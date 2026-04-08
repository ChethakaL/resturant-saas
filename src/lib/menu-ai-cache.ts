import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import {
  suggestCarouselItems,
  getFallbackCarouselItemIdsFromPool,
  getTimeSlotLabel,
  type CarouselMenuItem,
  type TimeSlotLabel,
} from '@/lib/carousel-ai'
import { suggestMenuBadges, type MenuItemForBadge, type BadgePicks } from '@/lib/menu-badge-ai'
import { getCurrentTimeSlot as getSlot, parseSlotTimes } from '@/lib/time-slots'

/** Match previous unstable_cache + cron refresh cadence */
export const CAROUSEL_CACHE_TTL_MS = 5 * 60 * 1000
export const BADGE_CACHE_TTL_MS = 10 * 60 * 1000

export function hashCarouselPoolKey(itemIds: string[]): string {
  return createHash('sha256').update(itemIds.slice().sort().join(',')).digest('hex')
}

export function hashBadgeItemSet(itemIds: string[]): string {
  return createHash('sha256').update(itemIds.slice().sort().join(',')).digest('hex')
}

async function persistCarouselCache(
  restaurantId: string,
  timeSlotLabel: string,
  poolKeyHash: string,
  itemIds: string[]
): Promise<void> {
  await prisma.carouselAiCache.upsert({
    where: {
      restaurantId_timeSlotLabel_poolKeyHash: {
        restaurantId,
        timeSlotLabel,
        poolKeyHash,
      },
    },
    create: {
      restaurantId,
      timeSlotLabel,
      poolKeyHash,
      itemIds,
    },
    update: { itemIds },
  })
}

export type CarouselRowPreload = Map<string, { itemIds: string[]; updatedAt: Date }>

/** One DB round-trip for all carousel rows needed this request (instead of N findUnique calls). */
export async function preloadCarouselCacheRows(
  restaurantId: string,
  timeSlotLabel: string,
  pools: CarouselMenuItem[][]
): Promise<CarouselRowPreload> {
  const hashes = [
    ...new Set(
      pools
        .filter((p) => p.length > 0)
        .map((p) => hashCarouselPoolKey(p.map((i) => i.id)))
    ),
  ]
  if (hashes.length === 0) return new Map()
  const rows = await prisma.carouselAiCache.findMany({
    where: {
      restaurantId,
      timeSlotLabel,
      poolKeyHash: { in: hashes },
    },
  })
  return new Map(rows.map((r) => [r.poolKeyHash, { itemIds: r.itemIds, updatedAt: r.updatedAt }]))
}

export type CarouselMenuPageOptions = {
  /** From preloadCarouselCacheRows — avoids per-showcase DB reads */
  preloaded?: CarouselRowPreload
  /** Dedupe background Gemini fills when the same pool appears in multiple showcases */
  fillDedupe?: Set<string>
}

/**
 * Guest menu: never blocks on Gemini — reads DB cache or margin fallback.
 * On miss/stale, fills cache in the background (best-effort on serverless).
 */
export async function getCarouselItemIdsForMenuPage(
  restaurantId: string,
  timeSlotLabel: string,
  pool: CarouselMenuItem[],
  maxItems: number,
  options?: CarouselMenuPageOptions
): Promise<string[]> {
  if (pool.length === 0) return []
  const poolKeyHash = hashCarouselPoolKey(pool.map((i) => i.id))

  let row: { itemIds: string[]; updatedAt: Date } | null | undefined
  if (options?.preloaded) {
    row = options.preloaded.get(poolKeyHash)
  } else {
    const dbRow = await prisma.carouselAiCache.findUnique({
      where: {
        restaurantId_timeSlotLabel_poolKeyHash: {
          restaurantId,
          timeSlotLabel,
          poolKeyHash,
        },
      },
    })
    row = dbRow ? { itemIds: dbRow.itemIds, updatedAt: dbRow.updatedAt } : null
  }

  const now = Date.now()
  if (row && now - row.updatedAt.getTime() < CAROUSEL_CACHE_TTL_MS && row.itemIds.length > 0) {
    return row.itemIds.slice(0, maxItems)
  }

  const dedupe = options?.fillDedupe
  const queueBackgroundFill = () => {
    void (async () => {
      try {
        const ids = await suggestCarouselItems(pool, timeSlotLabel as TimeSlotLabel, { maxItems: 16 })
        if (ids.length > 0) {
          await persistCarouselCache(restaurantId, timeSlotLabel, poolKeyHash, ids)
        }
      } catch (err) {
        console.error('Carousel AI cache fill failed:', err)
      }
    })()
  }
  if (dedupe) {
    if (!dedupe.has(poolKeyHash)) {
      dedupe.add(poolKeyHash)
      queueBackgroundFill()
    }
  } else {
    queueBackgroundFill()
  }

  return getFallbackCarouselItemIdsFromPool(pool, maxItems)
}

async function persistBadgeCache(
  restaurantId: string,
  itemSetHash: string,
  picks: BadgePicks
): Promise<void> {
  await prisma.menuBadgeAiCache.upsert({
    where: {
      restaurantId_itemSetHash: {
        restaurantId,
        itemSetHash,
      },
    },
    create: {
      restaurantId,
      itemSetHash,
      signatureIds: picks.signatureIds,
      mostLovedIds: picks.mostLovedIds,
    },
    update: {
      signatureIds: picks.signatureIds,
      mostLovedIds: picks.mostLovedIds,
    },
  })
}

/**
 * When sales are thin: read precomputed badges or return undefined (engine uses sales-only hints).
 */
export async function getBadgePicksForMenuPage(
  restaurantId: string,
  items: MenuItemForBadge[],
  enabled: boolean
): Promise<BadgePicks | undefined> {
  if (!enabled || items.length === 0) return undefined
  const itemSetHash = hashBadgeItemSet(items.map((i) => i.id))
  const row = await prisma.menuBadgeAiCache.findUnique({
    where: {
      restaurantId_itemSetHash: {
        restaurantId,
        itemSetHash,
      },
    },
  })
  const now = Date.now()
  if (row && now - row.updatedAt.getTime() < BADGE_CACHE_TTL_MS) {
    return {
      signatureIds: row.signatureIds,
      mostLovedIds: row.mostLovedIds,
    }
  }

  void (async () => {
    try {
      const picks = await suggestMenuBadges(items)
      await persistBadgeCache(restaurantId, itemSetHash, picks)
    } catch (err) {
      console.error('Menu badge AI cache fill failed:', err)
    }
  })()

  return undefined
}

/**
 * Cron: warm carousel + (optional) badge caches per restaurant.
 */
export async function refreshRestaurantMenuAiCaches(restaurantId: string): Promise<void> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
  })
  if (!restaurant) return

  const settings = (restaurant.settings as Record<string, unknown>) || {}
  const timezone = (settings.menuTimezone as string) || restaurant.timezone || 'Asia/Baghdad'
  const slotTimes = parseSlotTimes(settings.slotTimes)
  const currentSlot = getSlot(timezone, slotTimes)
  const timeSlotLabel = getTimeSlotLabel(currentSlot)

  const menuItems = await prisma.menuItem.findMany({
    where: { available: true, status: 'ACTIVE', restaurantId },
    include: {
      category: true,
      ingredients: { include: { ingredient: true } },
    },
  })

  const fullCarouselPool: CarouselMenuItem[] = menuItems.map((item) => {
    const ingredientTotal = item.ingredients.reduce(
      (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    const marginPercent =
      item.price > 0 ? ((item.price - ingredientTotal) / item.price) * 100 : 0
    return {
      id: item.id,
      name: item.name,
      category: item.category?.name ?? undefined,
      price: item.price,
      marginPercent,
    }
  })

  const maxCarousel = 16
  if (fullCarouselPool.length > 0) {
    const poolKeyHash = hashCarouselPoolKey(fullCarouselPool.map((i) => i.id))
    try {
      const ids = await suggestCarouselItems(fullCarouselPool, timeSlotLabel as TimeSlotLabel, {
        maxItems: maxCarousel,
      })
      if (ids.length > 0) {
        await persistCarouselCache(restaurantId, timeSlotLabel, poolKeyHash, ids)
      }
    } catch (err) {
      console.error(`Carousel warm failed for ${restaurantId}:`, err)
    }
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const saleAgg = await prisma.saleItem.aggregate({
    where: {
      sale: { restaurantId, timestamp: { gte: thirtyDaysAgo } },
    },
    _sum: { quantity: true },
  })
  const totalUnits = saleAgg._sum.quantity ?? 0
  if (totalUnits >= 10) return

  const badgeItemsPayload: MenuItemForBadge[] = menuItems.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    categoryName: i.category?.name,
    price: i.price,
    tags: i.tags,
  }))
  if (badgeItemsPayload.length === 0) return

  const itemSetHash = hashBadgeItemSet(badgeItemsPayload.map((i) => i.id))
  try {
    const picks = await suggestMenuBadges(badgeItemsPayload)
    await persistBadgeCache(restaurantId, itemSetHash, picks)
  } catch (err) {
    console.error(`Badge warm failed for ${restaurantId}:`, err)
  }
}
