import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Validates a promo code without starting checkout. Used for Apply button feedback. */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const code = request.nextUrl.searchParams.get('code')?.trim().toUpperCase()
    if (!code || code.length < 2) {
      return NextResponse.json({ valid: false, error: 'Enter a promo code' }, { status: 200 })
    }

    const promo = await prisma.promoCode.findUnique({
      where: { code },
    })

    if (!promo) {
      return NextResponse.json({ valid: false, error: 'Invalid promo code' }, { status: 200 })
    }
    if (!promo.stripeCouponId) {
      return NextResponse.json({ valid: false, error: 'This promo code is not properly configured.' }, { status: 200 })
    }
    if (promo.maxRedemptions != null && promo.timesRedeemed >= promo.maxRedemptions) {
      return NextResponse.json({ valid: false, error: 'This promo code has reached its usage limit.' }, { status: 200 })
    }

    const alreadyRedeemed = await prisma.promoRedemption.findUnique({
      where: {
        promoCodeId_restaurantId: { promoCodeId: promo.id, restaurantId: session.user.restaurantId },
      },
    })
    if (alreadyRedeemed) {
      return NextResponse.json({ valid: false, error: 'You have already used this promo code.' }, { status: 200 })
    }

    return NextResponse.json({
      valid: true,
      type: promo.type,
      message: promo.type === 'ONE_YEAR_FREE' ? '1 year free!' : '1 month free!',
    })
  } catch (error) {
    console.error('Validate promo error:', error)
    return NextResponse.json({ valid: false, error: 'Failed to validate' }, { status: 500 })
  }
}
