import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DEFAULT_MENU_ENGINE_SETTINGS } from '@/lib/menu-engine-defaults'

export const dynamic = 'force-dynamic'

const menuEngineSchema = z.object({
  mode: z.enum(['classic', 'profit', 'adaptive']).optional(),
  moodFlow: z.boolean().optional(),
  bundles: z.boolean().optional(),
  upsells: z.boolean().optional(),
  scarcityBadges: z.boolean().optional(),
  priceAnchoring: z.boolean().optional(),
  bundleCorrelationThreshold: z.number().min(0.1).max(1).optional(),
  maxItemsPerCategory: z.number().int().min(3).max(15).optional(),
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
    const merged = { ...DEFAULT_MENU_ENGINE_SETTINGS, ...menuEngine }
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
    const menuEngine = { ...currentEngine, ...parsed.data }

    await prisma.restaurant.update({
      where: { id: session.user.restaurantId },
      data: { settings: { ...currentSettings, menuEngine } },
    })

    revalidatePath('/')
    return NextResponse.json(menuEngine)
  } catch (error) {
    console.error('Error updating menu engine settings:', error)
    return NextResponse.json(
      { error: 'Failed to update menu engine settings' },
      { status: 500 }
    )
  }
}
