import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: { restaurantId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supplierId = session.user.supplierId
    const { restaurantId } = params

    // Find all MenuItemIngredients where the supplier product belongs to this supplier
    // AND the menu item belongs to this restaurant
    const ingredients = await prisma.menuItemIngredient.findMany({
      where: {
        supplierProduct: { supplierId },
        menuItem: { restaurantId },
      },
      select: {
        supplierProductId: true,
        supplierProduct: {
          select: {
            id: true,
            name: true,
          },
        },
        menuItem: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Group by supplierProductId
    const productMap = new Map<
      string,
      {
        supplierProductId: string
        productName: string
        menuItems: { menuItemId: string; menuItemName: string }[]
      }
    >()

    for (const ing of ingredients) {
      if (!ing.supplierProductId || !ing.supplierProduct) continue

      const pid = ing.supplierProductId
      if (!productMap.has(pid)) {
        productMap.set(pid, {
          supplierProductId: pid,
          productName: ing.supplierProduct.name,
          menuItems: [],
        })
      }
      productMap.get(pid)!.menuItems.push({
        menuItemId: ing.menuItem.id,
        menuItemName: ing.menuItem.name,
      })
    }

    const products = Array.from(productMap.values())

    return NextResponse.json({ products })
  } catch (error) {
    console.error('Supplier restaurant usage GET:', error)
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 })
  }
}
