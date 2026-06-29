import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireRestaurantFeature } from '@/lib/require-product-feature'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const locked = await requireRestaurantFeature(session.user.restaurantId, 'waiterPortal', 'Waiter Portal')
        if (locked) return locked

        const where: { restaurantId: string; branchId?: string } = {
            restaurantId: session.user.restaurantId,
        }
        if (session.user.branchId) {
            where.branchId = session.user.branchId
        }

        const tables = await prisma.table.findMany({
            where,
            select: {
                id: true,
                number: true,
                capacity: true,
                status: true,
                sales: {
                    where: {
                        status: {
                            in: ['PENDING', 'PREPARING', 'READY'],
                        },
                    },
                    select: {
                        id: true,
                        orderNumber: true,
                        total: true,
                        status: true,
                        customerName: true,
                        notes: true,
                        timestamp: true,
                        tableId: true,
                        _count: {
                            select: {
                                items: true,
                            },
                        },
                        table: {
                            select: {
                                id: true,
                                number: true,
                            },
                        },
                        waiter: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
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

        const payload = tables.map((table) => ({
            ...table,
            sales: table.sales.map(({ _count, ...sale }) => ({
                ...sale,
                itemCount: _count.items,
                items: [] as [],
            })),
        }))

        return NextResponse.json(payload)
    } catch (error) {
        console.error('Error fetching tables for waiter:', error)
        return NextResponse.json(
            { error: 'Failed to fetch tables' },
            { status: 500 }
        )
    }
}
