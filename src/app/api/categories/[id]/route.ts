import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, displayOrder, showOnMenu } = body

    const category = await prisma.category.updateMany({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(typeof displayOrder === 'number' && { displayOrder }),
        ...(typeof showOnMenu === 'boolean' && { showOnMenu }),
      },
    })

    if (category.count === 0) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const updated = await prisma.category.findUnique({
      where: { id: params.id },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating category:', error)
    return NextResponse.json(
      { error: 'Failed to update category' },
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

    const restaurantId = session.user.restaurantId

    // Count items in this category
    const itemCount = await prisma.menuItem.count({
      where: { categoryId: params.id, restaurantId },
    })

    // Update showcases that reference this category
    await prisma.menuShowcase.updateMany({
      where: { insertAfterCategoryId: params.id, restaurantId },
      data: { insertAfterCategoryId: null },
    })

    // If there are items, move them to "Uncategorized"
    if (itemCount > 0) {
      // Find or create "Uncategorized" category
      let uncategorized = await prisma.category.findFirst({
        where: {
          restaurantId,
          name: 'Uncategorized'
        },
      })

      if (!uncategorized) {
        // Create Uncategorized category
        const maxOrder = await prisma.category.findFirst({
          where: { restaurantId },
          orderBy: { displayOrder: 'desc' },
          select: { displayOrder: true },
        })

        uncategorized = await prisma.category.create({
          data: {
            name: 'Uncategorized',
            description: 'Items without a category',
            restaurantId,
            displayOrder: (maxOrder?.displayOrder ?? 0) + 1,
            showOnMenu: false, // Hidden by default
          },
        })
      }

      // Move all items to Uncategorized
      await prisma.menuItem.updateMany({
        where: { categoryId: params.id, restaurantId },
        data: { categoryId: uncategorized.id },
      })
    }

    const deleted = await prisma.category.deleteMany({
      where: {
        id: params.id,
        restaurantId,
      },
    })

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, itemsMoved: itemCount })
  } catch (error) {
    console.error('Error deleting category:', error)
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    )
  } finally {
    try {
      revalidatePath('/categories')
      revalidatePath('/menu')
      revalidatePath('/')
    } catch (err) {
      console.error('Revalidate failed after deleting category:', err)
    }
  }
}
