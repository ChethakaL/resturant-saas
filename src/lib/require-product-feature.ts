import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasProductFeature, productFeatureForbiddenResponse, type ProductFeature } from '@/lib/plan-features'

export async function requireRestaurantFeature(
  restaurantId: string,
  feature: ProductFeature,
  featureLabel: string
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { settings: true, subscriptionStatus: true },
  })

  if (hasProductFeature(restaurant, feature)) {
    return null
  }

  return NextResponse.json(productFeatureForbiddenResponse(featureLabel), { status: 403 })
}

export async function restaurantHasFeature(restaurantId: string, feature: ProductFeature) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { settings: true, subscriptionStatus: true },
  })
  return hasProductFeature(restaurant, feature)
}
