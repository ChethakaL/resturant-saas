import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const resolvedParams = params instanceof Promise ? await params : params

        // Get menu item with ingredients
        const menuItem = await prisma.menuItem.findFirst({
            where: {
                id: resolvedParams.id,
                restaurantId: session.user.restaurantId,
            },
            include: {
                ingredients: {
                    include: {
                        ingredient: {
                            select: {
                                id: true,
                                name: true,
                                unit: true,
                                costPerUnit: true,
                            },
                        },
                    },
                },
            },
        })

        if (!menuItem) {
            return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
        }

        // Extract unique ingredients
        const ingredients = menuItem.ingredients.map((mi) => ({
            id: mi.ingredient.id,
            name: mi.ingredient.name,
            unit: mi.ingredient.unit,
            costPerUnit: mi.ingredient.costPerUnit,
        }))

        return NextResponse.json({ ingredients })
    } catch (error) {
        console.error('Error fetching menu item ingredients:', error)
        return NextResponse.json(
            { error: 'Failed to fetch ingredients' },
            { status: 500 }
        )
    }
}
