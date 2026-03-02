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

        const categories = await prisma.category.findMany({
            where: {
                restaurantId: session.user.restaurantId,
                showOnMenu: true,
            },
            include: {
                menuItems: {
                    where: {
                        available: true,
                        status: 'ACTIVE',
                    },
                    orderBy: {
                        name: 'asc',
                    },
                },
            },
            orderBy: {
                displayOrder: 'asc',
            },
        })

        return NextResponse.json(categories)
    } catch (error) {
        console.error('Error fetching menu for waiter:', error)
        return NextResponse.json(
            { error: 'Failed to fetch menu' },
            { status: 500 }
        )
    }
}
