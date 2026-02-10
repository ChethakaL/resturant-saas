import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { menuItemId, restaurantId } = await request.json()

    if (!menuItemId || !restaurantId) {
      return NextResponse.json(
        { error: 'Menu item ID and restaurant ID are required' },
        { status: 400 }
      )
    }

    const selectedItem = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: {
        category: true,
        ingredients: {
          include: { ingredient: true },
        },
      },
    })

    if (!selectedItem) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    // 1. Prefer stored pairings (no API calls)
    const storedPairings = await prisma.menuItemPairing.findMany({
      where: { menuItemId },
      orderBy: { displayOrder: 'asc' },
      include: {
        suggestedMenuItem: {
          include: { category: true },
        },
      },
    })

    if (storedPairings.length > 0) {
      const suggestions = storedPairings.map((p) => p.suggestedMenuItem)
      return NextResponse.json({
        suggestions,
        source: 'stored',
      })
    }

    // 2. Compute suggestions (historical or AI), then save to DB for next time
    const allMenuItems = await prisma.menuItem.findMany({
      where: {
        restaurantId,
        available: true,
        id: { not: menuItemId },
      },
      include: { category: true },
      orderBy: { popularityScore: 'desc' },
    })

    const selectedCategoryName = selectedItem.category?.name?.toLowerCase() || ''
    const selectedItemName = selectedItem.name.toLowerCase()
    const beverageKeywords = ['drink', 'beverage', 'tea', 'coffee', 'juice', 'ayran', 'yogurt drink', 'soda', 'water', 'lemonade', 'smoothie', 'shake']
    const beverageCategories = ['beverages', 'drinks', 'beverage', 'drink']
    const isSelectedItemBeverage =
      beverageCategories.some((c) => selectedCategoryName.includes(c)) ||
      beverageKeywords.some((k) => selectedItemName.includes(k))

    const isBeverage = (item: (typeof allMenuItems)[0]) => {
      const cat = item.category?.name?.toLowerCase() || ''
      const name = item.name.toLowerCase()
      return beverageCategories.some((c) => cat.includes(c)) || beverageKeywords.some((k) => name.includes(k))
    }

    const orderHistory = await prisma.saleItem.findMany({
      where: {
        menuItemId,
        sale: { restaurantId },
      },
      include: {
        sale: {
          include: {
            items: {
              where: { menuItemId: { not: menuItemId } },
              include: { menuItem: true },
            },
          },
        },
      },
      take: 100,
    })

    const pairingCounts: Record<string, number> = {}
    orderHistory.forEach((saleItem) => {
      saleItem.sale.items.forEach((otherItem) => {
        if (otherItem.menuItemId !== menuItemId) {
          pairingCounts[otherItem.menuItemId] = (pairingCounts[otherItem.menuItemId] || 0) + 1
        }
      })
    })

    let historicalPairings = Object.entries(pairingCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([itemId]) => allMenuItems.find((item) => item.id === itemId))
      .filter(Boolean) as (typeof allMenuItems)[]

    if (isSelectedItemBeverage) {
      historicalPairings = historicalPairings.filter((item) => !isBeverage(item))
    }

    let suggestions: (typeof allMenuItems)[]
    let source: 'historical' | 'ai' = 'historical'

    if (historicalPairings.length >= 3) {
      suggestions = historicalPairings.slice(0, 4)
    } else {
      source = 'ai'
      if (!process.env.GOOGLE_AI_KEY) {
        return NextResponse.json(
          { error: 'Google AI API key not configured' },
          { status: 500 }
        )
      }
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const availableForPairing = isSelectedItemBeverage
        ? allMenuItems.filter((item) => !isBeverage(item))
        : allMenuItems
      const itemsToSuggest = availableForPairing.length >= 4 ? availableForPairing : allMenuItems

      const prompt = `You are a professional chef and menu consultant for an Iraqi restaurant in Erbil. A guest has selected "${selectedItem.name}" (${selectedItem.category?.name || 'Main Course'})${
        selectedItem.description ? `: ${selectedItem.description}` : ''
      }.

${isSelectedItemBeverage ? '⚠️ CRITICAL: The selected item is a BEVERAGE/DRINK. You MUST NOT suggest any other beverages or drinks. Only suggest FOOD items (appetizers, main courses, sides, desserts, etc.).' : ''}

Here are all available menu items to choose from:
${itemsToSuggest
  .map(
    (item, idx) =>
      `${idx + 1}. ${item.name} (${item.category?.name || 'General'})${item.description ? ` - ${item.description}` : ''}`
  )
  .join('\n')}

Suggest exactly 4 items from the above list that would pair perfectly with "${selectedItem.name}". Follow these rules:
${isSelectedItemBeverage ? '🚫 Since the selected item is a beverage, do NOT include ANY beverages in your suggestions.' : '- You may include at most ONE beverage.'}
- Prioritize different courses (appetizer → main → side → dessert).
- Honor Kurdish/Iraqi taste profiles. Respond ONLY with a JSON array of exactly 4 item numbers (e.g., [1, 5, 12, 8]). No other text.`

      const result = await model.generateContent(prompt)
      const response = result.response.text().trim()
      const indices = JSON.parse(response.replace(/```json|```/g, '').trim()) as number[]
      let aiSuggestions = indices
        .slice(0, 4)
        .map((idx) => itemsToSuggest[idx - 1])
        .filter(Boolean) as (typeof allMenuItems)[]
      if (isSelectedItemBeverage) {
        aiSuggestions = aiSuggestions.filter((item) => !isBeverage(item))
      }
      suggestions = aiSuggestions
    }

    // Save to DB so future requests are instant
    if (suggestions.length > 0) {
      await prisma.menuItemPairing.deleteMany({ where: { menuItemId } })
      await prisma.menuItemPairing.createMany({
        data: suggestions.map((item, i) => ({
          menuItemId,
          suggestedMenuItemId: item.id,
          displayOrder: i,
        })),
      })
    }

    return NextResponse.json({
      suggestions,
      source,
    })
  } catch (error) {
    console.error('Error generating pairing suggestions:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate suggestions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
