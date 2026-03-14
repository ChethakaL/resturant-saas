import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canonicalise } from '@/lib/unit-converter'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { receiptId, items } = await request.json()

    if (!receiptId || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }

    const restaurantId = session.user.restaurantId
    console.log(`[CONFIRM] Processing receipt ${receiptId} with ${items.length} items`)

    // 1. Process each item
    for (const item of items) {
      const { ingredientId, quantity, unitPrice, totalPrice, supplier, date } = item
      console.log(`[CONFIRM] Item: ${item.name}, ingredientId: ${ingredientId}`)

      let targetIngredientId = ingredientId

      // If no ID, create a new ingredient
      if (!targetIngredientId) {
        console.log(`[CONFIRM] Creating new ingredient: ${item.name}`)
        const newIng = await (prisma.ingredient.create as any)({
          data: {
            name: item.name,
            unit: canonicalise(item.unit || 'g'),
            restaurantId,
            stockQuantity: 0, // Will be incremented next
            costPerUnit: unitPrice,
            minStockLevel: 0,
            brand: item.brand || null,
            supplier: supplier || null,
          }
        })
        targetIngredientId = (newIng as any).id
      }

      // Update Ingredient costPerUnit and increment stock
      await prisma.ingredient.update({
        where: { id: targetIngredientId, restaurantId },
        data: {
          costPerUnit: unitPrice,
          stockQuantity: { increment: quantity },
          supplier: supplier || undefined,
        },
      })

      // Create Delivery record
      await prisma.delivery.create({
        data: {
          restaurantId,
          ingredientId: targetIngredientId,
          quantity,
          unitCost: unitPrice,
          totalCost: totalPrice,
          supplierName: supplier || 'Unknown',
          deliveryDate: date ? new Date(date) : new Date(),
          receiptId,
        } as any,
      })

      // Create ExpenseTransaction
      await prisma.expenseTransaction.create({
        data: {
          restaurantId,
          name: `Purchase: ${item.name || 'Ingredient'}`,
          category: 'INVENTORY_PURCHASE',
          amount: totalPrice,
          date: date ? new Date(date) : new Date(),
          ingredientId: targetIngredientId,
          quantity,
          unitCost: unitPrice,
          receiptId,
        } as any,
      })
    }

    // 2. Update Receipt status
    await (prisma as any).receipt.update({
      where: { id: receiptId, restaurantId },
      data: { status: 'PROCESSED' },
    })

    console.log(`[CONFIRM] Receipt ${receiptId} processed successfully`)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Receipt confirmation error:', error)
    return NextResponse.json(
      { error: 'Failed to confirm receipt', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
