import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { updates } = await req.json()

        if (!Array.isArray(updates) || updates.length === 0) {
            return NextResponse.json({ error: 'Invalid updates' }, { status: 400 })
        }

        // Update all categories in a transaction
        await prisma.$transaction(
            updates.map((update: { id: string; displayOrder: number }) =>
                prisma.category.update({
                    where: {
                        id: update.id,
                        restaurantId: session.user.restaurantId,
                    },
                    data: {
                        displayOrder: update.displayOrder,
                    },
                })
            )
        )

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to reorder categories:', error)
        return NextResponse.json(
            { error: 'Failed to reorder categories' },
            { status: 500 }
        )
    }
}
