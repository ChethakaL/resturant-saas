import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { prisma } from '@/lib/prisma'
import { parseGeminiJson } from '@/lib/generative'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const restaurantId = body.restaurantId as string | undefined
    const lastOrderItemIds = body.lastOrderItemIds as string[] | undefined

    if (!restaurantId || !lastOrderItemIds?.length) {
      return NextResponse.json(
        { error: 'restaurantId and lastOrderItemIds are required' },
        { status: 400 }
      )
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    })
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    const menuItems = await prisma.menuItem.findMany({
      where: {
        restaurantId,
        available: true,
        status: 'ACTIVE',
        id: { notIn: lastOrderItemIds },
      },
      include: {
        category: true,
        ingredients: { include: { ingredient: true } },
      },
    })

    if (menuItems.length === 0) {
      return NextResponse.json({ suggestedItemId: null, suggestedItemName: null, message: null })
    }

    const itemsWithMargin = menuItems.map((item) => {
      const cost = item.ingredients.reduce(
        (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
        0
      )
      const marginPercent = item.price > 0 ? ((item.price - cost) / item.price) * 100 : 0
      return {
        id: item.id,
        name: item.name,
        category: item.category?.name ?? 'General',
        price: item.price,
        marginPercent: Math.round(marginPercent * 10) / 10,
      }
    })

    const lastOrderItems = await prisma.menuItem.findMany({
      where: { id: { in: lastOrderItemIds } },
      select: { name: true },
    })
    const lastOrderNames = lastOrderItems.map((i) => i.name).join(', ')

    if (!process.env.GOOGLE_AI_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const listText = itemsWithMargin
      .map(
        (item, idx) =>
          `${idx + 1}. id: "${item.id}" | ${item.name} (${item.category}) | price: ${item.price} | margin: ${item.marginPercent}%`
      )
      .join('\n')

    const prompt = `You are a friendly restaurant assistant. A customer last ordered: ${lastOrderNames}.

Here are other menu items we can suggest (each has id, name, category, price, and profit margin %). We want to suggest ONE item that:
- Has a higher profit margin than typical, so we prefer items with higher margin % when it makes sense.
- Would appeal to someone who ordered ${lastOrderNames} (similar taste profile, or a natural next choice like a premium upgrade or a complementary dish).
- Is one short line of text for the customer, e.g. "Based on your taste for X, you might love our Y" or "Try our Y next — it's a favourite of guests who order X."

Menu items (reply with the exact id and a short message):
${listText}

Respond ONLY with valid JSON in this exact format, no other text:
{"itemId": "<exact id from the list>", "message": "<one short sentence for the customer>"}
Choose the itemId from the list above. Keep message under 80 characters.`

    const result = await model.generateContent(prompt)
    const rawText = result.response.text().trim()
    const parsed = parseGeminiJson(rawText) as { itemId?: string; message?: string }
    const itemId = parsed?.itemId ?? null
    const message = typeof parsed?.message === 'string' ? parsed.message.trim() : null

    if (!itemId || !message) {
      return NextResponse.json({ suggestedItemId: null, suggestedItemName: null, message: null })
    }

    const suggested = itemsWithMargin.find((i) => i.id === itemId)
    if (!suggested) {
      return NextResponse.json({ suggestedItemId: null, suggestedItemName: null, message: null })
    }

    return NextResponse.json({
      suggestedItemId: suggested.id,
      suggestedItemName: suggested.name,
      message,
    })
  } catch (error) {
    console.error('Suggest next order error:', error)
    return NextResponse.json(
      { error: 'Failed to get suggestion', suggestedItemId: null, suggestedItemName: null, message: null },
      { status: 500 }
    )
  }
}
