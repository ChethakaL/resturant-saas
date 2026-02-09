import { getServerSession } from 'next-auth'

export const dynamic = 'force-dynamic'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.supplierId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const requests = await prisma.stockRequest.findMany({
    where: { supplierId: session.user.supplierId },
    include: {
      restaurant: { select: { id: true, name: true, city: true, address: true } },
      lines: {
        include: {
          supplierProduct: { select: { name: true, packSize: true, packUnit: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(requests)
}
