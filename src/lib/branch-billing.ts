import type Stripe from 'stripe'
import { getPlatformConfig } from '@/lib/platform-config'
import { stripe } from '@/lib/stripe'

/** Product name used on Stripe for extra-branch subscription line items. */
export const BRANCH_ADDON_PRODUCT_NAME = 'Restaurant SaaS Branch Add-on'

const BILLING_CURRENCY = (process.env.STRIPE_BILLING_CURRENCY || 'usd').toLowerCase()

export type BranchBillingConfig = {
  /** Dollar amount per extra branch per month (from Platform Settings). */
  branchPriceUsd: number
  /** Optional Stripe Price ID if you set one in env; otherwise we bill via price_data. */
  branchPriceId: string | null
}

/** Branch price from Platform Settings (superadmin), with .env numeric fallback. */
export async function getBranchBillingConfig(): Promise<BranchBillingConfig> {
  const platformCfg = await getPlatformConfig()
  const fromDb = platformCfg.priceBranch
  const envRaw = process.env.STRIPE_PRICE_BRANCH?.trim()
  const configured = fromDb ?? (envRaw ? Number(envRaw) : undefined)

  if (envRaw && /^price_/i.test(envRaw)) {
    return {
      branchPriceUsd: Number(fromDb) || 10,
      branchPriceId: envRaw,
    }
  }

  return {
    branchPriceUsd: Number(configured) || 10,
    branchPriceId: null,
  }
}

const productCache = new Map<string, Stripe.Product>()

async function getProduct(productId: string): Promise<Stripe.Product> {
  const cached = productCache.get(productId)
  if (cached) return cached
  const product = await stripe.products.retrieve(productId)
  productCache.set(productId, product)
  return product
}

export function isBranchAddonSubscriptionItem(item: Stripe.SubscriptionItem): boolean {
  if (item.metadata?.kind === 'branch_addon') {
    return true
  }

  const product = item.price.product
  if (typeof product === 'object' && product && !product.deleted) {
    if (product.metadata?.kind === 'branch_addon') {
      return true
    }
    return product.name === BRANCH_ADDON_PRODUCT_NAME
  }

  return false
}

export async function isBranchAddonSubscriptionItemAsync(
  item: Stripe.SubscriptionItem
): Promise<boolean> {
  if (isBranchAddonSubscriptionItem(item)) {
    return true
  }

  const productId =
    typeof item.price.product === 'string' ? item.price.product : item.price.product?.id
  if (!productId) {
    return false
  }

  const product = await getProduct(productId)
  if (product.metadata?.kind === 'branch_addon') {
    return true
  }
  return product.name === BRANCH_ADDON_PRODUCT_NAME
}

export async function resolveBranchAddonItems(items: Stripe.SubscriptionItem[]) {
  const branchItems: Stripe.SubscriptionItem[] = []
  for (const item of items) {
    if (await isBranchAddonSubscriptionItemAsync(item)) {
      branchItems.push(item)
    }
  }
  return branchItems
}

export async function branchAddonQuantityOnSubscription(
  subscription: Stripe.Subscription,
  mainSubscriptionId?: string | null
): Promise<number> {
  if (subscription.metadata?.kind === 'branch_addon') {
    const branchItems = await resolveBranchAddonItems(subscription.items.data)
    return branchItems.reduce((total, item) => total + (item.quantity ?? 0), 0)
  }

  if (mainSubscriptionId && subscription.id !== mainSubscriptionId) {
    return 0
  }

  const branchItems = await resolveBranchAddonItems(subscription.items.data)
  return branchItems.reduce((total, item) => total + (item.quantity ?? 0), 0)
}

let cachedBranchProductId: string | null = null

/** Stripe Product for branch add-ons (created automatically once per account). */
export async function getOrCreateBranchAddonProduct(): Promise<string> {
  if (cachedBranchProductId) {
    return cachedBranchProductId
  }

  const search = await stripe.products.search({
    query: `name:'${BRANCH_ADDON_PRODUCT_NAME}' AND active:'true'`,
    limit: 1,
  })
  if (search.data[0]?.id) {
    cachedBranchProductId = search.data[0].id
    return cachedBranchProductId
  }

  const product = await stripe.products.create({
    name: BRANCH_ADDON_PRODUCT_NAME,
    metadata: { kind: 'branch_addon' },
  })
  cachedBranchProductId = product.id
  return product.id
}

export async function buildBranchSubscriptionItemParams(
  branchPriceUsd: number,
  branchPriceId: string | null,
  quantity: number
): Promise<Stripe.SubscriptionItemCreateParams> {
  if (branchPriceId) {
    return {
      price: branchPriceId,
      quantity,
      metadata: { kind: 'branch_addon' },
    }
  }

  const productId = await getOrCreateBranchAddonProduct()

  return {
    quantity,
    metadata: { kind: 'branch_addon' },
    price_data: {
      currency: BILLING_CURRENCY,
      unit_amount: Math.round(branchPriceUsd * 100),
      recurring: { interval: 'month' },
      product: productId,
    },
  }
}
