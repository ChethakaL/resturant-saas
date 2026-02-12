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

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!menuItem) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    const { categoryId } = await request.json()
    if (typeof categoryId !== 'string' || !categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
    }

    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    await prisma.menuItem.update({
      where: { id: params.id },
      data: { categoryId },
    })

    revalidatePath('/')
    revalidatePath('/categories')
    revalidatePath('/menu')

    return NextResponse.json({ categoryId })
  } catch (error) {
    console.error('Error updating menu item category:', error)
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    )
  }
}
