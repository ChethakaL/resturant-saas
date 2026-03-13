import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isZeroCostAllowed } from '@/lib/costing'

/**
 * Recalculates and updates the costing status for a menu item
 * This is called after ingredient prices are updated
 */
export async function POST(
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

        // Calculate costing status
        const validIngredients = menuItem.ingredients.filter(
            (ing) => ing.ingredientId && ing.quantity > 0
        )
        const hasRecipe = validIngredients.length > 0

        // Check if ALL ingredients have costs > 0
        let hasCosting = false
        if (hasRecipe) {
            const ingredientIds = validIngredients.map((ing) => ing.ingredientId)
            const ingredients = await prisma.ingredient.findMany({
                where: { id: { in: ingredientIds } },
                select: { id: true, name: true, costPerUnit: true },
            })

            // All ingredients must have costPerUnit > 0, except water and similar (allowed at 0)
            const resolvedIngredients = await Promise.all(ingredients.map(async (ing) => {
                if (ing.costPerUnit > 0 || isZeroCostAllowed(ing.name)) {
                    return ing
                }
                
                // If the ingredient has no cost, check if it's a parent with variants
                const variants = await prisma.ingredient.findMany({
                    where: { parentId: ing.id },
                    select: { costPerUnit: true }
                })
                
                if (variants.length > 0) {
                    const maxCost = Math.max(...variants.map(v => v.costPerUnit))
                    if (maxCost > 0) {
                        return { ...ing, costPerUnit: maxCost }
                    }
                }
                
                return ing
            }))

            hasCosting =
                resolvedIngredients.length === validIngredients.length &&
                resolvedIngredients.every((ing) => ing.costPerUnit > 0 || isZeroCostAllowed(ing.name))
        }

        const costingStatus = hasRecipe && hasCosting ? 'COMPLETE' : 'INCOMPLETE'

        // Update menu item with new costing status
        const updated = await prisma.menuItem.update({
            where: { id: resolvedParams.id },
            data: { costingStatus },
        })

        return NextResponse.json({
            costingStatus: updated.costingStatus,
            hasRecipe,
            hasCosting,
        })
    } catch (error) {
        console.error('Error recalculating costing status:', error)
        return NextResponse.json(
            { error: 'Failed to recalculate costing status' },
            { status: 500 }
        )
    }
}
