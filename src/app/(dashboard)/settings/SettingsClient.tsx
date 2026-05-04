'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  Star,
  Send,
  Dna,
  ChevronDown,
  Eye,
  MessageCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useI18n, useDynamicTranslate, type ManagementLocale } from '@/lib/i18n'
import { GoogleFontPicker } from '@/components/settings/GoogleFontPicker'
import { GoogleMapsStreetPicker } from '@/components/settings/GoogleMapsStreetPicker'
import { IRAQ_CITIES } from '@/lib/iraq-cities'

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
interface SettingsThemePayload {
  restaurantName?: string
  restaurantEmail?: string
  restaurantPhone?: string
  restaurantWhatsappNumber?: string
  restaurantWhatsappVerifiedAt?: string | null
  restaurantWhatsappLastInboundAt?: string | null
  instagramUrl?: string
  facebookUrl?: string
  whatsappUrl?: string
  restaurantCity?: string
  restaurantAddress?: string
  restaurantLat?: string | number
  restaurantLng?: string | number
  primaryColor?: string
  accentColor?: string
  chefPickColor?: string
  borderColor?: string
  backgroundStyle?: string
  fontFamily?: string
  fontMenuTitle?: string
  fontCategoryHeader?: string
  fontItemName?: string
  fontDescription?: string
  fontPrice?: string
  logoUrl?: string
  menuTimezone?: string
  themePreset?: string | null
  backgroundImageUrl?: string
  managementLanguage?: string
  menuCarouselStyle?: string
  descriptionTone?: string
  foodTerminologyOverrides?: string
  restaurantVibeImageKey?: string
  restaurantVibeImageUrl?: string
  snowfallEnabled?: string
  snowfallStart?: string
  snowfallEnd?: string
  tableOrderingEnabled?: boolean
  showKurdishOnMenu?: boolean
  showArabicOnMenu?: boolean
}

interface SettingsClientProps {
  currentTheme: SettingsThemePayload
  twilioWhatsAppNumber?: string
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
  twilioWhatsAppNumber = '',
  defaultBackgroundPrompt: initialDefaultBackgroundPrompt = '',
  hasDefaultBackgroundImage: initialHasDefaultBackgroundImage = false,
  defaultBackgroundImageData: initialDefaultBackgroundImageData = null,
}: SettingsClientProps) {
  const { toast } = useToast()
  const { t: i18n, locale, setLocale } = useI18n()
  const { t: td } = useDynamicTranslate()
  const router = useRouter()
  const dishPhotoDialogCopy = locale === 'ar-fusha'
    ? {
        title: 'معاينة/تحديث خلفيات صور الأطباق',
        description: 'عاين وطبّق نمط خلفية مناسب لصور أصناف قائمتك.',
        placeholder: 'اكتب وصفاً لأسلوب الخلفية...',
        onePhoto: 'سيتم تحديث صورة واحدة.',
        manyPhotos: 'سيتم تحديث الصور.',
        slow: 'قد تستغرق هذه العملية بضع دقائق للقوائم الكبيرة.',
        generate: 'إنشاء معاينة',
        updating: 'جارٍ التحديث',
        preparing: 'جارٍ تجهيز التقدير…',
        skip: 'تخطي',
        verify: 'تحقق وحدّث الكل',
      }
    : locale === 'ku'
      ? {
          title: 'پێشبینین/نوێکردنەوەی پاشبنەمای وێنەی خواردن',
          description: 'پێشبینی بکە و ستایلی پاشبنەمای گونجاو بۆ وێنەکانی ئایتمەکانی مینیوەکەت جێبەجێ بکە.',
          placeholder: 'وەسفی ستایلی پاشبنەما بنووسە...',
          onePhoto: 'یەک وێنە نوێ دەکرێتەوە.',
          manyPhotos: 'وێنەکان نوێ دەکرێنەوە.',
          slow: 'ئەم پرۆسەیە بۆ مینیوە گەورەکان لەوانەیە چەند خولەکێک بخایەنێت.',
          generate: 'پێشبینین دروست بکە',
          updating: 'نوێدەکرێتەوە',
          preparing: 'هەڵسەنگاندن ئامادە دەکرێت…',
          skip: 'بازبدە',
          verify: 'پشکنین و هەمووی نوێ بکەرەوە',
        }
      : {
          title: 'Preview/update dish photo backgrounds',
          description: 'Preview and apply a matching background style for your menu item photos.',
          placeholder: 'Background style description…',
          onePhoto: 'photo will be updated.',
          manyPhotos: 'photos will be updated.',
          slow: 'This process may take a few minutes for larger menus.',
          generate: 'Generate preview',
          updating: 'Updating',
          preparing: 'Preparing estimate…',
          skip: 'Skip',
          verify: 'Verify & update all',
        }

  // Theme state
  const [restaurantName, setRestaurantName] = useState(currentTheme.restaurantName || '')
  const [restaurantEmail, setRestaurantEmail] = useState(currentTheme.restaurantEmail || '')
  const [restaurantPhone, setRestaurantPhone] = useState(currentTheme.restaurantPhone || '')
  const [restaurantWhatsappNumber, setRestaurantWhatsappNumber] = useState(currentTheme.restaurantWhatsappNumber || '')
  const [instagramUrl, setInstagramUrl] = useState(currentTheme.instagramUrl || '')
  const [facebookUrl, setFacebookUrl] = useState(currentTheme.facebookUrl || '')
  const [whatsappUrl, setWhatsappUrl] = useState(currentTheme.whatsappUrl || '')
  const [restaurantCity, setRestaurantCity] = useState(currentTheme.restaurantCity || '')
  const [restaurantAddress, setRestaurantAddress] = useState(currentTheme.restaurantAddress || '')
  const [restaurantLat, setRestaurantLat] = useState<number | null>(() => {
    const value = currentTheme.restaurantLat
    return typeof value === 'string' ? Number(value) || null : typeof value === 'number' ? value : null
  })
  const [restaurantLng, setRestaurantLng] = useState<number | null>(() => {
    const value = currentTheme.restaurantLng
    return typeof value === 'string' ? Number(value) || null : typeof value === 'number' ? value : null
  })
  const [primaryColor, setPrimaryColor] = useState(currentTheme.primaryColor || '#10b981')
  const [accentColor, setAccentColor] = useState(currentTheme.accentColor || '#f59e0b')
  const [chefPickColor, setChefPickColor] = useState(currentTheme.chefPickColor || '#dc2626')
  const [borderColor, setBorderColor] = useState(currentTheme.borderColor || '#1e40af')
  const [backgroundStyle, setBackgroundStyle] = useState<string>(currentTheme.backgroundStyle || 'dark')
  const [fontFamily, setFontFamily] = useState<string>(currentTheme.fontFamily || 'DM Sans')
  const [fontMenuTitle, setFontMenuTitle] = useState<string>(currentTheme.fontMenuTitle || 'DM Sans')
  const [fontCategoryHeader, setFontCategoryHeader] = useState<string>(currentTheme.fontCategoryHeader || 'DM Sans')
  const [fontItemName, setFontItemName] = useState<string>(currentTheme.fontItemName || 'DM Sans')
  const [fontDescription, setFontDescription] = useState<string>(currentTheme.fontDescription || 'DM Sans')
  const [fontPrice, setFontPrice] = useState<string>(currentTheme.fontPrice || 'DM Sans')
  const [logoUrl, setLogoUrl] = useState(currentTheme.logoUrl || '')
  const [menuTimezone, setMenuTimezone] = useState(currentTheme.menuTimezone || 'Asia/Baghdad')
  const [themePreset, setThemePreset] = useState<string | null>(() => {
    const p = currentTheme.themePreset
    if (!p || !THEME_PRESETS[p]) return null
    const preset = THEME_PRESETS[p]
    // Validate that the main brand color and background style actually match the preset
    const isMatch = (currentTheme.primaryColor || '#10b981') === preset.primaryColor &&
      (currentTheme.backgroundStyle || 'dark') === preset.backgroundStyle
    return isMatch ? p : null
  })
  const [managementLanguage, setManagementLanguage] = useState<string>(currentTheme.managementLanguage || 'en')
  const initialManagementLanguage = currentTheme.managementLanguage || 'en'
  const [menuCarouselStyle, setMenuCarouselStyle] = useState<string>(currentTheme.menuCarouselStyle || 'sliding')
  const [descriptionTone, setDescriptionTone] = useState<string>(currentTheme.descriptionTone || '')
  const [foodTerminologyOverrides, setFoodTerminologyOverrides] = useState<string>(currentTheme.foodTerminologyOverrides || '')
  const [restaurantVibeImageKey, setRestaurantVibeImageKey] = useState<string>(currentTheme.restaurantVibeImageKey || '')
  const legacyVibeImageUrl = currentTheme.restaurantVibeImageUrl || ''
  const [vibeImageRemoved, setVibeImageRemoved] = useState(false)
  const [uploadingVibeImage, setUploadingVibeImage] = useState(false)
  const [vibeImageLoadError, setVibeImageLoadError] = useState(false)
  const vibeImageInputRef = useRef<HTMLInputElement>(null)
  const restaurantVibeImageDisplayUrl = restaurantVibeImageKey
    ? `/api/settings/restaurant-vibe-image?key=${encodeURIComponent(restaurantVibeImageKey)}`
    : vibeImageRemoved ? '' : legacyVibeImageUrl
  const [snowfallEnabled, setSnowfallEnabled] = useState<boolean>(currentTheme.snowfallEnabled === 'true')
  const [tableOrderingEnabled, setTableOrderingEnabled] = useState<boolean>(currentTheme.tableOrderingEnabled !== false)
  const [showKurdishOnMenu, setShowKurdishOnMenu] = useState<boolean>(currentTheme.showKurdishOnMenu !== false)
  const [showArabicOnMenu, setShowArabicOnMenu] = useState<boolean>(currentTheme.showArabicOnMenu !== false)
  const [snowfallStart, setSnowfallStart] = useState<string>(currentTheme.snowfallStart || '12-15')
  const [snowfallEnd, setSnowfallEnd] = useState<string>(currentTheme.snowfallEnd || '01-07')
  const [savingTheme, setSavingTheme] = useState(false)
  const [whatsappVerificationCode, setWhatsappVerificationCode] = useState<string | null>(null)
  const [whatsappVerificationRequestedAt, setWhatsappVerificationRequestedAt] = useState<string | null>(null)
  const [whatsappVerifiedAt, setWhatsappVerifiedAt] = useState<string | null>(currentTheme.restaurantWhatsappVerifiedAt || null)
  const [whatsappLastInboundAt, setWhatsappLastInboundAt] = useState<string | null>(currentTheme.restaurantWhatsappLastInboundAt || null)
  const [startingWhatsappVerification, setStartingWhatsappVerification] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resettingDemoAccount, setResettingDemoAccount] = useState(false)
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false)

  // Dish photo background state
  const [defaultBackgroundPrompt, setDefaultBackgroundPrompt] = useState(initialDefaultBackgroundPrompt)
  const [defaultBackgroundDraft, setDefaultBackgroundDraft] = useState(initialDefaultBackgroundPrompt)
  const [hasDefaultBackgroundImage, setHasDefaultBackgroundImage] = useState(initialHasDefaultBackgroundImage)
  const [defaultBackgroundImageData, setDefaultBackgroundImageData] = useState<string | null>(initialDefaultBackgroundImageData)
  const [describingImage, setDescribingImage] = useState(false)
  const [savingBackgroundPrompt, setSavingBackgroundPrompt] = useState(false)
  const [applyBackgroundProgress, setApplyBackgroundProgress] = useState<{ total: number; done: number } | null>(null)
  const [applyBackgroundStartedAt, setApplyBackgroundStartedAt] = useState<number | null>(null)
  const [applySelectedDialogOpen, setApplySelectedDialogOpen] = useState(false)
  const [applySelectedItems, setApplySelectedItems] = useState<{ id: string; name: string }[]>([])
  const [applySelectedIds, setApplySelectedIds] = useState<Set<string>>(new Set())
  const [applySelectedListLoading, setApplySelectedListLoading] = useState(false)
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
  const [themeSuggestApplyStartedAt, setThemeSuggestApplyStartedAt] = useState<number | null>(null)

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

  // Sync state with currentTheme prop (useful after router.refresh())
  useEffect(() => {
    if (currentTheme.restaurantName) setRestaurantName(currentTheme.restaurantName)
    if (currentTheme.restaurantEmail) setRestaurantEmail(currentTheme.restaurantEmail)
    if (currentTheme.restaurantPhone) setRestaurantPhone(currentTheme.restaurantPhone)
    if (currentTheme.restaurantWhatsappNumber) setRestaurantWhatsappNumber(currentTheme.restaurantWhatsappNumber)
    if (currentTheme.instagramUrl) setInstagramUrl(currentTheme.instagramUrl)
    if (currentTheme.facebookUrl) setFacebookUrl(currentTheme.facebookUrl)
    if (currentTheme.whatsappUrl) setWhatsappUrl(currentTheme.whatsappUrl)
    if (currentTheme.restaurantCity) setRestaurantCity(currentTheme.restaurantCity)
    if (currentTheme.restaurantAddress) setRestaurantAddress(currentTheme.restaurantAddress)
    if (currentTheme.primaryColor) setPrimaryColor(currentTheme.primaryColor)
    if (currentTheme.accentColor) setAccentColor(currentTheme.accentColor)
    if (currentTheme.chefPickColor) setChefPickColor(currentTheme.chefPickColor)
    if (currentTheme.borderColor) setBorderColor(currentTheme.borderColor)
    if (currentTheme.backgroundStyle) setBackgroundStyle(currentTheme.backgroundStyle)
    if (currentTheme.fontFamily) setFontFamily(currentTheme.fontFamily)
    if (currentTheme.fontMenuTitle) setFontMenuTitle(currentTheme.fontMenuTitle)
    if (currentTheme.fontCategoryHeader) setFontCategoryHeader(currentTheme.fontCategoryHeader)
    if (currentTheme.fontItemName) setFontItemName(currentTheme.fontItemName)
    if (currentTheme.fontDescription) setFontDescription(currentTheme.fontDescription)
    if (currentTheme.fontPrice) setFontPrice(currentTheme.fontPrice)
    if (currentTheme.logoUrl) setLogoUrl(currentTheme.logoUrl)

    // Sync themePreset with validation
    const p = currentTheme.themePreset
    if (!p || !THEME_PRESETS[p]) {
      setThemePreset(null)
    } else {
      const preset = THEME_PRESETS[p]
      const isMatch = (currentTheme.primaryColor || '#10b981') === preset.primaryColor &&
        (currentTheme.backgroundStyle || 'dark') === preset.backgroundStyle
      setThemePreset(isMatch ? p : null)
    }
  }, [currentTheme])

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

  useEffect(() => {
    setWhatsappVerifiedAt(currentTheme.restaurantWhatsappVerifiedAt || null)
    setWhatsappLastInboundAt(currentTheme.restaurantWhatsappLastInboundAt || null)
  }, [currentTheme.restaurantWhatsappVerifiedAt, currentTheme.restaurantWhatsappLastInboundAt])

  useEffect(() => {
    if (!whatsappVerificationRequestedAt || whatsappVerifiedAt) return

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch('/api/whatsapp/verification/status', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        setWhatsappVerifiedAt(data.verifiedAt || null)
        setWhatsappLastInboundAt(data.lastInboundAt || null)
        if (data.verified) {
          setRestaurantWhatsappNumber(data.whatsappNumber || '')
          setWhatsappVerificationCode(null)
          setWhatsappVerificationRequestedAt(null)
        }
      } catch {
        // Keep polling quietly while waiting for verification.
      }
    }, 3000)

    return () => window.clearInterval(interval)
  }, [whatsappVerificationRequestedAt, whatsappVerifiedAt])

  const verificationChatHref = (() => {
    if (!twilioWhatsAppNumber) return null
    const digits = twilioWhatsAppNumber.replace(/[^\d]/g, '')
    if (!digits) return null
    const base = `https://wa.me/${digits}`
    if (!whatsappVerificationCode) return base
    return `${base}?text=${encodeURIComponent(whatsappVerificationCode)}`
  })()

  const getEtaLabel = (done: number, total: number, startedAt: number | null): string => {
    if (!startedAt || total <= 0) return ''
    if (done >= total) return ''
    // Upfront estimate before first item completes (~1 min per photo for AI processing)
    if (done <= 0) {
      const estimatedMin = Math.max(1, total)
      return total === 1
        ? td('This might take about 1 minute.')
        : td(`This might take about ${estimatedMin} minutes.`)
    }
    const elapsedMs = Date.now() - startedAt
    const avgPerItem = elapsedMs / done
    const remainingMs = avgPerItem * (total - done)
    const remainingMin = Math.max(1, Math.round(remainingMs / 60000))
    return td(`About ${remainingMin} min remaining`)
  }

  /* =========================
   *  SAVE THEME
   * ========================= */
  const saveTheme = async () => {
    setSavingTheme(true)
    try {
      const languageChanged = (managementLanguage || 'en') !== initialManagementLanguage
      const response = await fetch('/api/settings/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryColor, accentColor, chefPickColor, borderColor,
          backgroundStyle, fontFamily,
          fontMenuTitle, fontCategoryHeader, fontItemName, fontDescription, fontPrice,
          logoUrl: logoUrl || null,
          menuTimezone: menuTimezone || 'Asia/Baghdad',
          themePreset: themePreset || null,
          managementLanguage: managementLanguage || 'en',
          menuCarouselStyle: menuCarouselStyle || 'sliding',
          snowfallEnabled: String(snowfallEnabled),
          snowfallStart: snowfallStart || '12-15',
          snowfallEnd: snowfallEnd || '01-07',
          ...(restaurantName.trim() && { restaurantName: restaurantName.trim() }),
          restaurantEmail: restaurantEmail.trim() || null,
          restaurantPhone: restaurantPhone.trim() || null,
          restaurantWhatsappNumber: restaurantWhatsappNumber.trim() || null,
          instagramUrl: instagramUrl.trim() || null,
          facebookUrl: facebookUrl.trim() || null,
          whatsappUrl: whatsappUrl.trim() || null,
          restaurantCity: restaurantCity || null,
          restaurantAddress: restaurantAddress.trim() || null,
          restaurantLat,
          restaurantLng,
          descriptionTone: descriptionTone.trim(),
          foodTerminologyOverrides: foodTerminologyOverrides.trim(),
          restaurantVibeImageKey: restaurantVibeImageKey.trim() || null,
          restaurantVibeImageUrl: (restaurantVibeImageKey.trim() && !vibeImageRemoved) ? undefined : null,
          tableOrderingEnabled,
          showKurdishOnMenu,
          showArabicOnMenu,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save theme')
      }
      if (!restaurantWhatsappNumber.trim()) {
        setWhatsappVerificationCode(null)
        setWhatsappVerificationRequestedAt(null)
        setWhatsappVerifiedAt(null)
        setWhatsappLastInboundAt(null)
      }
      toast({ title: 'Theme saved ✨', description: 'Your Restaurant DNA has been updated.' })
      if (languageChanged) {
        // Set client-side locale immediately for responsive UI
        if (managementLanguage) {
          setLocale(managementLanguage as ManagementLocale)
        }
        // Refresh server components to match new setting in DB (like layout, sidebar props etc)
        // router.refresh() will re-invoke the layout's getServerTranslations()
        router.refresh()
        return
      }
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save theme', variant: 'destructive' })
    } finally {
      setSavingTheme(false)
    }
  }

  const resetDemoAccount = async () => {
    setResettingDemoAccount(true)
    try {
      const response = await fetch('/api/settings/reset-demo-account', {
        method: 'POST',
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to reset demo account')
      }

      toast({
        title: 'Demo account reset',
        description: 'Restaurant data was cleared and Restaurant DNA onboarding will open again.',
      })
      setResetDialogOpen(false)
      router.refresh()
      window.location.reload()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reset demo account',
        variant: 'destructive',
      })
    } finally {
      setResettingDemoAccount(false)
    }
  }

  const startWhatsAppVerification = async () => {
    if (!restaurantWhatsappNumber.trim()) {
      toast({ title: td('WhatsApp number required'), description: td('Enter the restaurant WhatsApp number first.'), variant: 'destructive' })
      return
    }

    setStartingWhatsappVerification(true)
    try {
      const response = await fetch('/api/whatsapp/verification/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappNumber: restaurantWhatsappNumber }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start WhatsApp verification')
      }

      setRestaurantWhatsappNumber(data.whatsappNumber || restaurantWhatsappNumber)
      setWhatsappVerifiedAt(data.verifiedAt || null)
      setWhatsappLastInboundAt(data.lastInboundAt || null)
      setWhatsappVerificationRequestedAt(data.verificationRequestedAt || null)
      setWhatsappVerificationCode(data.verificationCode || null)

      toast({
        title: data.verified ? td('WhatsApp already verified') : td('OTP ready'),
        description: data.verified
          ? td('This WhatsApp number is already verified.')
          : td('Send the OTP from this WhatsApp number to finish verification.'),
      })
    } catch (error) {
      toast({
        title: td('Could not start verification'),
        description: error instanceof Error ? error.message : td('Unknown error'),
        variant: 'destructive',
      })
    } finally {
      setStartingWhatsappVerification(false)
    }
  }

  const copyVerificationCode = async () => {
    if (!whatsappVerificationCode) return
    try {
      await navigator.clipboard.writeText(whatsappVerificationCode)
      toast({ title: td('OTP copied'), description: td('Paste it into WhatsApp and send it to verify.') })
    } catch {
      toast({ title: td('Copy failed'), description: td('Please copy the OTP manually.'), variant: 'destructive' })
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
    setThemeSuggestApplyStartedAt(null)
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
      setThemeSuggestApplyStartedAt(Date.now())
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
      setThemeSuggestApplyStartedAt(null)
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
            <h1 className="text-3xl font-bold tracking-tight">{i18n.settings_title}</h1>
          </div>
          <p className="text-white/80 ml-[52px]">
            {i18n.settings_subtitle}
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
            <Star className="w-6 h-6 text-white fill-current" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-800">{i18n.settings_smart_designer}</h3>
            <p className="text-sm text-slate-500">
              {i18n.settings_smart_designer_description}
            </p>
          </div>
          <MessageCircle className="w-5 h-5 text-slate-700 group-hover:text-slate-900 transition-colors" />
        </CardContent>
      </Card>

      {/* Management Language */}
      <Card>
        <CardHeader>
          <CardTitle>{i18n.settings_management_language}</CardTitle>
          <p className="text-sm text-slate-500">{i18n.settings_management_language_description}</p>
        </CardHeader>
        <CardContent>
          <select
            value={managementLanguage}
            onChange={(e) => setManagementLanguage(e.target.value)}
            className="flex h-10 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="en">English</option>
            <option value="ku">كوردي</option>
            <option value="ar-fusha">العربية</option>
          </select>
        </CardContent>
      </Card>

      {/* Customer menu: show Kurdish language option */}
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900">{i18n.settings_customer_menu_languages}</CardTitle>
          <p className="text-sm text-slate-500">{i18n.settings_customer_menu_languages_description}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">{i18n.settings_show_arabic_on_menu}</p>
                <p className="text-sm text-slate-500">{i18n.settings_show_arabic_on_menu_description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showArabicOnMenu}
                onClick={() => setShowArabicOnMenu(!showArabicOnMenu)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                  showArabicOnMenu ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                    showArabicOnMenu ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">{i18n.settings_show_kurdish_on_menu}</p>
                <p className="text-sm text-slate-500">{i18n.settings_show_kurdish_on_menu_description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showKurdishOnMenu}
                onClick={() => setShowKurdishOnMenu(!showKurdishOnMenu)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                  showKurdishOnMenu ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                    showKurdishOnMenu ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Style Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-slate-900" />
            {td('Style Presets')}
          </CardTitle>
          <p className="text-sm text-slate-500">{td('Pick a starting point, then customize everything below.')}</p>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!themeSuggestPrompt.trim() && themePreset && PRESET_SUGGESTED_BACKGROUNDS[themePreset]) {
                  setThemeSuggestPrompt(PRESET_SUGGESTED_BACKGROUNDS[themePreset])
                  setThemeSuggestPresetLabel(THEME_PRESETS[themePreset]?.label || 'Preset')
                }
                if (!themeSuggestPresetLabel && themePreset && THEME_PRESETS[themePreset]) {
                  setThemeSuggestPresetLabel(THEME_PRESETS[themePreset].label)
                }
                setThemePreviewImageUrl(null)
                setThemeSuggestDialogOpen(true)
              }}
            >
              {td('Preview/update dish photo backgrounds')}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(THEME_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => {
                  setThemePreset(key)
                  setPrimaryColor(preset.primaryColor)
                  setAccentColor(preset.accentColor)
                  setChefPickColor(preset.primaryColor) // Default chef pick to primary for presets
                  setBorderColor(preset.accentColor) // Default border to accent for presets
                  setBackgroundStyle(preset.backgroundStyle)
                  setFontFamily(preset.fontFamily)
                  // Update all font layers to match the preset's primary font
                  setFontMenuTitle(preset.fontFamily)
                  setFontCategoryHeader(preset.fontFamily)
                  setFontItemName(preset.fontFamily)
                  setFontDescription(preset.fontFamily)
                  setFontPrice(preset.fontFamily)
                  
                  const suggestedBg = PRESET_SUGGESTED_BACKGROUNDS[key]
                  if (suggestedBg) {
                    setThemeSuggestPrompt(suggestedBg)
                    setThemeSuggestPresetLabel(preset.label)
                    setThemePreviewImageUrl(null)
                  }
                  toast({ title: 'Style updated', description: 'Colors and typography are instant. Dish photo background updates are optional and separate.' })
                }}
                className={`relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${themePreset === key ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                  }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{preset.emoji}</span>
                  <span className="font-semibold text-sm text-slate-800">{td(preset.label)}</span>
                  {themePreset === key && <Check className="w-4 h-4 text-slate-900 ml-auto" />}
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="h-4 w-4 rounded-full border border-slate-200" style={{ backgroundColor: preset.primaryColor }} />
                  <span className="h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: preset.accentColor }} />
                </div>
                <p className="text-[10px] text-slate-500">{td(preset.desc)}</p>
              </button>
            ))}
            <button
              onClick={() => setThemePreset(null)}
              className={`rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${!themePreset ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🎨</span>
                <span className="font-semibold text-sm text-slate-800">{td('Custom')}</span>
                {!themePreset && <Check className="w-4 h-4 text-slate-900 ml-auto" />}
              </div>
              <p className="text-[10px] text-slate-500">{td('Build your own from scratch')}</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Colors — Just color pickers, no hex codes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-slate-600" />
            {td('Brand Colors')}
          </CardTitle>
          <p className="text-sm text-slate-500">{td('Click the color circles to change them — pick what feels right for your brand.')}</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              { label: 'Main Brand Color', desc: 'Buttons, highlights, and key elements on your menu', value: primaryColor, onChange: (val: string) => { setPrimaryColor(val); setThemePreset(null); } },
              { label: '"Add to Order" Button', desc: 'Guests tap this to order — make it pop!', value: accentColor, onChange: (val: string) => { setAccentColor(val); setThemePreset(null); } },
              { label: 'Top Star Indicator', desc: 'The "★ Top Star" recommendation badge color', value: chefPickColor, onChange: (val: string) => { setChefPickColor(val); setThemePreset(null); } },
              { label: 'Featured Highlight', desc: 'Border glow on featured and high-margin items', value: borderColor, onChange: (val: string) => { setBorderColor(val); setThemePreset(null); } },
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
                  <p className="text-sm font-medium text-slate-700">{td(color.label)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{td(color.desc)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Menu Background */}
      <Card>
        <CardHeader>
          <CardTitle>{td('Menu Background')}</CardTitle>
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
                onClick={() => { setBackgroundStyle(option.value); setThemePreset(null); }}
                className={`flex items-center gap-3 rounded-xl border-2 px-5 py-4 transition-all hover:shadow-md ${backgroundStyle === option.value ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                  }`}
              >
                <div className={`h-8 w-12 rounded-lg ${option.preview}`} />
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-700">{td(option.label)}</p>
                  <p className="text-[10px] text-slate-400">{td(option.desc)}</p>
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
          <CardTitle>{td('Typography')}</CardTitle>
          <p className="text-sm text-slate-500">{td('Choose how text appears on your menu.')}</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-500 font-semibold uppercase">{td('Global/Body Font')}</Label>
                <div className="flex items-center justify-between text-[10px] text-slate-400 -mt-1 mb-1">
                  <span>Applies to buttons, plain text, and layout</span>
                </div>
                <GoogleFontPicker value={fontFamily} onChange={setFontFamily} />
              </div>

              <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500 font-semibold uppercase">{td('Restaurant Title')}</Label>
                  <GoogleFontPicker value={fontMenuTitle} onChange={setFontMenuTitle} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500 font-semibold uppercase">{td('Category Headers')}</Label>
                  <GoogleFontPicker value={fontCategoryHeader} onChange={setFontCategoryHeader} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500 font-semibold uppercase">{td('Item Names')}</Label>
                  <GoogleFontPicker value={fontItemName} onChange={setFontItemName} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500 font-semibold uppercase">{td('Prices')}</Label>
                  <GoogleFontPicker value={fontPrice} onChange={setFontPrice} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs text-slate-500 font-semibold uppercase">{td('Descriptions')}</Label>
                  <GoogleFontPicker value={fontDescription} onChange={setFontDescription} />
                </div>
              </div>
            </div>

            {/* Live Visual Preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-inner relative flex flex-col items-center justify-center min-h-[560px]">
              <div className="absolute top-4 left-4">
                <Badge variant="outline" className="bg-white text-[10px] uppercase font-bold tracking-wider text-slate-500">Live Preview</Badge>
              </div>

              <div
                className="w-full max-w-[28rem] rounded-[28px] shadow-2xl overflow-hidden mt-6 border"
                style={{
                  fontFamily: `"${fontFamily}", sans-serif`,
                  background:
                    backgroundStyle === 'gradient'
                      ? 'linear-gradient(180deg, #f8efe9 0%, #fffaf6 100%)'
                      : backgroundStyle === 'dark'
                        ? '#1f1f22'
                        : '#fff9f5',
                  borderColor: `${borderColor}22`,
                }}
              >
                {(() => {
                  const previewPageBg =
                    backgroundStyle === 'dark'
                      ? '#151515'
                      : backgroundStyle === 'gradient'
                        ? '#fff7f2'
                        : '#fff9f5'
                  const previewSurfaceBg = backgroundStyle === 'dark' ? '#211d1b' : '#ffffff'
                  const previewSurfaceSoft = backgroundStyle === 'dark' ? '#2d2826' : '#fff3ec'
                  const previewTextMain = backgroundStyle === 'dark' ? '#fff8f3' : '#1a0a06'
                  const previewTextMuted = backgroundStyle === 'dark' ? 'rgba(255,248,243,0.68)' : '#9a6a58'
                  return (
                    <>
                <div
                  className="px-5 py-5 text-white"
                  style={{
                    background:
                      backgroundStyle === 'gradient'
                        ? `linear-gradient(135deg, ${primaryColor}, #111827)`
                        : primaryColor,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h1
                        className="text-[1.7rem] font-bold tracking-tight"
                        style={{ fontFamily: `"${fontMenuTitle}", sans-serif` }}
                      >
                        {restaurantName || 'Your Restaurant'}
                      </h1>
                      <p className="mt-1 text-[0.66rem] uppercase tracking-[0.22em] text-white/70">
                        GOOD AFTERNOON
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[0.68rem] text-white/80">
                        Table 07
                      </div>
                      <div
                        className="h-11 w-11 rounded-full flex items-center justify-center text-white shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${accentColor}, ${chefPickColor})` }}
                      >
                        <span className="text-lg">+</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[0.62rem] font-bold uppercase tracking-[0.18em]" style={{ color: accentColor }}>
                      Chef&apos;s Recommendation
                    </div>
                    <p className="mt-2 text-sm text-white/85" style={{ fontFamily: `"${fontDescription}", sans-serif` }}>
                      A quick look at how your selected colors and fonts will feel on the guest menu.
                    </p>
                  </div>

                  <div className="mt-4">
                    <div className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-white/55 mb-2">
                      Featured Cards
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          name: 'Beef Tikka Skewers',
                          price: '24,500',
                          image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80',
                        },
                        {
                          name: 'Signature Hummus',
                          price: '5,000',
                          image: 'https://images.unsplash.com/photo-1571159456876-1eb03b6ac7f3?auto=format&fit=crop&w=500&q=80',
                        },
                      ].map((item, index) => (
                        <div
                          key={item.name}
                          className="rounded-[22px] overflow-hidden border shadow-lg"
                          style={{
                            borderColor: index === 0 ? borderColor : `${borderColor}33`,
                            boxShadow: index === 0 ? `0 12px 28px ${borderColor}22` : undefined,
                          }}
                        >
                          <div
                            className="relative h-32"
                            style={{
                              background: index === 0
                                ? 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(0,0,0,0.22)), radial-gradient(circle at top right, rgba(255,255,255,0.18), transparent 42%), linear-gradient(160deg, rgba(120,56,24,0.92), rgba(33,24,20,0.95))'
                                : 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(0,0,0,0.18)), radial-gradient(circle at top left, rgba(255,255,255,0.16), transparent 40%), linear-gradient(160deg, rgba(34,139,94,0.92), rgba(18,58,49,0.96))',
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                            <div className="absolute right-4 top-4 h-10 w-10 rounded-full border border-white/20 bg-white/10" />
                            <div className="absolute left-4 bottom-6 h-14 w-14 rounded-full border border-white/15 bg-white/10" />
                            <span
                              className="absolute left-3 top-3 rounded-full px-3 py-1 text-[0.54rem] font-bold uppercase tracking-[0.1em] text-white flex items-center gap-1"
                              style={{ backgroundColor: chefPickColor }}
                            >
                              <Star className="h-2.5 w-2.5 fill-current" />
                              Top Star
                            </span>
                            <div className="absolute left-3 right-3 bottom-3 flex items-end justify-between gap-3">
                              <div>
                                <div
                                  className="text-white text-base font-bold leading-tight"
                                  style={{ fontFamily: `"${fontItemName}", sans-serif` }}
                                >
                                  {item.name}
                                </div>
                                <div
                                  className="text-white/80 text-sm font-bold"
                                  style={{ fontFamily: `"${fontPrice}", sans-serif` }}
                                >
                                  {item.price}
                                </div>
                              </div>
                              <div
                                className="h-9 w-9 rounded-full flex items-center justify-center text-white text-lg"
                                style={{ backgroundColor: accentColor }}
                              >
                                +
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-5" style={{ backgroundColor: previewPageBg }}>
                  <div
                    className="text-[0.62rem] font-bold uppercase tracking-[0.18em] mb-3"
                    style={{ color: previewTextMuted }}
                  >
                    What are you in the mood for?
                  </div>
                  <div className="flex gap-2 mb-5">
                    <div className="rounded-2xl border px-4 py-3 text-center flex-1" style={{ borderColor: `${accentColor}44`, backgroundColor: `${accentColor}12` }}>
                      <div className="text-xs font-semibold" style={{ color: accentColor }}>Show all</div>
                    </div>
                    <div className="rounded-2xl border px-4 py-3 text-center flex-1" style={{ borderColor: `${borderColor}33`, backgroundColor: previewSurfaceBg }}>
                      <div className="text-xs font-semibold" style={{ color: previewTextMain }}>Sharing</div>
                    </div>
                  </div>

                  <div
                    className="rounded-[22px] border p-4 shadow-sm"
                    style={{ borderColor: `${borderColor}33`, backgroundColor: previewSurfaceBg }}
                  >
                    <div
                      className="text-[1.35rem] font-bold mb-3"
                      style={{ fontFamily: `"${fontCategoryHeader}", sans-serif`, color: previewTextMain }}
                    >
                      Appetizers & Starters
                    </div>
                    <div className="flex gap-3">
                      <div
                        className="h-20 w-20 shrink-0 rounded-2xl overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(0,0,0,0.14)), radial-gradient(circle at 30% 30%, rgba(255,200,120,0.45), transparent 25%), linear-gradient(160deg, rgba(176,95,31,0.9), rgba(67,38,22,0.96))',
                        }}
                      >
                        <div className="h-full w-full bg-[radial-gradient(circle_at_70%_70%,rgba(255,255,255,0.22),transparent_28%)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3
                            className="text-sm font-bold leading-tight"
                            style={{ fontFamily: `"${fontItemName}", sans-serif`, color: previewTextMain }}
                          >
                            Dolma — Stuffed Grape Leaves
                          </h3>
                          <span
                            className="text-sm font-bold shrink-0"
                            style={{ fontFamily: `"${fontPrice}", sans-serif`, color: previewTextMain }}
                          >
                            11,000
                          </span>
                        </div>
                        <p
                          className="mt-2 text-xs leading-5 line-clamp-2"
                          style={{ fontFamily: `"${fontDescription}", sans-serif`, color: previewTextMuted }}
                        >
                          House-style description preview so the owner can understand how their menu typography and accents actually appear.
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-[11px]" style={{ color: previewTextMuted }}>12 orders</div>
                          <button
                            className="rounded-xl px-3 py-2 text-[11px] font-bold text-white uppercase tracking-wide"
                            style={{ backgroundColor: accentColor }}
                          >
                            Add to order
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Restaurant Name */}
      <Card>
        <CardHeader>
          <CardTitle>{td('Restaurant Name')}</CardTitle>
          <p className="text-sm text-slate-500">{td('Displayed at the top of your guest-facing menu.')}</p>
        </CardHeader>
        <CardContent>
          <input
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder={td('Your restaurant name')}
            className="flex h-10 w-full max-w-sm rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{td('Guest Menu Social Links')}</CardTitle>
          <p className="text-sm text-slate-500">
            {td('These three icons appear in the small guest menu footer after the hero section.')}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="instagramUrl">{td('Instagram URL')}</Label>
            <Input
              id="instagramUrl"
              type="url"
              value={instagramUrl}
              onChange={(event) => setInstagramUrl(event.target.value)}
              placeholder="https://instagram.com/restaurant"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="facebookUrl">{td('Facebook URL')}</Label>
            <Input
              id="facebookUrl"
              type="url"
              value={facebookUrl}
              onChange={(event) => setFacebookUrl(event.target.value)}
              placeholder="https://facebook.com/restaurant"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsappUrl">{td('WhatsApp URL')}</Label>
            <Input
              id="whatsappUrl"
              type="url"
              value={whatsappUrl}
              onChange={(event) => setWhatsappUrl(event.target.value)}
              placeholder="https://wa.me/9647700000000"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{td('Restaurant Contact & Location')}</CardTitle>
          <p className="text-sm text-slate-500">
            {td('Set the single restaurant email and phone here. Choose the city, then pick the street from Google Maps.')}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="restaurantEmail">{td('Restaurant Email')}</Label>
            <Input
              id="restaurantEmail"
              type="email"
              value={restaurantEmail}
              onChange={(event) => setRestaurantEmail(event.target.value)}
              placeholder="contact@restaurant.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="restaurantPhone">{td('Restaurant Phone')}</Label>
            <Input
              id="restaurantPhone"
              type="tel"
              value={restaurantPhone}
              onChange={(event) => setRestaurantPhone(event.target.value)}
              placeholder="+964 770 000 0000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="restaurantWhatsappNumber">{td('Restaurant WhatsApp')}</Label>
            <Input
              id="restaurantWhatsappNumber"
              type="tel"
              value={restaurantWhatsappNumber}
              onChange={(event) => {
                setRestaurantWhatsappNumber(event.target.value)
                setWhatsappVerificationCode(null)
                setWhatsappVerificationRequestedAt(null)
                setWhatsappVerifiedAt(null)
              }}
              placeholder="+964 770 000 0000"
            />
            <p className="text-xs text-slate-500">
              {td('Optional. When a customer does a order, it will be sent to this Whatsapp Number.')}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 md:col-span-2">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-emerald-700" />
                  <p className="text-sm font-semibold text-slate-900">{td('WhatsApp order notification verification')}</p>
                  {whatsappVerifiedAt ? (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                      {td('Verified')}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 text-amber-700">
                      {td('Not verified')}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  {td('Generate an OTP, then send it from the restaurant WhatsApp number to the below WhatsApp number. Verification updates here automatically.')}
                </p>
                {twilioWhatsAppNumber && (
                  <p className="text-xs text-slate-500">
                    {td('The WhatsApp number you need to send the OTP to')}: <span className="font-mono">{twilioWhatsAppNumber}</span>
                  </p>
                )}
                {whatsappVerifiedAt && (
                  <p className="text-xs text-emerald-700">
                    {td('Verified')}: {new Date(whatsappVerifiedAt).toLocaleString()}
                    {whatsappLastInboundAt ? ` · ${td('Last inbound')}: ${new Date(whatsappLastInboundAt).toLocaleString()}` : ''}
                  </p>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={startWhatsAppVerification}
                  disabled={startingWhatsappVerification}
                  className="h-10 w-full justify-center"
                >
                  {startingWhatsappVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                  {whatsappVerifiedAt ? td('Regenerate OTP') : td('Generate OTP')}
                </Button>
                {verificationChatHref && (
                  <Button asChild type="button" className="h-10 w-full justify-center">
                    <a href={verificationChatHref} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {td('Open chat')}
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {!whatsappVerifiedAt && whatsappVerificationCode && (
              <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto_auto] md:items-end">
                <div className="space-y-1">
                  <Label>{td('OTP')}</Label>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-lg font-semibold tracking-[0.2em] text-slate-900">
                    {whatsappVerificationCode}
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={copyVerificationCode}>
                  <Copy className="mr-2 h-4 w-4" />
                  {td('Copy OTP')}
                </Button>
                {verificationChatHref ? (
                  <Button asChild type="button" variant="outline">
                    <a href={verificationChatHref} target="_blank" rel="noreferrer">
                      <Send className="mr-2 h-4 w-4" />
                      {td('Send in WhatsApp')}
                    </a>
                  </Button>
                ) : null}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="restaurantCity">{td('City')}</Label>
            <select
              id="restaurantCity"
              value={restaurantCity}
              onChange={(event) => setRestaurantCity(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">{td('Select a city')}</option>
              {IRAQ_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="restaurantAddress">{td('Street / Google Maps Address')}</Label>
            <GoogleMapsStreetPicker
              value={restaurantAddress}
              city={restaurantCity}
              lat={restaurantLat}
              lng={restaurantLng}
              onChange={(nextAddress) => setRestaurantAddress(nextAddress)}
              onPlaceSelected={({ address, lat, lng }) => {
                setRestaurantAddress(address)
                setRestaurantLat(lat)
                setRestaurantLng(lng)
              }}
              placeholder={td('Search your street or choose a Google Maps address')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table ordering toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>📋</span>
            {td('Table ordering')}
          </CardTitle>
          <p className="text-sm text-slate-500">
            {td('When enabled, guests can select their table when ordering from the digital menu (e.g. via QR codes on tables). When disabled, the table selector is hidden.')}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={tableOrderingEnabled}
              onClick={() => setTableOrderingEnabled(!tableOrderingEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                tableOrderingEnabled ? 'bg-emerald-500' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                  tableOrderingEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-slate-700">
              {tableOrderingEnabled ? td('Enabled') : td('Disabled')}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Restaurant photo for vibe (display only; no AI) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-slate-600" />
            {td('Restaurant Photo (Optional)')}
          </CardTitle>
          <p className="text-sm text-slate-500">{td('Upload a photo of your restaurant so we can match your vibe. Your space is part of your brand—this helps your custom design feel like you. Click Save Restaurant DNA below after uploading to keep the photo.')}</p>
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
            {uploadingVibeImage ? td('Uploading…') : td('Upload photo')}
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
          <CardTitle>{td('AI Menu Description Tone')}</CardTitle>
          <p className="text-sm text-slate-500">{td('Set how AI writes dish descriptions (e.g. fast casual vs fine dining). Used when generating or auto-filling menu item descriptions.')}</p>
        </CardHeader>
        <CardContent>
          <textarea
            value={descriptionTone}
            onChange={(e) => setDescriptionTone(e.target.value)}
            placeholder={td('e.g. Write concise, punchy descriptions for fast casual. Or: Write elegant, sensory descriptions suitable for fine dining.')}
            className="min-h-[80px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400"
            rows={3}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{td('Food Terminology Overrides')}</CardTitle>
          <p className="text-sm text-slate-500">{td('Set cuisine-specific wording preferences for AI recipes. One rule per line: "from => to".')}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            value={foodTerminologyOverrides}
            onChange={(e) => setFoodTerminologyOverrides(e.target.value)}
            placeholder={td('pita bread => Lebanese bread\nsyrian bread => Samoon')}
            className="min-h-[100px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400"
            rows={4}
          />
          <p className="text-xs text-slate-500">{td('Used by Smart Chef and recipe generation so terminology matches your market.')}</p>
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card>
        <CardHeader>
          <CardTitle>{td('Timezone')}</CardTitle>
          <p className="text-sm text-slate-500">{td('settings_timezone_description')}</p>
        </CardHeader>
        <CardContent>
          <select
            value={menuTimezone}
            onChange={(e) => setMenuTimezone(e.target.value)}
            className="flex h-10 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="Asia/Baghdad">Erbil (Asia/Baghdad)</option>
            <option value="Asia/Dubai">Dubai</option>
            <option value="Asia/Colombo">Sri Lanka (Asia/Colombo)</option>
            <option value="Australia/Sydney">Sydney (Australia/Sydney)</option>
            <option value="Europe/London">London</option>
            <option value="America/New_York">New York</option>
            <option value="UTC">UTC</option>
          </select>
        </CardContent>
      </Card>

      {/* Dish Photo Background */}
      <Card>
        <CardHeader>
          <CardTitle>{td('Dish Photo Background')}</CardTitle>
          <p className="text-sm text-slate-500">{td('Set the background style for all your menu item photos.')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={defaultBackgroundDraft}
            onChange={(e) => setDefaultBackgroundDraft(e.target.value)}
            placeholder={td('e.g. Clean light-gray tabletop, soft diffuse lighting, minimal studio style')}
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
            {td('Save & generate preview')}
          </Button>
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <p className="text-xs text-slate-500">{td('Or upload a reference image:')}</p>
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
              {describingImage ? td('Saving…') : hasDefaultBackgroundImage ? td('Replace reference') : td('Choose image')}
            </Button>
          </div>
          {defaultBackgroundImageData && (
            <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-700">{td('Current preview')}</p>
              <img src={defaultBackgroundImageData} alt="Background preview" className="h-36 w-full rounded-md border border-slate-200 object-cover" />
            </div>
          )}
          {hasDefaultBackgroundImage && (
            <Button type="button" variant="ghost" size="sm" disabled={savingBackgroundPrompt || describingImage}
              onClick={async () => {
                try { const res = await fetch('/api/user/background', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageData: null }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed'); setHasDefaultBackgroundImage(false); setDefaultBackgroundImageData(null); toast({ title: 'Image removed' }) } catch { toast({ title: 'Could not remove image', variant: 'destructive' }) }
              }}
            >{td('Remove reference image')}</Button>
          )}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <p className="text-xs text-slate-500">{td('Apply the background to all existing dish photos, or choose which dishes to update.')}</p>
            <p className="text-xs text-slate-500">{td('Roughly 1 minute per photo; progress and time estimate appear below.')}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm"
                disabled={!!applyBackgroundProgress || !(defaultBackgroundPrompt?.trim() || hasDefaultBackgroundImage)}
                onClick={async () => {
                  setApplyBackgroundProgress({ total: 0, done: 0 })
                  setApplyBackgroundStartedAt(null)
                  try {
                    const listRes = await fetch('/api/menu/items-with-images')
                    const listData = await listRes.json()
                    if (!listRes.ok) throw new Error(listData.error || 'Failed to load menu items')
                    const ids: string[] = listData.itemIds ?? []
                    if (ids.length === 0) {
                      toast({ title: td('No dish photos to update') })
                      setApplyBackgroundProgress(null)
                      return
                    }
                    setApplyBackgroundStartedAt(Date.now())
                    setApplyBackgroundProgress({ total: ids.length, done: 0 })
                    let done = 0
                    for (const id of ids) {
                      const res = await fetch(`/api/menu/${id}/apply-background`, { method: 'POST' })
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        const message = err.details || err.error || td('Failed for one item')
                        throw new Error(message)
                      }
                      done += 1
                      setApplyBackgroundProgress((p) => (p ? { ...p, done } : null))
                    }
                    toast({ title: td('Background applied'), description: `${ids.length} ${ids.length === 1 ? td('photo') : td('photos')} ${td('updated')}.` })
                  } catch (e) {
                    toast({ title: td('Could not apply'), description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' })
                  } finally {
                    setApplyBackgroundProgress(null)
                    setApplyBackgroundStartedAt(null)
                  }
                }}
              >
                {applyBackgroundProgress ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />{applyBackgroundProgress.total > 0 ? td(`Updating ${applyBackgroundProgress.done}/${applyBackgroundProgress.total}…`) : td('Loading…')}</>) : td('Apply to all dish photos')}
              </Button>
              <Button type="button" variant="outline" size="sm"
                disabled={!!applyBackgroundProgress || !(defaultBackgroundPrompt?.trim() || hasDefaultBackgroundImage)}
                onClick={async () => {
                  setApplySelectedListLoading(true)
                  setApplySelectedDialogOpen(true)
                  try {
                    const listRes = await fetch('/api/menu/items-with-images')
                    const listData = await listRes.json()
                    if (!listRes.ok) throw new Error(listData.error || 'Failed to load')
                    const items: { id: string; name: string }[] = listData.items ?? listData.itemIds?.map((id: string) => ({ id, name: '' })) ?? []
                    setApplySelectedItems(items)
                    setApplySelectedIds(new Set(items.map((i) => i.id)))
                  } catch {
                    toast({ title: td('Could not load menu items'), variant: 'destructive' })
                    setApplySelectedDialogOpen(false)
                  } finally {
                    setApplySelectedListLoading(false)
                  }
                }}
              >
                {td('Select dishes to update')}
              </Button>
            </div>
            {applyBackgroundProgress && applyBackgroundProgress.total > 0 && (
              <p className="text-xs text-slate-500">
                {getEtaLabel(applyBackgroundProgress.done, applyBackgroundProgress.total, applyBackgroundStartedAt)}
              </p>
            )}
          </div>

          {/* Apply to selected dishes dialog */}
          <Dialog open={applySelectedDialogOpen} onOpenChange={(open) => { if (!applyBackgroundProgress) setApplySelectedDialogOpen(open) }}>
            <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{td('Select dishes to update')}</DialogTitle>
                <DialogDescription>{td('Choose which menu items should get the new background. Then click Apply to selected.')}</DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-auto space-y-2 py-2">
                {applySelectedListLoading ? (
                  <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{td('Loading…')}</p>
                ) : applySelectedItems.length === 0 ? (
                  <p className="text-sm text-slate-500">{td('No dish photos to update.')}</p>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setApplySelectedIds(new Set(applySelectedItems.map((i) => i.id)))}>
                        {td('Select all')}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setApplySelectedIds(new Set())}>
                        {td('Deselect all')}
                      </Button>
                    </div>
                    <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto border rounded-md p-2">
                      {applySelectedItems.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`apply-sel-${item.id}`}
                            checked={applySelectedIds.has(item.id)}
                            onChange={() => {
                              setApplySelectedIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(item.id)) next.delete(item.id)
                                else next.add(item.id)
                                return next
                              })
                            }}
                            className="rounded border-slate-300"
                          />
                          <label htmlFor={`apply-sel-${item.id}`} className="text-sm cursor-pointer flex-1 truncate">{item.name || item.id}</label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <DialogFooter>
                {applyBackgroundProgress && applyBackgroundProgress.total > 0 ? (
                  <p className="text-xs text-slate-500 mr-auto">
                    {getEtaLabel(applyBackgroundProgress.done, applyBackgroundProgress.total, applyBackgroundStartedAt)}
                  </p>
                ) : null}
                <Button type="button" variant="outline" onClick={() => setApplySelectedDialogOpen(false)} disabled={!!applyBackgroundProgress}>
                  {td('Cancel')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={applySelectedListLoading || applySelectedIds.size === 0 || !!applyBackgroundProgress || !(defaultBackgroundPrompt?.trim() || hasDefaultBackgroundImage)}
                  onClick={async () => {
                    const ids = Array.from(applySelectedIds)
                    if (ids.length === 0) return
                    setApplyBackgroundStartedAt(Date.now())
                    setApplyBackgroundProgress({ total: ids.length, done: 0 })
                    let done = 0
                    try {
                      for (const id of ids) {
                        const res = await fetch(`/api/menu/${id}/apply-background`, { method: 'POST' })
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}))
                          throw new Error(err.details || err.error || td('Failed for one item'))
                        }
                        done += 1
                        setApplyBackgroundProgress((p) => (p ? { ...p, done } : null))
                      }
                      toast({ title: td('Background applied'), description: `${ids.length} ${ids.length === 1 ? td('photo') : td('photos')} ${td('updated')}.` })
                      setApplySelectedDialogOpen(false)
                    } catch (e) {
                      toast({ title: td('Could not apply'), description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' })
                    } finally {
                      setApplyBackgroundProgress(null)
                      setApplyBackgroundStartedAt(null)
                    }
                  }}
                >
                  {applyBackgroundProgress ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{td(`Updating ${applyBackgroundProgress.done}/${applyBackgroundProgress.total}…`)}</> : td(`Apply to selected (${applySelectedIds.size})`)}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle>{td('Restaurant Logo')}</CardTitle>
          <p className="text-sm text-slate-500">{td('Upload or paste a logo URL. Appears at the top of your digital menu.')}</p>
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
            {logoUploading ? td('Uploading…') : td('Upload from computer')}
          </Button>
          <div>
            <Label htmlFor="logoUrl" className="text-xs text-slate-500">{td('Or paste URL')}</Label>
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
            {td('Live Preview')}
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
                <p className="font-bold text-lg">{restaurantName || td('Your Restaurant')}</p>
                <p className="text-xs opacity-60">{td('Menu Preview')}</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {[1, 2].map((card) => (
                <div
                  key={card}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${backgroundStyle === 'light' ? 'border-slate-200 bg-white text-slate-900' : 'border-white/10 bg-white/10 text-white'}`}
                >
                  <div className="h-16 w-16 rounded-xl" style={{ backgroundColor: accentColor }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{card === 1 ? td('Signature Dish') : td('Chef Special')}</p>
                    <p className={`text-xs ${backgroundStyle === 'light' ? 'text-slate-500' : 'text-white/70'}`}>
                      {td('Restaurant DNA controls the overall look and feel of the menu.')}
                    </p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: accentColor }}>{card === 1 ? td('IQD 12,500') : td('IQD 9,000')}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Snowfall */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>❄️ {td('Seasonal Snowfall')}</CardTitle>
              <p className="text-sm text-slate-500 mt-1">{td('Animated snowfall on the guest menu during winter.')}</p>
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
                <Label className="text-xs text-slate-500">{td('Start (MM-DD)')}</Label>
                <Input value={snowfallStart} onChange={(e) => setSnowfallStart(e.target.value)} placeholder="12-15" className="h-8 w-24 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-slate-500">{td('End (MM-DD)')}</Label>
                <Input value={snowfallEnd} onChange={(e) => setSnowfallEnd(e.target.value)} placeholder="01-07" className="h-8 w-24 text-xs" />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="border-red-200 bg-red-50/40">
        <CardHeader>
          <CardTitle className="text-red-700">{td('Demo account reset')}</CardTitle>
          <p className="text-sm text-red-600">
            {td('This clears menu items, categories, sales, expenses, inventory, tables, branches, employees, featured sections, and Restaurant DNA setup for this restaurant. It does not touch the global UI translations.')}
          </p>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setResetDialogOpen(true)}
          >
            {td('Reset demo account')}
          </Button>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="sticky bottom-6 z-10">
        <Button onClick={saveTheme} disabled={savingTheme}
          className="w-full h-12 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white rounded-xl shadow-lg shadow-slate-900/10 text-base font-semibold"
        >
          {savingTheme ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Check className="h-5 w-5 mr-2" />}
          {i18n.settings_save_button}
        </Button>
      </div>

      {/* Theme Suggest Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{td('Reset demo account?')}</DialogTitle>
            <DialogDescription>
              {td('This will delete this restaurant’s menu items, categories, sales, expenses, inventory, tables, branches, employees, featured sections, and related demo data. Restaurant DNA onboarding will appear again after reload. UI translations will not be reset.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={resettingDemoAccount}
            >
              {i18n.common_cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={resetDemoAccount}
              disabled={resettingDemoAccount}
            >
              {resettingDemoAccount ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {td('Yes, reset everything')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Theme Suggest Dialog */}
      <Dialog open={themeSuggestDialogOpen} onOpenChange={setThemeSuggestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dishPhotoDialogCopy.title}</DialogTitle>
            <DialogDescription>{dishPhotoDialogCopy.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <textarea value={themeSuggestPrompt} onChange={(e) => setThemeSuggestPrompt(e.target.value)} placeholder={dishPhotoDialogCopy.placeholder} className="min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" rows={3} />
            {themeSuggestItemCount !== null && (
              <p className="text-sm text-slate-600"><strong>{themeSuggestItemCount}</strong> {themeSuggestItemCount !== 1 ? dishPhotoDialogCopy.manyPhotos : dishPhotoDialogCopy.onePhoto}</p>
            )}
            {themeSuggestItemCount !== null && themeSuggestItemCount > 0 && (
              <p className="text-xs text-slate-500">{dishPhotoDialogCopy.slow}</p>
            )}
            <div>
              <Button type="button" variant="outline" size="sm" disabled={themePreviewLoading || !!themeSuggestApplyProgress} onClick={generateThemePreview}>
                {themePreviewLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{dishPhotoDialogCopy.generate}
              </Button>
              {themePreviewImageUrl && (
                <div className="mt-3 rounded-lg border overflow-hidden">
                  <img src={themePreviewImageUrl} alt="Preview" className="w-full aspect-video object-cover" />
                </div>
              )}
            </div>
            {themeSuggestApplyProgress && (
              <div className="space-y-1">
                <p className="text-sm text-slate-600">{dishPhotoDialogCopy.updating} {themeSuggestApplyProgress.done}/{themeSuggestApplyProgress.total}…</p>
                <p className="text-xs text-slate-500">
                  {getEtaLabel(themeSuggestApplyProgress.done, themeSuggestApplyProgress.total, themeSuggestApplyStartedAt) || dishPhotoDialogCopy.preparing}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThemeSuggestDialogOpen(false)} disabled={!!themeSuggestApplyProgress}>{dishPhotoDialogCopy.skip}</Button>
            <Button onClick={applyThemeBackground} disabled={themeSuggestApplying}>
              {themeSuggestApplying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {themeSuggestApplyProgress ? `${dishPhotoDialogCopy.updating} ${themeSuggestApplyProgress.done}/${themeSuggestApplyProgress.total}…` : dishPhotoDialogCopy.verify}
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
              <div className="p-2 bg-amber-50 rounded-lg">
                <Star className="h-5 w-5 text-amber-600 fill-current" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{i18n.settings_smart_designer}</h3>
                <p className="text-xs text-white/70">AI design assistant</p>
              </div>
              <button onClick={() => setDesignerOpen(false)} className="text-white/70 hover:text-white text-xl px-2">✕</button>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {designerMessages.length === 0 && (
                <div className="text-center py-8">
                  <Star className="w-10 h-10 mx-auto text-amber-400 mb-3 fill-current" />
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
