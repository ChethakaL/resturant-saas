import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'

export function isActiveStripeSubscription(subscription: Stripe.Subscription) {
  return subscription.status === 'active' || subscription.status === 'trialing'
}

export function getBranchQuantityFromSubscription(
  subscription: Stripe.Subscription,
  branchPriceId: string,
  mainSubscriptionId?: string | null
) {
  const branchItem = subscription.items.data.find((item) => item.price.id === branchPriceId)
  if (!branchItem) {
    return 0
  }

  if (subscription.id === mainSubscriptionId) {
    return branchItem.quantity ?? 0
  }

  if (subscription.metadata?.kind === 'branch_addon') {
    return branchItem.quantity ?? 0
  }

  return 0
}

export async function listCustomerSubscriptions(customerId: string) {
  const subscriptions: Stripe.Subscription[] = []
  let startingAfter: string | undefined

  while (true) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    subscriptions.push(...page.data)

    if (!page.has_more || page.data.length === 0) {
      break
    }

    startingAfter = page.data[page.data.length - 1]?.id
  }

  return subscriptions
}

export async function getBranchCapacityForRestaurant(params: {
  branchPriceId: string
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  settings?: unknown
}) {
  const { branchPriceId, stripeCustomerId, stripeSubscriptionId, settings } = params
  const settingsRecord = (settings as Record<string, unknown>) || {}
  const fallbackMaxBranches = (settingsRecord.maxBranches as number) || 1

  if (!stripeCustomerId && !stripeSubscriptionId) {
    return {
      maxBranches: fallbackMaxBranches,
      extraBranchSlots: Math.max(0, fallbackMaxBranches - 1),
      subscriptions: [] as Stripe.Subscription[],
    }
  }

  const subscriptions = stripeCustomerId
    ? await listCustomerSubscriptions(stripeCustomerId)
    : stripeSubscriptionId
      ? [await stripe.subscriptions.retrieve(stripeSubscriptionId)]
      : []

  const activeSubscriptions = subscriptions.filter(isActiveStripeSubscription)
  const extraBranchSlots = activeSubscriptions.reduce((total, subscription) => {
    return total + getBranchQuantityFromSubscription(subscription, branchPriceId, stripeSubscriptionId)
  }, 0)

  return {
    maxBranches: 1 + extraBranchSlots,
    extraBranchSlots,
    subscriptions: activeSubscriptions,
  }
}

export function findBranchSubscriptionItem(
  subscriptions: Stripe.Subscription[],
  branchPriceId: string,
  mainSubscriptionId?: string | null
) {
  for (const subscription of subscriptions) {
    if (!isActiveStripeSubscription(subscription)) {
      continue
    }

    const branchItem = subscription.items.data.find((item) => item.price.id === branchPriceId)
    if (!branchItem) {
      continue
    }

    if (subscription.id === mainSubscriptionId || subscription.metadata?.kind === 'branch_addon') {
      return { subscription, item: branchItem }
    }
  }

  return null
}
