import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canonicalise } from '@/lib/unit-converter'

interface ConfirmItem {
  name: string
  ingredientId?: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  brand?: string
  supplier?: string
  date?: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurantId = session.user.restaurantId

    const body = await request.json()
    const { receiptId, items } = body

    if (!receiptId || typeof receiptId !== 'string') {
      return NextResponse.json({ error: 'receiptId is required' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.findUnique({
        where: { id: receiptId },
        select: {
          id: true,
          status: true,
          restaurantId: true,
        },
      })

      if (!receipt) {
        throw new Error('Receipt not found')
      }

      if (receipt.restaurantId !== restaurantId) {
        throw new Error('Unauthorized: receipt belongs to another restaurant')
      }

      if (receipt.status !== 'PENDING') {
        throw new Error(`Receipt is already ${receipt.status.toLowerCase()}`)
      }

      const processed: Array<{ ingredientId: string; expenseId: string }> = []

      for (const item of items as ConfirmItem[]) {
        const {
          name,
          ingredientId: providedIngredientId,
          quantity,
          unit,
          unitPrice,
          totalPrice,
          brand,
          supplier,
          date,
        } = item

        if (!name || quantity == null || unitPrice == null || totalPrice == null) {
          throw new Error(`Invalid item data: missing required fields for "${name || 'unnamed item'}"`)
        }

        let targetIngredientId = providedIngredientId

        if (!targetIngredientId) {
          const newIngredient = await prisma.ingredient.create({
            data: {
              name: name.trim(),
              unit: canonicalise(unit || 'piece'),
              restaurantId: restaurantId,
              restaurant: {
                connect: { id: restaurantId },
              },
              costPerUnit: unitPrice,
              supplier: supplier?.trim() || null,
              stockQuantity: 0,
              minStockLevel: 0,
              // variants: brand?.trim() || null,
              variants: {
                create: [{
                  brand: brand?.trim() || 'Generic',
                  supplier: supplier?.trim() || null,
                  purchaseFormat: null,
                  packageQuantity: quantity,
                  packageUnit: unit,
                  bulkPrice: totalPrice,
                  costPerUnit: unitPrice,
                }],
              },
            },
            include: {
              variants: true,
            },
          })

          targetIngredientId = newIngredient.id
        }

        // 2. Update existing ingredient (cost + stock)
        await tx.ingredient.update({
          where: {
            id: targetIngredientId,
            restaurantId,
          },
          data: {
            costPerUnit: unitPrice,
            stockQuantity: {
              increment: quantity,
            },
            supplier: supplier?.trim() || undefined,
          },
        })

        const expense = await tx.expenseTransaction.create({
          data: {
            name: `Purchase: ${name.trim()}${brand ? ` (${brand.trim()})` : ''}`,
            category: 'INVENTORY_PURCHASE',
            amount: totalPrice,
            date: date ? new Date(date) : new Date(),
            ingredientId: targetIngredientId,
            restaurantId,
            receiptId,
            unitCost: unitPrice,
          },
        })

        processed.push({
          ingredientId: targetIngredientId,
          expenseId: expense.id,
        })
      }

      await tx.receipt.update({
        where: { id: receiptId },
        data: {
          status: 'CONFIRMED',
        },
      })

      return {
        success: true,
        receiptId,
        processedItems: processed,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[RECEIPT_CONFIRM_ERROR]', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    const message =
      error instanceof Error ? error.message : 'Failed to confirm receipt'

    return NextResponse.json(
      { error: 'Confirmation failed', details: message },
      { status: 500 }
    )
  }
}