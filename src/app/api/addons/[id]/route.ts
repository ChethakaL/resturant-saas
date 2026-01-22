import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify add-on belongs to restaurant
    const existing = await prisma.addOn.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Add-on not found' }, { status: 404 })
    }

    const data = await request.json()

    const addOn = await prisma.addOn.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.price !== undefined && { price: parseFloat(data.price) }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.available !== undefined && { available: data.available }),
      },
    })

    return NextResponse.json(addOn)
  } catch (error) {
    console.error('Error updating add-on:', error)
    return NextResponse.json({ error: 'Failed to update add-on' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify add-on belongs to restaurant
    const existing = await prisma.addOn.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Add-on not found' }, { status: 404 })
    }

    await prisma.addOn.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting add-on:', error)
    return NextResponse.json({ error: 'Failed to delete add-on' }, { status: 500 })
  }
}
