'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import {
  Plus,
  Trash2,
  Check,
  Loader2,
  GripVertical,
  Clock,
  Search,
  X,
  BarChart3,
  LayoutGrid,
  Sparkles,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { MenuEngineSettings } from '@/types/menu-engine'
import type { EngineMode } from '@/types/menu-engine'
import { DEFAULT_SLOT_TIMES, buildSlotRangeLabels, formatSlotRange } from '@/lib/time-slots'
import type { SlotTimes } from '@/lib/time-slots'

interface SimpleMenuItem {
  id: string
  name: string
  imageUrl: string | null
  price: number
}

interface ShowcaseItem {
  id: string
  showcaseId: string
  menuItemId: string
  displayOrder: number
  menuItem: SimpleMenuItem
}

interface Showcase {
  id: string
  title: string
  type?: 'CHEFS_HIGHLIGHTS' | 'RECOMMENDATIONS'
  /** 'hero' = full-width image carousel; 'cards' = sliding cards row */
  displayVariant?: 'hero' | 'cards'
  position: string
  insertAfterCategoryId: string | null
  displayOrder: number
  isActive: boolean
  schedule?: TimeSlotSchedule | null
  items: ShowcaseItem[]
}

interface TimeSlotSchedule {
  useTimeSlots?: boolean
  breakfast?: { itemIds: string[] }
  day?: { itemIds: string[] }
  evening?: { itemIds: string[] }
  night?: { itemIds: string[] }
  /** When set, this carousel is only shown during this time slot. */
  displayForSlot?: 'breakfast' | 'day' | 'evening' | 'night'
  /** When set, this carousel is shown during any of these slots (e.g. lunch = day + evening). */
  displayForSlots?: ('breakfast' | 'day' | 'evening' | 'night')[]
  /** Optional decorative badge label shown on the carousel (e.g. "🎄 Christmas Special") */
  label?: string
  /** ISO date string — carousel is only shown on or after this date */
  seasonalStart?: string
  /** ISO date string — carousel is hidden after this date */
  seasonalEnd?: string
  /** One shared AI-generated CSS background (admin only, used as fallback) */
  seasonalBackgroundUrl?: string
  /** Per-dish AI-regenerated photos with Christmas backgrounds. Key = menuItem.id, value = dataUrl */
  seasonalItemImages?: Record<string, string>
}

interface CategoryOption {
  id: string
  name: string
  displayOrder: number
}

const quadrantLabelMap: Record<string, string> = {
  PUZZLE: 'High Margin, Low Sales',
  STAR: 'High Margin, High Sales',
  DOG: 'Low Margin, Low Sales',
  WORKHORSE: 'Low Margin, High Sales',
}

const getQuadrantLabel = (quadrant: string): string => quadrantLabelMap[quadrant] ?? quadrant
const formatDishCount = (count: number): string => `${count} ${count === 1 ? 'dish' : 'dishes'}`

export interface MenuOptimizationContentProps {
  categories: CategoryOption[]
  showcases: Showcase[]
  menuItems: SimpleMenuItem[]
  menuEngineSettings?: Record<string, unknown> | null
  /** Custom carousel time slot boundaries from restaurant settings */
  slotTimes?: SlotTimes | null
}

export default function MenuOptimizationContent({
  categories,
  showcases: initialShowcases,
  menuItems,
  menuEngineSettings: initialMenuEngineSettings,
  slotTimes: initialSlotTimes,
}: MenuOptimizationContentProps) {
  const { toast } = useToast()
  const storedMode = (initialMenuEngineSettings?.mode as EngineMode) || 'profit'
  const resolvedMode = storedMode && ['classic', 'profit', 'adaptive'].includes(storedMode) ? storedMode : 'profit'
  const [engineMode, setEngineMode] = useState<MenuEngineSettings['mode']>(resolvedMode)
  const [savingEngine, setSavingEngine] = useState(false)

  // Manual mode only: suggestions and numeric overrides (from API when classic)
  const stored = initialMenuEngineSettings || {}
  const defaults = {
    moodFlow: stored.moodFlow === true,
    bundles: stored.bundles === true,
    upsells: stored.upsells === true,
    scarcityBadges: stored.scarcityBadges === true,
    priceAnchoring: stored.priceAnchoring === true,
    maxItemsPerCategory: typeof stored.maxItemsPerCategory === 'number' ? stored.maxItemsPerCategory : 15,
    maxInitialItemsPerCategory: typeof stored.maxInitialItemsPerCategory === 'number' ? stored.maxInitialItemsPerCategory : 10,
    idleUpsellDelaySeconds: typeof stored.idleUpsellDelaySeconds === 'number' ? stored.idleUpsellDelaySeconds : 30,
  }
  const [moodFlow, setMoodFlow] = useState(defaults.moodFlow)
  const [bundles, setBundles] = useState(defaults.bundles)
  const [upsells, setUpsells] = useState(defaults.upsells)
  const [scarcityBadges, setScarcityBadges] = useState(defaults.scarcityBadges)
  const [priceAnchoring, setPriceAnchoring] = useState(defaults.priceAnchoring)
  const [maxItemsPerCategory, setMaxItemsPerCategory] = useState(defaults.maxItemsPerCategory)
  const [maxInitialItemsPerCategory, setMaxInitialItemsPerCategory] = useState(defaults.maxInitialItemsPerCategory)
  const [idleUpsellDelaySeconds, setIdleUpsellDelaySeconds] = useState(defaults.idleUpsellDelaySeconds)
  const [quadrantData, setQuadrantData] = useState<{ counts: Record<string, number>; items: Array<{ menuItemId: string; name: string; categoryName?: string; quadrant: string; marginPercent: number; unitsSold: number }> } | null>(null)
  const [loadingQuadrants, setLoadingQuadrants] = useState(false)
  const [expandedQuadrants, setExpandedQuadrants] = useState<Set<string>>(new Set())

  // AI-regenerate each dish photo with a consistent Christmas background
  const [generatingSeasonalBg, setGeneratingSeasonalBg] = useState<string | null>(null)

  const applyChristmasBackgrounds = async (showcaseId: string) => {
    setGeneratingSeasonalBg(showcaseId)
    try {
      const res = await fetch(`/api/menu-showcases/${showcaseId}/apply-seasonal-backgrounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      // Re-fetch all showcases to pick up the new seasonalItemImages
      const refreshRes = await fetch('/api/menu-showcases').catch(() => null)
      if (refreshRes?.ok) {
        const refreshed = await refreshRes.json()
        if (Array.isArray(refreshed)) setShowcases(refreshed)
      }
      toast({
        title: `Christmas backgrounds applied to ${data.count} dish${data.count === 1 ? '' : 'es'}`,
        description: 'All dishes used the same background prompt — consistent look on the guest menu.',
      })
    } catch (err) {
      toast({ title: 'Could not apply Christmas backgrounds', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setGeneratingSeasonalBg(null)
    }
  }

  const clearSeasonalItemImages = async (showcaseId: string) => {
    try {
      await fetch(`/api/menu-showcases/${showcaseId}/apply-seasonal-backgrounds`, { method: 'DELETE' })
      setShowcases((prev) => prev.map((s) => {
        if (s.id !== showcaseId) return s
        const sched = { ...(s.schedule as TimeSlotSchedule || {}) }
        delete sched.seasonalItemImages
        return { ...s, schedule: sched }
      }))
      toast({ title: 'Seasonal dish photos cleared — original photos restored.' })
    } catch {
      toast({ title: 'Could not clear', variant: 'destructive' })
    }
  }

  // Carousel time slot configuration
  const [slotTimes, setSlotTimes] = useState<SlotTimes>(initialSlotTimes ?? DEFAULT_SLOT_TIMES)
  const [slotTimesDialogOpen, setSlotTimesDialogOpen] = useState(false)
  const [slotTimesDraft, setSlotTimesDraft] = useState<SlotTimes>(initialSlotTimes ?? DEFAULT_SLOT_TIMES)
  const [savingSlotTimes, setSavingSlotTimes] = useState(false)

  const [showcases, setShowcases] = useState<Showcase[]>(initialShowcases)
  const [savingShowcase, setSavingShowcase] = useState<string | null>(null)
  const [deletingShowcase, setDeletingShowcase] = useState<string | null>(null)
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [editingShowcaseId, setEditingShowcaseId] = useState<string | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduleShowcaseId, setScheduleShowcaseId] = useState<string | null>(null)
  const [scheduleDraft, setScheduleDraft] = useState<TimeSlotSchedule>({ breakfast: { itemIds: [] }, day: { itemIds: [] }, evening: { itemIds: [] }, night: { itemIds: [] } })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleSlotTab, setScheduleSlotTab] = useState<'breakfast' | 'day' | 'evening' | 'night'>('breakfast')
  const [scheduleSearch, setScheduleSearch] = useState('')
  const [itemPickerSearch, setItemPickerSearch] = useState('')
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false)
  const prevEngineModeRef = useRef<EngineMode>(resolvedMode)
  const maxCarouselItems = (engineMode === 'profit' || engineMode === 'adaptive') ? 6 : 999

  // When switching to Profit or Smart Profit, default the five suggestion toggles to on (preset).
  useEffect(() => {
    if (engineMode === 'profit' || engineMode === 'adaptive') {
      if (prevEngineModeRef.current === 'classic') {
        setMoodFlow(true)
        setBundles(true)
        setUpsells(true)
        setScarcityBadges(true)
        setPriceAnchoring(true)
      }
      prevEngineModeRef.current = engineMode
    } else {
      prevEngineModeRef.current = engineMode
    }
  }, [engineMode])

  const createShowcase = async () => {
    try {
      const response = await fetch('/api/menu-showcases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Carousel', type: 'RECOMMENDATIONS', position: 'top' }),
      })
      if (!response.ok) throw new Error('Failed to create carousel')
      const newShowcase = await response.json()
      setShowcases((prev) => [...prev, { ...newShowcase, items: [] }])
      toast({ title: 'Carousel created', description: 'You can now customize it.' })
    } catch {
      toast({ title: 'Error', description: 'Failed to create carousel section', variant: 'destructive' })
    }
  }

  const createDefaultShowcases = async () => {
    try {
      const res1 = await fetch('/api/menu-showcases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: "Chef's Selection", type: 'CHEFS_HIGHLIGHTS', position: 'top' }),
      })
      const showcase1 = await res1.json()
      const firstCategory = categories[0]
      const res2 = await fetch('/api/menu-showcases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Try Something New',
          type: 'RECOMMENDATIONS',
          position: firstCategory ? 'between-categories' : 'top',
          insertAfterCategoryId: firstCategory?.id || null,
        }),
      })
      const showcase2 = await res2.json()
      setShowcases([{ ...showcase1, items: [] }, { ...showcase2, items: [] }])
      toast({ title: 'Default carousels created', description: 'Two carousel sections have been set up. Items will be auto-populated.' })
    } catch {
      toast({ title: 'Error', description: 'Failed to create default carousels', variant: 'destructive' })
    }
  }

  const updateShowcase = async (id: string, updates: Partial<Pick<Showcase, 'title' | 'position' | 'insertAfterCategoryId' | 'isActive' | 'type' | 'schedule' | 'displayVariant'>>) => {
    setSavingShowcase(id)
    try {
      // Slot-only carousels: persist only displayForSlot or displayForSlots, never useTimeSlots
      const payload = { ...updates }
      const s = payload.schedule as TimeSlotSchedule | null | undefined
      if (Array.isArray(s?.displayForSlots) && s.displayForSlots.length > 0) {
        payload.schedule = { displayForSlots: s.displayForSlots }
      } else if (s?.displayForSlot) {
        payload.schedule = { displayForSlot: s.displayForSlot }
      }
      const response = await fetch(`/api/menu-showcases/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.ok) throw new Error('Failed to update')
      setShowcases((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)))
      toast({ title: 'Carousel updated' })
    } catch {
      toast({ title: 'Error', description: 'Failed to update carousel', variant: 'destructive' })
    } finally {
      setSavingShowcase(null)
    }
  }

  const deleteShowcase = async (id: string) => {
    setDeletingShowcase(id)
    try {
      const response = await fetch(`/api/menu-showcases/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete')
      setShowcases((prev) => prev.filter((s) => s.id !== id))
      toast({ title: 'Carousel deleted' })
    } catch {
      toast({ title: 'Error', description: 'Failed to delete carousel', variant: 'destructive' })
    } finally {
      setDeletingShowcase(null)
    }
  }

  const openItemPicker = (showcaseId: string) => {
    const showcase = showcases.find((s) => s.id === showcaseId)
    setSelectedItemIds(new Set((showcase?.items || []).map((item) => item.menuItemId)))
    setEditingShowcaseId(showcaseId)
    setItemPickerSearch('')
    setItemPickerOpen(true)
  }

  const saveShowcaseItems = async () => {
    if (!editingShowcaseId) return
    setSavingShowcase(editingShowcaseId)
    try {
      const capped = Array.from(selectedItemIds).slice(0, maxCarouselItems)
      const itemsArray = capped.map((menuItemId, index) => ({ menuItemId, displayOrder: index }))
      const response = await fetch(`/api/menu-showcases/${editingShowcaseId}/items`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: itemsArray }) })
      if (!response.ok) throw new Error('Failed to save items')
      setShowcases((prev) =>
        prev.map((s) =>
          s.id !== editingShowcaseId
            ? s
            : { ...s, items: itemsArray.map((item) => ({ id: '', showcaseId: editingShowcaseId, menuItemId: item.menuItemId, displayOrder: item.displayOrder, menuItem: menuItems.find((m) => m.id === item.menuItemId)! })) }
        )
      )
      setItemPickerOpen(false)
      toast({ title: 'Items updated' })
    } catch {
      toast({ title: 'Error', description: 'Failed to update carousel items', variant: 'destructive' })
    } finally {
      setSavingShowcase(null)
    }
  }

  const toggleItemSelection = (menuItemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(menuItemId)) next.delete(menuItemId)
      else if (next.size < maxCarouselItems) next.add(menuItemId)
      return next
    })
  }

  const openScheduleDialog = (showcase: Showcase) => {
    setScheduleShowcaseId(showcase.id)
    const s = showcase.schedule
    setScheduleDraft({ useTimeSlots: s?.useTimeSlots ?? false, breakfast: s?.breakfast ?? { itemIds: [] }, day: s?.day ?? { itemIds: [] }, evening: s?.evening ?? { itemIds: [] }, night: s?.night ?? { itemIds: [] } })
    setScheduleSlotTab('breakfast')
    setScheduleSearch('')
    setScheduleDialogOpen(true)
  }

  const clearScheduleSlot = (slot: 'breakfast' | 'day' | 'evening' | 'night') => {
    setScheduleDraft((prev) => ({ ...prev, [slot]: { itemIds: [] } }))
  }

  const toggleScheduleSlotItem = (slot: 'breakfast' | 'day' | 'evening' | 'night', menuItemId: string) => {
    setScheduleDraft((prev) => {
      const ids = prev[slot]?.itemIds ?? []
      const next = ids.includes(menuItemId)
        ? ids.filter((id) => id !== menuItemId)
        : ids.length < maxCarouselItems
          ? [...ids, menuItemId]
          : ids
      return { ...prev, [slot]: { itemIds: next } }
    })
  }

  const saveSchedule = async () => {
    if (!scheduleShowcaseId) return
    setScheduleSaving(true)
    try {
      const showcase = showcases.find((s) => s.id === scheduleShowcaseId)
      const scheduleToSave = { ...scheduleDraft, useTimeSlots: showcase?.schedule?.useTimeSlots ?? scheduleDraft.useTimeSlots }
      const response = await fetch(`/api/menu-showcases/${scheduleShowcaseId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule: scheduleToSave }) })
      if (!response.ok) throw new Error('Failed to update')
      setShowcases((prev) => prev.map((s) => (s.id === scheduleShowcaseId ? { ...s, schedule: scheduleToSave } : s)))
      setScheduleDialogOpen(false)
      toast({ title: 'Time-based schedule saved' })
    } catch {
      toast({ title: 'Failed to save schedule', variant: 'destructive' })
    } finally {
      setScheduleSaving(false)
    }
  }

  const fetchQuadrants = async () => {
    setLoadingQuadrants(true)
    try {
      const res = await fetch('/api/menu-engine/quadrants')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setQuadrantData({ counts: data.counts ?? {}, items: data.items ?? [] })
    } catch {
      toast({ title: 'Could not load quadrant data', variant: 'destructive' })
    } finally {
      setLoadingQuadrants(false)
    }
  }

  const saveMenuEngine = async () => {
    setSavingEngine(true)
    try {
      const body =
        engineMode === 'classic'
          ? {
            mode: 'classic' as const,
            moodFlow,
            bundles,
            upsells,
            scarcityBadges,
            priceAnchoring,
            maxItemsPerCategory,
            maxInitialItemsPerCategory,
            idleUpsellDelaySeconds,
          }
          : {
            mode: engineMode,
            moodFlow,
            bundles,
            upsells,
            scarcityBadges,
            priceAnchoring,
          }
      const res = await fetch('/api/settings/menu-engine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast({ title: 'Optimization settings saved' })
    } catch {
      toast({ title: 'Failed to save optimization settings', variant: 'destructive' })
    } finally {
      setSavingEngine(false)
    }
  }

  const saveSlotTimes = async () => {
    setSavingSlotTimes(true)
    try {
      const res = await fetch('/api/settings/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotTimes: slotTimesDraft }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSlotTimes(slotTimesDraft)
      setSlotTimesDialogOpen(false)
      toast({ title: 'Carousel times saved', description: 'The guest menu will now use your custom time ranges.' })
    } catch {
      toast({ title: 'Could not save times', variant: 'destructive' })
    } finally {
      setSavingSlotTimes(false)
    }
  }

  const [autoFillingCarousels, setAutoFillingCarousels] = useState(false)

  const autoFillCarousels = async () => {
    if (engineMode !== 'profit' && engineMode !== 'adaptive') return
    setAutoFillingCarousels(true)
    try {
      // Refetch current showcases so we don't create duplicates (e.g. two tabs or two users).
      const listRes = await fetch('/api/menu-showcases')
      const currentShowcases = listRes.ok ? await listRes.json() : []
      let list = Array.isArray(currentShowcases) ? [...currentShowcases] : [...showcases]

      const res = await fetch(`/api/menu-showcases/suggested-items?mode=${engineMode}`)
      if (!res.ok) throw new Error('Failed to load suggestions')
      const suggested: {
        mode?: 'profit' | 'adaptive'
        usedSalesData?: boolean
        recommended?: string[]
        breakfast?: string[]
        day?: string[]
        evening?: string[]
        night?: string[]
      } = await res.json()
      const primaryIds = (suggested.recommended ?? suggested.day ?? []).slice(0, maxCarouselItems)
      const secondaryPool = [
        ...(suggested.breakfast ?? []),
        ...(suggested.evening ?? []),
        ...(suggested.night ?? []),
        ...(suggested.day ?? []),
      ]
      const secondaryIds = secondaryPool
        .filter((id, index, arr) => arr.indexOf(id) === index)
        .filter((id) => !primaryIds.includes(id))
        .slice(0, maxCarouselItems)
      const recommendationIds = secondaryIds.length > 0 ? secondaryIds : primaryIds
      const firstCategory = categories[0]

      // Remove old carousels so we only have the 3 boss-approved ones: breakfast, lunch, dinner.
      const titlesToRemove = new Set([
        "Chef's Highlights",
        'Recommended for Guests',
        'Breakfast (6am–10am)',
        'Day (10am–2pm)',
        'Evening (2pm–6pm)',
        'Night (6pm–6am)',
        'Breakfast',
        'Lunch',
        'Dinner',
      ])
      const toDelete = list.filter((s) => titlesToRemove.has((s.title || '').trim()))
      for (const section of toDelete) {
        await fetch(`/api/menu-showcases/${section.id}`, { method: 'DELETE' })
      }
      list = list.filter((s) => !titlesToRemove.has((s.title || '').trim()))

      const breakfastIds = (suggested.breakfast ?? primaryIds).slice(0, maxCarouselItems)
      const dayIds = (suggested.day ?? primaryIds).slice(0, maxCarouselItems)
      const eveningIds = (suggested.evening ?? recommendationIds).slice(0, maxCarouselItems)
      const nightIds = (suggested.night ?? recommendationIds).slice(0, maxCarouselItems)
      const lunchIds = Array.from(new Set([...(suggested.day ?? []), ...(suggested.evening ?? [])])).slice(0, maxCarouselItems)

      const upsertShowcase = async (
        def: {
          title: string
          type: 'CHEFS_HIGHLIGHTS' | 'RECOMMENDATIONS'
          displayVariant: 'hero' | 'cards'
          itemIds: string[]
          position?: 'top' | 'between-categories'
          insertAfterCategoryId?: string | null
          schedule?: TimeSlotSchedule | null
        }
      ) => {
        const byTitle = list.find((s) => s.title === def.title)
        let showcase = byTitle
        if (!showcase) {
          const createRes = await fetch('/api/menu-showcases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: def.title,
              type: def.type,
              position: 'top',
              insertAfterCategoryId: null,
              displayVariant: def.displayVariant,
            }),
          })
          if (!createRes.ok) throw new Error('Failed to create showcase')
          const created = await createRes.json()
          showcase = { ...created, items: [], schedule: null }
          list = [...list, showcase]
        }

        const updateRes = await fetch(`/api/menu-showcases/${showcase.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: def.title,
            type: def.type,
            position: def.position ?? 'top',
            insertAfterCategoryId: def.position === 'between-categories' ? (def.insertAfterCategoryId ?? null) : null,
            displayVariant: def.displayVariant,
            schedule: def.schedule ?? null,
          }),
        })
        if (!updateRes.ok) throw new Error('Failed to update showcase')

        // Dedupe itemIds (keep order) so we never send duplicate (showcaseId, menuItemId) to the API
        const uniqueIds = def.itemIds.filter((id, i, arr) => arr.indexOf(id) === i)
        const itemsPayload = uniqueIds.map((menuItemId, index) => ({
          menuItemId,
          displayOrder: index + 1,
        }))
        const saveItemsRes = await fetch(`/api/menu-showcases/${showcase.id}/items`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsPayload }),
        })
        if (!saveItemsRes.ok) throw new Error('Failed to save showcase items')

        const itemMap = new Map(menuItems.map((item) => [item.id, item]))
        const mappedItems: ShowcaseItem[] = itemsPayload
          .map(({ menuItemId, displayOrder }) => {
            const menuItem = itemMap.get(menuItemId)
            if (!menuItem) return null
            return {
              id: `${showcase!.id}-${menuItemId}`,
              showcaseId: showcase!.id,
              menuItemId,
              displayOrder,
              menuItem,
            }
          })
          .filter(Boolean) as ShowcaseItem[]

        return list.map((s) =>
          s.id === showcase!.id
            ? {
                ...s,
                title: def.title,
                type: def.type,
                displayVariant: def.displayVariant,
                schedule: def.schedule ?? null,
                position: def.position ?? 'top',
                insertAfterCategoryId: def.position === 'between-categories' ? (def.insertAfterCategoryId ?? null) : null,
                items: mappedItems,
              }
            : s
        )
      }

      // Only 3 carousels: Chef's recommendation for breakfast, lunch, dinner (boss requirement).
      list = await upsertShowcase({
        title: "Chef's recommendation for breakfast",
        type: 'CHEFS_HIGHLIGHTS',
        displayVariant: 'hero',
        itemIds: breakfastIds,
        position: 'top',
        insertAfterCategoryId: null,
        schedule: { displayForSlot: 'breakfast' },
      })
      list = await upsertShowcase({
        title: "Chef's recommendation for lunch",
        type: 'CHEFS_HIGHLIGHTS',
        displayVariant: 'hero',
        itemIds: lunchIds.length > 0 ? lunchIds : dayIds,
        position: 'top',
        insertAfterCategoryId: null,
        schedule: { displayForSlots: ['day', 'evening'] },
      })
      list = await upsertShowcase({
        title: "Chef's recommendation for dinner",
        type: 'CHEFS_HIGHLIGHTS',
        displayVariant: 'hero',
        itemIds: nightIds,
        position: 'top',
        insertAfterCategoryId: null,
        schedule: { displayForSlot: 'night' },
      })

      setShowcases(list)

      if (engineMode === 'adaptive' && !suggested.usedSalesData) {
        toast({
          title: 'Smart Profit fallback used',
          description: 'No sales history yet; used high-margin fallback for all three carousels.',
        })
      } else {
        toast({
          title: 'Carousels ready',
          description: "Three carousels: Chef's recommendation for breakfast, lunch, and dinner. Each shows only in its time period (menu timezone).",
        })
      }
    } catch {
      toast({ title: 'Failed to auto-fill carousels', variant: 'destructive' })
    } finally {
      setAutoFillingCarousels(false)
    }
  }

  useEffect(() => {
    if (engineMode === 'profit' || engineMode === 'adaptive') void autoFillCarousels()
  }, [engineMode])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Optimize your menu to increase profit and sales
          </CardTitle>
          <p className="text-sm text-slate-500">
            We offer three options to optimize your menu: <strong>1. Classic Mode</strong> — do it yourself. <strong>2. Profit Mode</strong> — highlight high-margin items. <strong>3. Smart Profit Mode</strong> — use sales and profit data to order and suggest. Only you see this data; guests never do.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-3">
              {(['classic', 'profit', 'adaptive'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEngineMode(mode)}
                  className={`rounded-xl border-2 p-4 text-left transition ${engineMode === mode ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="font-semibold">
                    {mode === 'classic' && '1. Classic Mode: do it yourself'}
                    {mode === 'profit' && '2. Profit Mode'}
                    {mode === 'adaptive' && '3. Smart Profit Mode'}
                  </span>
                  <p className="text-xs text-slate-500 mt-1">
                    {mode === 'classic' && 'Display your menu exactly as you organize it. No automatic reordering or suggestions.'}
                    {mode === 'profit' && 'Highlights high-margin items and suggests profitable combinations to guests.'}
                    {mode === 'adaptive' && 'Uses your sales and profit data to optimize what guests see and suggest add-ons that increase revenue.'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {engineMode === 'classic' && (
            <>
              <div className="space-y-2">
                <Label>Suggestions and highlights</Label>
                <p className="text-xs text-slate-500 mb-2">Enable or disable menu suggestion features.</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={moodFlow} onChange={(e) => setMoodFlow(e.target.checked)} className="rounded" />
                    <span className="text-sm">Mood-based suggestions (e.g. &quot;something light&quot;, &quot;something filling&quot;)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={bundles} onChange={(e) => setBundles(e.target.checked)} className="rounded" />
                    <span className="text-sm">&quot;Often bought together&quot; combos (top 5 by purchase count)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={upsells} onChange={(e) => setUpsells(e.target.checked)} className="rounded" />
                    <span className="text-sm">Add-on suggestions while browsing</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={scarcityBadges} onChange={(e) => setScarcityBadges(e.target.checked)} className="rounded" />
                    <span className="text-sm">&quot;Popular&quot; or &quot;Limited&quot; badges on items</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={priceAnchoring} onChange={(e) => setPriceAnchoring(e.target.checked)} className="rounded" />
                    <span className="text-sm">Show a higher-priced item first to make others feel reasonably priced</span>
                  </label>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <div className="h-14 flex items-center">
                    <Label className="leading-tight">Max items to show per category (3–15)</Label>
                  </div>
                  <Input
                    type="number"
                    min={3}
                    max={15}
                    value={maxItemsPerCategory}
                    onChange={(e) => setMaxItemsPerCategory(parseInt(e.target.value, 10) || 7)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <div className="h-14 flex items-center">
                    <Label className="leading-tight">Items shown before &quot;See more&quot; per category (1–10)</Label>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={maxInitialItemsPerCategory}
                    onChange={(e) => setMaxInitialItemsPerCategory(parseInt(e.target.value, 10) || 3)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <div className="h-14 flex items-start">
                    <Label className="leading-tight">When to show add-on suggestions (seconds after guest stops scrolling, 2–30)</Label>
                  </div>
                  <Input
                    type="number"
                    min={2}
                    max={30}
                    value={idleUpsellDelaySeconds}
                    onChange={(e) => setIdleUpsellDelaySeconds(parseInt(e.target.value, 10) || 6)}
                    className="w-full"
                  />
                </div>
              </div>
            </>
          )}

          {(engineMode === 'profit' || engineMode === 'adaptive') && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSuggestionsExpanded((e) => !e)}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                {suggestionsExpanded ? '▼' : '▶'} Customize which suggestions appear
              </button>
              {suggestionsExpanded && (
                <div className="mt-2 pl-4 space-y-1.5 text-sm text-slate-600">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={moodFlow} onChange={(e) => setMoodFlow(e.target.checked)} className="rounded border-slate-300" />
                    <span>Mood-based suggestions (e.g. &quot;something light&quot;, &quot;something filling&quot;)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={bundles} onChange={(e) => setBundles(e.target.checked)} className="rounded border-slate-300" />
                    <span>&quot;Often bought together&quot; combos</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={upsells} onChange={(e) => setUpsells(e.target.checked)} className="rounded border-slate-300" />
                    <span>Add-on suggestions while browsing</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={scarcityBadges} onChange={(e) => setScarcityBadges(e.target.checked)} className="rounded border-slate-300" />
                    <span>&quot;Popular&quot; or &quot;Limited&quot; badges on items</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={priceAnchoring} onChange={(e) => setPriceAnchoring(e.target.checked)} className="rounded border-slate-300" />
                    <span>Show a higher-priced item first to make others feel reasonably priced</span>
                  </label>
                </div>
              )}
            </div>
          )}

          <Button onClick={saveMenuEngine} disabled={savingEngine} className="gap-2">{savingEngine && <Loader2 className="h-4 w-4 animate-spin" />}Save optimization settings</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Menu Engineering Quadrant</CardTitle>
          <p className="text-sm text-slate-500">See how items compare by profit margin and popularity. Load the view to see the matrix and which items sit in each quadrant. Only you see this; guests do not.</p>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={fetchQuadrants} disabled={loadingQuadrants} className="mb-4 gap-2">{loadingQuadrants && <Loader2 className="h-4 w-4 animate-spin" />}Load performance view</Button>
          {quadrantData && (
            <div className="space-y-4">
              {/* 2x2 matrix: rows = Margin (High top, Low bottom), cols = Popularity (Low left, High right) */}
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                <div className="p-2 border-b border-slate-200 bg-slate-100/80">
                  <p className="text-center text-xs font-medium text-slate-600">Popularity →</p>
                  <div className="flex mt-1">
                    <span className="flex-1 text-center text-[10px] font-medium text-slate-500">Low</span>
                    <span className="flex-1 text-center text-[10px] font-medium text-slate-500">High</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-0">
                  {/* Row 1: High margin */}
                  {[
                    { key: 'PUZZLE', label: 'High Margin, Low Sales', sub: 'High margin, fewer sales', colorLabel: 'text-amber-800', colorCount: 'text-amber-900', colorSub: 'text-amber-700', bg: 'bg-amber-50/80', border: 'border-b border-r' },
                    { key: 'STAR', label: 'High Margin, High Sales', sub: 'High margin, high sales', colorLabel: 'text-emerald-800', colorCount: 'text-emerald-900', colorSub: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-b' },
                    { key: 'DOG', label: 'Low Margin, Low Sales', sub: 'Lower margin, fewer sales', colorLabel: 'text-slate-600', colorCount: 'text-slate-700', colorSub: 'text-slate-600', bg: 'bg-slate-100', border: 'border-r' },
                    { key: 'WORKHORSE', label: 'Low Margin, High Sales', sub: 'High sales, lower margin', colorLabel: 'text-blue-800', colorCount: 'text-blue-900', colorSub: 'text-blue-700', bg: 'bg-blue-50/80', border: '' },
                  ].map((q) => {
                    const qItems = quadrantData.items.filter((i) => i.quadrant === q.key)
                    const isExpanded = expandedQuadrants.has(q.key)
                    const displayItems = isExpanded ? qItems : qItems.slice(0, 4)
                    return (
                      <div key={q.key} className={`min-h-[100px] p-3 border-slate-200 ${q.border} ${q.bg}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${q.colorLabel}`}>{q.label}</p>
                        <p className={`text-2xl font-bold ${q.colorCount}`}>{formatDishCount(quadrantData.counts[q.key] ?? 0)}</p>
                        <p className={`text-[10px] mt-0.5 ${q.colorSub}`}>{q.sub}</p>
                        <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                          {displayItems.map((i) => (
                            <li key={i.menuItemId} className="truncate">{i.name}</li>
                          ))}
                        </ul>
                        {qItems.length > 4 && (
                          <button
                            type="button"
                            onClick={() => setExpandedQuadrants((prev) => {
                              const next = new Set(prev)
                              if (next.has(q.key)) next.delete(q.key)
                              else next.add(q.key)
                              return next
                            })}
                            className={`mt-2 text-[10px] font-medium underline underline-offset-2 ${q.colorLabel}`}
                          >
                            {isExpanded ? 'Show less' : `See all ${qItems.length} dishes`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="px-2 py-1.5 border-t border-slate-200 bg-slate-100/80 flex justify-center gap-6 text-[10px] text-slate-500">
                  <span>↑ High margin</span>
                  <span>↓ Low margin</span>
                </div>
              </div>
              <p className="text-xs text-slate-500">Matrix: rows = margin (high at top, low at bottom), columns = popularity (low left, high right). The big number is total dishes in that group. Click &quot;See all&quot; to view every item in a quadrant.</p>
              <div className="max-h-64 overflow-y-auto rounded border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr><th className="text-left p-2">Item</th><th className="text-left p-2">Category</th><th className="text-left p-2">Quadrant</th><th className="text-right p-2">Margin %</th><th className="text-right p-2">Units sold</th></tr>
                  </thead>
                  <tbody>
                    {quadrantData.items.map((row) => (
                      <tr key={row.menuItemId} className="border-t border-slate-100">
                        <td className="p-2">{row.name}</td><td className="p-2 text-slate-500">{row.categoryName ?? '—'}</td><td className="p-2">{getQuadrantLabel(row.quadrant)}</td><td className="p-2 text-right">{row.marginPercent}</td><td className="p-2 text-right">{row.unitsSold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle>Featured item sections (carousels)</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Swipeable rows of items on the menu. {engineMode === 'classic' && 'You choose items or use defaults.'}
                {(engineMode === 'profit' || engineMode === 'adaptive') && "Profit and Smart Profit modes auto-build three carousels: Chef's recommendation for breakfast, lunch, and dinner. Each shows only in its time period. Up to 6 items per carousel."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setSlotTimesDraft(slotTimes); setSlotTimesDialogOpen(true) }}
                className="gap-2"
                title="Edit the time ranges for each carousel slot"
              >
                <Clock className="h-4 w-4" />
                Carousel times
              </Button>
              {(engineMode === 'profit' || engineMode === 'adaptive') && (
                <Button size="sm" variant="outline" onClick={autoFillCarousels} disabled={autoFillingCarousels} className="gap-2">
                  {autoFillingCarousels && <Loader2 className="h-4 w-4 animate-spin" />}
                  Auto-fill carousels
                </Button>
              )}
              <Button size="sm" onClick={createShowcase}>
                <Plus className="h-4 w-4 mr-2" />
                Add section
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showcases.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
              <LayoutGrid className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-700 mb-1">No featured sections yet</p>
              <p className="text-xs text-slate-500 mb-4">
                {(engineMode === 'profit' || engineMode === 'adaptive')
                  ? 'Click &quot;Auto-fill carousels&quot; to create Chef&apos;s Highlights and Recommendations using your high-margin items. You can still edit them.'
                  : 'Featured sections are swipeable rows of items. You can pick items yourself or create default sections.'}
              </p>
              {(engineMode === 'profit' || engineMode === 'adaptive') ? (
                <Button variant="outline" onClick={autoFillCarousels} disabled={autoFillingCarousels} className="gap-2">
                  {autoFillingCarousels && <Loader2 className="h-4 w-4 animate-spin" />}
                  Auto-fill carousels
                </Button>
              ) : (
                <Button variant="outline" onClick={createDefaultShowcases}>Create default sections</Button>
              )}
            </div>
          ) : (
            showcases.map((showcase) => (
              <div key={showcase.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <GripVertical className="h-5 w-5 text-slate-300 mt-1 flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={showcase.title}
                        onChange={(e) => setShowcases((prev) => prev.map((s) => (s.id === showcase.id ? { ...s, title: e.target.value } : s)))}
                        onBlur={() => updateShowcase(showcase.id, { title: showcase.title })}
                        className="text-sm font-semibold min-w-[280px] max-w-[420px]"
                      />
                      <select
                        value={showcase.type ?? 'RECOMMENDATIONS'}
                        onChange={(e) => {
                          const val = e.target.value as 'CHEFS_HIGHLIGHTS' | 'RECOMMENDATIONS'
                          setShowcases((prev) => prev.map((s) => (s.id === showcase.id ? { ...s, type: val } : s)))
                          updateShowcase(showcase.id, { type: val })
                        }}
                        className="rounded border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        <option value="CHEFS_HIGHLIGHTS">Chef&apos;s Highlights</option>
                        <option value="RECOMMENDATIONS">Recommendations</option>
                      </select>
                      <span className="text-xs text-slate-400">(Style: Chef highlights = green; Recommendations = amber.)</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs text-slate-500">Display:</Label>
                      <select
                        value={showcase.displayVariant ?? 'cards'}
                        onChange={(e) => {
                          const val = e.target.value as 'hero' | 'cards'
                          setShowcases((prev) => prev.map((s) => (s.id === showcase.id ? { ...s, displayVariant: val } : s)))
                          updateShowcase(showcase.id, { displayVariant: val })
                        }}
                        className="rounded border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        <option value="cards">Cards carousel (sliding row of cards)</option>
                        <option value="hero">Full-width image carousel</option>
                      </select>
                      <span className="text-xs text-slate-400">Both are sliding; cards show multiple items, full-width shows one large image at a time.</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs text-slate-500">Position:</Label>
                      <select
                        value={showcase.position === 'top' ? 'top' : `after-${showcase.insertAfterCategoryId}`}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === 'top') updateShowcase(showcase.id, { position: 'top', insertAfterCategoryId: null })
                          else updateShowcase(showcase.id, { position: 'between-categories', insertAfterCategoryId: val.replace('after-', '') })
                        }}
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                      >
                        <option value="top">Top of menu</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={`after-${cat.id}`}>After &quot;{cat.name}&quot;</option>
                        ))}
                      </select>
                    </div>
                    {/* Carousel label (badge) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs text-slate-500 shrink-0">Badge label:</Label>
                      <Input
                        value={(showcase.schedule as TimeSlotSchedule)?.label ?? ''}
                        onChange={(e) => {
                          const label = e.target.value
                          const nextSchedule = { ...(showcase.schedule as TimeSlotSchedule || {}), label: label || undefined }
                          setShowcases((prev) => prev.map((s) => s.id === showcase.id ? { ...s, schedule: nextSchedule } : s))
                        }}
                        onBlur={() => updateShowcase(showcase.id, { schedule: showcase.schedule })}
                        placeholder='e.g. 🎄 Christmas Special'
                        className="text-xs h-8 max-w-[280px]"
                      />
                      <span className="text-xs text-slate-400">Shown as a badge on this carousel on the guest menu.</span>
                    </div>

                    {/* Seasonal date range */}
                    {(() => {
                      const s = showcase.schedule as TimeSlotSchedule | null | undefined
                      const isSeasonal = !!(s?.seasonalStart || s?.seasonalEnd)
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`seasonal-${showcase.id}`}
                              checked={isSeasonal}
                              onChange={(e) => {
                                const enabled = e.target.checked
                                const nextSchedule = {
                                  ...(s || {}),
                                  seasonalStart: enabled ? new Date().toISOString().slice(0, 10) : undefined,
                                  seasonalEnd: enabled
                                    ? new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
                                    : undefined,
                                } as TimeSlotSchedule
                                setShowcases((prev) => prev.map((sc) => sc.id === showcase.id ? { ...sc, schedule: nextSchedule } : sc))
                                updateShowcase(showcase.id, { schedule: nextSchedule })
                              }}
                              className="rounded border-slate-300"
                            />
                            <Label htmlFor={`seasonal-${showcase.id}`} className="text-sm font-normal cursor-pointer">
                              Seasonal (only show between specific dates)
                            </Label>
                          </div>
                          {isSeasonal && (
                            <div className="ml-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex flex-col gap-1">
                                  <Label className="text-xs text-slate-500">Start date</Label>
                                  <input
                                    type="date"
                                    value={s?.seasonalStart ?? ''}
                                    onChange={(e) => {
                                      const nextSchedule = { ...(s || {}), seasonalStart: e.target.value } as TimeSlotSchedule
                                      setShowcases((prev) => prev.map((sc) => sc.id === showcase.id ? { ...sc, schedule: nextSchedule } : sc))
                                      updateShowcase(showcase.id, { schedule: nextSchedule })
                                    }}
                                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <Label className="text-xs text-slate-500">End date</Label>
                                  <input
                                    type="date"
                                    value={s?.seasonalEnd ?? ''}
                                    onChange={(e) => {
                                      const nextSchedule = { ...(s || {}), seasonalEnd: e.target.value } as TimeSlotSchedule
                                      setShowcases((prev) => prev.map((sc) => sc.id === showcase.id ? { ...sc, schedule: nextSchedule } : sc))
                                      updateShowcase(showcase.id, { schedule: nextSchedule })
                                    }}
                                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                                  />
                                </div>
                              </div>
                              {/* AI-regenerate each dish photo with a consistent Christmas background */}
                              <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                                <p className="text-xs font-medium text-slate-600">Christmas dish photos</p>
                                <p className="text-xs text-slate-400">
                                  AI regenerates each dish photo using the same Christmas background prompt — food stays unchanged, background becomes festive. All dishes look consistent.
                                </p>
                                {s?.seasonalItemImages && Object.keys(s.seasonalItemImages).length > 0 ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex gap-1">
                                      {Object.values(s.seasonalItemImages).slice(0, 3).map((url, i) => (
                                        <img key={i} src={url} alt="" className="h-12 w-16 object-cover rounded-lg border border-slate-200 shadow-sm" />
                                      ))}
                                    </div>
                                    <div className="space-y-0.5">
                                      <p className="text-xs text-slate-600 font-medium">{Object.keys(s.seasonalItemImages).length} dish{Object.keys(s.seasonalItemImages).length === 1 ? '' : 'es'} regenerated</p>
                                      <button type="button" onClick={() => clearSeasonalItemImages(showcase.id)} className="text-xs text-red-500 underline underline-offset-2">Restore original photos</button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400">Not applied yet — original dish photos will be shown.</p>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => applyChristmasBackgrounds(showcase.id)}
                                  disabled={generatingSeasonalBg === showcase.id}
                                  className="gap-1.5"
                                >
                                  {generatingSeasonalBg === showcase.id
                                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating (may take a minute)…</>
                                    : <><Sparkles className="h-3.5 w-3.5" /> {s?.seasonalItemImages && Object.keys(s.seasonalItemImages).length > 0 ? 'Regenerate Christmas dish photos' : 'Apply Christmas backgrounds to dishes'}</>}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Time-slot carousels (breakfast/lunch/dinner): no "Use time slots" checkbox – they only show in that time window. */}
                    {!(showcase.schedule as TimeSlotSchedule)?.displayForSlot && !(Array.isArray((showcase.schedule as TimeSlotSchedule)?.displayForSlots) && (showcase.schedule as TimeSlotSchedule)!.displayForSlots!.length > 0) ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`use-time-slots-${showcase.id}`}
                          checked={(showcase.schedule as TimeSlotSchedule)?.useTimeSlots ?? false}
                          onChange={(e) => {
                            const useTimeSlots = e.target.checked
                            const nextSchedule = { ...(showcase.schedule || {}), useTimeSlots } as TimeSlotSchedule
                            setShowcases((prev) => prev.map((s) => (s.id === showcase.id ? { ...s, schedule: nextSchedule } : s)))
                            updateShowcase(showcase.id, { schedule: nextSchedule })
                          }}
                          className="rounded border-slate-300"
                        />
                        <Label htmlFor={`use-time-slots-${showcase.id}`} className="text-sm font-normal cursor-pointer">Use time slots (different items per Breakfast / Day / Evening / Night)</Label>
                      </div>
                    ) : (() => {
                      const s = showcase.schedule as TimeSlotSchedule | null | undefined
                      const slotRanges = buildSlotRangeLabels(slotTimes)
                      const lunchRange = `${slotRanges.day.split('–')[0]}–${slotRanges.evening.split('–')[1]}`
                      const slots = s?.displayForSlots
                      const slot = s?.displayForSlot
                      const timeLabel = Array.isArray(slots) && slots.length > 0
                        ? (slots.includes('day') && slots.includes('evening') ? lunchRange : slots.map((sl) => slotRanges[sl as keyof typeof slotRanges]).join(', '))
                        : slot && slotRanges[slot as keyof typeof slotRanges]
                          ? slotRanges[slot as keyof typeof slotRanges]
                          : null
                      return (
                        <p className="text-xs text-slate-500">
                          {timeLabel ? (
                            <>Shown <strong>{timeLabel}</strong> on the guest menu (menu timezone).</>
                          ) : (
                            'Shown only during this time period on the guest menu (menu timezone).'
                          )}
                        </p>
                      )
                    })()}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs text-slate-500">
                          {(engineMode === 'profit' || engineMode === 'adaptive') ? `Up to ${maxCarouselItems} items. ` : ''}
                          {showcase.items.length > 0 ? `${showcase.items.length} items selected` : 'Auto-populated (AI or high-margin when no slots)'}
                        </p>
                        <div className="flex gap-2">
                          {(showcase.schedule as TimeSlotSchedule)?.useTimeSlots && !(showcase.schedule as TimeSlotSchedule)?.displayForSlot && !(Array.isArray((showcase.schedule as TimeSlotSchedule)?.displayForSlots) && (showcase.schedule as TimeSlotSchedule)!.displayForSlots!.length > 0) && (
                            <Button variant="outline" size="sm" onClick={() => openScheduleDialog(showcase)} title="Set different items by time of day">
                              <Clock className="h-4 w-4 mr-1" />Time slots
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => openItemPicker(showcase.id)}>{showcase.items.length > 0 ? 'Edit Items' : 'Pick Items'}</Button>
                        </div>
                      </div>
                      {showcase.items.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {showcase.items.map((item) => (
                            <span key={item.menuItemId} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{item.menuItem.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {savingShowcase === showcase.id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => deleteShowcase(showcase.id)} disabled={deletingShowcase === showcase.id}>
                      {deletingShowcase === showcase.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Carousel Items</DialogTitle>
            <DialogDescription>
              Choose which menu items to display in this carousel. {(engineMode === 'profit' || engineMode === 'adaptive') && 'Maximum 6 items. '}
              Leave empty for automatic selection.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search menu items..."
              value={itemPickerSearch}
              onChange={(e) => setItemPickerSearch(e.target.value)}
              className="pl-9"
            />
            {itemPickerSearch && (
              <button type="button" onClick={() => setItemPickerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 py-2">
            {(() => {
              const q = itemPickerSearch.trim().toLowerCase()
              const filtered = q ? menuItems.filter((item) => item.name.toLowerCase().includes(q)) : menuItems
              if (filtered.length === 0) {
                return (
                  <div className="py-8 text-center text-sm text-slate-500">
                    {itemPickerSearch ? 'No menu items match your search.' : 'No menu items.'}
                  </div>
                )
              }
              return filtered.map((item) => {
                const isSelected = selectedItemIds.has(item.id)
                const atLimit = !isSelected && selectedItemIds.size >= maxCarouselItems
                return (
                  <button key={item.id} onClick={() => !atLimit && toggleItemSelection(item.id)} disabled={atLimit} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${isSelected ? 'border-emerald-400 bg-emerald-50' : atLimit ? 'opacity-60 cursor-not-allowed border-slate-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <div className={`flex h-5 w-5 items-center justify-center rounded border ${isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>{isSelected && <Check className="h-3 w-3" />}</div>
                    {item.imageUrl && <img src={item.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />}
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{item.name}</p></div>
                    <span className="text-xs font-medium text-slate-500">{formatCurrency(item.price)}</span>
                  </button>
                )
              })
            })()}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSelectedItemIds(new Set())}>Clear All</Button>
            <Button onClick={saveShowcaseItems} disabled={savingShowcase !== null}>{savingShowcase ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}Save ({selectedItemIds.size} items)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Time-based carousel items</DialogTitle>
            <DialogDescription>
              Choose which items appear for each time of day (menu timezone). {(engineMode === 'profit' || engineMode === 'adaptive') && 'Max 6 items per slot. '}
              Leave a slot empty to use AI suggestions or manual picks.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 gap-3 py-2">
            <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-100">
              {(['breakfast', 'day', 'evening', 'night'] as const).map((slot) => {
                const count = scheduleDraft[slot]?.itemIds?.length ?? 0
                const ranges = buildSlotRangeLabels(slotTimes)
                const label = slot === 'breakfast' ? `Breakfast (${ranges.breakfast})` : slot === 'day' ? `Day (${ranges.day})` : slot === 'evening' ? `Evening (${ranges.evening})` : `Night (${ranges.night})`
                return (
                  <button key={slot} type="button" onClick={() => setScheduleSlotTab(slot)} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${scheduleSlotTab === slot ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
                    {label}{count > 0 && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">{count}</span>}
                  </button>
                )
              })}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search menu items..." value={scheduleSearch} onChange={(e) => setScheduleSearch(e.target.value)} className="pl-9" />
              {scheduleSearch && <button type="button" onClick={() => setScheduleSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear search"><X className="h-4 w-4" /></button>}
            </div>
            {(() => {
              const ids = scheduleDraft[scheduleSlotTab]?.itemIds ?? []
              const selectedItems = ids.map((id) => menuItems.find((m) => m.id === id)).filter(Boolean) as SimpleMenuItem[]
              return (
                <>
                  {selectedItems.length > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">{selectedItems.length} selected for this slot</p>
                      <Button type="button" variant="ghost" size="sm" className="text-xs text-slate-500" onClick={() => clearScheduleSlot(scheduleSlotTab)}>Clear slot</Button>
                    </div>
                  )}
                  <div className="flex-1 min-h-[240px] max-h-[320px] overflow-y-auto rounded-lg border border-slate-200">
                    {(() => {
                      const q = scheduleSearch.trim().toLowerCase()
                      const filtered = q ? menuItems.filter((m) => m.name.toLowerCase().includes(q)) : menuItems
                      if (filtered.length === 0) return <div className="p-4 text-center text-sm text-slate-500">{scheduleSearch ? 'No items match your search.' : 'No menu items.'}</div>
                      return (
                        <ul className="divide-y divide-slate-100">
                          {filtered.map((item) => {
                            const ids = scheduleDraft[scheduleSlotTab]?.itemIds ?? []
                            const checked = ids.includes(item.id)
                            const atSlotLimit = !checked && ids.length >= maxCarouselItems
                            return (
                              <li key={item.id}>
                                <label className={`flex items-center gap-3 px-3 py-2.5 ${atSlotLimit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
                                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>{checked && <Check className="h-3 w-3" />}</div>
                                  <input type="checkbox" checked={checked} onChange={() => !atSlotLimit && toggleScheduleSlotItem(scheduleSlotTab, item.id)} className="sr-only" disabled={atSlotLimit} />
                                  {item.imageUrl && <img src={item.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />}
                                  <span className="flex-1 truncate text-sm font-medium text-slate-900">{item.name}</span>
                                  <span className="text-xs text-slate-500">{formatCurrency(item.price)}</span>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      )
                    })()}
                  </div>
                </>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveSchedule} disabled={scheduleSaving}>{scheduleSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carousel time slot configuration dialog */}
      <Dialog open={slotTimesDialogOpen} onOpenChange={setSlotTimesDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure carousel display times</DialogTitle>
            <DialogDescription>
              Set the hours (24h) when each time slot is active on the guest menu. &ldquo;Night&rdquo; is automatically everything outside these three slots.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {(['breakfast', 'day', 'evening'] as const).map((slot) => {
              const label = slot === 'breakfast' ? 'Breakfast' : slot === 'day' ? 'Day / Lunch' : 'Evening / Dinner'
              const current = slotTimesDraft[slot]
              return (
                <div key={slot} className="space-y-1.5">
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                      <Label className="text-xs text-slate-500">Start (hour, 0–23)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={current.start}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(23, parseInt(e.target.value) || 0))
                          setSlotTimesDraft((d) => ({ ...d, [slot]: { ...d[slot], start: v } }))
                        }}
                        className="h-9"
                      />
                    </div>
                    <span className="text-slate-400 mt-5">–</span>
                    <div className="flex flex-col gap-1 flex-1">
                      <Label className="text-xs text-slate-500">End (hour, 1–24)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={current.end}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(24, parseInt(e.target.value) || 1))
                          setSlotTimesDraft((d) => ({ ...d, [slot]: { ...d[slot], end: v } }))
                        }}
                        className="h-9"
                      />
                    </div>
                    <div className="flex flex-col gap-1 items-end mt-5 shrink-0">
                      <span className="text-sm text-slate-600 font-medium">{formatSlotRange(slotTimesDraft[slot])}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500 space-y-0.5">
              <p className="font-medium text-slate-700 mb-1">Preview</p>
              {(['breakfast', 'day', 'evening', 'night'] as const).map((slot) => {
                const ranges = buildSlotRangeLabels(slotTimesDraft)
                const names = { breakfast: 'Breakfast', day: 'Day / Lunch', evening: 'Evening / Dinner', night: 'Night' }
                return <p key={slot}><span className="font-medium">{names[slot]}:</span> {ranges[slot]}</p>
              })}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setSlotTimesDraft(DEFAULT_SLOT_TIMES) }}
              type="button"
            >
              Reset to defaults
            </Button>
            <Button onClick={saveSlotTimes} disabled={savingSlotTimes}>
              {savingSlotTimes && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save times
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
