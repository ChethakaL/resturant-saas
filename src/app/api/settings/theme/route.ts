import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { IRAQ_CITIES } from '@/lib/iraq-cities'
import {
  getRestaurantWhatsAppSettings,
  mergeRestaurantWhatsAppSettings,
  normalizeWhatsAppNumber,
} from '@/lib/restaurant-whatsapp'

export const dynamic = 'force-dynamic'

const themeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  chefPickColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundStyle: z.enum(['dark', 'light', 'gradient']).optional(),
  fontFamily: z.string().max(100).optional(),
  fontMenuTitle: z.string().max(100).optional(),
  fontCategoryHeader: z.string().max(100).optional(),
  fontItemName: z.string().max(100).optional(),
  fontDescription: z.string().max(100).optional(),
  fontPrice: z.string().max(100).optional(),
  logoUrl: z.string().url().nullable().optional(),
  menuTimezone: z.string().optional(),
  themePreset: z.enum(['classy', 'fast_food', 'cozy', 'minimal', 'luxe', 'ethnic']).nullable().optional(),
  backgroundImageUrl: z.string().url().nullable().optional(),
  managementLanguage: z.enum(['en', 'ku', 'ar-fusha']).optional(),
  /** Guest menu: 'sliding' = embla carousel with arrows; 'static' = horizontal row, no sliding */
  menuCarouselStyle: z.enum(['sliding', 'static']).optional(),
  /** Restaurant name displayed on the guest menu */
  restaurantName: z.string().min(1).max(100).optional(),
  restaurantEmail: z.string().email().nullable().optional(),
  restaurantPhone: z.string().max(50).nullable().optional(),
  restaurantWhatsappNumber: z.string().max(50).nullable().optional(),
  instagramUrl: z.string().url().nullable().optional(),
  facebookUrl: z.string().url().nullable().optional(),
  whatsappUrl: z.string().url().nullable().optional(),
  restaurantCity: z.enum(IRAQ_CITIES).nullable().optional(),
  restaurantAddress: z.string().max(255).nullable().optional(),
  restaurantLat: z.number().nullable().optional(),
  restaurantLng: z.number().nullable().optional(),
  /** Custom time slot boundaries for carousels */
  slotTimes: z.object({
    breakfast: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(24) }),
    day: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(24) }),
    evening: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(24) }),
  }).optional(),
  /** Christmas / seasonal snowfall on guest menu */
  snowfallEnabled: z.string().optional(),
  snowfallStart: z.string().optional(),
  snowfallEnd: z.string().optional(),
  /** Tone for AI-generated menu dish descriptions (from Restaurant DNA). e.g. "Write concise, punchy descriptions for fast casual." */
  descriptionTone: z.string().max(300).optional(),
  /** Optional restaurant photo for "vibe". S3 key for proxy URL (bucket can stay private). */
  restaurantVibeImageKey: z.string().min(1).max(512).nullable().optional(),
  /** Legacy: direct URL. Prefer restaurantVibeImageKey + proxy for private buckets. */
  restaurantVibeImageUrl: z.string().url().nullable().optional(),
  /** When true, guest menu shows table selector; when false, table ordering is disabled. */
  tableOrderingEnabled: z.boolean().optional(),
  /** When false, Kurdish is hidden from the customer menu language selector. Default true. */
  showKurdishOnMenu: z.boolean().optional(),
  /** When false, Arabic is hidden from the customer menu language selector. Default true. */
  showArabicOnMenu: z.boolean().optional(),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        settings: true,
        email: true,
        phone: true,
        city: true,
        address: true,
        lat: true,
        lng: true,
      },
    })

    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    const whatsappSettings = getRestaurantWhatsAppSettings(settings)
    return NextResponse.json({
      ...(settings.theme as object),
      menuTimezone: settings.menuTimezone ?? 'Asia/Baghdad',
      themePreset: settings.themePreset ?? null,
      backgroundImageUrl: settings.backgroundImageUrl ?? null,
      managementLanguage: settings.managementLanguage ?? 'en',
      tableOrderingEnabled: settings.tableOrderingEnabled !== false,
      restaurantEmail: restaurant?.email ?? null,
      restaurantPhone: restaurant?.phone ?? null,
      restaurantWhatsappNumber: whatsappSettings.number ?? null,
      restaurantWhatsappVerifiedAt: whatsappSettings.verifiedAt ?? null,
      restaurantWhatsappLastInboundAt: whatsappSettings.lastInboundAt ?? null,
      restaurantCity: restaurant?.city ?? null,
      restaurantAddress: restaurant?.address ?? null,
      restaurantLat: restaurant?.lat ?? null,
      restaurantLng: restaurant?.lng ?? null,
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
    const {
      primaryColor, accentColor, chefPickColor, borderColor,
      backgroundStyle, fontFamily,
      fontMenuTitle, fontCategoryHeader, fontItemName, fontDescription, fontPrice,
      logoUrl,
      menuTimezone,
      themePreset,
      backgroundImageUrl,
      managementLanguage,
      restaurantName,
      restaurantEmail,
      restaurantPhone,
      restaurantWhatsappNumber,
      restaurantCity,
      restaurantAddress,
      restaurantLat,
      restaurantLng,
      menuCarouselStyle,
      slotTimes,
      snowfallEnabled,
      snowfallStart,
      snowfallEnd,
      descriptionTone,
      restaurantVibeImageKey,
      restaurantVibeImageUrl,
      tableOrderingEnabled,
      showKurdishOnMenu,
      showArabicOnMenu,
      foodTerminologyOverrides,
    } = parsed.data

    const newSettings = {
      ...currentSettings,
      theme: {
        ...(currentSettings.theme as object ?? {}),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(accentColor !== undefined && { accentColor }),
        ...(chefPickColor !== undefined && { chefPickColor }),
        ...(borderColor !== undefined && { borderColor }),
        ...(backgroundStyle !== undefined && { backgroundStyle }),
        ...(fontFamily !== undefined && { fontFamily }),
        ...(fontMenuTitle !== undefined && { fontMenuTitle }),
        ...(fontCategoryHeader !== undefined && { fontCategoryHeader }),
        ...(fontItemName !== undefined && { fontItemName }),
        ...(fontDescription !== undefined && { fontDescription }),
        ...(fontPrice !== undefined && { fontPrice }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(menuCarouselStyle !== undefined && { menuCarouselStyle }),
        ...(descriptionTone !== undefined && { descriptionTone }),
        ...(foodTerminologyOverrides !== undefined && { foodTerminologyOverrides }),
        ...(restaurantVibeImageKey !== undefined && { restaurantVibeImageKey }),
        ...(restaurantVibeImageUrl !== undefined && { restaurantVibeImageUrl }),
        ...(showKurdishOnMenu !== undefined && { showKurdishOnMenu }),
        ...(showArabicOnMenu !== undefined && { showArabicOnMenu }),
      },
      ...(menuTimezone !== undefined && { menuTimezone }),
      ...(themePreset !== undefined ? { themePreset } : {}),
      ...(backgroundImageUrl !== undefined && { backgroundImageUrl }),
      ...(managementLanguage !== undefined && { managementLanguage }),
      ...(slotTimes !== undefined && { slotTimes }),
      ...(snowfallEnabled !== undefined && { snowfallEnabled }),
      ...(snowfallStart !== undefined && { snowfallStart }),
      ...(snowfallEnd !== undefined && { snowfallEnd }),
      ...(tableOrderingEnabled !== undefined && { tableOrderingEnabled }),
    }

    if (restaurantWhatsappNumber !== undefined) {
      const normalizedWhatsappNumber = normalizeWhatsAppNumber(restaurantWhatsappNumber)
      const currentWhatsappSettings = getRestaurantWhatsAppSettings(currentSettings)
      const mergedSettingsRoot = mergeRestaurantWhatsAppSettings(currentSettings, {
        number: normalizedWhatsappNumber,
        ...(normalizedWhatsappNumber !== currentWhatsappSettings.number
          ? {
              verifiedAt: null,
              verificationCode: null,
              verificationRequestedAt: null,
              lastInboundAt: null,
            }
          : {}),
      })
      // Only extract the WhatsApp-specific key to avoid overwriting theme/preset changes
      if (mergedSettingsRoot.whatsappOrderNotifications) {
        (newSettings as any).whatsappOrderNotifications = mergedSettingsRoot.whatsappOrderNotifications
      }
    }

    const updateData: Record<string, unknown> = { settings: newSettings }
    if (restaurantName !== undefined && restaurantName.trim()) {
      updateData.name = restaurantName.trim()
    }
    if (restaurantEmail !== undefined) updateData.email = restaurantEmail?.trim() || null
    if (restaurantPhone !== undefined) updateData.phone = restaurantPhone?.trim() || null
    if (restaurantCity !== undefined) updateData.city = restaurantCity || null
    if (restaurantAddress !== undefined) updateData.address = restaurantAddress?.trim() || null
    if (restaurantLat !== undefined) updateData.lat = restaurantLat
    if (restaurantLng !== undefined) updateData.lng = restaurantLng

    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: session.user.restaurantId },
      data: updateData,
      select: { slug: true },
    })

    revalidatePath('/settings')
    revalidatePath('/')
    if (updatedRestaurant.slug) {
      revalidatePath(`/${updatedRestaurant.slug}`)
    }

    return NextResponse.json({
      primaryColor: primaryColor ?? (currentSettings.theme as any)?.primaryColor,
      accentColor: accentColor ?? (currentSettings.theme as any)?.accentColor,
      chefPickColor: chefPickColor ?? (currentSettings.theme as any)?.chefPickColor,
      borderColor: borderColor ?? (currentSettings.theme as any)?.borderColor,
      backgroundStyle: backgroundStyle ?? (currentSettings.theme as any)?.backgroundStyle,
      fontFamily: fontFamily ?? (currentSettings.theme as any)?.fontFamily,
      fontMenuTitle: fontMenuTitle ?? (currentSettings.theme as any)?.fontMenuTitle,
      fontCategoryHeader: fontCategoryHeader ?? (currentSettings.theme as any)?.fontCategoryHeader,
      fontItemName: fontItemName ?? (currentSettings.theme as any)?.fontItemName,
      fontDescription: fontDescription ?? (currentSettings.theme as any)?.fontDescription,
      fontPrice: fontPrice ?? (currentSettings.theme as any)?.fontPrice,
      logoUrl: logoUrl ?? (currentSettings.theme as any)?.logoUrl,
      menuTimezone: menuTimezone ?? currentSettings.menuTimezone,
      themePreset: themePreset !== undefined ? themePreset : (currentSettings.themePreset ?? null),
      backgroundImageUrl: backgroundImageUrl ?? currentSettings.backgroundImageUrl,
      managementLanguage: managementLanguage ?? currentSettings.managementLanguage ?? 'en',
      restaurantEmail: restaurantEmail ?? null,
      restaurantPhone: restaurantPhone ?? null,
      restaurantWhatsappNumber: restaurantWhatsappNumber ?? null,
      restaurantCity: restaurantCity ?? null,
      restaurantAddress: restaurantAddress ?? null,
      restaurantLat: restaurantLat ?? null,
      restaurantLng: restaurantLng ?? null,
    })
  } catch (error) {
    console.error('Error updating theme settings:', error)
    return NextResponse.json(
      { error: 'Failed to update theme settings' },
      { status: 500 }
    )
  }
}
