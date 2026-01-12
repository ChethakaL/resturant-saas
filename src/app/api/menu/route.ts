import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Create menu item with ingredients in a transaction
    const menuItem = await prisma.$transaction(async (tx) => {
      // Create the menu item
      const item = await tx.menuItem.create({
        data: {
          name: data.name,
          description: data.description,
          price: data.price,
          imageUrl: data.imageUrl,
          available: data.available,
          categoryId: data.categoryId,
          restaurantId: session.user.restaurantId,
        },
      })

      // Create recipe ingredients
      if (data.ingredients && data.ingredients.length > 0) {
        await tx.menuItemIngredient.createMany({
          data: data.ingredients.map((ing: any) => ({
            menuItemId: item.id,
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
          })),
        })
      }

      return item
    })

    return NextResponse.json(menuItem)
  } catch (error) {
    console.error('Error creating menu item:', error)
    return NextResponse.json(
      { error: 'Failed to create menu item' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId: session.user.restaurantId },
      include: {
        category: true,
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(menuItems)
  } catch (error) {
    console.error('Error fetching menu items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menu items' },
      { status: 500 }
    )
  }
}
