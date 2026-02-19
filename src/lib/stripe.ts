import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY

if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY or STRIPE_API_KEY must be set')
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-06-20',
})
