import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import {
  BRANCH_ADDON_PRODUCT_NAME,
  branchAddonQuantityOnSubscription,
  buildBranchSubscriptionItemParams,
  getBranchBillingConfig,
  isBranchAddonSubscriptionItem,
  resolveBranchAddonItems,
  type BranchBillingConfig,
} from '@/lib/branch-billing'

export function isActiveStripeSubscription(subscription: Stripe.Subscription) {
  return subscription.status === 'active' || subscription.status === 'trialing'
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

export async function retrieveSubscription(subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId)
}

export async function countExtraBranchSlots(
  subscriptions: Stripe.Subscription[],
  mainSubscriptionId?: string | null
) {
  let total = 0
  for (const subscription of subscriptions) {
    if (!isActiveStripeSubscription(subscription)) {
      continue
    }
    total += await branchAddonQuantityOnSubscription(subscription, mainSubscriptionId)
  }
  return total
}

export async function getBranchCapacityForRestaurant(params: {
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  settings?: unknown
  branchBilling?: BranchBillingConfig
}) {
  const { stripeCustomerId, stripeSubscriptionId, settings } = params
  const settingsRecord = (settings as Record<string, unknown>) || {}
  const fallbackPaidSlots = Math.max(0, (settingsRecord.maxBranches as number) || 0)

  if (!stripeCustomerId && !stripeSubscriptionId) {
    return {
      maxBranches: fallbackPaidSlots,
      extraBranchSlots: fallbackPaidSlots,
      subscriptions: [] as Stripe.Subscription[],
    }
  }

  let subscriptions: Stripe.Subscription[]

  if (stripeSubscriptionId) {
    subscriptions = [await retrieveSubscription(stripeSubscriptionId)]
    if (stripeCustomerId) {
      const all = await listCustomerSubscriptions(stripeCustomerId)
      const extra = all.filter(
        (sub) =>
          sub.id !== stripeSubscriptionId &&
          isActiveStripeSubscription(sub) &&
          sub.metadata?.kind === 'branch_addon'
      )
      subscriptions = [...subscriptions, ...extra]
    }
  } else if (stripeCustomerId) {
    subscriptions = await listCustomerSubscriptions(stripeCustomerId)
  } else {
    subscriptions = []
  }

  const activeSubscriptions = subscriptions.filter(isActiveStripeSubscription)
  const extraBranchSlots = await countExtraBranchSlots(activeSubscriptions, stripeSubscriptionId)

  return {
    maxBranches: extraBranchSlots,
    extraBranchSlots,
    subscriptions: activeSubscriptions,
  }
}

export async function findBranchSubscriptionItem(
  subscriptions: Stripe.Subscription[],
  mainSubscriptionId?: string | null
) {
  for (const subscription of subscriptions) {
    if (!isActiveStripeSubscription(subscription)) {
      continue
    }

    const branchItems = await resolveBranchAddonItems(subscription.items.data)
    const branchItem = branchItems[0]
    if (!branchItem) {
      continue
    }

    if (subscription.id === mainSubscriptionId || subscription.metadata?.kind === 'branch_addon') {
      return { subscription, item: branchItem }
    }
  }

  return null
}

export type BranchSlotStripeResult = {
  action: 'created' | 'updated'
  subscriptionItemId: string
  quantity: number
  branchPriceUsd: number
}

/** Adds paid branch slots to the restaurant's main Stripe subscription. */
export async function incrementPaidBranchSlots(
  stripeSubscriptionId: string,
  slotsToAdd: number,
  branchBilling?: BranchBillingConfig
): Promise<BranchSlotStripeResult> {
  if (slotsToAdd <= 0) {
    throw new Error('slotsToAdd must be at least 1')
  }

  const billing = branchBilling ?? (await getBranchBillingConfig())

  const mainSubscription = await retrieveSubscription(stripeSubscriptionId)
  if (!isActiveStripeSubscription(mainSubscription)) {
    throw new Error('Your subscription is not active. Renew to add branches.')
  }

  const branchSubscription = await findBranchSubscriptionItem([mainSubscription], stripeSubscriptionId)
  const branchItem = branchSubscription?.item

  if (branchItem) {
    const quantity = (branchItem.quantity ?? 0) + slotsToAdd
    const updated = await stripe.subscriptionItems.update(branchItem.id, {
      quantity,
      proration_behavior: 'always_invoice',
    })
    const result: BranchSlotStripeResult = {
      action: 'updated',
      subscriptionItemId: updated.id,
      quantity,
      branchPriceUsd: billing.branchPriceUsd,
    }
    console.info('[billing/branch-slot] Stripe subscription item updated', result)
    return result
  }

  const itemParams = await buildBranchSubscriptionItemParams(
    billing.branchPriceUsd,
    billing.branchPriceId,
    slotsToAdd
  )

  const created = await stripe.subscriptionItems.create({
    subscription: stripeSubscriptionId,
    proration_behavior: 'always_invoice',
    ...itemParams,
  })

  const result: BranchSlotStripeResult = {
    action: 'created',
    subscriptionItemId: created.id,
    quantity: created.quantity ?? slotsToAdd,
    branchPriceUsd: billing.branchPriceUsd,
  }
  console.info('[billing/branch-slot] Stripe subscription item created', result)
  return result
}
