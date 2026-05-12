import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import type Stripe from 'stripe'

function isRestaurantMainSubscription(sub: Stripe.Subscription, restaurantId: string): boolean {
  if (sub.metadata?.kind === 'branch_addon') return false
  return sub.metadata?.restaurantId === restaurantId
}

function isBillableMainStatus(status: Stripe.Subscription.Status): boolean {
  return status === 'active' || status === 'trialing'
}

/**
 * Loads all subscriptions for a Stripe customer, finds main SaaS subs for this restaurant,
 * keeps one canonical subscription (preferSubscriptionId if valid, else newest by `created`),
 * cancels other active/trialing duplicates, and writes the winner to Postgres.
 *
 * Use after checkout and before starting a new Checkout Session to heal DB/Stripe drift.
 */
export async function reconcileRestaurantMainSubscriptions(params: {
  restaurantId: string
  stripeCustomerId: string
  /** Subscription from the current webhook or checkout; wins over older dupes */
  preferSubscriptionId?: string
}): Promise<{
  synced: boolean
  primarySubscriptionId: string | null
  primaryStatus: Stripe.Subscription.Status | null
  currentPeriodEnd: string | null
  canceledSubscriptionIds: string[]
}> {
  const { restaurantId, stripeCustomerId, preferSubscriptionId } = params

  const subs: Stripe.Subscription[] = []
  let startingAfter: string | undefined
  for (;;) {
    const page = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    subs.push(...page.data)
    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1]!.id
  }

  const mainSubs = subs.filter((s) => isRestaurantMainSubscription(s, restaurantId))
  const billable = mainSubs.filter((s) => isBillableMainStatus(s.status))

  if (billable.length === 0) {
    console.info('[billing] reconcile: no active/trialing main subscription for restaurant', {
      restaurantId,
      stripeCustomerId,
      totalStripeSubscriptions: subs.length,
      mainPlanCandidates: mainSubs.map((s) => ({
        id: s.id,
        status: s.status,
        restaurantMeta: s.metadata?.restaurantId ?? null,
      })),
    })
    return {
      synced: false,
      primarySubscriptionId: null,
      primaryStatus: null,
      currentPeriodEnd: null,
      canceledSubscriptionIds: [],
    }
  }

  let primary: Stripe.Subscription
  if (preferSubscriptionId && billable.some((s) => s.id === preferSubscriptionId)) {
    primary = billable.find((s) => s.id === preferSubscriptionId)!
  } else {
    primary = [...billable].sort((a, b) => b.created - a.created)[0]!
  }

  const dupes = billable.filter((s) => s.id !== primary.id)
  const canceledSubscriptionIds: string[] = []

  for (const d of dupes) {
    try {
      await stripe.subscriptions.cancel(d.id)
      canceledSubscriptionIds.push(d.id)
    } catch (err) {
      console.error('[billing] Failed to cancel duplicate subscription', d.id, err)
    }
  }

  const firstItem = primary.items.data[0]
  const periodEndSec = primary.current_period_end
  const currentPeriodEndIso =
    periodEndSec != null && periodEndSec > 0
      ? new Date(periodEndSec * 1000).toISOString()
      : null

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      stripeCustomerId,
      stripeSubscriptionId: primary.id,
      subscriptionStatus: primary.status,
      subscriptionPriceId: firstItem?.price?.id ?? null,
      currentPeriodEnd: currentPeriodEndIso ? new Date(currentPeriodEndIso) : null,
    },
  })

  console.info('[billing] reconcile: synced restaurant from Stripe', {
    restaurantId,
    stripeSubscriptionId: primary.id,
    subscriptionStatus: primary.status,
    canceledDuplicateIds: canceledSubscriptionIds,
  })

  return {
    synced: true,
    primarySubscriptionId: primary.id,
    primaryStatus: primary.status,
    currentPeriodEnd: currentPeriodEndIso,
    canceledSubscriptionIds,
  }
}

