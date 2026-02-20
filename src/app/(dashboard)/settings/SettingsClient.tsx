'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
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
  Check,
  Loader2,
  Upload,
  CreditCard,
} from 'lucide-react'
import SubscriptionTab from '@/components/settings/SubscriptionTab'

interface SettingsClientProps {
  currentTheme: Record<string, string>
  defaultBackgroundPrompt?: string
  subscription?: {
    isActive: boolean
    currentPeriodEnd: string | null
    currentPlan: 'monthly' | 'annual' | null
    pricesConfigured: boolean
  }
}

export default function SettingsClient({
  currentTheme,
  defaultBackgroundPrompt: initialDefaultBackgroundPrompt = '',
  subscription,
}: SettingsClientProps) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabFromUrl = searchParams.get('tab') === 'subscription' ? 'subscription' : 'theme'

  const setTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'theme') params.delete('tab')
    else params.set('tab', value)
    router.replace(`/settings${params.toString() ? `?${params}` : ''}`)
  }

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
  const [managementLanguage, setManagementLanguage] = useState<string>(currentTheme.managementLanguage || 'en')
  const [menuCarouselStyle, setMenuCarouselStyle] = useState<string>(currentTheme.menuCarouselStyle || 'sliding')
  const [savingTheme, setSavingTheme] = useState(false)

  // Consistent background prompt for dish photos (upload image → describe, or type)
  const [defaultBackgroundPrompt, setDefaultBackgroundPrompt] = useState(initialDefaultBackgroundPrompt)
  const [defaultBackgroundDraft, setDefaultBackgroundDraft] = useState(initialDefaultBackgroundPrompt)
  const [describingImage, setDescribingImage] = useState(false)
  const [savingBackgroundPrompt, setSavingBackgroundPrompt] = useState(false)
  const [applyBackgroundProgress, setApplyBackgroundProgress] = useState<{ total: number; done: number } | null>(null)
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
    fast_food: 'Fast food booth table, laminated tabletop, casual diner booth seating visible, tray or simple placemat, clean and vibrant.',
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
  const [themeSuggestItemCount, setThemeSuggestItemCount] = useState<number | null>(null)
  const [themeSuggestApplyProgress, setThemeSuggestApplyProgress] = useState<{ done: number; total: number } | null>(null)

  // When theme-suggest dialog opens, fetch how many dish photos will be updated
  useEffect(() => {
    if (!themeSuggestDialogOpen) {
      setThemeSuggestItemCount(null)
      setThemeSuggestApplyProgress(null)
      return
    }
    let cancelled = false
    fetch('/api/menu/items-with-images')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const ids: string[] = data.itemIds ?? []
        setThemeSuggestItemCount(ids.length)
      })
      .catch(() => {
        if (!cancelled) setThemeSuggestItemCount(0)
      })
    return () => { cancelled = true }
  }, [themeSuggestDialogOpen])

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
          managementLanguage: managementLanguage || 'en',
          menuCarouselStyle: menuCarouselStyle || 'sliding',
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

  const generateThemePreview = async () => {
    if (!themeSuggestPrompt) return
    setThemePreviewLoading(true)
    setThemePreviewImageUrl(null)
    try {
      const res = await fetch('/api/menu/preview-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: themeSuggestPrompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setThemePreviewImageUrl(data.imageUrl ?? null)
      toast({ title: 'Preview generated', description: 'One of your dish photos with the new background.' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not generate preview'
      toast({
        title: msg.includes('No dish photos') ? 'No dish photos yet' : 'Could not generate preview',
        description: msg.includes('No dish photos') ? 'Add at least one menu item with a photo to see a preview.' : msg,
        variant: 'destructive',
      })
    } finally {
      setThemePreviewLoading(false)
    }
  }

  const applyThemeBackground = async () => {
    if (!themeSuggestPrompt) return
    setThemeSuggestApplying(true)
    setThemeSuggestApplyProgress(null)
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

      const listRes = await fetch('/api/menu/items-with-images')
      const listData = await listRes.json()
      if (!listRes.ok) throw new Error(listData.error || 'Failed to list items')
      const ids: string[] = listData.itemIds ?? []

      if (ids.length === 0) {
        setThemeSuggestDialogOpen(false)
        toast({
          title: 'Background style saved',
          description: 'No dish photos to update. New photos will use this style.',
        })
        return
      }

      setThemeSuggestApplyProgress({ done: 0, total: ids.length })
      let done = 0
      for (const id of ids) {
        const applyRes = await fetch(`/api/menu/${id}/apply-background`, { method: 'POST' })
        if (!applyRes.ok) {
          const err = await applyRes.json().catch(() => ({}))
          throw new Error(err.error || err.details || `Failed for item`)
        }
        done += 1
        setThemeSuggestApplyProgress((p) => (p ? { ...p, done } : null))
      }
      setThemeSuggestDialogOpen(false)
      toast({
        title: 'All dish photos updated',
        description: `${ids.length} dish photo${ids.length === 1 ? '' : 's'} now use the new background style.`,
      })
    } catch (e) {
      toast({
        title: 'Could not update dish photos',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setThemeSuggestApplying(false)
      setThemeSuggestApplyProgress(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">
          Manage your restaurant theme, subscription, and preferences.
        </p>
      </div>

      <Tabs value={tabFromUrl} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="theme" className="gap-2">
            <Palette className="h-4 w-4" />
            Theme & design
          </TabsTrigger>
          <TabsTrigger value="subscription" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Subscription
          </TabsTrigger>
        </TabsList>

        {/* ───── Theme & design Tab ───── */}
        <TabsContent value="theme">
          <Card>
            <CardHeader>
              <CardTitle>Management system language</CardTitle>
              <p className="text-sm text-slate-500">
                Choose the language for this dashboard and management interface.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="managementLanguage">Interface language</Label>
                <select
                  id="managementLanguage"
                  value={managementLanguage}
                  onChange={(e) => setManagementLanguage(e.target.value)}
                  className="flex h-10 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="en">English</option>
                  <option value="ku">Kurdish (Kurdî)</option>
                  <option value="ar-fusha">Arabic</option>
                </select>
                <p className="text-xs text-slate-500">
                  Applies to this management system. Customer menu languages are set per menu.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Menu look and feel</CardTitle>
              <p className="text-sm text-slate-500">
                Colors, fonts, and style of your customer-facing digital menu.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Preset themes */}
              <div className="space-y-2">
                <Label>Quick style presets</Label>
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
                  <Label htmlFor="primaryColor">Main brand color</Label>
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
                    Used for buttons, highlights, and key elements on the menu.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accentColor">Client menu button color</Label>
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
                    Used for &quot;Add bundle&quot;, &quot;View order&quot; bar, Save tags, and other buttons on the customer-facing menu.
                  </p>
                </div>
              </div>

              {/* Background Style */}
              <div className="space-y-2">
                <Label>Menu background</Label>
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
                <Label>Text style</Label>
                <p className="text-xs text-slate-500">
                  Choose how headings and body text look on the menu.
                </p>
                <div className="flex flex-wrap gap-3">
                  {[
                    { value: 'sans', label: 'Modern', desc: 'DM Sans (clean, minimal)', displayVar: 'var(--font-dm-sans)', bodyVar: 'var(--font-dm-sans)' },
                    { value: 'serif', label: 'Elegant', desc: 'Playfair + DM Sans', displayVar: 'var(--font-playfair)', bodyVar: 'var(--font-dm-sans)' },
                    { value: 'display', label: 'Classic', desc: 'Cormorant + DM Sans', displayVar: 'var(--font-cormorant)', bodyVar: 'var(--font-dm-sans)' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFontFamily(option.value)}
                      className={`rounded-lg border-2 px-4 py-3 transition text-left ${
                        fontFamily === option.value
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="text-lg"
                        style={{ fontFamily: option.displayVar } as React.CSSProperties}
                      >
                        Aa
                      </span>
                      <p className="text-xs font-semibold text-slate-700 mt-1">
                        {option.label}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {option.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Menu timezone (for time-based carousels) */}
              <div className="space-y-2">
                <Label htmlFor="menuTimezone">Time zone for featured sections</Label>
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

              {/* Menu carousel display */}
              <div className="space-y-2">
                <Label>Menu carousel style</Label>
                <p className="text-xs text-slate-500">
                  How featured items appear on the guest menu: sliding carousel with arrows, or a static horizontal row.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setMenuCarouselStyle('sliding')}
                    className={`rounded-lg border-2 px-4 py-3 transition text-left ${
                      menuCarouselStyle === 'sliding'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">Sliding carousel</p>
                    <p className="text-xs text-slate-500">One/few items at a time, arrows to scroll</p>
                    {menuCarouselStyle === 'sliding' && <Check className="h-4 w-4 text-emerald-600 mt-1" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuCarouselStyle('static')}
                    className={`rounded-lg border-2 px-4 py-3 transition text-left ${
                      menuCarouselStyle === 'static'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">Static row</p>
                    <p className="text-xs text-slate-500">All items visible in a horizontal row, scroll if needed</p>
                    {menuCarouselStyle === 'static' && <Check className="h-4 w-4 text-emerald-600 mt-1" />}
                  </button>
                </div>
              </div>

              {/* Consistent background for dish photos: type the prompt or upload image to generate it */}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <Label>Dish photo background style</Label>
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
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <p className="text-xs text-slate-500">
                    Apply the saved background style above to all existing dish photos. This re-enhances each photo and may take a minute.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!!applyBackgroundProgress || !defaultBackgroundPrompt?.trim()}
                    onClick={async () => {
                      setApplyBackgroundProgress({ total: 0, done: 0 })
                      try {
                        const listRes = await fetch('/api/menu/items-with-images')
                        const listData = await listRes.json()
                        if (!listRes.ok) throw new Error(listData.error || 'Failed to list items')
                        const ids: string[] = listData.itemIds ?? []
                        if (ids.length === 0) {
                          toast({ title: 'No dish photos to update', description: 'Add images to menu items first.' })
                          setApplyBackgroundProgress(null)
                          return
                        }
                        setApplyBackgroundProgress((p) => (p ? { ...p, total: ids.length } : null))
                        let done = 0
                        for (const id of ids) {
                          const res = await fetch(`/api/menu/${id}/apply-background`, { method: 'POST' })
                          if (!res.ok) {
                            const err = await res.json().catch(() => ({}))
                            throw new Error(err.error || err.details || `Failed for item ${id}`)
                          }
                          done += 1
                          setApplyBackgroundProgress((p) => (p ? { ...p, done } : null))
                        }
                        toast({
                          title: 'Background applied',
                          description: `Updated ${ids.length} dish photo${ids.length === 1 ? '' : 's'}.`,
                        })
                      } catch (e) {
                        toast({
                          title: 'Could not apply background to all photos',
                          description: e instanceof Error ? e.message : 'Unknown error',
                          variant: 'destructive',
                        })
                      } finally {
                        setApplyBackgroundProgress(null)
                      }
                    }}
                  >
                    {applyBackgroundProgress ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {applyBackgroundProgress.total > 0
                          ? `Updating ${applyBackgroundProgress.done} of ${applyBackgroundProgress.total}…`
                          : 'Loading…'}
                      </>
                    ) : (
                      'Apply to all dish photos'
                    )}
                  </Button>
                </div>
              </div>

              {/* Logo: upload from computer (S3) or paste URL */}
              <div className="space-y-2">
                <Label>Your restaurant logo</Label>
                <p className="text-xs text-slate-500">
                  Upload an image or paste a logo URL. It appears at the top of your digital menu.
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
                  className={`rounded-xl p-6 font-body ${
                    backgroundStyle === 'light'
                      ? 'bg-slate-100 text-slate-900'
                      : backgroundStyle === 'gradient'
                        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white'
                        : 'bg-slate-950 text-white'
                  }`}
                  style={{
                    '--font-display': fontFamily === 'serif' ? 'var(--font-playfair)' : fontFamily === 'display' ? 'var(--font-cormorant)' : 'var(--font-dm-sans)',
                    '--font-body': 'var(--font-dm-sans)',
                  } as React.CSSProperties}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="h-10 w-10 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <div>
                      <p className="font-display font-bold text-lg">Your Restaurant</p>
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
                Save look and feel
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription">
          {subscription ? (
            <SubscriptionTab
              isActive={subscription.isActive}
              currentPeriodEnd={subscription.currentPeriodEnd}
              currentPlan={subscription.currentPlan}
              pricesConfigured={subscription.pricesConfigured}
            />
          ) : (
            <p className="text-slate-500">Loading subscription…</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Theme preset: dish photo background suggestion (preview + approve) */}
      <Dialog open={themeSuggestDialogOpen} onOpenChange={setThemeSuggestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dish photo background for {themeSuggestPresetLabel}</DialogTitle>
            <DialogDescription>
              This theme suggests a new background style for your menu item photos. The food stays the same; only the plate/setting changes to match the vibe. Preview uses one of your existing dish photos with only the background changed. Then verify to update all dish photos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Label htmlFor="theme-suggest-prompt" className="text-xs font-medium text-slate-500">
                Suggested background style (you can edit)
              </Label>
              <textarea
                id="theme-suggest-prompt"
                value={themeSuggestPrompt}
                onChange={(e) => setThemeSuggestPrompt(e.target.value)}
                placeholder="e.g. Fast food booth table, laminated tabletop…"
                className="mt-1.5 min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                rows={3}
              />
            </div>
            {themeSuggestItemCount !== null && (
              <p className="text-sm text-slate-600">
                <strong>{themeSuggestItemCount}</strong> dish photo{themeSuggestItemCount !== 1 ? 's' : ''} will be updated to this background when you verify.
              </p>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={themePreviewLoading || !!themeSuggestApplyProgress}
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
                  <p className="text-xs text-slate-500 px-2 py-1.5 bg-slate-50">One of your dish photos with this background style</p>
                </div>
              )}
            </div>
            {themeSuggestApplyProgress && (
              <p className="text-sm text-slate-600">
                Updating {themeSuggestApplyProgress.done} of {themeSuggestApplyProgress.total}…
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThemeSuggestDialogOpen(false)} disabled={!!themeSuggestApplyProgress}>
              Skip (keep current)
            </Button>
            <Button onClick={applyThemeBackground} disabled={themeSuggestApplying}>
              {themeSuggestApplying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {themeSuggestApplyProgress ? `Updating ${themeSuggestApplyProgress.done} of ${themeSuggestApplyProgress.total}…` : 'Verify and update all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
