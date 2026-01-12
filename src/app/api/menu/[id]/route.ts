import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Verify menu item belongs to restaurant
    const existing = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    // Update menu item and ingredients in a transaction
    const menuItem = await prisma.$transaction(async (tx) => {
      // Update the menu item
      const item = await tx.menuItem.update({
        where: { id: params.id },
        data: {
          name: data.name,
          description: data.description,
          price: data.price,
          imageUrl: data.imageUrl,
          available: data.available,
          categoryId: data.categoryId,
        },
      })

      // Delete existing ingredients
      await tx.menuItemIngredient.deleteMany({
        where: { menuItemId: params.id },
      })

      // Create new ingredients
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
    console.error('Error updating menu item:', error)
    return NextResponse.json(
      { error: 'Failed to update menu item' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify menu item belongs to restaurant
    const existing = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    await prisma.menuItem.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting menu item:', error)
    return NextResponse.json(
      { error: 'Failed to delete menu item' },
      { status: 500 }
    )
  }
}
