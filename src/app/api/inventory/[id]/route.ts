import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = params instanceof Promise ? await params : params
    const data = await request.json()

    // Verify ingredient belongs to restaurant
    const existing = await prisma.ingredient.findFirst({
      where: {
        id: resolvedParams.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
    }

    const ingredient = await prisma.ingredient.update({
      where: { id: resolvedParams.id },
      data: {
        name: data.name,
        unit: data.unit,
        costPerUnit: data.costPerUnit,
        minStockLevel: data.minStockLevel,
        supplier: data.supplier,
        notes: data.notes,
      },
    })

    return NextResponse.json(ingredient)
  } catch (error) {
    console.error('Error updating ingredient:', error)
    return NextResponse.json(
      { error: 'Failed to update ingredient' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = params instanceof Promise ? await params : params

    // Verify ingredient belongs to restaurant
    const existing = await prisma.ingredient.findFirst({
      where: {
        id: resolvedParams.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
    }

    await prisma.ingredient.delete({
      where: { id: resolvedParams.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting ingredient:', error)
    return NextResponse.json(
      { error: 'Failed to delete ingredient' },
      { status: 500 }
    )
  }
}
