import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existing = await prisma.menuShowcase.findFirst({
      where: { id: params.id, restaurantId: session.user.restaurantId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Showcase not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { title, position, insertAfterCategoryId, displayOrder, isActive, type, schedule, displayVariant } = body

    const showcase = await prisma.menuShowcase.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(position !== undefined && { position }),
        ...(insertAfterCategoryId !== undefined && { insertAfterCategoryId }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(isActive !== undefined && { isActive }),
        ...(type !== undefined && (type === 'CHEFS_HIGHLIGHTS' || type === 'RECOMMENDATIONS') && { type }),
        ...(schedule !== undefined && { schedule }),
        ...(displayVariant !== undefined && (displayVariant === 'hero' || displayVariant === 'cards') && { displayVariant }),
      },
    })

    revalidatePath('/')

    return NextResponse.json(showcase)
  } catch (error) {
    console.error('Error updating showcase:', error)
    return NextResponse.json(
      { error: 'Failed to update showcase' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existing = await prisma.menuShowcase.findFirst({
      where: { id: params.id, restaurantId: session.user.restaurantId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Showcase not found' },
        { status: 404 }
      )
    }

    await prisma.menuShowcase.delete({ where: { id: params.id } })

    revalidatePath('/')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting showcase:', error)
    return NextResponse.json(
      { error: 'Failed to delete showcase' },
      { status: 500 }
    )
  }
}
