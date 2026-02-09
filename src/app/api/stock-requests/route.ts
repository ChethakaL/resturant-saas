import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const requests = await prisma.stockRequest.findMany({
    where: { restaurantId: session.user.restaurantId },
    include: {
      supplier: { select: { id: true, name: true, email: true } },
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

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json()
  const { supplierId, lines, notes } = body as {
    supplierId: string
    lines: { supplierProductId: string; quantity: number; unit: string }[]
    notes?: string
  }
  if (!supplierId || !lines?.length) {
    return NextResponse.json(
      { error: 'supplierId and at least one line (supplierProductId, quantity, unit) required' },
      { status: 400 }
    )
  }
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, status: 'APPROVED' },
  })
  if (!supplier) {
    return NextResponse.json({ error: 'Supplier not found or not approved' }, { status: 404 })
  }
  const created = await prisma.stockRequest.create({
    data: {
      restaurantId: session.user.restaurantId,
      supplierId,
      status: 'PENDING',
      notes: notes || null,
      lines: {
        create: lines.map((l) => ({
          supplierProductId: l.supplierProductId,
          quantity: Number(l.quantity),
          unit: String(l.unit),
        })),
      },
    },
    include: {
      supplier: { select: { name: true } },
      lines: {
        include: {
          supplierProduct: { select: { name: true } },
        },
      },
    },
  })
  return NextResponse.json(created)
}
