import { unstable_cache } from 'next/cache'
import { getMenuFeelingContext, type MenuFeelingContext } from '@/lib/menu-feeling-message'

type Slot = 'breakfast' | 'day' | 'evening' | 'night'
type Lang = 'en' | 'ar_fusha' | 'ku'

/**
 * Weather + hero copy for the public menu — cached so we do not call Open-Meteo on every request.
 * (Guest page uses allowAi: false; no Gemini here.)
 */
export function getCachedPublicMenuFeeling(params: {
  restaurantId: string
  lat: number | null | undefined
  lng: number | null | undefined
  timezone: string
  slot: Slot
  language: Lang
}): Promise<MenuFeelingContext> {
  const latKey = typeof params.lat === 'number' ? params.lat.toFixed(2) : 'none'
  const lngKey = typeof params.lng === 'number' ? params.lng.toFixed(2) : 'none'

  return unstable_cache(
    () =>
      getMenuFeelingContext({
        lat: params.lat,
        lng: params.lng,
        timezone: params.timezone,
        slot: params.slot,
        language: params.language,
        allowAi: false,
      }),
    [
      'public-menu-feeling-v2',
      params.restaurantId,
      params.timezone,
      params.slot,
      params.language,
      latKey,
      lngKey,
    ],
    { revalidate: 600 }
  )()
}
