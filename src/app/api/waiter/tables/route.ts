import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const tables = await prisma.table.findMany({
            where: {
                restaurantId: session.user.restaurantId,
            },
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
                                menuItem: {
                                    include: {
                                        category: true,
                                    },
                                },
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
        console.error('Error fetching tables for waiter:', error)
        return NextResponse.json(
            { error: 'Failed to fetch tables' },
            { status: 500 }
        )
    }
}
