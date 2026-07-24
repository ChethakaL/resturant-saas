import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import {
  DEFAULT_MENU_DESIGN,
  menuDesignConfigSchema,
  menuDesignFromLegacyTheme,
  validateCustomMenuHtml,
} from '@/lib/menu-design'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const updateSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save-draft'),
    config: menuDesignConfigSchema,
    customHtml: z.string().max(200_000).nullable().optional(),
  }),
  z.object({
    action: z.literal('publish'),
    config: menuDesignConfigSchema,
    customHtml: z.string().max(200_000).nullable().optional(),
  }),
  z.object({ action: z.literal('reset') }),
])

async function getRestaurantContext(restaurantId: string) {
  return prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { slug: true, settings: true, menuDesign: true },
  })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const restaurant = await getRestaurantContext(session.user.restaurantId)
  if (!restaurant) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })

  const legacyConfig = menuDesignFromLegacyTheme(
    (restaurant.settings as Record<string, unknown>) || {},
  )
  const design = restaurant.menuDesign

  return NextResponse.json({
    draftConfig: design?.draftConfig ?? legacyConfig,
    publishedConfig: design?.publishedConfig ?? legacyConfig,
    customHtml: design?.customHtml ?? null,
    publishedHtml: design?.publishedHtml ?? null,
    version: design?.version ?? 0,
    publishedAt: design?.publishedAt ?? null,
    slug: restaurant.slug,
  })
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid menu design', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const restaurant = await getRestaurantContext(session.user.restaurantId)
  if (!restaurant) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })

  const currentConfig = restaurant.menuDesign?.publishedConfig
    ? menuDesignConfigSchema.parse(restaurant.menuDesign.publishedConfig)
    : menuDesignFromLegacyTheme((restaurant.settings as Record<string, unknown>) || {})

  if (parsed.data.action === 'reset') {
    const config = { ...DEFAULT_MENU_DESIGN }
    const design = await prisma.menuDesign.upsert({
      where: { restaurantId: session.user.restaurantId },
      create: {
        restaurantId: session.user.restaurantId,
        draftConfig: config,
        publishedConfig: currentConfig,
      },
      update: { draftConfig: config, customHtml: null },
    })
    return NextResponse.json(design)
  }

  const { config, customHtml = null } = parsed.data
  if (config.mode === 'custom') {
    if (!customHtml) {
      return NextResponse.json({ error: 'Custom mode requires an HTML template.' }, { status: 400 })
    }
    const validation = validateCustomMenuHtml(customHtml)
    if ('errors' in validation) {
      return NextResponse.json(
        { error: 'Template validation failed', details: validation.errors },
        { status: 400 },
      )
    }
  }

  const isPublish = parsed.data.action === 'publish'
  const design = await prisma.menuDesign.upsert({
    where: { restaurantId: session.user.restaurantId },
    create: {
      restaurantId: session.user.restaurantId,
      draftConfig: config,
      publishedConfig: isPublish ? config : currentConfig,
      customHtml,
      publishedHtml: isPublish ? customHtml : null,
      version: isPublish ? 1 : 0,
      publishedAt: isPublish ? new Date() : null,
    },
    update: {
      draftConfig: config,
      customHtml,
      ...(isPublish
        ? {
            publishedConfig: config,
            publishedHtml: config.mode === 'custom' ? customHtml : null,
            version: { increment: 1 },
            publishedAt: new Date(),
          }
        : {}),
    },
  })

  if (isPublish) {
    revalidatePath(`/${restaurant.slug}`)
    revalidatePath('/settings/appearance')
  }

  return NextResponse.json({
    draftConfig: design.draftConfig,
    publishedConfig: design.publishedConfig,
    customHtml: design.customHtml,
    publishedHtml: design.publishedHtml,
    version: design.version,
    publishedAt: design.publishedAt,
    slug: restaurant.slug,
  })
}
