import { getServerSession } from 'next-auth'

export const dynamic = 'force-dynamic'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.supplierId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await request.json()
  const status = body.status as string
  const valid = ['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED']
  if (!valid.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  const existing = await prisma.stockRequest.findFirst({
    where: { id, supplierId: session.user.supplierId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await prisma.stockRequest.update({
    where: { id },
    data: { status: status as 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' },
  })
  return NextResponse.json({ success: true, status })
}
