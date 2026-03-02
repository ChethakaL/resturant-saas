import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { callGemini, parseGeminiJson } from '@/lib/generative'

type LanguageCode = 'en' | 'ar' | 'ar_fusha' | 'ku'

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  ar: 'Iraqi Arabic',
  ar_fusha: 'Fusha Arabic (Modern Standard Arabic)',
  ku: 'Sorani Kurdish',
}

interface DescriptionRequestBody {
  menuItemId?: string
  language?: LanguageCode
}

type MenuItemDetail = NonNullable<
  Awaited<ReturnType<typeof prisma.menuItem.findUnique>>
>

function formatIngredientLine(ingredient: {
  quantity: number
  ingredient?: { name: string | null; unit: string | null }
}) {
  const name = ingredient.ingredient?.name || 'ingredient'
  const unit = ingredient.ingredient?.unit?.trim()
  const rawQuantity = Number.isFinite(ingredient.quantity)
    ? ingredient.quantity.toFixed(2).replace(/\.00$/, '')
    : String(ingredient.quantity)
  const parts = [rawQuantity]
  if (unit) {
    parts.push(unit)
  }
  parts.push(name)
  return parts.join(' ')
}

function buildPrompt(
  item: MenuItemDetail,
  languageLabel: string,
  cost: number,
  margin: number | null
) {
  const tags = item.tags?.length ? item.tags.join(', ') : 'No special tags'
  const popularity =
    typeof item.popularityScore === 'number'
      ? `${item.popularityScore} popularity score`
      : 'Popularity unknown'
  const calories =
    typeof item.calories === 'number' ? `${item.calories} calories` : 'Calorie count unavailable'
  const cookTime = item.cookTime || 'Cook time not specified'
  const prepTime = item.prepTime || 'Prep time not specified'
  const originalDescription = item.description?.trim() || 'No provided description'
  const ingredientLines =
    item.ingredients?.length
      ? item.ingredients.map((ing) => `- ${formatIngredientLine(ing)}`).join('\n')
      : '- Ingredients not listed'
  const recipeSteps =
    item.recipeSteps?.length
      ? item.recipeSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')
      : 'Not provided'
  const recipeTips =
    item.recipeTips?.length
      ? item.recipeTips.map((tip, index) => `${index + 1}. ${tip}`).join('\n')
      : 'No extra tips'
  const updatedAt = item.updatedAt?.toISOString() || 'Unknown'
  const categoryName = item.category?.name || 'General'
  const marginLabel =
    margin != null ? `${margin.toFixed(1)}% margin` : 'Margin unknown'

  return `You are an expressive Iraqi chef writing for ${languageLabel} diners. Use the data below to craft an engaging 2-3 sentence description that makes the dish feel vibrant and delicious while keeping all digits as ASCII. Respond in ${languageLabel} only and return EXACT JSON structure with no extra text:
{
  "language": "${languageLabel}",
  "description": "Chef description here"
}
Items with missing narrative facts should still sound warm and confident. Here is the menu item context:
- ID: ${item.id}
- Name: ${item.name}
- Category: ${categoryName}
- Price: ${item.price}
- Calories: ${calories}
- Cook time: ${cookTime}
- Prep time: ${prepTime}
- Tags: ${tags}
- Popularity: ${popularity}
- Cost to make: ${cost.toFixed(2)}
- ${marginLabel}
- Last updated: ${updatedAt}
- Original description: ${originalDescription}
Ingredient list:
${ingredientLines}
Recipe steps:
${recipeSteps}
Chef tips:
${recipeTips}
Make sure the description is flavorful but grounded in what is hard-coded above.`
}

export async function POST(request: NextRequest) {
  if (!process.env.GOOGLE_AI_KEY) {
    return NextResponse.json(
      { error: 'Google AI API key not configured' },
      { status: 500 }
    )
  }

  let body: DescriptionRequestBody
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request payload' },
      { status: 400 }
    )
  }

  const menuItemId = body.menuItemId?.trim()
  const language = body.language || 'en'
  if (!menuItemId) {
    return NextResponse.json(
      { error: 'Missing menuItemId' },
      { status: 400 }
    )
  }

  if (!LANGUAGE_LABELS[language]) {
    return NextResponse.json(
      { error: 'Unsupported language' },
      { status: 400 }
    )
  }

  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    include: {
      category: true,
      ingredients: {
        include: {
          ingredient: true,
        },
      },
    },
  })

  if (!menuItem) {
    return NextResponse.json(
      { error: 'Menu item not found' },
      { status: 404 }
    )
  }

  const cost = menuItem.ingredients.reduce((sum, ing) => {
    if (!ing.ingredient?.costPerUnit) {
      return sum
    }
    return sum + ing.quantity * ing.ingredient.costPerUnit
  }, 0)

  const margin =
    menuItem.price > 0 ? ((menuItem.price - cost) / menuItem.price) * 100 : null

  try {
    const prompt = buildPrompt(
      menuItem,
      LANGUAGE_LABELS[language],
      cost,
      margin
    )

    const aiResult = await callGemini(prompt)
    const rawText = aiResult.response.text()
    const payload = parseGeminiJson(rawText)

    if (!payload || typeof payload.description !== 'string') {
      throw new Error('AI response missing description')
    }

    const description = payload.description.trim()

    return NextResponse.json({
      language: LANGUAGE_LABELS[language],
      description,
    })
  } catch (error: any) {
    console.error('[item-description]', error)
    const message = error?.message || 'Failed to generate description'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
