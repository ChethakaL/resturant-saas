import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** List a supplier's products (for restaurant to pick when requesting stock). Query: supplierId */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const supplierId = searchParams.get('supplierId')
  if (!supplierId) {
    return NextResponse.json({ error: 'supplierId required' }, { status: 400 })
  }
  const products = await prisma.supplierProduct.findMany({
    where: { supplierId, isActive: true },
    include: {
      prices: {
        where: { effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(products)
}
