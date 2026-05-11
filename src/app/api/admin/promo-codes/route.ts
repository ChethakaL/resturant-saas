import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

const PROMO_TYPES = ['ONE_YEAR_FREE', 'ONE_MONTH_FREE', 'PERCENTAGE'] as const
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
      include: {
        redemptions: {
          orderBy: { createdAt: 'desc' },
          include: {
            restaurant: {
              select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                subscriptionStatus: true,
                createdAt: true,
              },
            },
          },
        },
      },
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
        { error: 'Invalid promo type' },
        { status: 400 }
      )
    }

    const percentOff = typeof body.percentOff === 'number' ? body.percentOff : null
    if (type === 'PERCENTAGE' && (percentOff === null || percentOff <= 0 || percentOff > 100)) {
      return NextResponse.json(
        { error: 'Percentage off must be between 0 and 100' },
        { status: 400 }
      )
    }

    const existing = await prisma.promoCode.findUnique({ where: { code } })
    if (existing) {
      return NextResponse.json({ error: 'Promo code already exists' }, { status: 400 })
    }

    // Create Stripe Coupon
    let stripeCouponId: string | undefined
    try {
      const couponParams: any = {
        name: `${code} (${type})`,
        id: code, // Use the code as the ID for easier management
      }

      if (type === 'ONE_YEAR_FREE') {
        couponParams.percent_off = 100
        couponParams.duration = 'repeating'
        couponParams.duration_in_months = 12
      } else if (type === 'ONE_MONTH_FREE') {
        couponParams.percent_off = 100
        couponParams.duration = 'once'
      } else if (type === 'PERCENTAGE') {
        couponParams.percent_off = percentOff
        couponParams.duration = 'forever'
      }

      const coupon = await stripe.coupons.create(couponParams)
      stripeCouponId = coupon.id
    } catch (err: any) {
      console.error('Stripe coupon creation error:', err)
      return NextResponse.json(
        { error: `Stripe Error: ${err.message}` },
        { status: 500 }
      )
    }

    const promo = await prisma.promoCode.create({
      data: {
        code,
        type,
        value: type === 'PERCENTAGE' ? percentOff : null,
        stripeCouponId,
        maxRedemptions: maxRedemptions ?? undefined,
      },
      include: {
        redemptions: {
          include: {
            restaurant: {
              select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                subscriptionStatus: true,
                createdAt: true,
              },
            },
          },
        },
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
