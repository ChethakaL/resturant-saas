import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')?.trim().toUpperCase()
    if (!code || code.length < 2) {
      return NextResponse.json({ valid: false, error: 'Enter a promo code' })
    }

    const promo = await prisma.promoCode.findUnique({ where: { code } })
    if (!promo) {
      return NextResponse.json({ valid: false, error: 'Invalid promo code' })
    }
    if (!promo.stripeCouponId) {
      return NextResponse.json({ valid: false, error: 'This promo code is not properly configured.' })
    }
    if (promo.maxRedemptions != null && promo.timesRedeemed >= promo.maxRedemptions) {
      return NextResponse.json({ valid: false, error: 'This promo code has reached its usage limit.' })
    }
    try {
      await stripe.coupons.retrieve(promo.stripeCouponId)
    } catch {
      return NextResponse.json({
        valid: false,
        error: 'This promo code is not available for the current Stripe mode.',
      })
    }

    return NextResponse.json({
      valid: true,
      code,
      type: promo.type,
      value: promo.value,
      message:
        promo.type === 'ONE_YEAR_FREE'
          ? '1 year free!'
          : promo.type === 'ONE_MONTH_FREE'
            ? '1 month free!'
            : `${promo.value}% discount applied!`,
    })
  } catch (error) {
    console.error('Public validate promo error:', error)
    return NextResponse.json({ valid: false, error: 'Failed to validate promo code' }, { status: 500 })
  }
}
