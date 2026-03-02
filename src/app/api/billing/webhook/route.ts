import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
if (!webhookSecret) {
  console.warn('STRIPE_WEBHOOK_SECRET is not set — subscription webhook will not verify signatures')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const sig = request.headers.get('stripe-signature')
    let event: Stripe.Event

    if (webhookSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Webhook signature verification failed:', message)
        return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 })
      }
    } else {
      event = JSON.parse(body) as Stripe.Event
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription' || !session.subscription) break
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
        const restaurantId = subscription.metadata?.restaurantId || session.metadata?.restaurantId
        if (!restaurantId) break
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { referredByRestaurantId: true },
        })
        const priceMonthly = process.env.STRIPE_PRICE_MONTHLY
        const priceAnnual = process.env.STRIPE_PRICE_ANNUAL
        const mainPlanItem = subscription.items.data.find(
          (item) => item.price.id === priceMonthly || item.price.id === priceAnnual
        )
        await prisma.restaurant.update({
          where: { id: restaurantId },
          data: {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionPriceId: mainPlanItem?.price?.id ?? subscription.items.data[0]?.price?.id ?? null,
            currentPeriodEnd: new Date((subscription.current_period_end ?? 0) * 1000),
          },
        })
        // Referral bonus: grant referrer 10% off their next month
        if (restaurant?.referredByRestaurantId) {
          try {
            const referrer = await prisma.restaurant.findUnique({
              where: { id: restaurant.referredByRestaurantId },
              select: { stripeSubscriptionId: true },
            })
            if (referrer?.stripeSubscriptionId) {
              const coupon = await stripe.coupons.create({
                percent_off: 10,
                duration: 'once',
                name: 'Referral bonus - 10% off',
              })
              await stripe.subscriptions.update(referrer.stripeSubscriptionId, {
                coupon: coupon.id,
              })
            }
          } catch (err) {
            console.error('Referral bonus apply error:', err)
          }
        }
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const restaurantId = subscription.metadata?.restaurantId
        if (!restaurantId) break
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status
        const priceMonthly = process.env.STRIPE_PRICE_MONTHLY
        const priceAnnual = process.env.STRIPE_PRICE_ANNUAL
        const mainPlanItem = subscription.items.data.find(
          (item) => item.price.id === priceMonthly || item.price.id === priceAnnual
        )
        await prisma.restaurant.update({
          where: { id: restaurantId },
          data: {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: status,
            subscriptionPriceId: mainPlanItem?.price?.id ?? subscription.items.data[0]?.price?.id ?? null,
            currentPeriodEnd: new Date((subscription.current_period_end ?? 0) * 1000),
          },
        })
        break
      }
      default:
        // Unhandled event type
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Billing webhook error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
