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

    const table = await prisma.table.findFirst({
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

    const existingTable = await prisma.table.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      select: { id: true },
    })

    if (!existingTable) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const table = await prisma.table.update({
      where: {
        id: existingTable.id,
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

    const table = await prisma.table.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      include: {
        sales: {
          where: {
            status: {
              in: ['PENDING', 'PREPARING', 'READY'],
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    if (table.sales.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a table with active orders' },
        { status: 400 }
      )
    }

    await prisma.table.delete({
      where: {
        id: table.id,
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
