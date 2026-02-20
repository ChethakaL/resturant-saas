import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

/** Creates a Stripe Customer Portal session for managing subscription (cancel, update payment, invoices). */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { stripeCustomerId: true },
    })

    if (!restaurant?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account found. Subscribe first to manage your subscription.' },
        { status: 400 }
      )
    }

    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const returnUrl = `${origin}/billing`

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: restaurant.stripeCustomerId,
      return_url: returnUrl,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error('Billing portal error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to open billing portal' },
      { status: 500 }
    )
  }
}
