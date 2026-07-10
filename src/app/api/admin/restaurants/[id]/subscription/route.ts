import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRestaurantPlanTier, normalizeProductPlanTier } from '@/lib/plan-features'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.type !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    const status = body.subscriptionStatus as string | undefined
    const extendDays = typeof body.extendDays === 'number' ? body.extendDays : null
    const productPlanTier = normalizeProductPlanTier(body.productPlanTier)

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, currentPeriodEnd: true, settings: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    const updates: Prisma.RestaurantUpdateInput = {}

    if (status && ['active', 'trialing', 'canceled', 'past_due', 'none'].includes(status)) {
      updates.subscriptionStatus = status === 'none' ? null : status
    }

    if (extendDays != null && extendDays > 0) {
      const base = restaurant.currentPeriodEnd
        ? new Date(restaurant.currentPeriodEnd)
        : new Date()
      if (restaurant.currentPeriodEnd && new Date(restaurant.currentPeriodEnd) < new Date()) {
        base.setTime(Date.now())
      }
      base.setDate(base.getDate() + extendDays)
      updates.currentPeriodEnd = base
      if (updates.subscriptionStatus === undefined) {
        updates.subscriptionStatus = 'active'
      }
    }

    if (productPlanTier) {
      const settings = (restaurant.settings as Record<string, unknown> | null) || {}
      const {
        pendingProductPlanTier: _pendingTier,
        pendingProductPlanTierEffectiveAt: _pendingAt,
        scheduledProductPlanTier: _scheduledTier,
        ...restSettings
      } = settings

      updates.settings = {
        ...restSettings,
        productPlanTier,
      } as Prisma.InputJsonValue
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid updates' }, { status: 400 })
    }

    const updated = await prisma.restaurant.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        settings: true,
      },
    })

    return NextResponse.json({
      ...updated,
      productPlanTier: getRestaurantPlanTier(updated),
    })
  } catch (error) {
    console.error('Admin subscription update error:', error)
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    )
  }
}
