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
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { MenuEngineSettings } from '@/types/menu-engine'
import type { EngineMode } from '@/types/menu-engine'

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
  day?: { itemIds: string[] }
  evening?: { itemIds: string[] }
  night?: { itemIds: string[] }
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
}

export default function MenuOptimizationContent({
  categories,
  showcases: initialShowcases,
  menuItems,
  menuEngineSettings: initialMenuEngineSettings,
}: MenuOptimizationContentProps) {
  const { toast } = useToast()
  const storedMode = (initialMenuEngineSettings?.mode as EngineMode) || 'classic'
  const resolvedMode = storedMode && ['classic', 'profit', 'adaptive'].includes(storedMode) ? storedMode : 'classic'
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

  const [showcases, setShowcases] = useState<Showcase[]>(initialShowcases)
  const [savingShowcase, setSavingShowcase] = useState<string | null>(null)
  const [deletingShowcase, setDeletingShowcase] = useState<string | null>(null)
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [editingShowcaseId, setEditingShowcaseId] = useState<string | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduleShowcaseId, setScheduleShowcaseId] = useState<string | null>(null)
  const [scheduleDraft, setScheduleDraft] = useState<TimeSlotSchedule>({ day: { itemIds: [] }, evening: { itemIds: [] }, night: { itemIds: [] } })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleSlotTab, setScheduleSlotTab] = useState<'day' | 'evening' | 'night'>('day')
  const [scheduleSearch, setScheduleSearch] = useState('')
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
      const response = await fetch(`/api/menu-showcases/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
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
    setScheduleDraft({ useTimeSlots: s?.useTimeSlots ?? false, day: s?.day ?? { itemIds: [] }, evening: s?.evening ?? { itemIds: [] }, night: s?.night ?? { itemIds: [] } })
    setScheduleSlotTab('day')
    setScheduleSearch('')
    setScheduleDialogOpen(true)
  }

  const clearScheduleSlot = (slot: 'day' | 'evening' | 'night') => {
    setScheduleDraft((prev) => ({ ...prev, [slot]: { itemIds: [] } }))
  }

  const toggleScheduleSlotItem = (slot: 'day' | 'evening' | 'night', menuItemId: string) => {
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
        day?: string[]
        evening?: string[]
        night?: string[]
      } = await res.json()
      const primaryIds = (suggested.recommended ?? suggested.day ?? []).slice(0, maxCarouselItems)
      const secondaryPool = [
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

      // Remove legacy auto-generated sections so only useful carousel(s) remain.
      const legacyTitles = new Set(['Breakfast', 'Lunch', 'Dinner'])
      const toDelete = list.filter((s) => legacyTitles.has((s.title || '').trim()))
      for (const section of toDelete) {
        await fetch(`/api/menu-showcases/${section.id}`, { method: 'DELETE' })
      }
      list = list.filter((s) => !legacyTitles.has((s.title || '').trim()))

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
        let showcase = list.find((s) => s.title === def.title) ?? list.find((s) => s.type === def.type)
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

        const itemsPayload = def.itemIds.map((menuItemId, index) => ({
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

      list = await upsertShowcase({
        title: "Chef's Highlights",
        type: 'CHEFS_HIGHLIGHTS',
        displayVariant: 'hero',
        itemIds: primaryIds,
        position: 'top',
        insertAfterCategoryId: null,
      })

      const dayIds = (suggested.day ?? primaryIds).slice(0, maxCarouselItems)
      const eveningIds = (suggested.evening ?? recommendationIds).slice(0, maxCarouselItems)
      const nightIds = (suggested.night ?? recommendationIds).slice(0, maxCarouselItems)
      const adaptiveSchedule: TimeSlotSchedule | null =
        engineMode === 'adaptive'
          ? {
              useTimeSlots: true,
              day: { itemIds: dayIds },
              evening: { itemIds: eveningIds },
              night: { itemIds: nightIds },
            }
          : null
      const recommendationPool =
        engineMode === 'adaptive'
          ? Array.from(new Set([...dayIds, ...eveningIds, ...nightIds]))
          : recommendationIds

      list = await upsertShowcase({
        title: 'Recommended for Guests',
        type: 'RECOMMENDATIONS',
        displayVariant: 'cards',
        itemIds: recommendationPool,
        position: firstCategory ? 'between-categories' : 'top',
        insertAfterCategoryId: firstCategory?.id ?? null,
        schedule: adaptiveSchedule,
      })

      setShowcases(list)

      if (engineMode === 'adaptive' && !suggested.usedSalesData) {
        toast({
          title: 'Smart Profit fallback used',
          description: 'No sales history yet, so Smart Profit used high-margin fallback. Carousels may look similar to Profit mode until sales data is available.',
        })
      } else {
        toast({
          title: 'Carousels ready',
          description: "Created Chef's Highlights and Recommendations from high-margin items.",
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
            We offer three options to optimize your menu: <strong>1. Manual Mode</strong> — do it yourself. <strong>2. Profit Mode</strong> — highlight high-margin items. <strong>3. Smart Profit Mode</strong> — use sales and profit data to order and suggest. Only you see this data; guests never do.
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
                    {mode === 'classic' && '1. Manual Mode: do it yourself'}
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
                  <div className="min-h-[100px] p-3 border-b border-r border-slate-200 bg-amber-50/80">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">High Margin, Low Sales</p>
                    <p className="text-2xl font-bold text-amber-900">{formatDishCount(quadrantData.counts.PUZZLE ?? 0)}</p>
                    <p className="text-[10px] text-amber-700 mt-0.5">High margin, fewer sales</p>
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-600 line-clamp-3">
                      {quadrantData.items.filter((i) => i.quadrant === 'PUZZLE').slice(0, 4).map((i) => (
                        <li key={i.menuItemId} className="truncate">{i.name}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[10px] text-slate-500">Showing up to 4 example dishes.</p>
                  </div>
                  <div className="min-h-[100px] p-3 border-b border-slate-200 bg-emerald-50">
                    <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">High Margin, High Sales</p>
                    <p className="text-2xl font-bold text-emerald-900">{formatDishCount(quadrantData.counts.STAR ?? 0)}</p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">High margin, high sales</p>
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-600 line-clamp-3">
                      {quadrantData.items.filter((i) => i.quadrant === 'STAR').slice(0, 4).map((i) => (
                        <li key={i.menuItemId} className="truncate">{i.name}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[10px] text-slate-500">Showing up to 4 example dishes.</p>
                  </div>
                  {/* Row 2: Low margin */}
                  <div className="min-h-[100px] p-3 border-r border-slate-200 bg-slate-100">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Low Margin, Low Sales</p>
                    <p className="text-2xl font-bold text-slate-700">{formatDishCount(quadrantData.counts.DOG ?? 0)}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">Lower margin, fewer sales</p>
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-600 line-clamp-3">
                      {quadrantData.items.filter((i) => i.quadrant === 'DOG').slice(0, 4).map((i) => (
                        <li key={i.menuItemId} className="truncate">{i.name}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[10px] text-slate-500">Showing up to 4 example dishes.</p>
                  </div>
                  <div className="min-h-[100px] p-3 border-slate-200 bg-blue-50/80">
                    <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-1">Low Margin, High Sales</p>
                    <p className="text-2xl font-bold text-blue-900">{formatDishCount(quadrantData.counts.WORKHORSE ?? 0)}</p>
                    <p className="text-[10px] text-blue-700 mt-0.5">High sales, lower margin</p>
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-600 line-clamp-3">
                      {quadrantData.items.filter((i) => i.quadrant === 'WORKHORSE').slice(0, 4).map((i) => (
                        <li key={i.menuItemId} className="truncate">{i.name}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[10px] text-slate-500">Showing up to 4 example dishes.</p>
                  </div>
                </div>
                <div className="px-2 py-1.5 border-t border-slate-200 bg-slate-100/80 flex justify-center gap-6 text-[10px] text-slate-500">
                  <span>↑ High margin</span>
                  <span>↓ Low margin</span>
                </div>
              </div>
              <p className="text-xs text-slate-500">Matrix: rows = margin (high at top, low at bottom), columns = popularity (low left, high right). The big number is total dishes in that group; the names under it are up to 4 examples.</p>
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
                {(engineMode === 'profit' || engineMode === 'adaptive') && "Profit and Smart Profit modes auto-build Chef's Highlights and Recommendations carousels using your highest-margin items. Up to 6 items per carousel."}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
                        className="text-sm font-semibold max-w-[200px]"
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
                      <Label htmlFor={`use-time-slots-${showcase.id}`} className="text-sm font-normal cursor-pointer">Use time slots (Day / Evening / Night)</Label>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs text-slate-500">
                          {(engineMode === 'profit' || engineMode === 'adaptive') ? `Up to ${maxCarouselItems} items. ` : ''}
                          {showcase.items.length > 0 ? `${showcase.items.length} items selected` : 'Auto-populated (AI or high-margin when no slots)'}
                        </p>
                        <div className="flex gap-2">
                          {(showcase.schedule as TimeSlotSchedule)?.useTimeSlots && (
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Carousel Items</DialogTitle>
            <DialogDescription>
              Choose which menu items to display in this carousel. {(engineMode === 'profit' || engineMode === 'adaptive') && 'Maximum 6 items. '}
              Leave empty for automatic selection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2">
            {menuItems.map((item) => {
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
            })}
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
              Choose which items appear for each time of day (menu timezone). Day = morning (6am–12pm), Evening = lunch (12–6pm), Night = evening (6pm–6am). {(engineMode === 'profit' || engineMode === 'adaptive') && 'Max 6 items per slot. '}
              Leave a slot empty to use AI suggestions or manual picks.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 gap-3 py-2">
            <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-100">
              {(['day', 'evening', 'night'] as const).map((slot) => {
                const count = scheduleDraft[slot]?.itemIds?.length ?? 0
                const label = slot === 'day' ? 'Day (6am–12pm)' : slot === 'evening' ? 'Evening (12–6pm)' : 'Night (6pm–6am)'
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
    </div>
  )
}
