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

    // Get the selected menu item
    const selectedItem = await prisma.menuItem.findUnique({
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

    if (!selectedItem) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    // Get all available menu items from the restaurant (excluding the selected one)
    const allMenuItems = await prisma.menuItem.findMany({
      where: {
        restaurantId,
        available: true,
        id: { not: menuItemId },
      },
      include: {
        category: true,
      },
      orderBy: {
        popularityScore: 'desc',
      },
    })

    // Detect if selected item is a beverage (CRITICAL: do this early)
    const selectedCategoryName = selectedItem.category?.name?.toLowerCase() || ''
    const selectedItemName = selectedItem.name.toLowerCase()
    const beverageKeywords = ['drink', 'beverage', 'tea', 'coffee', 'juice', 'ayran', 'yogurt drink', 'soda', 'water', 'lemonade', 'smoothie', 'shake']
    const beverageCategories = ['beverages', 'drinks', 'beverage', 'drink']
    const isSelectedItemBeverage = 
      beverageCategories.some(cat => selectedCategoryName.includes(cat)) ||
      beverageKeywords.some(keyword => selectedItemName.includes(keyword))

    // Helper function to check if an item is a beverage
    const isBeverage = (item: typeof allMenuItems[0]) => {
      const itemCategoryName = item.category?.name?.toLowerCase() || ''
      const itemName = item.name.toLowerCase()
      return (
        beverageCategories.some(cat => itemCategoryName.includes(cat)) ||
        beverageKeywords.some(keyword => itemName.includes(keyword))
      )
    }

    // Check if we have historical data (based on actual orders)
    const orderHistory = await prisma.saleItem.findMany({
      where: {
        menuItemId,
        sale: {
          restaurantId,
        },
      },
      include: {
        sale: {
          include: {
            items: {
              where: {
                menuItemId: { not: menuItemId },
              },
              include: {
                menuItem: true,
              },
            },
          },
        },
      },
      take: 100,
    })

    // Calculate frequently ordered together items
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
      .slice(0, 10) // Get more candidates to filter from
      .map(([itemId]) => allMenuItems.find((item) => item.id === itemId))
      .filter(Boolean) as typeof allMenuItems

    // CRITICAL FIX: Filter out beverages from historical pairings if selected item is a beverage
    if (isSelectedItemBeverage) {
      historicalPairings = historicalPairings.filter(item => !isBeverage(item))
    }

    // If we have good historical data after filtering, use it
    if (historicalPairings.length >= 3) {
      return NextResponse.json({
        suggestions: historicalPairings.slice(0, 4),
        source: 'historical',
      })
    }

    // Otherwise, use AI to generate suggestions
    if (!process.env.GOOGLE_AI_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    // Filter out beverages from suggestions if selected item is a beverage
    const availableForPairing = isSelectedItemBeverage
      ? allMenuItems.filter(item => !isBeverage(item))
      : allMenuItems

    // If we filtered out too many items, use all items but with stronger prompt
    const itemsToSuggest = availableForPairing.length >= 4 ? availableForPairing : allMenuItems

    const prompt = `You are a professional chef and menu consultant for an Iraqi restaurant in Erbil. A guest has selected "${selectedItem.name}" (${selectedItem.category?.name || 'Main Course'})${
      selectedItem.description ? `: ${selectedItem.description}` : ''
    }.

${isSelectedItemBeverage ? '⚠️ CRITICAL: The selected item is a BEVERAGE/DRINK. You MUST NOT suggest any other beverages or drinks. Only suggest FOOD items (appetizers, main courses, sides, desserts, etc.).' : ''}

Here are all available menu items to choose from:
${itemsToSuggest
  .map(
    (item, idx) =>
      `${idx + 1}. ${item.name} (${item.category?.name || 'General'})${
        item.description ? ` - ${item.description}` : ''
      }`
  )
  .join('\n')}

Suggest exactly 4 items from the above list that would pair perfectly with "${selectedItem.name}" while building a balanced, culturally appropriate meal experience. Follow these CRITICAL rules:

${isSelectedItemBeverage ? '🚫 ABSOLUTE RULE: Since the selected item is a beverage, you MUST NOT include ANY beverages, drinks, teas, coffees, or liquid items in your suggestions. Only suggest solid food items like appetizers, main dishes, sides, breads, or desserts.' : '- If the selected item is food, you may include at most ONE beverage that complements it culturally (e.g., tea with kebabs, ayran with grilled meats).'}

- Prioritize combinations that cover different courses (appetizer → main → side → dessert) so the suggestions feel like a complete, balanced meal.
- Honor complementary flavors, textures, and local Kurdish/Iraqi taste profiles. The pairings should feel natural and culturally authentic.
- Choose items that would realistically appear together on a table in Erbil, respecting traditional meal structures and local dining customs.
- Consider flavor harmony: avoid conflicting tastes (e.g., don't pair very sweet items with very savory items unless culturally appropriate).
- Ensure variety: suggest items from different categories when possible to create a well-rounded dining experience.

${isSelectedItemBeverage ? 'Remember: NO beverages in your response - only food items!' : ''}

Respond ONLY with a JSON array of exactly 4 item numbers from the list above (e.g., [1, 5, 12, 8]). No other text, no explanations.`

    const result = await model.generateContent(prompt)
    const response = result.response.text().trim()

    // Parse the AI response to get item indices
    const indices = JSON.parse(response.replace(/```json|```/g, '').trim()) as number[]

    // Map indices from the filtered list back to actual menu items
    let aiSuggestions = indices
      .slice(0, 4)
      .map((idx) => itemsToSuggest[idx - 1]) // Use itemsToSuggest instead of allMenuItems
      .filter(Boolean)

    // Final safety check: if selected item is a beverage, remove any beverages that slipped through
    if (isSelectedItemBeverage) {
      aiSuggestions = aiSuggestions.filter(item => !isBeverage(item))
    }

    return NextResponse.json({
      suggestions: aiSuggestions,
      source: 'ai',
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
