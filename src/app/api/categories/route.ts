import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { isPnlCategoryType, isPnlParentCategory } from '@/lib/live-pnl-categories'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const categories = await prisma.category.findMany({
      where: { restaurantId: session.user.restaurantId },
      orderBy: { displayOrder: 'asc' },
    })

    return NextResponse.json(categories)
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
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

    const data = await request.json()

    const pnlParent = isPnlParentCategory(data.pnlParent) ? data.pnlParent : 'FOOD'
    const pnlType = isPnlCategoryType(data.pnlType) ? data.pnlType : pnlParent === 'OTHER' ? 'INCOME' : 'PRODUCT'
    const taxRate = typeof data.taxRate === 'number' && Number.isFinite(data.taxRate) ? data.taxRate : null

    const category = await prisma.category.create({
      data: {
        name: data.name,
        description: data.description,
        displayOrder: data.displayOrder ?? 0,
        showOnMenu: data.showOnMenu !== false,
        pnlParent,
        pnlType,
        taxRate,
        restaurantId: session.user.restaurantId,
      },
    })

    return NextResponse.json(category)
  } catch (error) {
    console.error('Error creating category:', error)
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    )
  }
}
