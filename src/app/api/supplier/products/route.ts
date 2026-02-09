import { getServerSession } from 'next-auth'

export const dynamic = 'force-dynamic'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const products = await prisma.supplierProduct.findMany({
      where: { supplierId: session.user.supplierId },
      include: {
        globalIngredient: true,
        prices: {
          where: {
            effectiveFrom: { lte: new Date() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(products)
  } catch (error) {
    console.error('Supplier products GET:', error)
    return NextResponse.json({ error: 'Failed to list products' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      category,
      packSize,
      packUnit,
      brand,
      sku,
      isActive = true,
      globalIngredientId,
    } = body

    if (!name || category == null || packSize == null || !packUnit) {
      return NextResponse.json(
        { error: 'Missing required fields: name, category, packSize, packUnit' },
        { status: 400 }
      )
    }

    const product = await prisma.supplierProduct.create({
      data: {
        supplierId: session.user.supplierId,
        name: String(name),
        category: String(category),
        packSize: Number(packSize),
        packUnit: String(packUnit),
        brand: brand ? String(brand) : null,
        sku: sku ? String(sku) : null,
        isActive: Boolean(isActive),
        globalIngredientId: globalIngredientId || null,
      },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('Supplier product POST:', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
