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
  packageQuantity?: number
  packageUnit?: string
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
    bulkPrice: number | null
  }>
}

function normalizeText(value?: string | null) {
  return (value || '').trim().toLowerCase()
}

function normalizeForIngredientMatch(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|grams?|kilograms?|l|lt|liter|litre|liters|litres|ml|pcs?|pieces?)\b/g, ' ')
    .replace(/\b(?:bag|bags|box|boxes|pack|packs|bottle|bottles|can|cans|carton|cartons|jar|jars|block|blocks)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return normalized
    .split(' ')
    .filter((token) => token.length > 1)
    .join(' ')
}

function ingredientMatchScore(receiptName: string, ingredientName: string, brand?: string) {
  const receiptNormalized = normalizeForIngredientMatch(receiptName)
  const ingredientNormalized = normalizeForIngredientMatch(ingredientName)
  const brandNormalized = brand ? normalizeForIngredientMatch(brand) : ''

  if (!receiptNormalized || !ingredientNormalized) return 0
  if (receiptNormalized === ingredientNormalized) return 100
  if (receiptNormalized.includes(ingredientNormalized) || ingredientNormalized.includes(receiptNormalized)) return 90

  const receiptTokens = new Set(normalizeForIngredientMatch(`${receiptName} ${brand ?? ''}`).split(' ').filter(Boolean))
  const ingredientTokens = ingredientNormalized.split(' ').filter(Boolean)
  if (ingredientTokens.length === 0) return 0

  const matchedTokens = ingredientTokens.filter((token) => receiptTokens.has(token))
  const tokenScore = matchedTokens.length / ingredientTokens.length
  const brandScore = brandNormalized && ingredientNormalized.includes(brandNormalized) ? 0.25 : 0

  return tokenScore + brandScore
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function sanitizeReceiptIngredientName(value: string) {
  return value
    .replace(/\b\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)*\b/gi, '')
    .replace(/\b\d+\s*(?:pcs?|pieces?|pack|packs|box|boxes|bag|bags)\b$/i, '')
    .replace(/[()\-_,]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
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
  const packageQuantity = Number(item.packageQuantity)
  const packageUnit = canonicalise(item.packageUnit || 'piece')

  if (!Number.isFinite(receiptQuantity) || receiptQuantity <= 0) {
    throw new Error(`Invalid quantity for receipt item "${item.name}"`)
  }

  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    throw new Error(`Invalid total price for receipt item "${item.name}"`)
  }

  if (Number.isFinite(packageQuantity) && packageQuantity > 0) {
    const packageBaseQuantity = convertQuantityValue(packageQuantity, packageUnit, ingredientUnit)
    if (packageBaseQuantity != null && packageBaseQuantity > 0) {
      const stockIncrement = receiptQuantity * packageBaseQuantity
      return {
        stockIncrement,
        unitCost: totalPrice / stockIncrement,
      }
    }
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

      const processed: Array<{
        ingredientId: string
        ingredientName: string
        expenseId: string
        action: 'CREATED' | 'UPDATED'
      }> = []

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
          packageQuantity,
          packageUnit,
        } = item

        if (!name || quantity == null || unitPrice == null || totalPrice == null) {
          throw new Error(`Invalid item data: missing required fields for "${name || 'unnamed item'}"`)
        }

        let targetIngredientId = providedIngredientId
        let expenseQuantity = Number(quantity)
        let expenseUnitCost = roundCurrency(Number(unitPrice))

        if (!targetIngredientId) {
          const existingCandidates = await tx.ingredient.findMany({
            where: { restaurantId },
            select: { id: true, name: true },
          })
          const matchedExisting = existingCandidates
            .map((ingredient) => ({
              ingredient,
              score: ingredientMatchScore(name, ingredient.name, brand),
            }))
            .filter((candidate) => candidate.score >= 0.6)
            .sort((left, right) => right.score - left.score)[0]

          if (matchedExisting) {
            targetIngredientId = matchedExisting.ingredient.id
          }
        }

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
                  bulkPrice: true,
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

          const matchedVariant = pickBestVariant(existingIngredient, brand, supplier)
          const variantData = {
            brand: brand?.trim() || matchedVariant?.brand || 'Generic',
            supplier: supplier?.trim() || matchedVariant?.supplier || null,
            purchaseDate: date ? new Date(date) : null,
            packageQuantity:
              Number.isFinite(Number(packageQuantity)) && Number(packageQuantity) > 0
                ? Number(packageQuantity)
                : Number.isFinite(Number(quantity)) && Number(quantity) > 0
                  ? Number(quantity)
                  : null,
            packageUnit: canonicalise(packageUnit || unit || existingIngredient.unit || 'piece'),
            bulkPrice: Number(quantity) > 0 ? roundCurrency(Number(totalPrice) / Number(quantity)) : Number(totalPrice),
            costPerUnit: roundCurrency(unitCost),
          }

          if (matchedVariant) {
            await tx.ingredientVariant.update({
              where: { id: matchedVariant.id },
              data: variantData,
            })
          } else {
            await tx.ingredientVariant.create({
              data: {
                ...variantData,
                ingredientId: targetIngredientId,
              },
            })
          }

          expenseQuantity = stockIncrement
          expenseUnitCost = roundCurrency(unitCost)

          processed.push({
            ingredientId: targetIngredientId,
            ingredientName: existingIngredient.name,
            expenseId: '',
            action: 'UPDATED',
          })
        } else {
          const normalizedName = sanitizeReceiptIngredientName(name.trim()) || name.trim()
          const baseUnit = canonicalise(packageUnit || unit || 'piece')
          const receiptQuantity = Number(quantity)
          const packageSize = Number(packageQuantity)
          const stockQuantity =
            Number.isFinite(packageSize) && packageSize > 0
              ? receiptQuantity * packageSize
              : receiptQuantity
          const roundedUnitCost = roundCurrency(Number(totalPrice) / stockQuantity)

          const newIngredient = await tx.ingredient.create({
            data: {
              name: normalizedName,
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
                  packageQuantity:
                    Number.isFinite(packageSize) && packageSize > 0
                      ? packageSize
                      : Number.isFinite(receiptQuantity) && receiptQuantity > 0
                        ? receiptQuantity
                        : null,
                  packageUnit: canonicalise(packageUnit || unit || 'piece'),
                  bulkPrice: receiptQuantity > 0 ? roundCurrency(Number(totalPrice) / receiptQuantity) : totalPrice,
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
                increment: stockQuantity,
              },
            },
          })

          expenseQuantity = stockQuantity
          expenseUnitCost = roundedUnitCost

          processed.push({
            ingredientId: targetIngredientId,
            ingredientName: normalizedName,
            expenseId: '',
            action: 'CREATED',
          })
        }

        const expense = await tx.expenseTransaction.create({
          data: {
            name: `Purchase: ${sanitizeReceiptIngredientName(name.trim()) || name.trim()}${brand ? ` (${brand.trim()})` : ''}`,
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

        const processedEntry = processed[processed.length - 1]
        if (processedEntry && processedEntry.ingredientId === targetIngredientId) {
          processedEntry.expenseId = expense.id
        }
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
