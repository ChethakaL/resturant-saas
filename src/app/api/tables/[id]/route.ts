import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const table = await prisma.table.findUnique({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      include: {
        sales: {
          include: {
            items: {
              include: {
                menuItem: true,
              },
            },
            waiter: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    })

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    return NextResponse.json(table)
  } catch (error) {
    console.error('Error fetching table:', error)
    return NextResponse.json(
      { error: 'Failed to fetch table' },
      { status: 500 }
    )
  }
}

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

    const table = await prisma.table.update({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      data: {
        status: data.status,
        number: data.number,
        capacity: data.capacity,
      },
    })

    return NextResponse.json(table)
  } catch (error: any) {
    console.error('Error updating table:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update table' },
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

    await prisma.table.delete({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting table:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete table' },
      { status: 500 }
    )
  }
}
