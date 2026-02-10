import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const deliverySchema = z.object({
  ingredientId: z.string(),
  supplierName: z.string().min(1),
  quantity: z.number().positive(),
  unitCost: z.number().positive(),
  transportCost: z.number().min(0).optional(),
  deliveryDate: z.string(),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ingredientId = searchParams.get('ingredientId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const supplier = searchParams.get('supplier')

    const where: any = {
      restaurantId: session.user.restaurantId,
    }

    if (ingredientId) {
      where.ingredientId = ingredientId
    }

    if (startDate && endDate) {
      where.deliveryDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    if (supplier) {
      where.supplierName = {
        contains: supplier,
        mode: 'insensitive',
      }
    }

    const deliveries = await prisma.delivery.findMany({
      where,
      include: {
        ingredient: true,
        expenseTransaction: true,
      },
      orderBy: {
        deliveryDate: 'desc',
      },
    })

    return NextResponse.json(deliveries)
  } catch (error: any) {
    console.error('Error fetching deliveries:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch deliveries' },
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
    const data = deliverySchema.parse(body)

    const result = await prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.findUnique({
        where: { id: data.ingredientId },
      })

      if (!ingredient || ingredient.restaurantId !== session.user.restaurantId) {
        throw new Error('Ingredient not found')
      }

      const totalCost = data.quantity * data.unitCost
      const transportCost = data.transportCost || 0

      const expenseTransaction = await tx.expenseTransaction.create({
        data: {
          name: `Delivery: ${ingredient.name} (${data.supplierName})`,
          category: 'INVENTORY_PURCHASE',
          amount: totalCost,
          date: new Date(data.deliveryDate),
          notes: data.notes,
          ingredientId: data.ingredientId,
          quantity: data.quantity,
          unitCost: data.unitCost,
          restaurantId: session.user.restaurantId,
        },
      })

      if (transportCost > 0) {
        await tx.expenseTransaction.create({
          data: {
            name: `Delivery Transport: ${data.supplierName}`,
            category: 'OTHER',
            amount: transportCost,
            date: new Date(data.deliveryDate),
            notes: 'Transport cost',
            restaurantId: session.user.restaurantId,
          },
        })
      }

      const currentTotalValue = ingredient.stockQuantity * ingredient.costPerUnit
      const newTotalValue = data.quantity * data.unitCost
      const newTotalQuantity = ingredient.stockQuantity + data.quantity
      const newAverageCost =
        newTotalQuantity > 0
          ? (currentTotalValue + newTotalValue) / newTotalQuantity
          : data.unitCost
      const costPerUnitRounded = Math.round(newAverageCost * 100) / 100

      await tx.ingredient.update({
        where: { id: data.ingredientId },
        data: {
          stockQuantity: newTotalQuantity,
          costPerUnit: costPerUnitRounded,
        },
      })

      await tx.stockAdjustment.create({
        data: {
          ingredientId: data.ingredientId,
          quantityChange: data.quantity,
          reason: 'purchase',
          notes: `Delivery: ${data.supplierName}`,
        },
      })

      const delivery = await tx.delivery.create({
        data: {
          ingredientId: data.ingredientId,
          supplierName: data.supplierName,
          quantity: data.quantity,
          unitCost: data.unitCost,
          totalCost,
          transportCost,
          deliveryDate: new Date(data.deliveryDate),
          invoiceNumber: data.invoiceNumber,
          notes: data.notes,
          expenseTransactionId: expenseTransaction.id,
          restaurantId: session.user.restaurantId,
        },
      })

      return delivery
    })

    const fullDelivery = await prisma.delivery.findUnique({
      where: { id: result.id },
      include: {
        ingredient: true,
        expenseTransaction: true,
      },
    })

    return NextResponse.json(fullDelivery)
  } catch (error: any) {
    console.error('Error creating delivery:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || 'Failed to create delivery' },
      { status: 500 }
    )
  }
}
