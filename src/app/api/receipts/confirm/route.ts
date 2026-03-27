import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canonicalise, convertQuantityValue } from '@/lib/unit-converter'

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

type IngredientWithVariants = {
  id: string
  name: string
  unit: string
  stockQuantity: number
  costPerUnit: number
  variants: Array<{
    id: number
    brand: string
    supplier: string | null
    packageQuantity: number | null
    packageUnit: string
  }>
}

function normalizeText(value?: string | null) {
  return (value || '').trim().toLowerCase()
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function pickBestVariant(
  ingredient: IngredientWithVariants,
  brand?: string,
  supplier?: string
) {
  const desiredBrand = normalizeText(brand)
  const desiredSupplier = normalizeText(supplier)

  const byBrand = desiredBrand
    ? ingredient.variants.find((variant) => normalizeText(variant.brand).includes(desiredBrand))
    : null
  if (byBrand) return byBrand

  const bySupplier = desiredSupplier
    ? ingredient.variants.find((variant) => normalizeText(variant.supplier).includes(desiredSupplier))
    : null
  if (bySupplier) return bySupplier

  return ingredient.variants.find((variant) => (variant.packageQuantity ?? 0) > 0) || null
}

function resolveReceiptToIngredientBaseUnits(
  ingredient: IngredientWithVariants,
  item: ConfirmItem
) {
  const ingredientUnit = canonicalise(ingredient.unit || 'piece')
  const receiptUnit = canonicalise(item.unit || 'piece')
  const receiptQuantity = Number(item.quantity)
  const totalPrice = Number(item.totalPrice)

  if (!Number.isFinite(receiptQuantity) || receiptQuantity <= 0) {
    throw new Error(`Invalid quantity for receipt item "${item.name}"`)
  }

  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    throw new Error(`Invalid total price for receipt item "${item.name}"`)
  }

  const directlyConvertedQuantity = convertQuantityValue(receiptQuantity, receiptUnit, ingredientUnit)
  if (directlyConvertedQuantity != null && directlyConvertedQuantity > 0) {
    return {
      stockIncrement: directlyConvertedQuantity,
      unitCost: totalPrice / directlyConvertedQuantity,
    }
  }

  const matchedVariant = pickBestVariant(ingredient, item.brand, item.supplier)
  if (matchedVariant?.packageQuantity && matchedVariant.packageQuantity > 0) {
    const packageBaseQuantity = convertQuantityValue(
      matchedVariant.packageQuantity,
      matchedVariant.packageUnit,
      ingredientUnit
    )

    if (packageBaseQuantity != null && packageBaseQuantity > 0) {
      const stockIncrement = receiptQuantity * packageBaseQuantity
      return {
        stockIncrement,
        unitCost: totalPrice / stockIncrement,
      }
    }
  }

  throw new Error(
    `Cannot convert receipt unit "${item.unit || 'unknown'}" to ingredient unit "${ingredient.unit}" for "${item.name}". Add package size details to the linked ingredient first.`
  )
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
        let expenseQuantity = Number(quantity)
        let expenseUnitCost = roundCurrency(Number(unitPrice))

        if (targetIngredientId) {
          const existingIngredient = await tx.ingredient.findFirst({
            where: {
              id: targetIngredientId,
              restaurantId,
            },
            select: {
              id: true,
              name: true,
              unit: true,
              stockQuantity: true,
              costPerUnit: true,
              variants: {
                select: {
                  id: true,
                  brand: true,
                  supplier: true,
                  packageQuantity: true,
                  packageUnit: true,
                },
                orderBy: { id: 'asc' },
              },
            },
          })

          if (!existingIngredient) {
            throw new Error(`Ingredient not found for receipt item "${name}"`)
          }

          const { stockIncrement, unitCost } = resolveReceiptToIngredientBaseUnits(existingIngredient, item)
          const currentTotalValue = existingIngredient.stockQuantity * existingIngredient.costPerUnit
          const newTotalValue = stockIncrement * unitCost
          const newTotalQuantity = existingIngredient.stockQuantity + stockIncrement
          const newAverageCost =
            newTotalQuantity > 0
              ? (currentTotalValue + newTotalValue) / newTotalQuantity
              : unitCost

          await tx.ingredient.update({
            where: {
              id: targetIngredientId,
            },
            data: {
              costPerUnit: roundCurrency(newAverageCost),
              stockQuantity: newTotalQuantity,
              supplier: supplier?.trim() || undefined,
            },
          })

          expenseQuantity = stockIncrement
          expenseUnitCost = roundCurrency(unitCost)
        } else {
          const baseUnit = canonicalise(unit || 'piece')
          const roundedUnitCost = roundCurrency(Number(unitPrice))

          const newIngredient = await tx.ingredient.create({
            data: {
              name: name.trim(),
              unit: baseUnit,
              restaurant: {
                connect: { id: restaurantId },
              },
              costPerUnit: roundedUnitCost,
              supplier: supplier?.trim() || null,
              stockQuantity: 0,
              minStockLevel: 0,
              variants: {
                create: [{
                  brand: brand?.trim() || 'Generic',
                  supplier: supplier?.trim() || null,
                  purchaseFormat: null,
                  packageQuantity: quantity,
                  packageUnit: unit,
                  bulkPrice: totalPrice,
                  costPerUnit: roundedUnitCost,
                }],
              },
            },
            include: {
              variants: true,
            },
          })

          targetIngredientId = newIngredient.id

          await tx.ingredient.update({
            where: {
              id: targetIngredientId,
            },
            data: {
              stockQuantity: {
                increment: quantity,
              },
            },
          })
        }

        const expense = await tx.expenseTransaction.create({
          data: {
            name: `Purchase: ${name.trim()}${brand ? ` (${brand.trim()})` : ''}`,
            category: 'INVENTORY_PURCHASE',
            amount: totalPrice,
            date: date ? new Date(date) : new Date(),
            ingredientId: targetIngredientId,
            restaurantId,
            receiptId,
            quantity: expenseQuantity,
            unitCost: expenseUnitCost,
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
    }, {
      maxWait: 10000,
      timeout: 30000,
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
