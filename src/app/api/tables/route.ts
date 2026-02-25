import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const branchId = searchParams.get('branchId')

    const where: any = {
      restaurantId: session.user.restaurantId,
    }

    if (branchId) {
      if (branchId === 'unassigned') {
        where.branchId = null
      } else {
        where.branchId = branchId
      }
    }

    if (status && status !== 'all') {
      where.status = status
    }

    const tables = await prisma.table.findMany({
      where,
      include: {
        sales: {
          where: {
            status: {
              in: ['PENDING', 'PREPARING', 'READY'],
            },
          },
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
      orderBy: {
        number: 'asc',
      },
    })

    return NextResponse.json(tables)
  } catch (error) {
    console.error('Error fetching tables:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tables' },
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

    const data = await request.json()

    const table = await prisma.table.create({
      data: {
        number: data.number,
        capacity: data.capacity,
        restaurantId: session.user.restaurantId,
        ...(data.branchId && { branchId: data.branchId }),
      },
    })

    return NextResponse.json(table)
  } catch (error: any) {
    console.error('Error creating table:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create table' },
      { status: 500 }
    )
  }
}
