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

    const payload = await request.json()
    if (typeof payload.available !== 'boolean') {
      return NextResponse.json(
        { error: 'Availability status must be true or false' },
        { status: 400 }
      )
    }

    const existing = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    const updated = await prisma.menuItem.update({
      where: { id: params.id },
      data: {
        available: payload.available,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating availability:', error)
    return NextResponse.json(
      { error: 'Failed to update availability' },
      { status: 500 }
    )
  }
}
