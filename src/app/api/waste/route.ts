import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const wasteRecordSchema = z.object({
  ingredientId: z.string(),
  quantity: z.number().positive(),
  date: z.string(),
  reason: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {
      restaurantId: session.user.restaurantId,
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const wasteRecords = await prisma.wasteRecord.findMany({
      where,
      include: {
        ingredient: true,
      },
      orderBy: {
        date: 'desc',
      },
    })

    return NextResponse.json(wasteRecords)
  } catch (error: any) {
    console.error('Error fetching waste records:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch waste records' },
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
    const data = wasteRecordSchema.parse(body)

    const result = await prisma.$transaction(async (tx) => {
      // Get ingredient to calculate cost
      const ingredient = await tx.ingredient.findUnique({
        where: { id: data.ingredientId },
      })

      if (!ingredient) {
        throw new Error('Ingredient not found')
      }

      if (ingredient.restaurantId !== session.user.restaurantId) {
        throw new Error('Unauthorized')
      }

      // Check if we have enough stock
      if (ingredient.stockQuantity < data.quantity) {
        throw new Error(`Insufficient stock. Available: ${ingredient.stockQuantity} ${ingredient.unit}`)
      }

      const cost = data.quantity * ingredient.costPerUnit

      // Create waste record
      const wasteRecord = await tx.wasteRecord.create({
        data: {
          ingredientId: data.ingredientId,
          quantity: data.quantity,
          cost,
          date: new Date(data.date),
          reason: data.reason,
          notes: data.notes,
          restaurantId: session.user.restaurantId,
        },
        include: {
          ingredient: true,
        },
      })

      // Deduct from inventory
      await tx.ingredient.update({
        where: { id: data.ingredientId },
        data: {
          stockQuantity: {
            decrement: data.quantity,
          },
        },
      })

      // Create stock adjustment record
      await tx.stockAdjustment.create({
        data: {
          ingredientId: data.ingredientId,
          quantityChange: -data.quantity,
          reason: 'waste',
          notes: data.notes || `Waste: ${data.reason || 'No reason provided'}`,
        },
      })

      // Create expense transaction for the waste cost
      await tx.expenseTransaction.create({
        data: {
          name: `Waste: ${ingredient.name}`,
          category: 'OTHER',
          amount: cost,
          date: new Date(data.date),
          notes: `Waste record: ${data.quantity} ${ingredient.unit} of ${ingredient.name}. ${data.reason || ''}`,
          restaurantId: session.user.restaurantId,
        },
      })

      return wasteRecord
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error creating waste record:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || 'Failed to create waste record' },
      { status: 500 }
    )
  }
}
