import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSettingsForMode } from '@/lib/menu-engine-defaults'
import type { EngineMode } from '@/types/menu-engine'

export const dynamic = 'force-dynamic'

const menuEngineSchema = z.object({
  mode: z.enum(['classic', 'profit', 'adaptive']),
  moodFlow: z.boolean().optional(),
  bundles: z.boolean().optional(),
  upsells: z.boolean().optional(),
  scarcityBadges: z.boolean().optional(),
  priceAnchoring: z.boolean().optional(),
  maxItemsPerCategory: z.number().int().min(3).max(15).optional(),
  maxInitialItemsPerCategory: z.number().int().min(1).max(10).optional(),
  idleUpsellDelaySeconds: z.number().int().min(2).max(30).optional(),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })

    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    const menuEngine = (settings.menuEngine as Record<string, unknown>) || {}
    const mode = (menuEngine.mode as EngineMode) || 'classic'
    const resolved = getSettingsForMode(mode)
    // Classic: full overrides. Profit/adaptive: merge preset with stored suggestion overrides only.
    const suggestionKeys = ['moodFlow', 'bundles', 'upsells', 'scarcityBadges', 'priceAnchoring'] as const
    const overrides =
      mode === 'classic'
        ? menuEngine
        : Object.fromEntries(
            suggestionKeys.filter((k) => menuEngine[k] !== undefined).map((k) => [k, menuEngine[k]])
          )
    const merged = { ...resolved, ...overrides } as typeof resolved
    return NextResponse.json(merged)
  } catch (error) {
    console.error('Error fetching menu engine settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menu engine settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = menuEngineSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid menu engine data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })

    const currentSettings = (restaurant?.settings as Record<string, unknown>) || {}
    const currentEngine = (currentSettings.menuEngine as Record<string, unknown>) || {}
    const mode = parsed.data.mode

    // Spread currentEngine first so parsed.data.mode and overrides always win (fixes classic not persisting)
    const menuEngine: Record<string, unknown> =
      mode === 'classic'
        ? {
            ...currentEngine,
            mode,
            ...(parsed.data.moodFlow !== undefined && { moodFlow: parsed.data.moodFlow }),
            ...(parsed.data.bundles !== undefined && { bundles: parsed.data.bundles }),
            ...(parsed.data.upsells !== undefined && { upsells: parsed.data.upsells }),
            ...(parsed.data.scarcityBadges !== undefined && { scarcityBadges: parsed.data.scarcityBadges }),
            ...(parsed.data.priceAnchoring !== undefined && { priceAnchoring: parsed.data.priceAnchoring }),
            ...(parsed.data.maxItemsPerCategory !== undefined && { maxItemsPerCategory: parsed.data.maxItemsPerCategory }),
            ...(parsed.data.maxInitialItemsPerCategory !== undefined && { maxInitialItemsPerCategory: parsed.data.maxInitialItemsPerCategory }),
            ...(parsed.data.idleUpsellDelaySeconds !== undefined && { idleUpsellDelaySeconds: parsed.data.idleUpsellDelaySeconds }),
          }
        : {
            ...currentEngine,
            mode,
            ...(parsed.data.moodFlow !== undefined && { moodFlow: parsed.data.moodFlow }),
            ...(parsed.data.bundles !== undefined && { bundles: parsed.data.bundles }),
            ...(parsed.data.upsells !== undefined && { upsells: parsed.data.upsells }),
            ...(parsed.data.scarcityBadges !== undefined && { scarcityBadges: parsed.data.scarcityBadges }),
            ...(parsed.data.priceAnchoring !== undefined && { priceAnchoring: parsed.data.priceAnchoring }),
          }

    await prisma.restaurant.update({
      where: { id: session.user.restaurantId },
      data: { settings: { ...currentSettings, menuEngine } },
    })

    revalidatePath('/')
    const suggestionKeys = ['moodFlow', 'bundles', 'upsells', 'scarcityBadges', 'priceAnchoring'] as const
    const overrides =
      mode === 'classic'
        ? menuEngine
        : Object.fromEntries(
            suggestionKeys.filter((k) => menuEngine[k] !== undefined).map((k) => [k, menuEngine[k]])
          )
    const resolved = { ...getSettingsForMode(mode), ...overrides } as ReturnType<typeof getSettingsForMode>
    return NextResponse.json(resolved)
  } catch (error) {
    console.error('Error updating menu engine settings:', error)
    return NextResponse.json(
      { error: 'Failed to update menu engine settings' },
      { status: 500 }
    )
  }
}
