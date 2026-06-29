import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const VOID_REASONS = [
  'MIS_RING_WRONG_ITEM',
  'WRONG_TABLE',
  'CUSTOMER_WALKOUT',
  'COMP_STAFF_MEAL',
  'KITCHEN_ERROR',
] as const

const RESTORE_INVENTORY_REASONS = new Set<(typeof VOID_REASONS)[number]>([
  'MIS_RING_WRONG_ITEM',
  'WRONG_TABLE',
])

class VoidOrderError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function isVoidReason(value: unknown): value is (typeof VOID_REASONS)[number] {
  return typeof value === 'string' && VOID_REASONS.includes(value as (typeof VOID_REASONS)[number])
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can void paid orders' }, { status: 403 })
    }

    const resolvedParams = typeof params === 'object' && 'then' in params
      ? await params
      : params
    const orderId = resolvedParams.id
    const body = await request.json().catch(() => ({}))
    const reason = body?.reason

    if (!isVoidReason(reason)) {
      return NextResponse.json({ error: 'A valid void reason is required' }, { status: 400 })
    }

    const restoresInventory = RESTORE_INVENTORY_REASONS.has(reason)

    const voidRecord = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.sale.findFirst({
        where: {
          id: orderId,
          restaurantId: session.user.restaurantId,
        },
        include: {
          void: true,
          items: {
            include: {
              menuItem: {
                include: {
                  ingredients: true,
                },
              },
            },
          },
        },
      })

      if (!existingOrder) {
        throw new VoidOrderError('Order not found', 404)
      }

      if (existingOrder.status !== 'COMPLETED') {
        throw new VoidOrderError('Only paid completed orders can be voided', 400)
      }

      if (existingOrder.void) {
        throw new VoidOrderError('Order has already been voided', 409)
      }

      const createdVoid = await tx.orderVoid.create({
        data: {
          orderId: existingOrder.id,
          restaurantId: existingOrder.restaurantId,
          performedByUserId: session.user.id,
          reason,
          amount: existingOrder.total,
          restoresInventory,
        },
        include: {
          performedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      if (restoresInventory) {
        const ingredientRestoration = new Map<string, number>()

        existingOrder.items.forEach((saleItem) => {
          saleItem.menuItem.ingredients.forEach((itemIngredient) => {
            const current = ingredientRestoration.get(itemIngredient.ingredientId) || 0
            ingredientRestoration.set(
              itemIngredient.ingredientId,
              current + itemIngredient.quantity * saleItem.quantity
            )
          })
        })

        for (const [ingredientId, quantity] of Array.from(ingredientRestoration.entries())) {
          await tx.ingredient.update({
            where: { id: ingredientId },
            data: {
              stockQuantity: {
                increment: quantity,
              },
            },
          })

          await tx.stockAdjustment.create({
            data: {
              ingredientId,
              quantityChange: quantity,
              reason: 'void_order',
              notes: `Order ${existingOrder.orderNumber} voided - stock restored (${reason})`,
            },
          })
        }
      }

      return createdVoid
    })

    return NextResponse.json({ success: true, void: voidRecord })
  } catch (error: any) {
    console.error('Error voiding order:', error)
    const status = error instanceof VoidOrderError ? error.status : 500
    return NextResponse.json(
      { error: error.message || 'Failed to void order' },
      { status }
    )
  }
}
