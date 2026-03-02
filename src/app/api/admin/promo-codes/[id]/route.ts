import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.type !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const promo = await prisma.promoCode.findUnique({ where: { id } })
    if (!promo) {
      return NextResponse.json({ error: 'Promo code not found' }, { status: 404 })
    }

    await prisma.promoCode.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin promo-codes delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete promo code' },
      { status: 500 }
    )
  }
}
