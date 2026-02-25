import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateMenuDescription } from '@/lib/menu-description-ai'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const itemName = body.itemName ?? body.name
    const category = body.category ?? body.categoryName
    const tags = body.tags
    const price = body.price
    const existingDraft = body.existingDraft ?? body.description

    if (!itemName) {
      return NextResponse.json(
        { error: 'Item name is required' },
        { status: 400 }
      )
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })
    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    const theme = (settings.theme as Record<string, unknown>) || {}
    const descriptionTone = typeof theme.descriptionTone === 'string' ? theme.descriptionTone : null

    const description = await generateMenuDescription({
      itemName,
      categoryName: category ?? null,
      tags: Array.isArray(tags) ? tags : null,
      price: typeof price === 'number' ? price : null,
      existingDraft: typeof existingDraft === 'string' ? existingDraft : null,
      descriptionTone,
    })

    if (description === null) {
      return NextResponse.json(
        { error: 'Google AI API key not configured or generation failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      description,
    })
  } catch (error) {
    console.error('Error generating description:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate description',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
