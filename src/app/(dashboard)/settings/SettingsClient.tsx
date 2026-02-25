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
  Palette,
  Check,
  Loader2,
  Upload,
  Sparkles,
  Send,
  Dna,
  ChevronDown,
  Eye,
  MessageCircle,
} from 'lucide-react'

/* ============================================
 *  FONT OPTIONS (expanded list)
 * ============================================ */
const FONT_OPTIONS = [
  { value: 'sans', label: 'Modern / Clean', family: 'DM Sans', desc: 'Great for fast-casual and modern restaurants' },
  { value: 'serif', label: 'Elegant', family: 'Playfair Display', desc: 'Perfect for fine dining and upscale venues' },
  { value: 'display', label: 'Classic', family: 'Cormorant Garamond', desc: 'Timeless look for traditional restaurants' },
  { value: 'mono', label: 'Tech / Industrial', family: 'Space Mono', desc: 'Great for craft coffee shops and modern bistros' },
  { value: 'rounded', label: 'Friendly / Warm', family: 'Nunito', desc: 'Perfect for family restaurants and cafes' },
  { value: 'handwritten', label: 'Artsy / Casual', family: 'Caveat', desc: 'Ideal for artisan bakeries and casual spots' },
  { value: 'condensed', label: 'Bold / Urban', family: 'Barlow Condensed', desc: 'Strong presence for street food and bars' },
  { value: 'slab', label: 'Strong / Reliable', family: 'Roboto Slab', desc: 'Dependable look for steakhouses and grills' },
]

/* ============================================
 *  THEME PRESETS
 * ============================================ */
const THEME_PRESETS: Record<string, { label: string; emoji: string; primaryColor: string; accentColor: string; backgroundStyle: string; fontFamily: string; desc: string }> = {
  classy: { label: 'Classy', emoji: '🥂', primaryColor: '#1e293b', accentColor: '#c9a227', backgroundStyle: 'dark', fontFamily: 'serif', desc: 'Deep navy & gold' },
  fast_food: { label: 'Fast Food', emoji: '🍔', primaryColor: '#dc2626', accentColor: '#fbbf24', backgroundStyle: 'light', fontFamily: 'sans', desc: 'Vibrant red & yellow' },
  cozy: { label: 'Cozy', emoji: '☕', primaryColor: '#b45309', accentColor: '#d97706', backgroundStyle: 'gradient', fontFamily: 'rounded', desc: 'Warm amber tones' },
  minimal: { label: 'Minimal', emoji: '✨', primaryColor: '#0f766e', accentColor: '#5eead4', backgroundStyle: 'light', fontFamily: 'sans', desc: 'Clean teal palette' },
  luxe: { label: 'Luxe', emoji: '💎', primaryColor: '#7c3aed', accentColor: '#a78bfa', backgroundStyle: 'dark', fontFamily: 'display', desc: 'Rich purple depth' },
  ethnic: { label: 'Heritage', emoji: '🏛️', primaryColor: '#991b1b', accentColor: '#d4a017', backgroundStyle: 'dark', fontFamily: 'serif', desc: 'Traditional warmth' },
}

const PRESET_SUGGESTED_BACKGROUNDS: Record<string, string> = {
  classy: 'Elegant dark marble or white linen surface, soft studio lighting, minimal props, refined restaurant ambiance.',
  fast_food: 'Fast food booth table, laminated tabletop, casual diner booth seating visible, tray or simple placemat, clean and vibrant.',
  cozy: 'Warm wooden table, soft natural light, cozy restaurant or home dining vibe, shallow depth of field.',
  minimal: 'Clean neutral background, soft diffused light, minimal props, calm and simple aesthetic.',
  luxe: 'Premium dark surface or velvet texture, dramatic soft lighting, high-end restaurant atmosphere.',
  ethnic: 'Traditional handcrafted table setting, ornate patterns, warm ambient lighting, cultural elements.',
}

/* ============================================
 *  COMPONENT PROPS
 * ============================================ */
interface SettingsClientProps {
  currentTheme: Record<string, string>
  defaultBackgroundPrompt?: string
  hasDefaultBackgroundImage?: boolean
  defaultBackgroundImageData?: string | null
}

/* ============================================
 *  Smart Designer Chat Message
 * ============================================ */
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function SettingsClient({
  currentTheme,
  defaultBackgroundPrompt: initialDefaultBackgroundPrompt = '',
  hasDefaultBackgroundImage: initialHasDefaultBackgroundImage = false,
  defaultBackgroundImageData: initialDefaultBackgroundImageData = null,
}: SettingsClientProps) {
  const { toast } = useToast()

  // Theme state
  const [restaurantName, setRestaurantName] = useState(currentTheme.restaurantName || '')
  const [primaryColor, setPrimaryColor] = useState(currentTheme.primaryColor || '#10b981')
  const [accentColor, setAccentColor] = useState(currentTheme.accentColor || '#f59e0b')
  const [chefPickColor, setChefPickColor] = useState(currentTheme.chefPickColor || '#dc2626')
  const [borderColor, setBorderColor] = useState(currentTheme.borderColor || '#1e40af')
  const [backgroundStyle, setBackgroundStyle] = useState<string>(currentTheme.backgroundStyle || 'dark')
  const [fontFamily, setFontFamily] = useState<string>(currentTheme.fontFamily || 'sans')
  const [logoUrl, setLogoUrl] = useState(currentTheme.logoUrl || '')
  const [menuTimezone, setMenuTimezone] = useState(currentTheme.menuTimezone || 'Asia/Baghdad')
  const [themePreset, setThemePreset] = useState<string | null>(currentTheme.themePreset ?? null)
  const [managementLanguage, setManagementLanguage] = useState<string>(currentTheme.managementLanguage || 'en')
  const [menuCarouselStyle, setMenuCarouselStyle] = useState<string>(currentTheme.menuCarouselStyle || 'sliding')
  const [descriptionTone, setDescriptionTone] = useState<string>((currentTheme as Record<string, unknown>).descriptionTone as string || '')
  const [restaurantVibeImageKey, setRestaurantVibeImageKey] = useState<string>((currentTheme as Record<string, unknown>).restaurantVibeImageKey as string || '')
  const legacyVibeImageUrl = ((currentTheme as Record<string, unknown>).restaurantVibeImageUrl as string) || ''
  const [vibeImageRemoved, setVibeImageRemoved] = useState(false)
  const [uploadingVibeImage, setUploadingVibeImage] = useState(false)
  const [vibeImageLoadError, setVibeImageLoadError] = useState(false)
  const vibeImageInputRef = useRef<HTMLInputElement>(null)
  const restaurantVibeImageDisplayUrl = restaurantVibeImageKey
    ? `/api/settings/restaurant-vibe-image?key=${encodeURIComponent(restaurantVibeImageKey)}`
    : vibeImageRemoved ? '' : legacyVibeImageUrl
  const [snowfallEnabled, setSnowfallEnabled] = useState<boolean>(currentTheme.snowfallEnabled === 'true')
  const [snowfallStart, setSnowfallStart] = useState<string>(currentTheme.snowfallStart || '12-15')
  const [snowfallEnd, setSnowfallEnd] = useState<string>(currentTheme.snowfallEnd || '01-07')
  const [savingTheme, setSavingTheme] = useState(false)
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false)

  // Dish photo background state
  const [defaultBackgroundPrompt, setDefaultBackgroundPrompt] = useState(initialDefaultBackgroundPrompt)
  const [defaultBackgroundDraft, setDefaultBackgroundDraft] = useState(initialDefaultBackgroundPrompt)
  const [hasDefaultBackgroundImage, setHasDefaultBackgroundImage] = useState(initialHasDefaultBackgroundImage)
  const [defaultBackgroundImageData, setDefaultBackgroundImageData] = useState<string | null>(initialDefaultBackgroundImageData)
  const [describingImage, setDescribingImage] = useState(false)
  const [savingBackgroundPrompt, setSavingBackgroundPrompt] = useState(false)
  const [applyBackgroundProgress, setApplyBackgroundProgress] = useState<{ total: number; done: number } | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Theme suggestion dialog
  const [themeSuggestDialogOpen, setThemeSuggestDialogOpen] = useState(false)
  const [themeSuggestPrompt, setThemeSuggestPrompt] = useState('')
  const [themeSuggestPresetLabel, setThemeSuggestPresetLabel] = useState('')
  const [themePreviewImageUrl, setThemePreviewImageUrl] = useState<string | null>(null)
  const [themePreviewLoading, setThemePreviewLoading] = useState(false)
  const [themeSuggestApplying, setThemeSuggestApplying] = useState(false)
  const [themeSuggestItemCount, setThemeSuggestItemCount] = useState<number | null>(null)
  const [themeSuggestApplyProgress, setThemeSuggestApplyProgress] = useState<{ done: number; total: number } | null>(null)

  // Smart Designer chat
  const [designerOpen, setDesignerOpen] = useState(false)
  const [designerMessages, setDesignerMessages] = useState<ChatMessage[]>([])
  const [designerInput, setDesignerInput] = useState('')
  const [designerLoading, setDesignerLoading] = useState(false)
  const designerEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDefaultBackgroundPrompt(initialDefaultBackgroundPrompt)
    setDefaultBackgroundDraft(initialDefaultBackgroundPrompt)
    setHasDefaultBackgroundImage(initialHasDefaultBackgroundImage)
    setDefaultBackgroundImageData(initialDefaultBackgroundImageData)
  }, [initialDefaultBackgroundPrompt, initialHasDefaultBackgroundImage, initialDefaultBackgroundImageData])

  useEffect(() => {
    if (!themeSuggestDialogOpen) {
      setThemeSuggestItemCount(null)
      setThemeSuggestApplyProgress(null)
      return
    }
    let cancelled = false
    fetch('/api/menu/items-with-images')
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setThemeSuggestItemCount((data.itemIds ?? []).length) })
      .catch(() => { if (!cancelled) setThemeSuggestItemCount(0) })
    return () => { cancelled = true }
  }, [themeSuggestDialogOpen])

  useEffect(() => {
    designerEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [designerMessages])

  /* =========================
   *  SAVE THEME
   * ========================= */
  const saveTheme = async () => {
    setSavingTheme(true)
    try {
      const response = await fetch('/api/settings/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryColor, accentColor, chefPickColor, borderColor,
          backgroundStyle, fontFamily,
          logoUrl: logoUrl || null,
          menuTimezone: menuTimezone || 'Asia/Baghdad',
          themePreset: themePreset || null,
          managementLanguage: managementLanguage || 'en',
          menuCarouselStyle: menuCarouselStyle || 'sliding',
          snowfallEnabled: String(snowfallEnabled),
          snowfallStart: snowfallStart || '12-15',
          snowfallEnd: snowfallEnd || '01-07',
          ...(restaurantName.trim() && { restaurantName: restaurantName.trim() }),
          descriptionTone: descriptionTone.trim(),
          restaurantVibeImageKey: restaurantVibeImageKey.trim() || null,
          restaurantVibeImageUrl: (restaurantVibeImageKey.trim() && !vibeImageRemoved) ? undefined : null,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save theme')
      }
      toast({ title: 'Theme saved ✨', description: 'Your Restaurant DNA has been updated.' })
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save theme', variant: 'destructive' })
    } finally {
      setSavingTheme(false)
    }
  }

  /* =========================
   *  THEME PREVIEW / APPLY
   * ========================= */
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
      toast({ title: 'Preview generated' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not generate preview'
      toast({ title: msg.includes('No dish photos') ? 'No dish photos yet' : 'Could not generate preview', description: msg.includes('No dish photos') ? 'Add at least one menu item with a photo to see a preview.' : msg, variant: 'destructive' })
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
      setDefaultBackgroundImageData(data.defaultBackgroundImageData ?? null)
      setHasDefaultBackgroundImage(Boolean(data.hasDefaultBackgroundImage ?? data.defaultBackgroundImageData))
      const listRes = await fetch('/api/menu/items-with-images')
      const listData = await listRes.json()
      if (!listRes.ok) throw new Error(listData.error || 'Failed to list items')
      const ids: string[] = listData.itemIds ?? []
      if (ids.length === 0) {
        setThemeSuggestDialogOpen(false)
        toast({ title: 'Background style saved', description: 'No dish photos to update. New photos will use this style.' })
        return
      }
      setThemeSuggestApplyProgress({ done: 0, total: ids.length })
      let done = 0
      for (const id of ids) {
        const applyRes = await fetch(`/api/menu/${id}/apply-background`, { method: 'POST' })
        if (!applyRes.ok) { const err = await applyRes.json().catch(() => ({})); throw new Error(err.error || err.details || 'Failed for item') }
        done += 1
        setThemeSuggestApplyProgress((p) => (p ? { ...p, done } : null))
      }
      setThemeSuggestDialogOpen(false)
      toast({ title: 'All dish photos updated', description: `${ids.length} dish photo${ids.length === 1 ? '' : 's'} now use the new background style.` })
    } catch (e) {
      toast({ title: 'Could not update dish photos', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setThemeSuggestApplying(false)
      setThemeSuggestApplyProgress(null)
    }
  }

  /* =========================
   *  SMART DESIGNER CHAT
   * ========================= */
  const sendDesignerMessage = async () => {
    if (!designerInput.trim() || designerLoading) return
    const userMsg: ChatMessage = { role: 'user', content: designerInput.trim() }
    const updated = [...designerMessages, userMsg]
    setDesignerMessages(updated)
    setDesignerInput('')
    setDesignerLoading(true)
    try {
      const res = await fetch('/api/restaurant-dna/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, phase: 'designer' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setDesignerMessages((prev) => [...prev, { role: 'assistant', content: data.message }])
      if (data.applyTheme) {
        const t = data.applyTheme
        if (t.primaryColor) setPrimaryColor(t.primaryColor)
        if (t.accentColor) setAccentColor(t.accentColor)
        if (t.chefPickColor) setChefPickColor(t.chefPickColor)
        if (t.borderColor) setBorderColor(t.borderColor)
        if (t.backgroundStyle) setBackgroundStyle(t.backgroundStyle)
        if (t.fontFamily) setFontFamily(t.fontFamily)
        if (t.menuCarouselStyle) setMenuCarouselStyle(t.menuCarouselStyle)
        toast({ title: 'Theme updated by Smart Designer ✨' })
      }
    } catch {
      setDesignerMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I had trouble with that. Could you try again?' }])
    } finally {
      setDesignerLoading(false)
    }
  }

  /* =========================================
   *  RENDER
   * ========================================= */
  const selectedFont = FONT_OPTIONS.find((f) => f.value === fontFamily)

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 p-8 text-white">
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Dna className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Restaurant DNA</h1>
          </div>
          <p className="text-white/80 ml-[52px]">
            Your restaurant&apos;s unique identity — colors, fonts, and everything that makes your brand yours.
          </p>
        </div>
      </div>

      {/* Smart Designer Button */}
      <Card
        className="border-2 border-dashed border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 hover:border-slate-300 hover:shadow-lg transition-all cursor-pointer group"
        onClick={() => setDesignerOpen(true)}
      >
        <CardContent className="flex items-center gap-4 p-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center shadow-lg shadow-slate-900/10 group-hover:scale-105 transition-transform">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-800">Smart Designer</h3>
            <p className="text-sm text-slate-500">
              AI-powered design assistant — get color recommendations, font suggestions, and carousel advice
            </p>
          </div>
          <MessageCircle className="w-5 h-5 text-slate-700 group-hover:text-slate-900 transition-colors" />
        </CardContent>
      </Card>

      {/* Management Language */}
      <Card>
        <CardHeader>
          <CardTitle>Management Language</CardTitle>
          <p className="text-sm text-slate-500">Choose the language for this dashboard.</p>
        </CardHeader>
        <CardContent>
          <select
            value={managementLanguage}
            onChange={(e) => setManagementLanguage(e.target.value)}
            className="flex h-10 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="en">English</option>
            <option value="ku">Kurdish (Kurdî)</option>
            <option value="ar-fusha">Arabic</option>
          </select>
        </CardContent>
      </Card>

      {/* Quick Style Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-slate-900" />
            Style Presets
          </CardTitle>
          <p className="text-sm text-slate-500">Pick a starting point, then customize everything below.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                className={`relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${themePreset === key ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                  }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{preset.emoji}</span>
                  <span className="font-semibold text-sm text-slate-800">{preset.label}</span>
                  {themePreset === key && <Check className="w-4 h-4 text-slate-900 ml-auto" />}
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="h-4 w-4 rounded-full border border-slate-200" style={{ backgroundColor: preset.primaryColor }} />
                  <span className="h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: preset.accentColor }} />
                </div>
                <p className="text-[10px] text-slate-500">{preset.desc}</p>
              </button>
            ))}
            <button
              onClick={() => setThemePreset(null)}
              className={`rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${!themePreset ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🎨</span>
                <span className="font-semibold text-sm text-slate-800">Custom</span>
                {!themePreset && <Check className="w-4 h-4 text-slate-900 ml-auto" />}
              </div>
              <p className="text-[10px] text-slate-500">Build your own from scratch</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Colors — Just color pickers, no hex codes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-slate-600" />
            Brand Colors
          </CardTitle>
          <p className="text-sm text-slate-500">Click the color circles to change them — pick what feels right for your brand.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              { label: 'Main Brand Color', desc: 'Buttons, highlights, and key elements on your menu', value: primaryColor, onChange: setPrimaryColor },
              { label: '"Add to Order" Button', desc: 'Guests tap this to order — make it pop!', value: accentColor, onChange: setAccentColor },
              { label: 'Chef\'s Pick Badge', desc: 'The "★ Signature" recommendation badge color', value: chefPickColor, onChange: setChefPickColor },
              { label: 'Featured Highlight', desc: 'Border glow on featured and high-margin items', value: borderColor, onChange: setBorderColor },
            ].map((color) => (
              <div key={color.label} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
                <label className="relative cursor-pointer group">
                  <div
                    className="w-12 h-12 rounded-xl border-2 border-white shadow-lg transition-transform group-hover:scale-110"
                    style={{ backgroundColor: color.value }}
                  />
                  <input
                    type="color"
                    value={color.value}
                    onChange={(e) => color.onChange(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye className="w-2.5 h-2.5 text-slate-400" />
                  </div>
                </label>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{color.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{color.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Menu Background */}
      <Card>
        <CardHeader>
          <CardTitle>Menu Background</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {[
              { value: 'dark', label: 'Dark', preview: 'bg-slate-950', desc: 'Sleek & moody' },
              { value: 'gradient', label: 'Gradient', preview: 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950', desc: 'Depth & richness' },
              { value: 'light', label: 'Light', preview: 'bg-slate-100', desc: 'Clean & bright' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setBackgroundStyle(option.value)}
                className={`flex items-center gap-3 rounded-xl border-2 px-5 py-4 transition-all hover:shadow-md ${backgroundStyle === option.value ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                  }`}
              >
                <div className={`h-8 w-12 rounded-lg ${option.preview}`} />
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-700">{option.label}</p>
                  <p className="text-[10px] text-slate-400">{option.desc}</p>
                </div>
                {backgroundStyle === option.value && <Check className="h-4 w-4 text-slate-900" />}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Font Family Dropdown */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Typography</CardTitle>
          <p className="text-sm text-slate-500">Choose how text appears on your menu.</p>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <button
              type="button"
              onClick={() => setFontDropdownOpen(!fontDropdownOpen)}
              className="w-full flex items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">{selectedFont?.label || 'Select font'}</p>
                <p className="text-xs text-slate-400">{selectedFont?.family} — {selectedFont?.desc}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${fontDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {fontDropdownOpen && (
              <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-xl max-h-72 overflow-y-auto">
                {FONT_OPTIONS.map((font) => (
                  <button
                    key={font.value}
                    onClick={() => { setFontFamily(font.value); setFontDropdownOpen(false) }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${fontFamily === font.value ? 'bg-slate-50' : ''
                      }`}
                  >
                    <span className="text-xl font-bold text-slate-600 w-8">Aa</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700">{font.label}</p>
                      <p className="text-[10px] text-slate-400">{font.family} — {font.desc}</p>
                    </div>
                    {fontFamily === font.value && <Check className="w-4 h-4 text-slate-900" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Restaurant Name */}
      <Card>
        <CardHeader>
          <CardTitle>Restaurant Name</CardTitle>
          <p className="text-sm text-slate-500">Displayed at the top of your guest-facing menu.</p>
        </CardHeader>
        <CardContent>
          <input
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="Your restaurant name"
            className="flex h-10 w-full max-w-sm rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </CardContent>
      </Card>

      {/* Carousel Style */}
      <Card>
        <CardHeader>
          <CardTitle>Carousel Style</CardTitle>
          <p className="text-sm text-slate-500">How featured items appear on the guest menu.</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setMenuCarouselStyle('sliding')}
              className={`rounded-xl border-2 px-5 py-4 transition-all text-left hover:shadow-md ${menuCarouselStyle === 'sliding' ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                }`}
            >
              <p className="text-sm font-semibold text-slate-800">🎠 Sliding Carousel</p>
              <p className="text-xs text-slate-500 mt-1">One/few items at a time, arrows to scroll</p>
              {menuCarouselStyle === 'sliding' && <Check className="h-4 w-4 text-slate-900 mt-1" />}
            </button>
            <button
              type="button"
              onClick={() => setMenuCarouselStyle('static')}
              className={`rounded-xl border-2 px-5 py-4 transition-all text-left hover:shadow-md ${menuCarouselStyle === 'static' ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                }`}
            >
              <p className="text-sm font-semibold text-slate-800">📐 Static Row</p>
              <p className="text-xs text-slate-500 mt-1">All items visible in a horizontal row</p>
              {menuCarouselStyle === 'static' && <Check className="h-4 w-4 text-slate-900 mt-1" />}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Restaurant photo for vibe (display only; no AI) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-slate-600" />
            Restaurant Photo (Optional)
          </CardTitle>
          <p className="text-sm text-slate-500">Upload a photo of your restaurant so we can match your vibe. Your space is part of your brand—this helps your custom design feel like you. Click <strong>Save Restaurant DNA</strong> below after uploading to keep the photo.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={vibeImageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploadingVibeImage(true)
              try {
                const form = new FormData()
                form.append('image', file)
                const res = await fetch('/api/upload/restaurant-vibe', { method: 'POST', body: form })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || 'Upload failed')
                const key = (data as { key?: string }).key
                if (key) {
                  setRestaurantVibeImageKey(key)
                  setVibeImageLoadError(false)
                  toast({ title: 'Photo uploaded', description: 'Click Save Restaurant DNA to apply.' })
                } else {
                  toast({ title: 'Upload failed', variant: 'destructive' })
                }
              } catch {
                toast({ title: 'Upload failed', variant: 'destructive' })
              } finally {
                setUploadingVibeImage(false)
                e.target.value = ''
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploadingVibeImage} onClick={() => vibeImageInputRef.current?.click()}>
            {uploadingVibeImage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {uploadingVibeImage ? 'Uploading…' : 'Upload photo'}
          </Button>
          {(restaurantVibeImageKey || (legacyVibeImageUrl && !vibeImageRemoved)) && restaurantVibeImageDisplayUrl && (
            <div className="flex items-center gap-3">
              <div className="relative h-20 w-28 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
                {vibeImageLoadError ? (
                  <span className="text-xs text-slate-500 px-2 text-center">Image could not be loaded.</span>
                ) : (
                  <img
                    src={restaurantVibeImageDisplayUrl}
                    alt="Your restaurant"
                    className="h-full w-full object-cover"
                    onLoad={() => setVibeImageLoadError(false)}
                    onError={(e) => {
                      console.error('[Restaurant DNA] Image failed to load:', restaurantVibeImageDisplayUrl, e)
                      setVibeImageLoadError(true)
                    }}
                  />
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" className="text-slate-500" onClick={() => { setRestaurantVibeImageKey(''); setVibeImageRemoved(true); setVibeImageLoadError(false); }}>Remove</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI menu description tone */}
      <Card>
        <CardHeader>
          <CardTitle>AI Menu Description Tone</CardTitle>
          <p className="text-sm text-slate-500">Set how AI writes dish descriptions (e.g. fast casual vs fine dining). Used when generating or auto-filling menu item descriptions.</p>
        </CardHeader>
        <CardContent>
          <textarea
            value={descriptionTone}
            onChange={(e) => setDescriptionTone(e.target.value)}
            placeholder="e.g. Write concise, punchy descriptions for fast casual. Or: Write elegant, sensory descriptions suitable for fine dining."
            className="min-h-[80px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400"
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card>
        <CardHeader>
          <CardTitle>Timezone</CardTitle>
          <p className="text-sm text-slate-500">Used for time-based featured sections.</p>
        </CardHeader>
        <CardContent>
          <select
            value={menuTimezone}
            onChange={(e) => setMenuTimezone(e.target.value)}
            className="flex h-10 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="Asia/Baghdad">Erbil (Asia/Baghdad)</option>
            <option value="Asia/Dubai">Dubai</option>
            <option value="Europe/London">London</option>
            <option value="America/New_York">New York</option>
            <option value="UTC">UTC</option>
          </select>
        </CardContent>
      </Card>

      {/* Dish Photo Background */}
      <Card>
        <CardHeader>
          <CardTitle>Dish Photo Background</CardTitle>
          <p className="text-sm text-slate-500">Set the background style for all your menu item photos.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={defaultBackgroundDraft}
            onChange={(e) => setDefaultBackgroundDraft(e.target.value)}
            placeholder="e.g. Clean light-gray tabletop, soft diffuse lighting, minimal studio style"
            className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            rows={3}
          />
          <Button
            type="button" size="sm"
            disabled={savingBackgroundPrompt || (defaultBackgroundDraft.trim() === (defaultBackgroundPrompt || '') && hasDefaultBackgroundImage)}
            onClick={async () => {
              setSavingBackgroundPrompt(true)
              try {
                const res = await fetch('/api/user/background', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: defaultBackgroundDraft.trim() }) })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || 'Failed')
                setDefaultBackgroundPrompt(data.defaultBackgroundPrompt ?? defaultBackgroundDraft.trim())
                setDefaultBackgroundImageData(data.defaultBackgroundImageData ?? null)
                if (typeof data.hasDefaultBackgroundImage === 'boolean') setHasDefaultBackgroundImage(data.hasDefaultBackgroundImage)
                toast({ title: 'Background prompt saved' })
              } catch { toast({ title: 'Could not save prompt', variant: 'destructive' }) }
              finally { setSavingBackgroundPrompt(false) }
            }}
          >
            {savingBackgroundPrompt ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Save & generate preview
          </Button>
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <p className="text-xs text-slate-500">Or upload a reference image:</p>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return; setDescribingImage(true)
                try {
                  const form = new FormData(); form.append('image', file)
                  const res = await fetch('/api/user/background/describe-image', { method: 'POST', body: form })
                  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed')
                  const prompt = data.defaultBackgroundPrompt ?? data.description ?? ''
                  setDefaultBackgroundPrompt(prompt); setDefaultBackgroundDraft(prompt)
                  setDefaultBackgroundImageData(data.defaultBackgroundImageData ?? null)
                  setHasDefaultBackgroundImage(Boolean(data.hasDefaultBackgroundImage ?? data.defaultBackgroundImageData))
                  toast({ title: 'Reference background saved' })
                } catch { toast({ title: 'Could not save reference image', variant: 'destructive' }) }
                finally { setDescribingImage(false); e.target.value = '' }
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={describingImage} onClick={() => imageInputRef.current?.click()}>
              {describingImage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              {describingImage ? 'Saving…' : hasDefaultBackgroundImage ? 'Replace reference' : 'Choose image'}
            </Button>
          </div>
          {defaultBackgroundImageData && (
            <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-700">Current preview</p>
              <img src={defaultBackgroundImageData} alt="Background preview" className="h-36 w-full rounded-md border border-slate-200 object-cover" />
            </div>
          )}
          {hasDefaultBackgroundImage && (
            <Button type="button" variant="ghost" size="sm" disabled={savingBackgroundPrompt || describingImage}
              onClick={async () => {
                try { const res = await fetch('/api/user/background', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageData: null }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed'); setHasDefaultBackgroundImage(false); setDefaultBackgroundImageData(null); toast({ title: 'Image removed' }) } catch { toast({ title: 'Could not remove image', variant: 'destructive' }) }
              }}
            >Remove reference image</Button>
          )}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <p className="text-xs text-slate-500">Apply the background to all existing dish photos.</p>
            <Button type="button" variant="secondary" size="sm"
              disabled={!!applyBackgroundProgress || !(defaultBackgroundPrompt?.trim() || hasDefaultBackgroundImage)}
              onClick={async () => {
                setApplyBackgroundProgress({ total: 0, done: 0 })
                try {
                  const listRes = await fetch('/api/menu/items-with-images'); const listData = await listRes.json()
                  if (!listRes.ok) throw new Error(listData.error || 'Failed'); const ids: string[] = listData.itemIds ?? []
                  if (ids.length === 0) { toast({ title: 'No dish photos to update' }); setApplyBackgroundProgress(null); return }
                  setApplyBackgroundProgress((p) => (p ? { ...p, total: ids.length } : null))
                  let done = 0
                  for (const id of ids) {
                    const res = await fetch(`/api/menu/${id}/apply-background`, { method: 'POST' })
                    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Failed for item`) }
                    done += 1; setApplyBackgroundProgress((p) => (p ? { ...p, done } : null))
                  }
                  toast({ title: 'Background applied', description: `Updated ${ids.length} photo${ids.length === 1 ? '' : 's'}.` })
                } catch (e) { toast({ title: 'Could not apply', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' }) }
                finally { setApplyBackgroundProgress(null) }
              }}
            >
              {applyBackgroundProgress ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />{applyBackgroundProgress.total > 0 ? `Updating ${applyBackgroundProgress.done}/${applyBackgroundProgress.total}…` : 'Loading…'}</>) : 'Apply to all dish photos'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle>Restaurant Logo</CardTitle>
          <p className="text-sm text-slate-500">Upload or paste a logo URL. Appears at the top of your digital menu.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return; setLogoUploading(true)
              try {
                const form = new FormData(); form.append('logo', file)
                const res = await fetch('/api/upload/logo', { method: 'POST', body: form })
                const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Upload failed')
                setLogoUrl(data.url); toast({ title: 'Logo uploaded', description: 'Click Save to apply.' })
              } catch { toast({ title: 'Upload failed', variant: 'destructive' }) }
              finally { setLogoUploading(false); e.target.value = '' }
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}>
            {logoUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {logoUploading ? 'Uploading…' : 'Upload from computer'}
          </Button>
          <div>
            <Label htmlFor="logoUrl" className="text-xs text-slate-500">Or paste URL</Label>
            <Input id="logoUrl" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className="mt-1 max-w-sm" />
          </div>
          {logoUrl && (
            <img src={logoUrl} alt="Logo preview" className="h-16 w-16 rounded-full object-contain border border-slate-200"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-slate-900" />
            Live Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`rounded-xl p-6 ${backgroundStyle === 'light' ? 'bg-slate-100 text-slate-900'
            : backgroundStyle === 'gradient' ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white'
              : 'bg-slate-950 text-white'
            }`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full" style={{ backgroundColor: primaryColor }} />
              <div>
                <p className="font-bold text-lg">{restaurantName || 'Your Restaurant'}</p>
                <p className="text-xs opacity-60">Menu Preview</p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-2 w-8 rounded-full" style={{ backgroundColor: primaryColor }} />
              <div className="h-2 w-4 rounded-full" style={{ backgroundColor: accentColor }} />
              <div className="h-2 w-4 rounded-full opacity-30" style={{ backgroundColor: accentColor }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Snowfall */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>❄️ Seasonal Snowfall</CardTitle>
              <p className="text-sm text-slate-500 mt-1">Animated snowfall on the guest menu during winter.</p>
            </div>
            <button type="button" role="switch" aria-checked={snowfallEnabled} onClick={() => setSnowfallEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${snowfallEnabled ? 'bg-slate-500' : 'bg-slate-200'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${snowfallEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </CardHeader>
        {snowfallEnabled && (
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-slate-500">Start (MM-DD)</Label>
                <Input value={snowfallStart} onChange={(e) => setSnowfallStart(e.target.value)} placeholder="12-15" className="h-8 w-24 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-slate-500">End (MM-DD)</Label>
                <Input value={snowfallEnd} onChange={(e) => setSnowfallEnd(e.target.value)} placeholder="01-07" className="h-8 w-24 text-xs" />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Save Button */}
      <div className="sticky bottom-6 z-10">
        <Button onClick={saveTheme} disabled={savingTheme}
          className="w-full h-12 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white rounded-xl shadow-lg shadow-slate-900/10 text-base font-semibold"
        >
          {savingTheme ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Check className="h-5 w-5 mr-2" />}
          Save Restaurant DNA
        </Button>
      </div>

      {/* Theme Suggest Dialog */}
      <Dialog open={themeSuggestDialogOpen} onOpenChange={setThemeSuggestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dish photo background for {themeSuggestPresetLabel}</DialogTitle>
            <DialogDescription>Preview and apply a matching background style for your menu item photos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <textarea value={themeSuggestPrompt} onChange={(e) => setThemeSuggestPrompt(e.target.value)} placeholder="Background style description…" className="min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" rows={3} />
            {themeSuggestItemCount !== null && (
              <p className="text-sm text-slate-600"><strong>{themeSuggestItemCount}</strong> photo{themeSuggestItemCount !== 1 ? 's' : ''} will be updated.</p>
            )}
            <div>
              <Button type="button" variant="outline" size="sm" disabled={themePreviewLoading || !!themeSuggestApplyProgress} onClick={generateThemePreview}>
                {themePreviewLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Generate preview
              </Button>
              {themePreviewImageUrl && (
                <div className="mt-3 rounded-lg border overflow-hidden">
                  <img src={themePreviewImageUrl} alt="Preview" className="w-full aspect-video object-cover" />
                </div>
              )}
            </div>
            {themeSuggestApplyProgress && <p className="text-sm text-slate-600">Updating {themeSuggestApplyProgress.done}/{themeSuggestApplyProgress.total}…</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThemeSuggestDialogOpen(false)} disabled={!!themeSuggestApplyProgress}>Skip</Button>
            <Button onClick={applyThemeBackground} disabled={themeSuggestApplying}>
              {themeSuggestApplying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {themeSuggestApplyProgress ? `Updating ${themeSuggestApplyProgress.done}/${themeSuggestApplyProgress.total}…` : 'Verify & update all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Smart Designer Chat Panel */}
      {designerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative flex flex-col w-full max-w-lg h-[70vh] mx-4 rounded-2xl overflow-hidden shadow-2xl bg-white">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Smart Designer</h3>
                <p className="text-xs text-white/70">AI design assistant</p>
              </div>
              <button onClick={() => setDesignerOpen(false)} className="text-white/70 hover:text-white text-xl px-2">✕</button>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {designerMessages.length === 0 && (
                <div className="text-center py-8">
                  <Sparkles className="w-10 h-10 mx-auto text-slate-400 mb-3" />
                  <p className="text-sm text-slate-500">Ask me anything about your restaurant design!</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {['Suggest colors for an Italian bistro', 'Best fonts for fine dining?', 'Should I use a carousel or static row?'].map((q) => (
                      <button key={q} onClick={() => { setDesignerInput(q) }}
                        className="text-xs bg-slate-50 text-slate-900 px-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors"
                      >{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {designerMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user'
                    ? 'bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-br-md'
                    : 'bg-slate-100 text-slate-700 rounded-bl-md'
                    }`}>
                    {msg.content.split('\n').map((line, j) => <p key={j} className={j > 0 ? 'mt-1.5' : ''}>{line}</p>)}
                  </div>
                </div>
              ))}
              {designerLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-700" />
                  </div>
                </div>
              )}
              <div ref={designerEndRef} />
            </div>
            {/* Input */}
            <div className="p-4 border-t">
              <div className="flex items-center gap-2">
                <input
                  type="text" value={designerInput}
                  onChange={(e) => setDesignerInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDesignerMessage() } }}
                  placeholder="Ask the Smart Designer…"
                  disabled={designerLoading}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-slate-400 transition-colors"
                />
                <Button onClick={sendDesignerMessage} disabled={!designerInput.trim() || designerLoading} size="sm"
                  className="h-10 w-10 p-0 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 rounded-xl"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
