import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY
const PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!PRICE_MONTHLY || !PRICE_ANNUAL) {
      return NextResponse.json(
        { error: 'Billing not configured. Set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL.' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const plan = body.plan === 'annual' ? 'annual' : 'monthly'
    const priceId = plan === 'annual' ? PRICE_ANNUAL : PRICE_MONTHLY

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { id: true, name: true, email: true, stripeCustomerId: true },
    })
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    let customerId = restaurant.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: restaurant.email || undefined,
        name: restaurant.name,
        metadata: { restaurantId: restaurant.id },
      })
      customerId = customer.id
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { stripeCustomerId: customerId },
      })
    }

    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?success=true`,
      cancel_url: `${origin}/billing?canceled=true`,
      metadata: { restaurantId: restaurant.id, plan },
      subscription_data: { metadata: { restaurantId: restaurant.id } },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Billing checkout error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
