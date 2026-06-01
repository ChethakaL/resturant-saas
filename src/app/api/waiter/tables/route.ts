import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

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
                        items: {
                            select: {
                                id: true,
                                menuItemId: true,
                                quantity: true,
                                price: true,
                                menuItem: {
                                    select: {
                                        id: true,
                                        name: true,
                                        price: true,
                                        description: true,
                                        imageUrl: true,
                                        category: {
                                            select: {
                                                id: true,
                                                name: true,
                                            },
                                        },
                                    },
                                },
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

        return NextResponse.json(tables)
    } catch (error) {
        console.error('Error fetching tables for waiter:', error)
        return NextResponse.json(
            { error: 'Failed to fetch tables' },
            { status: 500 }
        )
    }
}
