'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
  Palette,
  LayoutGrid,
  Plus,
  Trash2,
  Check,
  Loader2,
  GripVertical,
  Clock,
  Upload,
  Search,
  X,
  Zap,
  BarChart3,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { DEFAULT_MENU_ENGINE_SETTINGS } from '@/lib/menu-engine-defaults'
import type { MenuEngineSettings } from '@/types/menu-engine'

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

interface SettingsClientProps {
  currentTheme: Record<string, string>
  defaultBackgroundPrompt?: string
  categories: CategoryOption[]
  showcases: Showcase[]
  menuItems: SimpleMenuItem[]
  menuEngineSettings?: Record<string, unknown> | null
}

export default function SettingsClient({
  currentTheme,
  defaultBackgroundPrompt: initialDefaultBackgroundPrompt = '',
  categories,
  showcases: initialShowcases,
  menuItems,
  menuEngineSettings: initialMenuEngineSettings,
}: SettingsClientProps) {
  const { toast } = useToast()

  const defaultEngine = { ...DEFAULT_MENU_ENGINE_SETTINGS, ...(initialMenuEngineSettings || {}) } as MenuEngineSettings
  const [engineMode, setEngineMode] = useState<MenuEngineSettings['mode']>(defaultEngine.mode)
  const [moodFlow, setMoodFlow] = useState(defaultEngine.moodFlow)
  const [bundles, setBundles] = useState(defaultEngine.bundles)
  const [upsells, setUpsells] = useState(defaultEngine.upsells)
  const [scarcityBadges, setScarcityBadges] = useState(defaultEngine.scarcityBadges)
  const [priceAnchoring, setPriceAnchoring] = useState(defaultEngine.priceAnchoring)
  const [bundleCorrelationThreshold, setBundleCorrelationThreshold] = useState(defaultEngine.bundleCorrelationThreshold)
  const [maxItemsPerCategory, setMaxItemsPerCategory] = useState(defaultEngine.maxItemsPerCategory)
  const [idleUpsellDelaySeconds, setIdleUpsellDelaySeconds] = useState(defaultEngine.idleUpsellDelaySeconds)
  const [savingEngine, setSavingEngine] = useState(false)
  const [quadrantData, setQuadrantData] = useState<{ counts: Record<string, number>; items: Array<{ menuItemId: string; name: string; categoryName?: string; quadrant: string; marginPercent: number; unitsSold: number }> } | null>(null)
  const [loadingQuadrants, setLoadingQuadrants] = useState(false)

  // Theme state
  const [primaryColor, setPrimaryColor] = useState(
    currentTheme.primaryColor || '#10b981'
  )
  const [accentColor, setAccentColor] = useState(
    currentTheme.accentColor || '#f59e0b'
  )
  const [backgroundStyle, setBackgroundStyle] = useState<string>(
    currentTheme.backgroundStyle || 'dark'
  )
  const [fontFamily, setFontFamily] = useState<string>(
    currentTheme.fontFamily || 'sans'
  )
  const [logoUrl, setLogoUrl] = useState(currentTheme.logoUrl || '')
  const [menuTimezone, setMenuTimezone] = useState(currentTheme.menuTimezone || 'Asia/Baghdad')
  const [themePreset, setThemePreset] = useState<string | null>(currentTheme.themePreset ?? null)
  const [savingTheme, setSavingTheme] = useState(false)

  // Consistent background prompt for dish photos (upload image → describe, or type)
  const [defaultBackgroundPrompt, setDefaultBackgroundPrompt] = useState(initialDefaultBackgroundPrompt)
  const [defaultBackgroundDraft, setDefaultBackgroundDraft] = useState(initialDefaultBackgroundPrompt)
  const [describingImage, setDescribingImage] = useState(false)
  const [savingBackgroundPrompt, setSavingBackgroundPrompt] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDefaultBackgroundPrompt(initialDefaultBackgroundPrompt)
    setDefaultBackgroundDraft(initialDefaultBackgroundPrompt)
  }, [initialDefaultBackgroundPrompt])

  const THEME_PRESETS: Record<string, { label: string; primaryColor: string; accentColor: string; backgroundStyle: string; fontFamily: string }> = {
    classy: { label: 'Classy', primaryColor: '#1e293b', accentColor: '#c9a227', backgroundStyle: 'dark', fontFamily: 'serif' },
    fast_food: { label: 'Fast Food', primaryColor: '#dc2626', accentColor: '#fbbf24', backgroundStyle: 'light', fontFamily: 'sans' },
    cozy: { label: 'Cozy', primaryColor: '#b45309', accentColor: '#d97706', backgroundStyle: 'gradient', fontFamily: 'serif' },
    minimal: { label: 'Minimal', primaryColor: '#0f766e', accentColor: '#5eead4', backgroundStyle: 'light', fontFamily: 'sans' },
    luxe: { label: 'Luxe', primaryColor: '#7c3aed', accentColor: '#a78bfa', backgroundStyle: 'dark', fontFamily: 'display' },
  }

  /** Suggested dish-photo background prompt per preset (background only; food stays the same). */
  const PRESET_SUGGESTED_BACKGROUNDS: Record<string, string> = {
    classy: 'Elegant dark marble or white linen surface, soft studio lighting, minimal props, refined restaurant ambiance.',
    fast_food: 'Clean bright surface, casual diner or counter style, vibrant and energetic, simple backdrop.',
    cozy: 'Warm wooden table, soft natural light, cozy restaurant or home dining vibe, shallow depth of field.',
    minimal: 'Clean neutral background, soft diffused light, minimal props, calm and simple aesthetic.',
    luxe: 'Premium dark surface or velvet texture, dramatic soft lighting, high-end restaurant atmosphere.',
  }

  // Theme suggestion dialog (preview + approve before changing dish photo background)
  const [themeSuggestDialogOpen, setThemeSuggestDialogOpen] = useState(false)
  const [themeSuggestPrompt, setThemeSuggestPrompt] = useState('')
  const [themeSuggestPresetLabel, setThemeSuggestPresetLabel] = useState('')
  const [themePreviewImageUrl, setThemePreviewImageUrl] = useState<string | null>(null)
  const [themePreviewLoading, setThemePreviewLoading] = useState(false)
  const [themeSuggestApplying, setThemeSuggestApplying] = useState(false)

  // Showcase state
  const [showcases, setShowcases] = useState<Showcase[]>(initialShowcases)
  const [savingShowcase, setSavingShowcase] = useState<string | null>(null)
  const [deletingShowcase, setDeletingShowcase] = useState<string | null>(null)

  // Item picker dialog
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [editingShowcaseId, setEditingShowcaseId] = useState<string | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())

  // Schedule (time slots) dialog
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduleShowcaseId, setScheduleShowcaseId] = useState<string | null>(null)
  const [scheduleDraft, setScheduleDraft] = useState<TimeSlotSchedule>({ day: { itemIds: [] }, evening: { itemIds: [] }, night: { itemIds: [] } })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleSlotTab, setScheduleSlotTab] = useState<'day' | 'evening' | 'night'>('day')
  const [scheduleSearch, setScheduleSearch] = useState('')

  const saveTheme = async () => {
    setSavingTheme(true)
    try {
      const response = await fetch('/api/settings/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryColor,
          accentColor,
          backgroundStyle,
          fontFamily,
          logoUrl: logoUrl || null,
          menuTimezone: menuTimezone || 'Asia/Baghdad',
          themePreset: themePreset || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save theme')
      }

      toast({ title: 'Theme saved', description: 'Your menu theme has been updated.' })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save theme',
        variant: 'destructive',
      })
    } finally {
      setSavingTheme(false)
    }
  }

  const createShowcase = async () => {
    try {
      const response = await fetch('/api/menu-showcases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Carousel',
          type: 'RECOMMENDATIONS',
          position: 'top',
        }),
      })

      if (!response.ok) throw new Error('Failed to create carousel')

      const newShowcase = await response.json()
      setShowcases((prev) => [
        ...prev,
        { ...newShowcase, items: [] },
      ])

      toast({ title: 'Carousel created', description: 'You can now customize it.' })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create carousel section',
        variant: 'destructive',
      })
    }
  }

  const createDefaultShowcases = async () => {
    try {
      // Create top carousel
      const res1 = await fetch('/api/menu-showcases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: "Chef's Selection",
          type: 'CHEFS_HIGHLIGHTS',
          position: 'top',
        }),
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

      setShowcases([
        { ...showcase1, items: [] },
        { ...showcase2, items: [] },
      ])

      toast({
        title: 'Default carousels created',
        description: 'Two carousel sections have been set up. Items will be auto-populated.',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create default carousels',
        variant: 'destructive',
      })
    }
  }

  const updateShowcase = async (
    id: string,
    updates: Partial<Pick<Showcase, 'title' | 'position' | 'insertAfterCategoryId' | 'isActive' | 'type' | 'schedule'>>
  ) => {
    setSavingShowcase(id)
    try {
      const response = await fetch(`/api/menu-showcases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) throw new Error('Failed to update')

      setShowcases((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      )

      toast({ title: 'Carousel updated' })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update carousel',
        variant: 'destructive',
      })
    } finally {
      setSavingShowcase(null)
    }
  }

  const deleteShowcase = async (id: string) => {
    setDeletingShowcase(id)
    try {
      const response = await fetch(`/api/menu-showcases/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete')

      setShowcases((prev) => prev.filter((s) => s.id !== id))
      toast({ title: 'Carousel deleted' })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete carousel',
        variant: 'destructive',
      })
    } finally {
      setDeletingShowcase(null)
    }
  }

  const openItemPicker = (showcaseId: string) => {
    const showcase = showcases.find((s) => s.id === showcaseId)
    const currentIds = new Set(
      (showcase?.items || []).map((item) => item.menuItemId)
    )
    setSelectedItemIds(currentIds)
    setEditingShowcaseId(showcaseId)
    setItemPickerOpen(true)
  }

  const saveShowcaseItems = async () => {
    if (!editingShowcaseId) return

    setSavingShowcase(editingShowcaseId)
    try {
      const itemsArray = Array.from(selectedItemIds).map((menuItemId, index) => ({
        menuItemId,
        displayOrder: index,
      }))

      const response = await fetch(
        `/api/menu-showcases/${editingShowcaseId}/items`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsArray }),
        }
      )

      if (!response.ok) throw new Error('Failed to save items')

      // Update local state
      setShowcases((prev) =>
        prev.map((s) => {
          if (s.id !== editingShowcaseId) return s
          return {
            ...s,
            items: itemsArray.map((item) => ({
              id: '',
              showcaseId: editingShowcaseId,
              menuItemId: item.menuItemId,
              displayOrder: item.displayOrder,
              menuItem: menuItems.find((m) => m.id === item.menuItemId)!,
            })),
          }
        })
      )

      setItemPickerOpen(false)
      toast({ title: 'Items updated' })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update carousel items',
        variant: 'destructive',
      })
    } finally {
      setSavingShowcase(null)
    }
  }

  const toggleItemSelection = (menuItemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(menuItemId)) {
        next.delete(menuItemId)
      } else {
        next.add(menuItemId)
      }
      return next
    })
  }

  const openScheduleDialog = (showcase: Showcase) => {
    setScheduleShowcaseId(showcase.id)
    const s = showcase.schedule
    setScheduleDraft({
      useTimeSlots: s?.useTimeSlots ?? false,
      day: s?.day ?? { itemIds: [] },
      evening: s?.evening ?? { itemIds: [] },
      night: s?.night ?? { itemIds: [] },
    })
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
      const next = ids.includes(menuItemId) ? ids.filter((id) => id !== menuItemId) : [...ids, menuItemId]
      return { ...prev, [slot]: { itemIds: next } }
    })
  }

  const saveSchedule = async () => {
    if (!scheduleShowcaseId) return
    setScheduleSaving(true)
    try {
      const showcase = showcases.find((s) => s.id === scheduleShowcaseId)
      const scheduleToSave = { ...scheduleDraft, useTimeSlots: showcase?.schedule?.useTimeSlots ?? scheduleDraft.useTimeSlots }
      const response = await fetch(`/api/menu-showcases/${scheduleShowcaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: scheduleToSave }),
      })
      if (!response.ok) throw new Error('Failed to update')
      setShowcases((prev) =>
        prev.map((s) => (s.id === scheduleShowcaseId ? { ...s, schedule: scheduleToSave } : s))
      )
      setScheduleDialogOpen(false)
      toast({ title: 'Time-based schedule saved' })
    } catch {
      toast({ title: 'Failed to save schedule', variant: 'destructive' })
    } finally {
      setScheduleSaving(false)
    }
  }

  const generateThemePreview = async () => {
    if (!themeSuggestPrompt) return
    setThemePreviewLoading(true)
    setThemePreviewImageUrl(null)
    try {
      const res = await fetch('/api/menu/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: 'Grilled chicken breast',
          description: 'Sample dish for preview',
          category: 'Main',
          prompt: themeSuggestPrompt,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setThemePreviewImageUrl(data.imageUrl ?? null)
      toast({ title: 'Preview generated' })
    } catch {
      toast({ title: 'Could not generate preview', variant: 'destructive' })
    } finally {
      setThemePreviewLoading(false)
    }
  }

  const applyThemeBackground = async () => {
    if (!themeSuggestPrompt) return
    setThemeSuggestApplying(true)
    try {
      const res = await fetch('/api/user/background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: themeSuggestPrompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setDefaultBackgroundPrompt(data.defaultBackgroundPrompt ?? themeSuggestPrompt)
      setDefaultBackgroundDraft(data.defaultBackgroundPrompt ?? themeSuggestPrompt)
      setThemeSuggestDialogOpen(false)
      toast({
        title: 'Dish photo background updated',
        description: 'Future generated menu item photos will use this style.',
      })
    } catch {
      toast({ title: 'Could not update background', variant: 'destructive' })
    } finally {
      setThemeSuggestApplying(false)
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
      const res = await fetch('/api/settings/menu-engine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: engineMode,
          moodFlow,
          bundles,
          upsells,
          scarcityBadges,
          priceAnchoring,
          bundleCorrelationThreshold,
          maxItemsPerCategory,
          idleUpsellDelaySeconds,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast({ title: 'Menu engine settings saved' })
    } catch {
      toast({ title: 'Failed to save menu engine settings', variant: 'destructive' })
    } finally {
      setSavingEngine(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">
          Customize your customer-facing menu appearance and carousel sections.
        </p>
      </div>

      <Tabs defaultValue="theme" className="space-y-4">
        <TabsList>
          <TabsTrigger value="theme" className="gap-2">
            <Palette className="h-4 w-4" />
            Menu Theme
          </TabsTrigger>
          <TabsTrigger value="carousels" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Carousel Sections
          </TabsTrigger>
          <TabsTrigger value="menu-engine" className="gap-2">
            <Zap className="h-4 w-4" />
            Menu Engine
          </TabsTrigger>
        </TabsList>

        {/* ───── Theme Tab ───── */}
        <TabsContent value="theme">
          <Card>
            <CardHeader>
              <CardTitle>Menu Branding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Preset themes */}
              <div className="space-y-2">
                <Label>Preset theme</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(THEME_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setThemePreset(key)
                        setPrimaryColor(preset.primaryColor)
                        setAccentColor(preset.accentColor)
                        setBackgroundStyle(preset.backgroundStyle)
                        setFontFamily(preset.fontFamily)
                        const suggestedBg = PRESET_SUGGESTED_BACKGROUNDS[key]
                        if (suggestedBg) {
                          setThemeSuggestPrompt(suggestedBg)
                          setThemeSuggestPresetLabel(preset.label)
                          setThemePreviewImageUrl(null)
                          setThemeSuggestDialogOpen(true)
                        }
                      }}
                      className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm ${
                        themePreset === key ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-slate-300"
                        style={{ backgroundColor: preset.primaryColor }}
                      />
                      <span
                        className="h-3 w-3 rounded-full border border-slate-300"
                        style={{ backgroundColor: preset.accentColor }}
                      />
                      {preset.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setThemePreset(null)}
                    className={`rounded-lg border-2 px-3 py-2 text-sm ${
                      !themePreset ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Colors */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      id="primaryColor"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded border border-slate-200"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      placeholder="#10b981"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Used for highlights, buttons, and accents on the menu.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accentColor">Accent Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      id="accentColor"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded border border-slate-200"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      placeholder="#f59e0b"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Used for carousel indicators and secondary elements.
                  </p>
                </div>
              </div>

              {/* Background Style */}
              <div className="space-y-2">
                <Label>Background Style</Label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { value: 'dark', label: 'Dark', preview: 'bg-slate-950' },
                    {
                      value: 'gradient',
                      label: 'Gradient',
                      preview:
                        'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950',
                    },
                    { value: 'light', label: 'Light', preview: 'bg-slate-100' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setBackgroundStyle(option.value)}
                      className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 transition ${
                        backgroundStyle === option.value
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`h-6 w-10 rounded ${option.preview}`}
                      />
                      <span className="text-sm font-medium">
                        {option.label}
                      </span>
                      {backgroundStyle === option.value && (
                        <Check className="h-4 w-4 text-emerald-600" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Family */}
              <div className="space-y-2">
                <Label>Font Family</Label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { value: 'sans', label: 'Sans-serif', sample: 'font-sans' },
                    { value: 'serif', label: 'Serif', sample: 'font-serif' },
                    {
                      value: 'display',
                      label: 'Display',
                      sample: 'font-serif italic',
                    },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFontFamily(option.value)}
                      className={`rounded-lg border-2 px-4 py-3 transition ${
                        fontFamily === option.value
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className={`text-lg ${option.sample}`}>
                        Aa
                      </span>
                      <p className="text-xs text-slate-500 mt-1">
                        {option.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Menu timezone (for time-based carousels) */}
              <div className="space-y-2">
                <Label htmlFor="menuTimezone">Menu timezone</Label>
                <select
                  id="menuTimezone"
                  value={menuTimezone}
                  onChange={(e) => setMenuTimezone(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="Asia/Baghdad">Erbil (Asia/Baghdad)</option>
                  <option value="Asia/Dubai">Dubai</option>
                  <option value="Europe/London">London</option>
                  <option value="America/New_York">New York</option>
                  <option value="UTC">UTC</option>
                </select>
                <p className="text-xs text-slate-500">
                  Used for time-based carousel slots (Day 6am–12pm, Evening 12–6pm, Night 6pm–6am).
                </p>
              </div>

              {/* Consistent background for dish photos: type the prompt or upload image to generate it */}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <Label>Consistent background for dish photos</Label>
                <p className="text-xs text-slate-500">
                  Set the background style for every generated menu item photo. You can type a description below, or upload a reference image and we’ll generate the prompt from it.
                </p>
                <div className="space-y-2">
                  <textarea
                    value={defaultBackgroundDraft}
                    onChange={(e) => setDefaultBackgroundDraft(e.target.value)}
                    placeholder="e.g. Clean light-gray tabletop, soft diffuse lighting, minimal studio style"
                    className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    rows={3}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingBackgroundPrompt || defaultBackgroundDraft.trim() === (defaultBackgroundPrompt || '')}
                    onClick={async () => {
                      setSavingBackgroundPrompt(true)
                      try {
                        const res = await fetch('/api/user/background', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ prompt: defaultBackgroundDraft.trim() }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error || 'Failed')
                        setDefaultBackgroundPrompt(data.defaultBackgroundPrompt ?? defaultBackgroundDraft.trim())
                        toast({ title: 'Background prompt saved' })
                      } catch {
                        toast({ title: 'Could not save prompt', variant: 'destructive' })
                      } finally {
                        setSavingBackgroundPrompt(false)
                      }
                    }}
                  >
                    {savingBackgroundPrompt ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                    Save prompt
                  </Button>
                </div>
                <p className="text-xs text-slate-500 pt-1 border-t border-slate-200">
                  Or upload a reference image — we’ll describe its background and save it as the prompt:
                </p>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setDescribingImage(true)
                    try {
                      const form = new FormData()
                      form.append('image', file)
                      const res = await fetch('/api/user/background/describe-image', {
                        method: 'POST',
                        body: form,
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error || 'Failed')
                      const prompt = data.defaultBackgroundPrompt ?? data.description ?? ''
                      setDefaultBackgroundPrompt(prompt)
                      setDefaultBackgroundDraft(prompt)
                      toast({
                        title: 'Background prompt saved',
                        description: 'Generated from your image. You can edit the text above and save again.',
                      })
                    } catch {
                      toast({
                        title: 'Could not describe image',
                        description: 'Check OPENAI_API_KEY and try again.',
                        variant: 'destructive',
                      })
                    } finally {
                      setDescribingImage(false)
                      e.target.value = ''
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={describingImage}
                  onClick={() => imageInputRef.current?.click()}
                >
                  {describingImage ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {describingImage ? 'Describing…' : 'Choose image from computer'}
                </Button>
              </div>

              {/* Logo: upload from computer (S3) or paste URL */}
              <div className="space-y-2">
                <Label>Restaurant logo</Label>
                <p className="text-xs text-slate-500">
                  Upload from your computer (stored in your S3 bucket) or paste a URL.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setLogoUploading(true)
                      try {
                        const form = new FormData()
                        form.append('logo', file)
                        const res = await fetch('/api/upload/logo', {
                          method: 'POST',
                          body: form,
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error || 'Upload failed')
                        setLogoUrl(data.url)
                        toast({ title: 'Logo uploaded', description: 'Click Save Theme to apply.' })
                      } catch {
                        toast({
                          title: 'Upload failed',
                          description: 'Check AWS S3 env vars (AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, etc.).',
                          variant: 'destructive',
                        })
                      } finally {
                        setLogoUploading(false)
                        e.target.value = ''
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={logoUploading}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {logoUploading ? 'Uploading…' : 'Upload from computer'}
                  </Button>
                </div>
                <div className="pt-1">
                  <Label htmlFor="logoUrl" className="text-xs text-slate-500">Or paste logo URL</Label>
                  <Input
                    id="logoUrl"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://… or upload above"
                    className="mt-1"
                  />
                </div>
                {logoUrl && (
                  <div className="mt-2">
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="h-16 w-16 rounded-full object-contain border border-slate-200"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label>Preview</Label>
                <div
                  className={`rounded-xl p-6 ${
                    backgroundStyle === 'light'
                      ? 'bg-slate-100 text-slate-900'
                      : backgroundStyle === 'gradient'
                        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white'
                        : 'bg-slate-950 text-white'
                  } ${fontFamily === 'serif' ? 'font-serif' : fontFamily === 'display' ? 'font-serif italic' : ''}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="h-10 w-10 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <div>
                      <p className="font-bold text-lg">Your Restaurant</p>
                      <p className="text-xs opacity-60">Menu Preview</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div
                      className="h-2 w-8 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <div
                      className="h-2 w-4 rounded-full"
                      style={{ backgroundColor: accentColor }}
                    />
                    <div
                      className="h-2 w-4 rounded-full opacity-30"
                      style={{ backgroundColor: accentColor }}
                    />
                  </div>
                </div>
              </div>

              <Button onClick={saveTheme} disabled={savingTheme}>
                {savingTheme ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Save Theme
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── Carousels Tab ───── */}
        <TabsContent value="carousels">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Carousel Sections</CardTitle>
                <Button size="sm" onClick={createShowcase}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Carousel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showcases.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                  <LayoutGrid className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-700 mb-1">
                    No carousel sections yet
                  </p>
                  <p className="text-xs text-slate-500 mb-4">
                    Carousels showcase featured items in a swipeable format.
                    Items are auto-populated when none are manually picked.
                  </p>
                  <Button variant="outline" onClick={createDefaultShowcases}>
                    Set Up Default Carousels
                  </Button>
                </div>
              ) : (
                showcases.map((showcase) => (
                  <div
                    key={showcase.id}
                    className="rounded-lg border border-slate-200 p-4 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <GripVertical className="h-5 w-5 text-slate-300 mt-1 flex-shrink-0" />
                      <div className="flex-1 space-y-3">
                        {/* Title */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            value={showcase.title}
                            onChange={(e) =>
                              setShowcases((prev) =>
                                prev.map((s) =>
                                  s.id === showcase.id
                                    ? { ...s, title: e.target.value }
                                    : s
                                )
                              )
                            }
                            onBlur={() =>
                              updateShowcase(showcase.id, {
                                title: showcase.title,
                              })
                            }
                            className="text-sm font-semibold max-w-[200px]"
                          />
                          <select
                            value={showcase.type ?? 'RECOMMENDATIONS'}
                            onChange={(e) => {
                              const val = e.target.value as 'CHEFS_HIGHLIGHTS' | 'RECOMMENDATIONS'
                              setShowcases((prev) =>
                                prev.map((s) =>
                                  s.id === showcase.id ? { ...s, type: val } : s
                                )
                              )
                              updateShowcase(showcase.id, { type: val })
                            }}
                            className="rounded border border-slate-200 px-2 py-1.5 text-xs"
                          >
                            <option value="CHEFS_HIGHLIGHTS">Chef&apos;s Highlights</option>
                            <option value="RECOMMENDATIONS">Recommendations</option>
                          </select>
                          <span className="text-xs text-slate-400">
                            (Controls carousel style: Chef = green accent; Recommendations = amber.)
                          </span>
                        </div>

                        {/* Position */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Label className="text-xs text-slate-500">
                            Position:
                          </Label>
                          <select
                            value={
                              showcase.position === 'top'
                                ? 'top'
                                : `after-${showcase.insertAfterCategoryId}`
                            }
                            onChange={(e) => {
                              const val = e.target.value
                              if (val === 'top') {
                                updateShowcase(showcase.id, {
                                  position: 'top',
                                  insertAfterCategoryId: null,
                                })
                              } else {
                                const catId = val.replace('after-', '')
                                updateShowcase(showcase.id, {
                                  position: 'between-categories',
                                  insertAfterCategoryId: catId,
                                })
                              }
                            }}
                            className="rounded border border-slate-200 px-2 py-1 text-xs"
                          >
                            <option value="top">Top of menu</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={`after-${cat.id}`}>
                                After &quot;{cat.name}&quot;
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Use time slots toggle */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`use-time-slots-${showcase.id}`}
                            checked={(showcase.schedule as TimeSlotSchedule)?.useTimeSlots ?? false}
                            onChange={(e) => {
                              const useTimeSlots = e.target.checked
                              const nextSchedule = { ...(showcase.schedule || {}), useTimeSlots } as TimeSlotSchedule
                              setShowcases((prev) =>
                                prev.map((s) => (s.id === showcase.id ? { ...s, schedule: nextSchedule } : s))
                              )
                              updateShowcase(showcase.id, { schedule: nextSchedule })
                            }}
                            className="rounded border-slate-300"
                          />
                          <Label htmlFor={`use-time-slots-${showcase.id}`} className="text-sm font-normal cursor-pointer">
                            Use time slots (Day / Evening / Night)
                          </Label>
                        </div>
                        {/* Items */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <p className="text-xs text-slate-500">
                              {showcase.items.length > 0
                                ? `${showcase.items.length} items selected`
                                : 'Auto-populated (AI or high-margin when no slots)'}
                            </p>
                            <div className="flex gap-2">
                              {(showcase.schedule as TimeSlotSchedule)?.useTimeSlots && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openScheduleDialog(showcase)}
                                  title="Set different items by time of day (Day / Evening / Night)"
                                >
                                  <Clock className="h-4 w-4 mr-1" />
                                  Time slots
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openItemPicker(showcase.id)}
                              >
                                {showcase.items.length > 0
                                  ? 'Edit Items'
                                  : 'Pick Items'}
                              </Button>
                            </div>
                          </div>
                          {showcase.items.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {showcase.items.map((item) => (
                                <span
                                  key={item.menuItemId}
                                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                                >
                                  {item.menuItem.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {savingShowcase === showcase.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteShowcase(showcase.id)}
                          disabled={deletingShowcase === showcase.id}
                        >
                          {deletingShowcase === showcase.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── Menu Engine Tab ───── */}
        <TabsContent value="menu-engine" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Revenue optimization
              </CardTitle>
              <p className="text-sm text-slate-500">
                Control how the customer QR menu is ordered, highlighted, and upsold. Classic keeps current behavior; Profit and Smart Adaptive use margin and sales data (never sent to the client).
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Mode</Label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['classic', 'profit', 'adaptive'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setEngineMode(mode)}
                      className={`rounded-xl border-2 p-4 text-left transition ${
                        engineMode === mode ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="font-semibold capitalize">{mode === 'classic' ? 'Classic' : mode === 'profit' ? 'Profit' : 'Smart Adaptive'}</span>
                      <p className="text-xs text-slate-500 mt-1">
                        {mode === 'classic' && 'Current menu; no reorder or upsells.'}
                        {mode === 'profit' && 'Aggressive: high margin first, mood flow, bundles.'}
                        {mode === 'adaptive' && 'Data-driven thresholds and ordering.'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Features</Label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={moodFlow} onChange={(e) => setMoodFlow(e.target.checked)} className="rounded" />
                    <span className="text-sm">Mood flow</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={bundles} onChange={(e) => setBundles(e.target.checked)} className="rounded" />
                    <span className="text-sm">Bundles</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={upsells} onChange={(e) => setUpsells(e.target.checked)} className="rounded" />
                    <span className="text-sm">Upsells</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={scarcityBadges} onChange={(e) => setScarcityBadges(e.target.checked)} className="rounded" />
                    <span className="text-sm">Scarcity badges</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={priceAnchoring} onChange={(e) => setPriceAnchoring(e.target.checked)} className="rounded" />
                    <span className="text-sm">Price anchoring</span>
                  </label>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Bundle correlation threshold (0.1–1)</Label>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={bundleCorrelationThreshold}
                    onChange={(e) => setBundleCorrelationThreshold(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <span className="text-sm text-slate-500">{bundleCorrelationThreshold}</span>
                </div>
                <div className="space-y-2">
                  <Label>Max items per category (3–15)</Label>
                  <input
                    type="number"
                    min={3}
                    max={15}
                    value={maxItemsPerCategory}
                    onChange={(e) => setMaxItemsPerCategory(parseInt(e.target.value, 10) || 7)}
                    className="w-full rounded border border-slate-200 px-3 py-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Idle upsell delay (seconds, 2–30)</Label>
                  <input
                    type="number"
                    min={2}
                    max={30}
                    value={idleUpsellDelaySeconds}
                    onChange={(e) => setIdleUpsellDelaySeconds(parseInt(e.target.value, 10) || 6)}
                    className="w-full rounded border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>

              <Button onClick={saveMenuEngine} disabled={savingEngine} className="gap-2">
                {savingEngine && <Loader2 className="h-4 w-4 animate-spin" />}
                Save menu engine settings
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quadrant preview</CardTitle>
              <p className="text-sm text-slate-500">
                STAR = high margin, high sales. WORKHORSE = low margin, high sales. PUZZLE = high margin, low sales. DOG = low margin, low sales. Margin data is only visible here (admin).
              </p>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={fetchQuadrants} disabled={loadingQuadrants} className="mb-4 gap-2">
                {loadingQuadrants && <Loader2 className="h-4 w-4 animate-spin" />}
                Load quadrant data
              </Button>
              {quadrantData && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-4">
                    {['STAR', 'WORKHORSE', 'PUZZLE', 'DOG'].map((q) => (
                      <div key={q} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
                        <span className="font-semibold text-slate-700">{q}</span>
                        <span className="ml-2 text-slate-500">{quadrantData.counts[q] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Item</th>
                          <th className="text-left p-2">Category</th>
                          <th className="text-left p-2">Quadrant</th>
                          <th className="text-right p-2">Margin %</th>
                          <th className="text-right p-2">Units sold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quadrantData.items.map((row) => (
                          <tr key={row.menuItemId} className="border-t border-slate-100">
                            <td className="p-2">{row.name}</td>
                            <td className="p-2 text-slate-500">{row.categoryName ?? '—'}</td>
                            <td className="p-2">{row.quadrant}</td>
                            <td className="p-2 text-right">{row.marginPercent}</td>
                            <td className="p-2 text-right">{row.unitsSold}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Theme preset: dish photo background suggestion (preview + approve) */}
      <Dialog open={themeSuggestDialogOpen} onOpenChange={setThemeSuggestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dish photo background for {themeSuggestPresetLabel}</DialogTitle>
            <DialogDescription>
              This theme suggests a new background style for generated menu item photos. The food stays the same; only the plate/setting changes to match the vibe. Preview below, then choose to apply or skip.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500 mb-1">Suggested background style</p>
              <p className="text-sm text-slate-800">{themeSuggestPrompt}</p>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={themePreviewLoading}
                onClick={generateThemePreview}
              >
                {themePreviewLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Generate preview image
              </Button>
              {themePreviewImageUrl && (
                <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden">
                  <img
                    src={themePreviewImageUrl}
                    alt="Preview with suggested background"
                    className="w-full aspect-video object-cover"
                  />
                  <p className="text-xs text-slate-500 px-2 py-1.5 bg-slate-50">Sample dish with this background style</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThemeSuggestDialogOpen(false)}>
              Skip (keep current)
            </Button>
            <Button onClick={applyThemeBackground} disabled={themeSuggestApplying}>
              {themeSuggestApplying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Apply to dish photos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Picker Dialog */}
      <Dialog open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Carousel Items</DialogTitle>
            <DialogDescription>
              Choose which menu items to display in this carousel. Leave empty
              for automatic selection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2">
            {menuItems.map((item) => {
              const isSelected = selectedItemIds.has(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItemSelection(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                    isSelected
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-slate-300'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-8 w-8 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                  </div>
                  <span className="text-xs font-medium text-slate-500">
                    {formatCurrency(item.price)}
                  </span>
                </button>
              )
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedItemIds(new Set())
              }}
            >
              Clear All
            </Button>
            <Button onClick={saveShowcaseItems} disabled={savingShowcase !== null}>
              {savingShowcase ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save ({selectedItemIds.size} items)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time slots (schedule) dialog — search + tabbed select */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Time-based carousel items</DialogTitle>
            <DialogDescription>
              Choose which items appear for each time of day (menu timezone). Day = morning (6am–12pm), Evening = lunch (12–6pm), Night = evening (6pm–6am). Leave a slot empty to use AI suggestions (high margin + best for that time) or manual picks.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 gap-3 py-2">
            {/* Slot tabs */}
            <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-100">
              {(['day', 'evening', 'night'] as const).map((slot) => {
                const count = scheduleDraft[slot]?.itemIds?.length ?? 0
                const label = slot === 'day' ? 'Day (6am–12pm)' : slot === 'evening' ? 'Evening (12–6pm)' : 'Night (6pm–6am)'
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setScheduleSlotTab(slot)}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                      scheduleSlotTab === slot ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Search for current slot */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search menu items..."
                value={scheduleSearch}
                onChange={(e) => setScheduleSearch(e.target.value)}
                className="pl-9"
              />
              {scheduleSearch && (
                <button
                  type="button"
                  onClick={() => setScheduleSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* Selected summary for current slot */}
            {(() => {
              const ids = scheduleDraft[scheduleSlotTab]?.itemIds ?? []
              const selectedItems = ids.map((id) => menuItems.find((m) => m.id === id)).filter(Boolean) as SimpleMenuItem[]
              return (
                <>
                  {selectedItems.length > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        {selectedItems.length} selected for this slot
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-slate-500"
                        onClick={() => clearScheduleSlot(scheduleSlotTab)}
                      >
                        Clear slot
                      </Button>
                    </div>
                  )}
                  {/* Scrollable searchable list */}
                  <div className="flex-1 min-h-[240px] max-h-[320px] overflow-y-auto rounded-lg border border-slate-200">
                    {(() => {
                      const q = scheduleSearch.trim().toLowerCase()
                      const filtered = q
                        ? menuItems.filter((m) => m.name.toLowerCase().includes(q))
                        : menuItems
                      if (filtered.length === 0) {
                        return (
                          <div className="p-4 text-center text-sm text-slate-500">
                            {scheduleSearch ? 'No items match your search.' : 'No menu items.'}
                          </div>
                        )
                      }
                      return (
                        <ul className="divide-y divide-slate-100">
                          {filtered.map((item) => {
                            const ids = scheduleDraft[scheduleSlotTab]?.itemIds ?? []
                            const checked = ids.includes(item.id)
                            return (
                              <li key={item.id}>
                                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                                  <div
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                      checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                                    }`}
                                  >
                                    {checked && <Check className="h-3 w-3" />}
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleScheduleSlotItem(scheduleSlotTab, item.id)}
                                    className="sr-only"
                                  />
                                  {item.imageUrl && (
                                    <img src={item.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                                  )}
                                  <span className="flex-1 truncate text-sm font-medium text-slate-900">
                                    {item.name}
                                  </span>
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
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSchedule} disabled={scheduleSaving}>
              {scheduleSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
