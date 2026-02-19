import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const showcases = await prisma.menuShowcase.findMany({
      where: { restaurantId: session.user.restaurantId },
      orderBy: { displayOrder: 'asc' },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            menuItem: {
              select: { id: true, name: true, imageUrl: true, price: true },
            },
          },
        },
      },
    })

    return NextResponse.json(showcases)
  } catch (error) {
    console.error('Error fetching showcases:', error)
    return NextResponse.json(
      { error: 'Failed to fetch showcases' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, position, insertAfterCategoryId, type, displayVariant } = body

    if (!title) {
      return NextResponse.json(
        { error: 'title is required' },
        { status: 400 }
      )
    }

    const validType = type === 'CHEFS_HIGHLIGHTS' ? 'CHEFS_HIGHLIGHTS' : 'RECOMMENDATIONS'
    const validDisplayVariant = displayVariant === 'hero' ? 'hero' : 'cards'
    const trimmedTitle = String(title).trim()

    // Never create a duplicate: if a carousel with this name already exists, update it and return.
    const existingByName = await prisma.menuShowcase.findFirst({
      where: {
        restaurantId: session.user.restaurantId,
        title: { equals: trimmedTitle, mode: 'insensitive' },
      },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            menuItem: {
              select: { id: true, name: true, imageUrl: true, price: true },
            },
          },
        },
      },
    })
    if (existingByName) {
      const updated = await prisma.menuShowcase.update({
        where: { id: existingByName.id },
        data: {
          title: trimmedTitle,
          type: validType,
          displayVariant: validDisplayVariant,
          position: position ?? existingByName.position,
          insertAfterCategoryId: insertAfterCategoryId !== undefined ? insertAfterCategoryId : existingByName.insertAfterCategoryId,
        },
        include: {
          items: {
            orderBy: { displayOrder: 'asc' },
            include: {
              menuItem: {
                select: { id: true, name: true, imageUrl: true, price: true },
              },
            },
          },
        },
      })
      revalidatePath('/')
      return NextResponse.json(updated)
    }

    const lastShowcase = await prisma.menuShowcase.findFirst({
      where: { restaurantId: session.user.restaurantId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    })
    const nextOrder = (lastShowcase?.displayOrder ?? 0) + 1

    const showcase = await prisma.menuShowcase.create({
      data: {
        restaurantId: session.user.restaurantId,
        title: trimmedTitle,
        type: validType,
        displayVariant: validDisplayVariant,
        position: position || 'top',
        insertAfterCategoryId: insertAfterCategoryId || null,
        displayOrder: nextOrder,
      },
    })

    revalidatePath('/')

    return NextResponse.json(showcase)
  } catch (error) {
    console.error('Error creating showcase:', error)
    return NextResponse.json(
      { error: 'Failed to create showcase' },
      { status: 500 }
    )
  }
}
