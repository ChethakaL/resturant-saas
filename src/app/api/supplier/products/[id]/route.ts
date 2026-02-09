import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const product = await prisma.supplierProduct.findFirst({
      where: { id, supplierId: session.user.supplierId },
      include: {
        globalIngredient: true,
        prices: { orderBy: { effectiveFrom: 'desc' } },
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('Supplier product GET:', error)
    return NextResponse.json({ error: 'Failed to get product' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.supplierProduct.findFirst({
      where: { id, supplierId: session.user.supplierId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const body = await request.json()
    const product = await prisma.supplierProduct.update({
      where: { id },
      data: {
        ...(body.name != null && { name: String(body.name) }),
        ...(body.category != null && { category: String(body.category) }),
        ...(body.packSize != null && { packSize: Number(body.packSize) }),
        ...(body.packUnit != null && { packUnit: String(body.packUnit) }),
        ...(body.brand !== undefined && { brand: body.brand ? String(body.brand) : null }),
        ...(body.sku !== undefined && { sku: body.sku ? String(body.sku) : null }),
        ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
        ...(body.globalIngredientId !== undefined && { globalIngredientId: body.globalIngredientId || null }),
      },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('Supplier product PATCH:', error)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.supplierProduct.findFirst({
      where: { id, supplierId: session.user.supplierId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    await prisma.supplierProduct.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Supplier product DELETE:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
