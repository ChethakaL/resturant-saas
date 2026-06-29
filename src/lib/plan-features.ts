export type ProductPlanTier = 'SMART_MENU_MANAGER' | 'SMART_RESTAURANT_MANAGER'
export type ProductFeature = 'pos' | 'waiterPortal' | 'livePnl' | 'hr'

const RESTAURANT_ONLY_FEATURES = new Set<ProductFeature>(['pos', 'waiterPortal', 'livePnl', 'hr'])

export const PRODUCT_PLAN_LABELS: Record<ProductPlanTier, string> = {
  SMART_MENU_MANAGER: 'Smart Menu Manager',
  SMART_RESTAURANT_MANAGER: 'Smart Restaurant Manager',
}

export function normalizeProductPlanTier(value: unknown): ProductPlanTier | null {
  return value === 'SMART_MENU_MANAGER' || value === 'SMART_RESTAURANT_MANAGER' ? value : null
}

export function getRestaurantPlanTier(restaurant: {
  settings?: unknown
  subscriptionStatus?: string | null
} | null | undefined): ProductPlanTier {
  const settings = (restaurant?.settings as Record<string, unknown> | null) || {}
  const pendingTier = normalizeProductPlanTier(settings.pendingProductPlanTier)
  const pendingEffectiveAt =
    typeof settings.pendingProductPlanTierEffectiveAt === 'string'
      ? new Date(settings.pendingProductPlanTierEffectiveAt)
      : null
  if (pendingTier && pendingEffectiveAt && !Number.isNaN(pendingEffectiveAt.getTime()) && pendingEffectiveAt <= new Date()) {
    return pendingTier
  }

  const tier = normalizeProductPlanTier(settings.productPlanTier)
  if (tier) return tier

  return 'SMART_MENU_MANAGER'
}

export function hasProductFeature(
  restaurant: { settings?: unknown; subscriptionStatus?: string | null } | null | undefined,
  feature: ProductFeature
) {
  const tier = getRestaurantPlanTier(restaurant)
  if (tier === 'SMART_RESTAURANT_MANAGER') return true
  return !RESTAURANT_ONLY_FEATURES.has(feature)
}

export function productFeatureForbiddenResponse(featureLabel: string) {
  return {
    error: `${featureLabel} is available on the Smart Restaurant Manager plan.`,
    code: 'PLAN_FEATURE_LOCKED',
    requiredPlan: 'SMART_RESTAURANT_MANAGER',
  }
}
