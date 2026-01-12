import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const mealPrepSessionSchema = z.object({
  prepDate: z.string(),
  sessionTime: z.string(),
  preparedBy: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      menuItemId: z.string(),
      quantityPrepped: z.number().int().positive(),
    })
  ),
  customUsages: z
    .array(
      z.object({
        ingredientId: z.string(),
        quantityUsed: z.number().positive(),
      })
    )
    .optional(),
})

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    const where: any = {
      restaurantId: session.user.restaurantId,
    }

    if (date) {
      where.prepDate = new Date(date)
    }

    const sessions = await prisma.mealPrepSession.findMany({
      where,
      include: {
        prepItems: {
          include: {
            menuItem: true,
          },
        },
        inventoryUsages: {
          include: {
            ingredient: true,
          },
        },
      },
      orderBy: {
        prepDate: 'desc',
      },
    })

    return NextResponse.json(sessions)
  } catch (error: any) {
    console.error('Error fetching meal prep sessions:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sessions' },
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

    const body = await request.json()
    const data = mealPrepSessionSchema.parse(body)

    // Fetch all menu items with their recipes
    const menuItems = await prisma.menuItem.findMany({
      where: {
        id: { in: data.items.map((item) => item.menuItemId) },
        restaurantId: session.user.restaurantId,
      },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    })

    // Calculate total ingredient usage and validate stock
    const ingredientUsage = new Map<string, number>()
    const ingredientDetails = new Map<string, any>()

    for (const prepItem of data.items) {
      const menuItem = menuItems.find((m) => m.id === prepItem.menuItemId)
      if (!menuItem) {
        throw new Error(`Menu item not found: ${prepItem.menuItemId}`)
      }

      for (const recipeIng of menuItem.ingredients) {
        const totalNeeded =
          recipeIng.quantity * prepItem.quantityPrepped
        const current = ingredientUsage.get(recipeIng.ingredientId) || 0
        ingredientUsage.set(recipeIng.ingredientId, current + totalNeeded)
        ingredientDetails.set(recipeIng.ingredientId, recipeIng.ingredient)
      }
    }

    // Override or extend with custom usage when provided
    if (data.customUsages && data.customUsages.length > 0) {
      const customIngredientIds = data.customUsages.map((usage) => usage.ingredientId)
      const customIngredients = await prisma.ingredient.findMany({
        where: {
          id: { in: customIngredientIds },
          restaurantId: session.user.restaurantId,
        },
      })

      customIngredients.forEach((ingredient) => {
        ingredientDetails.set(ingredient.id, ingredient)
      })

      data.customUsages.forEach((usage) => {
        ingredientUsage.set(usage.ingredientId, usage.quantityUsed)
      })
    }

    // Validate stock availability
    for (const [ingredientId, needed] of ingredientUsage.entries()) {
      const ingredient = ingredientDetails.get(ingredientId)
      if (!ingredient) {
        throw new Error(`Ingredient not found: ${ingredientId}`)
      }
      if (ingredient.stockQuantity < needed) {
        throw new Error(
          `Insufficient stock for ${ingredient.name}. Need ${needed} ${ingredient.unit}, have ${ingredient.stockQuantity} ${ingredient.unit}`
        )
      }
    }

    // Create prep session and deduct inventory
    const result = await prisma.$transaction(async (tx) => {
      // Create prep session
      const prepSession = await tx.mealPrepSession.create({
        data: {
          prepDate: new Date(data.prepDate),
          sessionTime: data.sessionTime,
          preparedBy: data.preparedBy,
          notes: data.notes,
          restaurantId: session.user.restaurantId,
        },
      })

      // Create prep items and update prepped stock
      for (const prepItem of data.items) {
        await tx.mealPrepItem.create({
          data: {
            prepSessionId: prepSession.id,
            menuItemId: prepItem.menuItemId,
            quantityPrepped: prepItem.quantityPrepped,
          },
        })

        // Update or create prepped dish stock
        const existingStock = await tx.preppedDishStock.findUnique({
          where: { menuItemId: prepItem.menuItemId },
        })

        if (existingStock) {
          await tx.preppedDishStock.update({
            where: { menuItemId: prepItem.menuItemId },
            data: {
              availableQuantity: {
                increment: prepItem.quantityPrepped,
              },
            },
          })
        } else {
          await tx.preppedDishStock.create({
            data: {
              menuItemId: prepItem.menuItemId,
              availableQuantity: prepItem.quantityPrepped,
              restaurantId: session.user.restaurantId,
            },
          })
        }
      }

      // Deduct ingredients and create usage records
      for (const [ingredientId, quantityUsed] of ingredientUsage.entries()) {
        // Deduct from inventory
        await tx.ingredient.update({
          where: { id: ingredientId },
          data: {
            stockQuantity: {
              decrement: quantityUsed,
            },
          },
        })

        // Create usage record
        await tx.mealPrepInventoryUsage.create({
          data: {
            prepSessionId: prepSession.id,
            ingredientId,
            quantityUsed,
          },
        })

        // Create stock adjustment
        await tx.stockAdjustment.create({
          data: {
            ingredientId,
            quantityChange: -quantityUsed,
            reason: 'meal_prep',
            notes: `Meal prep session: ${data.sessionTime}`,
          },
        })
      }

      return prepSession
    })

    // Fetch the complete session with relations
    const completeSession = await prisma.mealPrepSession.findUnique({
      where: { id: result.id },
      include: {
        prepItems: {
          include: {
            menuItem: true,
          },
        },
        inventoryUsages: {
          include: {
            ingredient: true,
          },
        },
      },
    })

    return NextResponse.json(completeSession)
  } catch (error: any) {
    console.error('Error creating meal prep session:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || 'Failed to create meal prep session' },
      { status: 500 }
    )
  }
}
