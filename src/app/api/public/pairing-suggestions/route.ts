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

    const historicalPairings = Object.entries(pairingCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([itemId]) => allMenuItems.find((item) => item.id === itemId))
      .filter(Boolean)

    // If we have good historical data, use it
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

    const prompt = `You are a professional chef and menu consultant. A customer has selected "${selectedItem.name}" (${selectedItem.category?.name || 'Main Course'})${
      selectedItem.description ? `: ${selectedItem.description}` : ''
    }.

Here are all available menu items:
${allMenuItems
  .map(
    (item, idx) =>
      `${idx + 1}. ${item.name} (${item.category?.name || 'General'})${
        item.description ? ` - ${item.description}` : ''
      }`
  )
  .join('\n')}

Based on culinary pairing principles, flavor profiles, and typical meal combinations, suggest 4 items from the above list that would pair perfectly with "${selectedItem.name}".

Consider:
- Complementary flavors and textures
- Traditional meal pairings (appetizer + main, main + side, main + drink, etc.)
- Cultural cuisine compatibility
- Balanced meal composition

Respond ONLY with a JSON array of exactly 4 item numbers (just the numbers from the list above, e.g., [1, 5, 12, 8]). No other text.`

    const result = await model.generateContent(prompt)
    const response = result.response.text().trim()

    // Parse the AI response to get item indices
    const indices = JSON.parse(response.replace(/```json|```/g, '').trim()) as number[]

    const aiSuggestions = indices
      .slice(0, 4)
      .map((idx) => allMenuItems[idx - 1])
      .filter(Boolean)

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
