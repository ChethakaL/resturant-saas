'use client'

import { useSearchParams } from 'next/navigation'
import SmartMenu from './SmartMenu'
import type { BundleHint, MoodOption, UpsellSuggestion } from '@/types/menu-engine'

const LAST_ORDER_KEY = 'iserve_last_order'

export interface MenuPersonalizationWrapperProps {
  restaurantId: string
  menuItems: any[]
  showcases?: any[]
  categories?: any[]
  theme?: any
  restaurantName?: string
  restaurantLogo?: string | null
  engineMode?: 'classic' | 'profit' | 'adaptive'
  bundles?: BundleHint[]
  moods?: MoodOption[]
  upsellMap?: Record<string, UpsellSuggestion[]>
  categoryOrder?: string[]
  categoryAnchorBundle?: Record<string, BundleHint>
  maxInitialItemsPerCategory?: number
  tables?: { id: string; number: string }[]
  forceShowImages?: boolean
  snowfallSettings?: { enabled: boolean; start: string; end: string } | null
  currency?: string
}

export function MenuPersonalizationWrapper(props: MenuPersonalizationWrapperProps) {
  const searchParams = useSearchParams()
  const guestsParam = searchParams.get('guests')
  const tableSize = guestsParam ? parseInt(guestsParam, 10) : undefined
  const validTableSize = tableSize != null && !Number.isNaN(tableSize) && tableSize > 0 ? tableSize : undefined
  const tableParam = searchParams.get('table') ?? searchParams.get('tableNumber')
  const tableNumber = tableParam?.trim() || undefined

  return (
    <SmartMenu
      {...props}
      forceShowImages={props.forceShowImages}
      tableSize={validTableSize}
      tableNumber={tableNumber}
      tables={props.tables}
    />
  )
}

export function getLastOrderKey(restaurantId: string): string {
  return `${LAST_ORDER_KEY}_${restaurantId}`
}

export function getStoredLastOrder(restaurantId: string): { itemIds: string[]; names: string[] } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(getLastOrderKey(restaurantId))
    if (!raw) return null
    return JSON.parse(raw) as { itemIds: string[]; names: string[] }
  } catch {
    return null
  }
}

export function setStoredLastOrder(
  restaurantId: string,
  lines: { menuItemId: string; name: string; quantity: number }[]
): void {
  if (typeof window === 'undefined') return
  try {
    const itemIds: string[] = []
    const names: string[] = []
    for (const line of lines) {
      for (let i = 0; i < line.quantity; i++) {
        itemIds.push(line.menuItemId)
        names.push(line.name)
      }
    }
    localStorage.setItem(
      getLastOrderKey(restaurantId),
      JSON.stringify({ itemIds, names })
    )
  } catch {}
}

const GUEST_ID_KEY = 'iserve_guest_id'

export function getOrCreateGuestId(restaurantId: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const key = `${GUEST_ID_KEY}_${restaurantId}`
    let id = localStorage.getItem(key)
    if (!id) {
      id = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    return ''
  }
}
