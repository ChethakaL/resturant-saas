import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

function compactStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
    )
  )
}

export function getStripeCouponIdsFromSubscription(
  subscription: Stripe.Subscription
): string[] {
  const sub = subscription as any
  const ids: unknown[] = []

  if (typeof sub.discount?.coupon?.id === 'string') {
    ids.push(sub.discount.coupon.id)
  }

  if (Array.isArray(sub.discounts)) {
    for (const discount of sub.discounts) {
      if (typeof discount?.coupon?.id === 'string') ids.push(discount.coupon.id)
      if (typeof discount === 'string') ids.push(discount)
    }
  }

  for (const item of sub.items?.data ?? []) {
    if (typeof item.discount?.coupon?.id === 'string') {
      ids.push(item.discount.coupon.id)
    }
    if (Array.isArray(item.discounts)) {
      for (const discount of item.discounts) {
        if (typeof discount?.coupon?.id === 'string') ids.push(discount.coupon.id)
        if (typeof discount === 'string') ids.push(discount)
      }
    }
  }

  return compactStrings(ids)
}

export async function recordPromoRedemptionForRestaurant({
  restaurantId,
  promotionCode,
  stripeCouponIds,
}: {
  restaurantId: string
  promotionCode?: string | null
  stripeCouponIds?: string[]
}) {
  const normalizedCode = promotionCode?.trim().toUpperCase()
  const couponIds = compactStrings(stripeCouponIds ?? [])

  if (!normalizedCode && couponIds.length === 0) {
    return null
  }

  const promo = await prisma.promoCode.findFirst({
    where: {
      OR: [
        ...(normalizedCode ? [{ code: normalizedCode }] : []),
        ...(couponIds.length > 0 ? [{ stripeCouponId: { in: couponIds } }] : []),
      ],
    },
  })

  if (!promo) {
    return null
  }

  const existing = await prisma.promoRedemption.findUnique({
    where: {
      promoCodeId_restaurantId: { promoCodeId: promo.id, restaurantId },
    },
    select: { id: true },
  })

  if (existing) {
    return { promo, created: false }
  }

  try {
    await prisma.$transaction([
      prisma.promoRedemption.create({
        data: { promoCodeId: promo.id, restaurantId },
      }),
      prisma.promoCode.update({
        where: { id: promo.id },
        data: { timesRedeemed: { increment: 1 } },
      }),
    ])
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { promo, created: false }
    }
    throw error
  }

  return { promo, created: true }
}
