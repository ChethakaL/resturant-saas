import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// List price history for a product
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: productId } = await params
    const product = await prisma.supplierProduct.findFirst({
      where: { id: productId, supplierId: session.user.supplierId },
    })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const prices = await prisma.supplierPrice.findMany({
      where: { supplierProductId: productId },
      orderBy: { effectiveFrom: 'desc' },
    })

    return NextResponse.json(prices)
  } catch (error) {
    console.error('Supplier prices GET:', error)
    return NextResponse.json({ error: 'Failed to list prices' }, { status: 500 })
  }
}

// Add a new price (versioned; does not overwrite)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: productId } = await params
    const product = await prisma.supplierProduct.findFirst({
      where: { id: productId, supplierId: session.user.supplierId },
    })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const body = await request.json()
    const { price, currency, effectiveFrom, effectiveTo, minOrderQty } = body
    if (price == null || !currency) {
      return NextResponse.json(
        { error: 'Missing required fields: price, currency' },
        { status: 400 }
      )
    }

    const effectiveFromDate = effectiveFrom ? new Date(effectiveFrom) : new Date()
    const effectiveToDate = effectiveTo ? new Date(effectiveTo) : null

    // End the current active price if it exists (only if new price has no end date, i.e. it becomes the active one)
    if (!effectiveToDate) {
      await prisma.supplierPrice.updateMany({
        where: {
          supplierProductId: productId,
          effectiveTo: null,
        },
        data: { effectiveTo: effectiveFromDate },
      })
    }

    const newPrice = await prisma.supplierPrice.create({
      data: {
        supplierProductId: productId,
        price: Number(price),
        currency: String(currency),
        effectiveFrom: effectiveFromDate,
        effectiveTo: effectiveToDate,
        minOrderQty: minOrderQty ? Number(minOrderQty) : null,
        createdByUserId: session.user.id,
      },
    })

    return NextResponse.json(newPrice)
  } catch (error) {
    console.error('Supplier price POST:', error)
    return NextResponse.json({ error: 'Failed to add price' }, { status: 500 })
  }
}
