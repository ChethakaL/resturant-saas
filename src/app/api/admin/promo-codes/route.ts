import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

const PROMO_TYPES = ['ONE_YEAR_FREE', 'ONE_MONTH_FREE'] as const
type PromoType = (typeof PROMO_TYPES)[number]

function isValidPromoType(v: unknown): v is PromoType {
  return typeof v === 'string' && PROMO_TYPES.includes(v as PromoType)
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.type !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const promos = await prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(promos)
  } catch (error) {
    console.error('Admin promo-codes list error:', error)
    return NextResponse.json(
      { error: 'Failed to list promo codes' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.type !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    const type = body.type
    const maxRedemptions = typeof body.maxRedemptions === 'number' ? body.maxRedemptions : null

    if (!code || code.length < 3) {
      return NextResponse.json(
        { error: 'Code must be at least 3 characters' },
        { status: 400 }
      )
    }

    if (!isValidPromoType(type)) {
      return NextResponse.json(
        { error: 'Type must be ONE_YEAR_FREE or ONE_MONTH_FREE' },
        { status: 400 }
      )
    }

    const existing = await prisma.promoCode.findUnique({ where: { code } })
    if (existing) {
      return NextResponse.json({ error: 'Promo code already exists' }, { status: 400 })
    }

    const durationMonths = type === 'ONE_YEAR_FREE' ? 12 : 1
    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'repeating',
      duration_in_months: durationMonths,
      name: `${type === 'ONE_YEAR_FREE' ? '1 year' : '1 month'} free - ${code}`,
    })

    const promo = await prisma.promoCode.create({
      data: {
        code,
        type,
        stripeCouponId: coupon.id,
        maxRedemptions: maxRedemptions ?? undefined,
      },
    })

    return NextResponse.json(promo)
  } catch (error) {
    console.error('Admin promo-codes create error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create promo code' },
      { status: 500 }
    )
  }
}
