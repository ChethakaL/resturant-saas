import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { NextResponse } from 'next/server'

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
  'IQD',
])

function toStripeAmount(amount: number, currency: string) {
  const normalized = currency.toUpperCase()
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) {
    return Math.round(amount)
  }
  return Math.round(amount * 100)
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const orderId = data.orderId as string | undefined
    const amountOverride = typeof data.amount === 'number' ? data.amount : null

    let amount = amountOverride
    let currency = 'IQD'

    if (orderId) {
      const order = await prisma.sale.findFirst({
        where: { id: orderId, restaurantId: session.user.restaurantId },
        include: { restaurant: true },
      })

      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      amount = order.total
      currency = order.restaurant.currency || 'IQD'
    } else {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: session.user.restaurantId },
        select: { currency: true },
      })
      currency = restaurant?.currency || 'IQD'
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const intent = await stripe.paymentIntents.create({
      amount: toStripeAmount(amount, currency),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: orderId ? { orderId } : undefined,
    })

    if (orderId) {
      await prisma.sale.update({
        where: { id: orderId },
        data: {
          stripePaymentIntentId: intent.id,
          paymentProvider: 'STRIPE',
        },
      })
    }

    return NextResponse.json({ clientSecret: intent.client_secret })
  } catch (error) {
    console.error('Error creating payment intent:', error)
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    )
  }
}
