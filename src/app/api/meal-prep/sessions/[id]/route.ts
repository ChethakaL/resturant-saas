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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = mealPrepSessionSchema.parse(body)

    const existing = await prisma.mealPrepSession.findUnique({
      where: { id: params.id },
      include: {
        prepItems: true,
        inventoryUsages: true,
      },
    })

    if (!existing || existing.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Reverse prepped stock
      for (const item of existing.prepItems) {
        const stock = await tx.preppedDishStock.findUnique({
          where: { menuItemId: item.menuItemId },
        })

        if (stock) {
          await tx.preppedDishStock.update({
            where: { menuItemId: item.menuItemId },
            data: {
              availableQuantity: {
                decrement: item.quantityPrepped,
              },
            },
          })
        }
      }

      // Reverse inventory usage
      for (const usage of existing.inventoryUsages) {
        await tx.ingredient.update({
          where: { id: usage.ingredientId },
          data: {
            stockQuantity: {
              increment: usage.quantityUsed,
            },
          },
        })

        await tx.stockAdjustment.create({
          data: {
            ingredientId: usage.ingredientId,
            quantityChange: usage.quantityUsed,
            reason: 'meal_prep_reversal',
            notes: `Reversed meal prep session ${existing.id}`,
          },
        })
      }

      await tx.mealPrepItem.deleteMany({
        where: { prepSessionId: existing.id },
      })

      await tx.mealPrepInventoryUsage.deleteMany({
        where: { prepSessionId: existing.id },
      })

      // Recalculate usage for updated data
      const menuItems = await tx.menuItem.findMany({
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

      const ingredientUsage = new Map<string, number>()
      const ingredientDetails = new Map<string, any>()

      for (const prepItem of data.items) {
        const menuItem = menuItems.find((m) => m.id === prepItem.menuItemId)
        if (!menuItem) {
          throw new Error(`Menu item not found: ${prepItem.menuItemId}`)
        }

        for (const recipeIng of menuItem.ingredients) {
          const totalNeeded = recipeIng.quantity * prepItem.quantityPrepped
          const current = ingredientUsage.get(recipeIng.ingredientId) || 0
          ingredientUsage.set(recipeIng.ingredientId, current + totalNeeded)
          ingredientDetails.set(recipeIng.ingredientId, recipeIng.ingredient)
        }
      }

      if (data.customUsages && data.customUsages.length > 0) {
        const customIngredientIds = data.customUsages.map((usage) => usage.ingredientId)
        const customIngredients = await tx.ingredient.findMany({
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

      const updatedSession = await tx.mealPrepSession.update({
        where: { id: existing.id },
        data: {
          prepDate: new Date(data.prepDate),
          sessionTime: data.sessionTime,
          preparedBy: data.preparedBy,
          notes: data.notes,
        },
      })

      for (const prepItem of data.items) {
        await tx.mealPrepItem.create({
          data: {
            prepSessionId: updatedSession.id,
            menuItemId: prepItem.menuItemId,
            quantityPrepped: prepItem.quantityPrepped,
          },
        })

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

      for (const [ingredientId, quantityUsed] of ingredientUsage.entries()) {
        await tx.ingredient.update({
          where: { id: ingredientId },
          data: {
            stockQuantity: {
              decrement: quantityUsed,
            },
          },
        })

        await tx.mealPrepInventoryUsage.create({
          data: {
            prepSessionId: updatedSession.id,
            ingredientId,
            quantityUsed,
          },
        })

        await tx.stockAdjustment.create({
          data: {
            ingredientId,
            quantityChange: -quantityUsed,
            reason: 'meal_prep',
            notes: `Meal prep session: ${data.sessionTime}`,
          },
        })
      }

      return updatedSession
    })

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
    console.error('Error updating meal prep session:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || 'Failed to update meal prep session' },
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

    const existing = await prisma.mealPrepSession.findUnique({
      where: { id: params.id },
      include: {
        prepItems: true,
        inventoryUsages: true,
      },
    })

    if (!existing || existing.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      for (const item of existing.prepItems) {
        const stock = await tx.preppedDishStock.findUnique({
          where: { menuItemId: item.menuItemId },
        })

        if (stock) {
          await tx.preppedDishStock.update({
            where: { menuItemId: item.menuItemId },
            data: {
              availableQuantity: {
                decrement: item.quantityPrepped,
              },
            },
          })
        }
      }

      for (const usage of existing.inventoryUsages) {
        await tx.ingredient.update({
          where: { id: usage.ingredientId },
          data: {
            stockQuantity: {
              increment: usage.quantityUsed,
            },
          },
        })

        await tx.stockAdjustment.create({
          data: {
            ingredientId: usage.ingredientId,
            quantityChange: usage.quantityUsed,
            reason: 'meal_prep_reversal',
            notes: `Deleted meal prep session ${existing.id}`,
          },
        })
      }

      await tx.mealPrepItem.deleteMany({
        where: { prepSessionId: existing.id },
      })
      await tx.mealPrepInventoryUsage.deleteMany({
        where: { prepSessionId: existing.id },
      })
      await tx.mealPrepSession.delete({
        where: { id: existing.id },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting meal prep session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete meal prep session' },
      { status: 500 }
    )
  }
}
