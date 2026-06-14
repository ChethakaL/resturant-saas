import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getMenuFeelingContext, type MenuFeelingContext } from '@/lib/menu-feeling-message'
import { formatHourBucketInTimeZone, getCurrentTimeSlot, parseSlotTimes } from '@/lib/time-slots'

type Lang = 'en' | 'ar_fusha' | 'ku'

/**
 * Gemini + Open-Meteo hero line for the guest menu. Cached per restaurant, language, and local hour
 * so repeat views are fast and the line refreshes when the clock bucket changes.
 */
export async function getCachedPublicMenuFeelingAi(params: {
  restaurantId: string
  language: Lang
  menuTimezone: string
}): Promise<MenuFeelingContext | null> {
  const hourBucket = formatHourBucketInTimeZone(params.menuTimezone)

  return unstable_cache(
    async () => {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: params.restaurantId },
        select: { lat: true, lng: true, timezone: true, settings: true },
      })
      if (!restaurant) return null
      const settings = (restaurant.settings as Record<string, unknown>) || {}
      const timezone =
        (settings.menuTimezone as string) || restaurant.timezone || 'Asia/Baghdad'
      const slotTimes = parseSlotTimes(settings.slotTimes)
      const slot = getCurrentTimeSlot(timezone, slotTimes)
      return getMenuFeelingContext({
        lat: restaurant.lat,
        lng: restaurant.lng,
        timezone,
        slot,
        language: params.language,
        allowAi: true,
      })
    },
    [
      'public-menu-feeling-ai-v3',
      params.restaurantId,
      params.language,
      hourBucket,
    ],
    { revalidate: 7200 }
  )()
}
