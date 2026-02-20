import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const themeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  chefPickColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundStyle: z.enum(['dark', 'light', 'gradient']).optional(),
  fontFamily: z.enum(['sans', 'serif', 'display']).optional(),
  logoUrl: z.string().url().nullable().optional(),
  menuTimezone: z.string().optional(),
  themePreset: z.enum(['classy', 'fast_food', 'cozy', 'minimal', 'luxe']).nullable().optional(),
  backgroundImageUrl: z.string().url().nullable().optional(),
  managementLanguage: z.enum(['en', 'ku', 'ar-fusha']).optional(),
  /** Guest menu: 'sliding' = embla carousel with arrows; 'static' = horizontal row, no sliding */
  menuCarouselStyle: z.enum(['sliding', 'static']).optional(),
  /** Restaurant name displayed on the guest menu */
  restaurantName: z.string().min(1).max(100).optional(),
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
    return NextResponse.json({
      ...(settings.theme as object),
      menuTimezone: settings.menuTimezone ?? 'Asia/Baghdad',
      themePreset: settings.themePreset ?? null,
      backgroundImageUrl: settings.backgroundImageUrl ?? null,
      managementLanguage: settings.managementLanguage ?? 'en',
    })
  } catch (error) {
    console.error('Error fetching theme settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch theme settings' },
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
    const parsed = themeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid theme data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })

    const currentSettings = (restaurant?.settings as Record<string, unknown>) || {}
    const { menuTimezone, themePreset, backgroundImageUrl, managementLanguage, restaurantName, menuCarouselStyle, ...themeData } = parsed.data
    const newSettings = {
      ...currentSettings,
      theme: { ...(currentSettings.theme as object ?? {}), ...themeData, ...(menuCarouselStyle !== undefined && { menuCarouselStyle }) },
      ...(menuTimezone !== undefined && { menuTimezone }),
      ...(themePreset !== undefined && { themePreset }),
      ...(backgroundImageUrl !== undefined && { backgroundImageUrl }),
      ...(managementLanguage !== undefined && { managementLanguage }),
    }

    const updateData: Record<string, unknown> = { settings: newSettings }
    if (restaurantName !== undefined && restaurantName.trim()) {
      updateData.name = restaurantName.trim()
    }

    await prisma.restaurant.update({
      where: { id: session.user.restaurantId },
      data: updateData,
    })

    revalidatePath('/')

    return NextResponse.json({
      ...themeData,
      menuTimezone: menuTimezone ?? currentSettings.menuTimezone,
      themePreset: themePreset ?? currentSettings.themePreset,
      backgroundImageUrl: backgroundImageUrl ?? currentSettings.backgroundImageUrl,
      managementLanguage: managementLanguage ?? currentSettings.managementLanguage ?? 'en',
    })
  } catch (error) {
    console.error('Error updating theme settings:', error)
    return NextResponse.json(
      { error: 'Failed to update theme settings' },
      { status: 500 }
    )
  }
}
