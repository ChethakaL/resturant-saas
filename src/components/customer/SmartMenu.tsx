'use client'

import { useMemo, useState, useEffect, useCallback, useRef, useReducer } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatCurrency, formatMenuPrice, formatMenuPriceWithVariant } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Flame, Leaf, X, Loader2, Globe, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { MenuCarousel } from './MenuCarousel'
import { MenuItemCard } from './MenuItemCard'
import { MoodSelector } from './MoodSelector'
import { CartDrawer } from './CartDrawer'
import { SequentialUpsell } from './SequentialUpsell'
import { BundledUpsell } from './BundledUpsell'
import { BundleCarousel } from './BundleCarousel'
import { CheckoutNudge } from './CheckoutNudge'
import { IdleUpsellPopup } from './IdleUpsellPopup'
import { getStoredLastOrder, setStoredLastOrder, getOrCreateGuestId } from './MenuPersonalizationWrapper'
import { getAllVariants, getVariant } from '@/lib/experiments'
import { logMenuEvent } from '@/lib/menu-events'
import type { ItemDisplayHints, BundleHint, MoodOption, UpsellSuggestion } from '@/types/menu-engine'

interface MenuItem {
  id: string
  name: string
  description?: string | null
  price: number
  imageUrl?: string | null
  calories?: number | null
  tags?: string[]
  popularityScore?: number
  chefPickOrder?: number | null
  protein?: number | null
  carbs?: number | null
  category?: { name: string | null; id: string } | null
  updatedAt: string
  addOns?: Array<{
    id: string
    name: string
    price: number
    description?: string | null
  }>
  _hints?: ItemDisplayHints
}

interface ShowcaseSection {
  id: string
  title: string
  type?: 'CHEFS_HIGHLIGHTS' | 'RECOMMENDATIONS'
  /** 'hero' = full-width image carousel; 'cards' = sliding cards row */
  displayVariant?: 'hero' | 'cards'
  position: string
  insertAfterCategoryId: string | null
  items: MenuItem[]
}

interface CategorySection {
  id: string
  name: string
  displayOrder: number
}

interface MenuTheme {
  primaryColor?: string
  accentColor?: string
  backgroundStyle?: 'dark' | 'light' | 'gradient'
  fontFamily?: 'sans' | 'serif' | 'display'
  logoUrl?: string | null
  backgroundImageUrl?: string | null
  menuCarouselStyle?: string
}

interface SmartMenuProps {
  restaurantId: string
  menuItems: MenuItem[]
  showcases?: ShowcaseSection[]
  categories?: CategorySection[]
  theme?: MenuTheme | null
  restaurantName?: string
  restaurantLogo?: string | null
  engineMode?: 'classic' | 'profit' | 'adaptive'
  bundles?: BundleHint[]
  moods?: MoodOption[]
  upsellMap?: Record<string, UpsellSuggestion[]>
  categoryOrder?: string[]
  tableSize?: number
  /** When menu is opened from a table (e.g. QR code), pass table number so the order is assigned to that table. */
  tableNumber?: string
  /** Tables available for guest to select (e.g. for order assignment). */
  tables?: { id: string; number: string }[]
  categoryAnchorBundle?: Record<string, BundleHint>
  maxInitialItemsPerCategory?: number
  forceShowImages?: boolean
}

type LanguageCode = 'en' | 'ar' | 'ar_fusha' | 'ku'

interface MenuItemTranslation {
  name: string
  description: string
  aiDescription: string
  protein?: number | null
  carbs?: number | null
}

type TranslationCache = Partial<Record<LanguageCode, Record<string, MenuItemTranslation>>>

const languageOptions: { value: LanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ku', label: 'كوردي' },
  { value: 'ar_fusha', label: 'Arabic' },
]

const sortOptions: {
  value:
  | 'popular'
  | 'price-low'
  | 'price-high'
  | 'protein-high'
  | 'carbs-high'
  | 'protein-low'
  | 'carbs-low'
  | 'calories-low'
  label: string
}[] = [
    { value: 'popular', label: 'Most Popular' },
    { value: 'price-low', label: 'Price: Low → High' },
    { value: 'price-high', label: 'Price: High → Low' },
    { value: 'protein-high', label: 'Protein: High → Low' },
    { value: 'carbs-high', label: 'Carbs: High → Low' },
    { value: 'protein-low', label: 'Protein: Low → High' },
    { value: 'carbs-low', label: 'Carbs: Low → High' },
    { value: 'calories-low', label: 'Calories: Low → High' },
  ]

const tagTranslations: Record<string, Partial<Record<LanguageCode, string>>> = {
  spicy: { ar: 'حار', ku: 'تێز' },
  'non-vegetarian': { ar: 'غير نباتي', ku: 'نەخۆشی' },
  'high-protein': { ar: 'عالي البروتين', ku: 'پڕۆتینی زۆر' },
  'gluten-free-optional': { ar: 'خالٍ من الغلوتين (اختياري)', ku: 'بێ گلووتین (هەڵبژاردە)' },
  halal: { ar: 'حلال', ku: 'حەلال' },
  vegetarian: { ar: 'نباتي', ku: 'نباتی' },
  vegan: { ar: 'نباتي بالكامل', ku: 'هەموو تێ‌مەند' },
  chicken: { ar: 'دجاج', ku: 'مرغ' },
  wrap: { ar: 'لفافة', ku: 'لەپەک' },
}

const categoryTranslations: Record<string, Partial<Record<LanguageCode, string>>> = {
  'main dishes': { ar: 'الأطباق الرئيسية', ku: 'سەربەخۆیەکان' },
  grills: { ar: 'مشاوي', ku: 'گریلەکان' },
  appetizers: { ar: 'مقبلات', ku: 'پێوەچوون' },
  'signature dishes': { ar: 'أطباقنا المميزة', ku: 'خواردنە تایبەتەکان' },
  'signature dish': { ar: 'أطباقنا المميزة', ku: 'خواردنە تایبەتەکان' },
  shareables: { ar: 'أطباق للمشاركة', ku: 'خواردنی هاوبەش' },
  shareable: { ar: 'أطباق للمشاركة', ku: 'خواردنی هاوبەش' },
  'popular combos': { ar: 'تركيبات شائعة', ku: 'کۆمەڵە باوەکان' },
  drinks: { ar: 'المشروبات', ku: 'خواردنەوەکان' },
  beverages: { ar: 'المشروبات', ku: 'خواردنەوەکان' },
  desserts: { ar: 'الحلويات', ku: 'شیرینەکان' },
  sides: { ar: 'الأطباق الجانبية', ku: 'لایەنەکان' },
  soups: { ar: 'الشوربات', ku: 'شۆربەکان' },
  salads: { ar: 'السلطات', ku: 'سەلاطەکان' },
  'light meal': { ar: 'وجبة خفيفة', ku: 'نانی سووک' },
  filling: { ar: 'مشبع', ku: 'پڕ' },
  'for sharing': { ar: 'للمشاركة', ku: 'بۆ هاوبەشکردن' },
  featured: { ar: 'مميز', ku: 'تایبەت' },
}

const addOnTranslations: Record<string, Partial<Record<LanguageCode, string>>> = {
  'extra sauce': { ar: 'صلصة إضافية', ku: 'سوسە زیادە' },
  cheese: { ar: 'جبنة', ku: 'پنیەر' },
  bread: { ar: 'خبز', ku: 'نان' },
  'mixed greens': { ar: 'خضار مشكلة', ku: 'سەوزی تێکەوت' },
}

const uiCopyMap: Record<
  LanguageCode,
  {
    searchPlaceholder: string
    filtersLabel: string
    whatGoesWithThis: string
    noItemsMessage: string
    languageLabel: string
    costLabel: string
    proteinLabel: string
    carbsLabel: string
    addOnsLabel: string
    viewDetails: string
    detailTitle: string
    pairingTitle: string
    pairingDescription: string
    pairingAnalyzing: string
    pairingNoSuggestions: string
    loadingLabel: string
    smartSearchLabel: string
    smartSearchPrompt: string
    smartSearchDescription: string
    smartSearchInputPlaceholder: string
    smartSearchFilters: string
    smartSearchClear: string
    resultsHeadingPrefix: string
    resultsSummarySingular: string
    resultsSummaryPlural: string
    noMatchesTitle: string
    noMatchesDescription: string
    lastTimeYouOrdered: string
    orderAgain: string
    tryItemLabel: string
    suggestingLabel: string
    chefRecommendationLabel: string
  }
> = {
  en: {
    searchPlaceholder: 'Explore',
    filtersLabel: 'Active filters:',
    whatGoesWithThis: 'What goes well with this?',
    noItemsMessage: 'No items match your filters',
    languageLabel: 'Display language',
    costLabel: 'Price',
    proteinLabel: 'Protein',
    carbsLabel: 'Carbs',
    addOnsLabel: 'Available add-ons',
    viewDetails: 'See the full AI description',
    detailTitle: 'Chef insights',
    pairingTitle: 'Perfect pairings for',
    pairingDescription:
      'AI-powered recommendations based on flavor profiles and popular combinations',
    pairingAnalyzing: 'Analyzing flavor profiles...',
    pairingNoSuggestions: 'No suggestions available at the moment.',
    loadingLabel: 'Loading...',
    smartSearchLabel: 'Smart Search',
    smartSearchPrompt: 'Tell us what you crave',
    smartSearchDescription:
      'Use dishes, ingredients, or vibes and we will surface matching cards for you.',
    smartSearchInputPlaceholder: 'Search by ingredient, flavor, or mood...',
    smartSearchFilters: 'Discover',
    smartSearchClear: 'Clear',
    resultsHeadingPrefix: 'Results for',
    resultsSummarySingular: 'We found {count} menu item inspired by "{query}".',
    resultsSummaryPlural: 'We found {count} menu items inspired by "{query}".',
    noMatchesTitle: 'No matches yet.',
    noMatchesDescription: 'Try a different prompt or broaden the search.',
    lastTimeYouOrdered: 'Last time you ordered',
    orderAgain: 'Order again',
    tryItemLabel: 'Try',
    suggestingLabel: 'Suggesting…',
    chefRecommendationLabel: "Chef's recommendation",
  },
  ar: {
    searchPlaceholder: 'ابحث عن الأطباق…',
    filtersLabel: 'الفلاتر النشطة:',
    whatGoesWithThis: 'ما الذي ينسجم مع هذا؟',
    noItemsMessage: 'لا توجد أطباق تطابق الفلاتر',
    languageLabel: 'اللغة',
    costLabel: 'التكلفة',
    proteinLabel: 'بروتين',
    carbsLabel: 'كربوهيدرات',
    addOnsLabel: 'الإضافات المتاحة',
    viewDetails: 'عرض الوصف الكامل من الذكاء الاصطناعي',
    detailTitle: 'لمحات الشيف',
    pairingTitle: 'مقترحات مثالية لـ',
    pairingDescription:
      'توصيات مدعومة بالذكاء الاصطناعي بناءً على نكهات وتركيبات شهيرة',
    pairingAnalyzing: 'يتم تحليل نكهات الطعام...',
    pairingNoSuggestions: 'لا توجد اقتراحات حالياً.',
    loadingLabel: 'جارٍ التحميل...',
    smartSearchLabel: 'البحث الذكي',
    smartSearchPrompt: 'قل لنا ما تهتم به',
    smartSearchDescription:
      'استخدم اسم طبق، مكوّن أو شعور وسنُظهر خيارات متناسبة.',
    smartSearchInputPlaceholder: 'ابحث عن مكوّن، نكهة أو مزاج...',
    smartSearchFilters: 'اكتشف',
    smartSearchClear: 'مسح',
    resultsHeadingPrefix: 'النتائج لـ',
    resultsSummarySingular: 'وجدنا {count} طبقًا مستوحى من "{query}".',
    resultsSummaryPlural: 'وجدنا {count} أطباقًا مستوحاة من "{query}".',
    noMatchesTitle: 'لا توجد نتائج حتى الآن.',
    noMatchesDescription: 'حاول عبارة مختلفة أو وسّع نطاق البحث.',
    lastTimeYouOrdered: 'آخر ما طلبته',
    orderAgain: 'اطلب مرة أخرى',
    tryItemLabel: 'جرّب',
    suggestingLabel: 'جاري الاقتراح…',
    chefRecommendationLabel: 'توصية الشيف',
  },
  ar_fusha: {
    searchPlaceholder: 'ابحث عن الأطباق…',
    filtersLabel: 'الفلاتر النشطة:',
    whatGoesWithThis: 'ما الذي ينسجم مع هذا؟',
    noItemsMessage: 'لا توجد أطباق تطابق الفلاتر',
    languageLabel: 'اللغة',
    costLabel: 'التكلفة',
    proteinLabel: 'البروتين',
    carbsLabel: 'الكربوهيدرات',
    addOnsLabel: 'الإضافات المتاحة',
    viewDetails: 'عرض الوصف الكامل',
    detailTitle: 'لمحات الشيف',
    pairingTitle: 'مقترحات مثالية لـ',
    pairingDescription:
      'توصيات مدعومة بالذكاء الاصطناعي بناءً على نكهات وتركيبات شهيرة',
    pairingAnalyzing: 'يتم تحليل نكهات الطعام...',
    pairingNoSuggestions: 'لا توجد اقتراحات حالياً.',
    loadingLabel: 'جارٍ التحميل...',
    smartSearchLabel: 'البحث الذكي',
    smartSearchPrompt: 'قل لنا ما تهتم به',
    smartSearchDescription:
      'استخدم اسم طبق، مكوّن أو شعور وسنُظهر خيارات متناسبة.',
    smartSearchInputPlaceholder: 'ابحث عن مكوّن، نكهة أو مزاج...',
    smartSearchFilters: 'اكتشف',
    smartSearchClear: 'مسح',
    resultsHeadingPrefix: 'النتائج لـ',
    resultsSummarySingular: 'وجدنا {count} طبقًا مستوحى من "{query}".',
    resultsSummaryPlural: 'وجدنا {count} أطباقًا مستوحاة من "{query}".',
    noMatchesTitle: 'لا توجد نتائج حتى الآن.',
    noMatchesDescription: 'حاول عبارة مختلفة أو وسّع نطاق البحث.',
    lastTimeYouOrdered: 'آخر ما طلبته',
    orderAgain: 'اطلب مرة أخرى',
    tryItemLabel: 'جرّب',
    suggestingLabel: 'جاري الاقتراح…',
    chefRecommendationLabel: 'توصية الشيف',
  },
  ku: {
    searchPlaceholder: 'ئێستا خواردنەکان بگەڕە…',
    filtersLabel: 'فلتەری کارکردن:',
    whatGoesWithThis: 'چی دواخوازە لەگەڵ ئەمە؟',
    noItemsMessage: 'هیچ تیا ناهێن دەگەڕێتەوە',
    languageLabel: 'زمان',
    costLabel: 'نرخی بەرهەم',
    proteinLabel: 'پڕۆتین',
    carbsLabel: 'کاربوهایدرات',
    addOnsLabel: 'زیادکاریەکان',
    viewDetails: 'وەسفی تەواوی AI ببینە',
    detailTitle: 'هەڵەکانی خواردن',
    pairingTitle: 'هاوپەیوەندییە باشەکان بۆ',
    pairingDescription:
      'پێشنیارەکانی AI لەسەر هەماهنگی تەمەنی و خواردنە گونجاوەکان',
    pairingAnalyzing: 'پەیوەندی تەمەنی دەچێتەوە...',
    pairingNoSuggestions: 'هێشتا پێشنیارێک نییە.',
    loadingLabel: 'ئامادە دەبێت...',
    smartSearchLabel: 'گەڕینی زیرەک',
    smartSearchPrompt: 'بەڵگەکەت بڵێ چی دەتەوێت',
    smartSearchDescription:
      'بەکارهێنانی خۆراک، ماددە یان هەست بۆ نیشاندانی کارتێکی گونجاو.',
    smartSearchInputPlaceholder: 'بگەڕێ بە ماددە، چێشت یان مەزە...',
    smartSearchFilters: 'دۆزینەوە',
    smartSearchClear: 'سڕینەوە',
    resultsHeadingPrefix: 'ئەنجامەکان بۆ',
    resultsSummarySingular: 'دۆزرا {count} خواردن بە پێی "{query}".',
    resultsSummaryPlural: 'دۆزرا {count} خواردنە گونجاوەکان بە "{query}".',
    noMatchesTitle: 'هێشتا هیچ ئەنجامێک نییە.',
    noMatchesDescription: 'وشەیەکی دیاری بکە یان گەڕانەکە زۆرتر بکە.',
    lastTimeYouOrdered: 'دوایین جار کە داواکاریت کرد',
    orderAgain: 'دووبارە داوا بکە',
    tryItemLabel: 'تاقی بکەرەوە',
    suggestingLabel: 'پێشنیار دەکرێت…',
    chefRecommendationLabel: 'پێشنیاری چێشتلێنەر',
  },
}

const engineCopyMap: Record<
  LanguageCode,
  {
    showAll: string
    viewOrder: string
    placeOrder: string
    cartTitle: string
    addLabel: string
    skipLabel: string
    addBundleLabel: string
    bundlesTitle: string
    saveLabel: string
    checkoutNudgeBeverage: string
    checkoutNudgeDessert: string
    addToOrder: string
    dismissLabel: string
    idleMessage: string
    jumpToSection: string
    signatureBadge: string
    mostLovedBadge: string
    chefSelectionBadge: string
  }
> = {
  en: {
    showAll: 'Show all',
    viewOrder: 'View order',
    placeOrder: 'Place order',
    cartTitle: 'Your order',
    addLabel: 'Add',
    skipLabel: 'Skip',
    addBundleLabel: 'Add bundle',
    bundlesTitle: 'Popular combos',
    saveLabel: 'Save',
    checkoutNudgeBeverage: 'Most guests complete with a refreshing drink.',
    checkoutNudgeDessert: 'End your meal on a sweet note?',
    addToOrder: 'Add to order',
    dismissLabel: 'No thanks',
    idleMessage: 'Looking for something? Try our',
    jumpToSection: 'Jump to',
    signatureBadge: '★ SIGNATURE',
    mostLovedBadge: '★ MOST LOVED',
    chefSelectionBadge: "💎 CHEF'S SELECTION",
  },
  ar: {
    showAll: 'عرض الكل',
    viewOrder: 'عرض الطلب',
    placeOrder: 'تأكيد الطلب',
    cartTitle: 'طلبك',
    addLabel: 'إضافة',
    skipLabel: 'تخطي',
    addBundleLabel: 'إضافة المجموعة',
    bundlesTitle: 'تركيبات شائعة',
    saveLabel: 'وفر',
    checkoutNudgeBeverage: 'معظم الضيوف يكمّلون مع مشروب منعش.',
    checkoutNudgeDessert: 'اختم وجبتك بحلوى؟',
    addToOrder: 'إضافة للطلب',
    dismissLabel: 'لا شكراً',
    idleMessage: 'تبحث عن شيء؟ جرّب',
    jumpToSection: 'انتقل إلى',
    signatureBadge: '★ مميز',
    mostLovedBadge: '★ الأكثر حباً',
    chefSelectionBadge: '💎 اختيار الشيف',
  },
  ar_fusha: {
    showAll: 'عرض الكل',
    viewOrder: 'عرض الطلب',
    placeOrder: 'تأكيد الطلب',
    cartTitle: 'طلبك',
    addLabel: 'إضافة',
    skipLabel: 'تخطي',
    addBundleLabel: 'إضافة المجموعة',
    bundlesTitle: 'تركيبات شائعة',
    saveLabel: 'وفر',
    checkoutNudgeBeverage: 'معظم الضيوف يكملون مع مشروب منعش.',
    checkoutNudgeDessert: 'اختم وجبتك بحلوى؟',
    addToOrder: 'إضافة إلى الطلب',
    dismissLabel: 'لا شكراً',
    idleMessage: 'تبحث عن شيء؟ جرّب',
    jumpToSection: 'انتقل إلى',
    signatureBadge: '★ مميز',
    mostLovedBadge: '★ الأكثر حباً',
    chefSelectionBadge: '💎 اختيار الشيف',
  },
  ku: {
    showAll: 'هەموویان',
    viewOrder: 'بینینی داواکاری',
    placeOrder: 'داواکاری بدە',
    cartTitle: 'داواکاریی تۆ',
    addLabel: 'زیاد بکە',
    skipLabel: 'تێپەڕە',
    addBundleLabel: 'کۆمەڵە زیاد بکە',
    bundlesTitle: 'کۆمەڵە باوەکان',
    saveLabel: 'پاشەکەوت',
    checkoutNudgeBeverage: 'زۆربەی میوانەکان لەگەڵ خواردنەوەیەک تەواو دەکەن.',
    checkoutNudgeDessert: 'نانی خواردنت بە شیرینێک تەواو بکە؟',
    addToOrder: 'زیاد بکە بۆ داواکاری',
    dismissLabel: 'نەخێر',
    idleMessage: 'شتیک دەگەڕیت؟ تاقی',
    jumpToSection: 'بڕو بۆ',
    signatureBadge: '★ تایبەت',
    mostLovedBadge: '★ خۆشەویستترین',
    chefSelectionBadge: '💎 هەڵبژاردنی چێشتلێنەر',
  },
}

const SMART_SEARCH_STOP_WORDS = new Set(['or', 'and'])

const formatTemplate = (
  template: string,
  values: Record<string, string>
): string => {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }, template)
}

type CartLine = { menuItemId: string; name: string; price: number; quantity: number }
type CartAction =
  | { type: 'ADD_ITEM'; item: MenuItem; quantity?: number }
  | { type: 'REMOVE_ITEM'; menuItemId: string }
  | { type: 'UPDATE_QUANTITY'; menuItemId: string; delta: number }
  | { type: 'ADD_BUNDLE'; itemIds: string[]; items: MenuItem[]; bundlePrice: number }
  | { type: 'CLEAR' }

function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'ADD_ITEM': {
      const q = action.quantity ?? 1
      const existing = state.find((l) => l.menuItemId === action.item.id)
      if (existing) {
        return state.map((l) =>
          l.menuItemId === action.item.id ? { ...l, quantity: l.quantity + q } : l
        )
      }
      return [...state, { menuItemId: action.item.id, name: action.item.name, price: action.item.price, quantity: q }]
    }
    case 'REMOVE_ITEM':
      return state.filter((l) => l.menuItemId !== action.menuItemId)
    case 'UPDATE_QUANTITY': {
      const line = state.find((l) => l.menuItemId === action.menuItemId)
      if (!line) return state
      const next = line.quantity + action.delta
      if (next <= 0) return state.filter((l) => l.menuItemId !== action.menuItemId)
      return state.map((l) =>
        l.menuItemId === action.menuItemId ? { ...l, quantity: next } : l
      )
    }
    case 'ADD_BUNDLE': {
      const byId = new Map(action.items.map((i) => [i.id, i]))
      const newLines: CartLine[] = []
      for (const id of action.itemIds) {
        const item = byId.get(id)
        if (item) newLines.push({ menuItemId: item.id, name: item.name, price: item.price, quantity: 1 })
      }
      return [...state, ...newLines]
    }
    case 'CLEAR':
      return []
    default:
      return state
  }
}

/** Sign in / My visits next to cart. Renders same on server and first client to avoid hydration mismatch, then session-aware after mount. */
function CustomerSignInControl({ isDarkBg }: { isDarkBg: boolean }) {
  const [mounted, setMounted] = useState(false)
  const { data: session } = useSession()
  const pathname = usePathname()
  const callbackUrl = pathname || '/'
  useEffect(() => setMounted(true), [])

  const btnClass = isDarkBg
    ? 'text-white hover:bg-white/10 hover:text-white'
    : 'text-slate-700 hover:bg-slate-200 hover:text-slate-700'

  if (!mounted) {
    return (
      <Link href={`/customer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
        <Button variant="ghost" size="sm" className={`h-9 px-2.5 sm:px-3 text-xs sm:text-sm shrink-0 ${btnClass}`}>
          Sign in
        </Button>
      </Link>
    )
  }
  if (session?.user?.type === 'customer') {
    return (
      <>
        <Link href="/customer/me">
          <Button variant="ghost" size="sm" className={`h-9 px-2.5 sm:px-3 text-xs sm:text-sm shrink-0 ${btnClass}`}>
            <span className="hidden sm:inline">My visits</span>
            <span className="sm:hidden">Visits</span>
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className={`h-9 px-2 sm:px-2.5 text-xs shrink-0 ${btnClass}`}
          onClick={() => signOut({ callbackUrl })}
        >
          Sign out
        </Button>
      </>
    )
  }
  return (
    <Link href={`/customer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
      <Button variant="ghost" size="sm" className={`h-9 px-2.5 sm:px-3 text-xs sm:text-sm shrink-0 ${btnClass}`}>
        Sign in
      </Button>
    </Link>
  )
}

export default function SmartMenu({
  restaurantId,
  menuItems,
  showcases,
  categories: categoriesProp,
  theme,
  restaurantName,
  restaurantLogo,
  engineMode = 'classic',
  bundles = [],
  moods = [],
  upsellMap = {},
  categoryOrder,
  tableSize,
  tableNumber,
  tables = [],
  categoryAnchorBundle = {},
  maxInitialItemsPerCategory = 3,
  forceShowImages = false,
}: SmartMenuProps) {
  // Safety check for menuItems
  if (!menuItems || !Array.isArray(menuItems)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <p className="text-white/70">Loading menu...</p>
      </div>
    )
  }

  const [selectedTableNumber, setSelectedTableNumber] = useState<string | null>(tableNumber ?? null)
  const [search, setSearch] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const searchOverlayInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<
    | 'popular'
    | 'price-low'
    | 'price-high'
    | 'protein-high'
    | 'carbs-high'
    | 'protein-low'
    | 'carbs-low'
    | 'calories-low'
  >('popular')
  const [showPairingSuggestions, setShowPairingSuggestions] = useState(false)
  const [selectedItemForPairing, setSelectedItemForPairing] =
    useState<MenuItem | null>(null)
  const [pairingSuggestions, setPairingSuggestions] = useState<MenuItem[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [language, setLanguage] = useState<LanguageCode>('en')
  const [translationCache, setTranslationCache] = useState<TranslationCache>({})
  const translationCacheRef = useRef<TranslationCache>({})
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationError, setTranslationError] = useState<string | null>(null)
  const [translatedCount, setTranslatedCount] = useState<Record<LanguageCode, number>>({
    en: 0,
    ar: 0,
    ar_fusha: 0,
    ku: 0,
  })
  const [selectedItemForDetail, setSelectedItemForDetail] =
    useState<MenuItem | null>(null)
  const { toast } = useToast()
  const isDetailOpen = Boolean(selectedItemForDetail)
  const [cart, dispatchCart] = useReducer(cartReducer, [])
  const [selectedMoodId, setSelectedMoodId] = useState<string | null>(null)
  const [upsellAfterAdd, setUpsellAfterAdd] = useState<{ itemId: string } | null>(null)
  const [upsellIndex, setUpsellIndex] = useState(0)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [idleUpsellDismissed, setIdleUpsellDismissed] = useState(false)
  const [lastOrder, setLastOrder] = useState<{ itemIds: string[]; names: string[] } | null>(null)
  const [nextOrderSuggestion, setNextOrderSuggestion] = useState<{ itemId: string; name: string; message: string } | null>(null)
  const [nextOrderSuggestionLoading, setNextOrderSuggestionLoading] = useState(false)
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set())
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [scrollDepth, setScrollDepth] = useState(0)
  const hideImages = !forceShowImages && getVariant('photo_visibility') === 'hide'
  const setSectionRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(id, el)
    else sectionRefs.current.delete(id)
  }, [])

  useEffect(() => {
    setLastOrder(getStoredLastOrder(restaurantId))
  }, [restaurantId])

  useEffect(() => {
    if (!lastOrder?.itemIds?.length) {
      setNextOrderSuggestion(null)
      return
    }
    const uniqueIds = Array.from(new Set(lastOrder.itemIds))
    setNextOrderSuggestionLoading(true)
    setNextOrderSuggestion(null)
    fetch('/api/public/menu/suggest-next-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, lastOrderItemIds: uniqueIds }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.suggestedItemId && data.suggestedItemName && data.message) {
          setNextOrderSuggestion({
            itemId: data.suggestedItemId,
            name: data.suggestedItemName,
            message: data.message,
          })
        }
      })
      .catch(() => setNextOrderSuggestion(null))
      .finally(() => setNextOrderSuggestionLoading(false))
  }, [restaurantId, lastOrder?.itemIds?.join(',')])

  useEffect(() => {
    logMenuEvent(restaurantId, 'menu_view', {}, getOrCreateGuestId(restaurantId), JSON.stringify(getAllVariants()))
  }, [restaurantId])

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const scrollTop = doc.scrollTop || window.scrollY
      const scrollHeight = doc.scrollHeight - doc.clientHeight
      const depth = scrollHeight > 0 ? Math.min(1, scrollTop / scrollHeight) : 1
      setScrollDepth(depth)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToSection = useCallback((categoryId: string) => {
    sectionRefs.current.get(categoryId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const trimmedSearch = search.trim()
  const searchTokens = useMemo(() => {
    if (!trimmedSearch) {
      return []
    }
    return trimmedSearch
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !SMART_SEARCH_STOP_WORDS.has(token))
  }, [trimmedSearch])
  const isSmartSearchActive = isSearchFocused || trimmedSearch.length > 0
  const closeSmartSearch = () => {
    setSearch('')
    setIsSearchFocused(false)
  }

  const fetchTranslations = useCallback(
    async (lang: LanguageCode) => {
      if (menuItems.length === 0) {
        return
      }

      const existingCache = translationCacheRef.current[lang]
      if (
        existingCache &&
        Object.keys(existingCache).length === menuItems.length &&
        menuItems.every((item) => Boolean(existingCache[item.id]))
      ) {
        return
      }

      const baseMap = menuItems.reduce<Record<string, MenuItemTranslation>>(
        (acc, item) => {
          acc[item.id] = {
            name: item.name,
            description: item.description || '',
            aiDescription: item.description || '',
            protein: item.protein ?? null,
            carbs: item.carbs ?? null,
          }
          return acc
        },
        {}
      )

      const updateCache = (map: Record<string, MenuItemTranslation>) => {
        setTranslationCache((prev) => {
          const next: TranslationCache = {
            ...prev,
            [lang]: map,
          }
          translationCacheRef.current = next
          return next
        })
      }

      if (lang === 'en') {
        updateCache(baseMap)
        setTranslatedCount((prev) => ({
          ...prev,
          [lang]: menuItems.length,
        }))
        return
      }

      setIsTranslating(true)
      setTranslationError(null)
      setTranslatedCount((prev) => ({
        ...prev,
        [lang]: 0,
      }))

      if (!existingCache) {
        updateCache(baseMap)
      }

      try {
        const payloadItems = menuItems.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description || '',
          calories: item.calories ?? null,
          protein: item.protein ?? null,
          carbs: item.carbs ?? null,
          category: item.category?.name || 'Chef specials',
          price: item.price,
          updatedAt: item.updatedAt,
        }))

        const response = await fetch('/api/public/menu/translate-items', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            language: lang,
            items: payloadItems,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || 'Translation service failed')
        }

        if (!Array.isArray(data.items)) {
          throw new Error('Translation payload malformed')
        }

        const translatedMap = (data.items as any[]).reduce(
          (acc: Record<string, MenuItemTranslation>, translated: any) => {
            acc[translated.id] = {
              name: translated.name,
              description: translated.description,
              aiDescription:
                translated.aiDescription ||
                translated.description ||
                '',
              protein:
                typeof translated.protein === 'number'
                  ? translated.protein
                  : null,
              carbs:
                typeof translated.carbs === 'number'
                  ? translated.carbs
                  : null,
            }
            return acc
          }, {})

        updateCache(translatedMap)
        setTranslatedCount((prev) => ({
          ...prev,
          [lang]: menuItems.length,
        }))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Translation service failed'
        setTranslationError(message)
        toast({
          title: 'Translation could not complete',
          description: message,
          variant: 'destructive',
        })
      } finally {
        setIsTranslating(false)
      }
    },
    [menuItems, toast]
  )

  // Load English immediately (no API call). Load ar/ku only when user switches language to avoid slow initial load.
  useEffect(() => {
    fetchTranslations('en')
  }, [fetchTranslations])

  useEffect(() => {
    fetchTranslations(language)
  }, [language, fetchTranslations])

  useEffect(() => {
    if (isSmartSearchActive && searchOverlayInputRef.current) {
      searchOverlayInputRef.current.focus({ preventScroll: true })
    }
  }, [isSmartSearchActive])

  const currentCopy = uiCopyMap[language]
  const currentEngineCopy = engineCopyMap[language]
  const currentLanguageLabel =
    languageOptions.find((option) => option.value === language)?.label || ''
  const buildMacroSegments = (
    item: MenuItem,
    translation?: MenuItemTranslation
  ) => {
    const segments: string[] = []
    if (item.calories) {
      segments.push(`${item.calories} cal`)
    }

    const protein =
      translation?.protein != null
        ? translation.protein
        : item.protein ?? null
    if (protein != null) {
      segments.push(`${Math.round(protein)}g ${currentCopy.proteinLabel}`)
    }

    const carbs =
      translation?.carbs != null ? translation.carbs : item.carbs ?? null
    if (carbs != null) {
      segments.push(`${Math.round(carbs)}g ${currentCopy.carbsLabel}`)
    }

    return segments
  }

  // Extract unique categories
  const categories = useMemo(() => {
    const uniqueCategories = new Map<string, { id: string; name: string }>()
    menuItems.forEach((item) => {
      if (item.category && item.category.id && item.category.name) {
        uniqueCategories.set(item.category.id, {
          id: item.category.id,
          name: item.category.name,
        })
      }
    })
    return Array.from(uniqueCategories.values())
  }, [menuItems])

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    menuItems.forEach((item) => {
      item.tags?.forEach((tag) => tags.add(tag))
    })
    return Array.from(tags)
  }, [menuItems])

  // Filter and sort menu items
  const filteredItems = useMemo(() => {
    let items = menuItems

    // Search filter
    if (searchTokens.length > 0) {
      items = items.filter((item) => {
        const translation = translationCache[language]?.[item.id]
        const multiLangTranslations = Object.values(translationCache)
          .map((langMap) => langMap[item.id])
          .filter(Boolean)
          .flatMap((t) => [t.name, t.description, t.aiDescription])

        const haystack = [
          item.name,
          item.description,
          item.category?.name,
          item.tags?.join(' '),
          translation?.name,
          translation?.description,
          translation?.aiDescription,
          ...multiLangTranslations,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return searchTokens.some((token) => haystack.includes(token))
      })
    }

    // Category filter
    if (selectedCategory !== 'all') {
      items = items.filter((item) => item.category?.id === selectedCategory)
    }

    // Tags filter
    if (selectedTags.length > 0) {
      items = items.filter((item) =>
        selectedTags.every((tag) => item.tags?.includes(tag))
      )
    }

    // Mood filter (engine)
    if (selectedMoodId && moods.length > 0) {
      const mood = moods.find((m) => m.id === selectedMoodId)
      if (mood && mood.itemIds.length > 0) {
        const moodIds = new Set(mood.itemIds)
        items = items.filter((item) => moodIds.has(item.id))
      }
    }

    // Sort
    const macroValue = (item: MenuItem, key: 'protein' | 'carbs') => {
      const translation = translationCache[language]?.[item.id]
      const raw =
        key === 'protein'
          ? translation?.protein ?? item.protein ?? 0
          : translation?.carbs ?? item.carbs ?? 0
      return raw ?? 0
    }

    items = [...items].sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return (b.popularityScore || 0) - (a.popularityScore || 0)
        case 'price-low':
          return a.price - b.price
        case 'price-high':
          return b.price - a.price
        case 'protein-high':
          return macroValue(b, 'protein') - macroValue(a, 'protein')
        case 'carbs-high':
          return macroValue(b, 'carbs') - macroValue(a, 'carbs')
        case 'protein-low':
          return macroValue(a, 'protein') - macroValue(b, 'protein')
        case 'carbs-low':
          return macroValue(a, 'carbs') - macroValue(b, 'carbs')
        case 'calories-low':
          return (a.calories || 0) - (b.calories || 0)
        default:
          return 0
      }
    })

    return items
  }, [
    menuItems,
    searchTokens,
    selectedCategory,
    selectedTags,
    selectedMoodId,
    moods,
    sortBy,
    language,
    translationCache,
  ])

  const summaryTemplate =
    filteredItems.length === 1
      ? currentCopy.resultsSummarySingular
      : currentCopy.resultsSummaryPlural
  const smartSearchSummary = trimmedSearch
    ? formatTemplate(summaryTemplate, {
      count: filteredItems.length.toString(),
      query: trimmedSearch,
    })
    : currentCopy.smartSearchDescription


  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const fetchPairingSuggestions = async (item: MenuItem) => {
    setSelectedItemForPairing(item)
    setShowPairingSuggestions(true)
    setLoadingSuggestions(true)
    setPairingSuggestions([])

    try {
      const response = await fetch('/api/public/pairing-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: item.id,
          restaurantId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch suggestions')
      }

      setPairingSuggestions(data.suggestions || [])
    } catch (error) {
      console.error('Error fetching pairing suggestions:', error)
      toast({
        title: 'Pairing failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to load suggestions. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const getTagIcon = (tag: string) => {
    const lowerTag = tag.toLowerCase()
    if (lowerTag.includes('spicy') || lowerTag.includes('hot')) {
      return <Flame className="h-3 w-3" />
    }
    if (
      lowerTag.includes('vegan') ||
      lowerTag.includes('vegetarian') ||
      lowerTag.includes('plant')
    ) {
      return <Leaf className="h-3 w-3" />
    }
    return null
  }

  const getLocalizedTagLabel = (tag: string) => {
    if (language === 'en') return tag
    const normalized = tag.toLowerCase()
    const lang = language === 'ar_fusha' ? 'ar' : language
    return tagTranslations[normalized]?.[lang] || tag
  }

  const getLocalizedCategoryName = (category?: string | null) => {
    if (!category) return 'General'
    if (language === 'en') return category
    const normalized = category.toLowerCase()
    const lang = language === 'ar_fusha' ? 'ar' : language
    return categoryTranslations[normalized]?.[lang] || category
  }

  const getLocalizedSavingsText = (savingsText: string) => {
    if (language === 'en') return savingsText
    const match = savingsText.match(/^Save\s+(.+)$/i)
    if (!match) return savingsText
    const saveLabel = engineCopyMap[language]?.saveLabel ?? 'Save'
    return `${saveLabel} ${match[1]}`
  }

  const getLocalizedAddOnName = (name: string) => {
    if (language === 'en') return name
    const normalized = name.toLowerCase()
    const lang = language === 'ar_fusha' ? 'ar' : language
    return addOnTranslations[normalized]?.[lang] || name
  }

  const pairingItemTranslation = selectedItemForPairing
    ? translationCache[language]?.[selectedItemForPairing.id]
    : undefined
  const pairingItemDisplayName =
    pairingItemTranslation?.name || selectedItemForPairing?.name || ''

  const detailTranslation = selectedItemForDetail
    ? translationCache[language]?.[selectedItemForDetail.id]
    : undefined
  const detailMacroSegments = selectedItemForDetail
    ? buildMacroSegments(selectedItemForDetail, detailTranslation)
    : []
  const detailDescriptionText =
    detailTranslation?.aiDescription ||
    selectedItemForDetail?.description ||
    ''

  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)

  // Theme computation: CSS vars for colors and font pair (display + body)
  const themeStyle = useMemo((): React.CSSProperties => {
    const displayVar =
      theme?.fontFamily === 'serif'
        ? 'var(--font-playfair)'
        : theme?.fontFamily === 'display'
          ? 'var(--font-cormorant)'
          : 'var(--font-dm-sans)'
    return {
      '--menu-primary': theme?.primaryColor || '#10b981',
      '--menu-accent': theme?.accentColor || '#f59e0b',
      '--font-display': displayVar,
      '--font-body': 'var(--font-dm-sans)',
    } as React.CSSProperties
  }, [theme])

  const fontClass = 'font-body'

  const bgClass =
    theme?.backgroundStyle === 'light'
      ? 'bg-slate-100 text-slate-900'
      : theme?.backgroundStyle === 'gradient'
        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white'
        : 'bg-slate-950 text-white'

  const isDarkBg = theme?.backgroundStyle !== 'light'
  const bgImageStyle = theme?.backgroundImageUrl
    ? {
      backgroundImage: `url(${theme.backgroundImageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
    : undefined

  // Tier order for placement: hero=0, featured=1, standard=2, minimal=3 (DOG last)
  const tierOrder = (tier: ItemDisplayHints['displayTier']) =>
    tier === 'hero' ? 0 : tier === 'featured' ? 1 : tier === 'standard' ? 2 : 3

  // Category sections with placement-based item order: anchor first, then by engine position, DOG last
  const categorizedSections = useMemo(() => {
    if (!categoriesProp || categoriesProp.length === 0) {
      return [{ category: null as CategorySection | null, items: filteredItems }]
    }

    const sections: Array<{ category: CategorySection | null; items: MenuItem[] }> = []
    const sortedCategories =
      categoryOrder && categoryOrder.length > 0
        ? [...categoriesProp].sort(
          (a, b) =>
            (categoryOrder.indexOf(a.id) === -1 ? 999 : categoryOrder.indexOf(a.id)) -
            (categoryOrder.indexOf(b.id) === -1 ? 999 : categoryOrder.indexOf(b.id))
        )
        : [...categoriesProp].sort((a, b) => a.displayOrder - b.displayOrder)

    for (const cat of sortedCategories) {
      const categoryItems = filteredItems.filter(
        (item) => item.category?.id === cat.id
      )
      // Place: first = price anchor (highest margin), middle = WORKHORSE, bottom = DOG
      const ordered = [...categoryItems].sort((a, b) => {
        const hintsA = a._hints
        const hintsB = b._hints
        if (hintsA?.isAnchor && !hintsB?.isAnchor) return -1
        if (!hintsA?.isAnchor && hintsB?.isAnchor) return 1
        const posA = hintsA?.position ?? 999
        const posB = hintsB?.position ?? 999
        if (posA !== posB) return posA - posB
        return tierOrder(hintsA?.displayTier ?? 'standard') - tierOrder(hintsB?.displayTier ?? 'standard')
      })
      if (ordered.length > 0) {
        sections.push({ category: cat, items: ordered })
      }
    }

    const uncategorized = filteredItems.filter(
      (item) =>
        !categoriesProp.some((c) => c.id === item.category?.id)
    )
    if (uncategorized.length > 0) {
      sections.push({ category: null, items: uncategorized })
    }

    return sections
  }, [filteredItems, categoriesProp, categoryOrder])

  // Highlight which section is in view (for the sticky nav)
  useEffect(() => {
    const sections = categorizedSections.filter((s): s is typeof s & { category: NonNullable<typeof s.category> } => !!s.category)
    if (sections.length === 0) return
    const firstId = sections[0]?.category.id ?? null
    setActiveSectionId((prev) => prev ?? firstId)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const id = (entry.target as HTMLElement).getAttribute('data-section-id')
          if (id) setActiveSectionId(id)
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )
    const raf = requestAnimationFrame(() => {
      sections.forEach((s) => {
        const el = sectionRefs.current.get(s.category.id)
        if (el) {
          el.setAttribute('data-section-id', s.category.id)
          observer.observe(el)
        }
      })
    })
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [categorizedSections])

  const topShowcases = useMemo(
    () => (showcases || []).filter((s) => s.position === 'top'),
    [showcases]
  )

  const betweenShowcases = useMemo(
    () => (showcases || []).filter((s) => s.position === 'between-categories'),
    [showcases]
  )

  const logoSrc = theme?.logoUrl || restaurantLogo || '/logo.png'

  return (
    <div
      className={`min-h-screen ${bgClass} ${fontClass}`}
      style={{ ...themeStyle, ...bgImageStyle }}
    >
      {theme?.backgroundImageUrl && (
        <div className="fixed inset-0 bg-black/40 pointer-events-none z-0" aria-hidden />
      )}
      <div
        className={`relative overflow-hidden transition-all duration-300 ${theme?.backgroundImageUrl ? 'z-10' : ''} ${isSmartSearchActive ? 'pointer-events-none blur-sm' : 'pointer-events-auto'
          }`}
      >
        {/* Background Effects */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-32 left-10 h-72 w-72 rounded-full bg-emerald-400 blur-[140px]" />
          <div className="absolute top-20 right-10 h-80 w-80 rounded-full bg-amber-400 blur-[160px]" />
          <div className="absolute bottom-20 left-1/2 h-60 w-60 rounded-full bg-blue-400 blur-[140px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-3 sm:px-6 pt-3 sm:pt-6">
          {/* Header: logo left, category tabs center, cart + language right */}
          <header className="flex items-center gap-2 sm:gap-4">
            <div className="flex-shrink-0 flex items-center gap-2 min-w-0">
              {logoSrc ? (
                <img
                  src={logoSrc}
                  width={40}
                  height={40}
                  alt=""
                  className={`w-9 h-9 sm:w-12 sm:h-12 rounded-lg object-contain shrink-0 ${isDarkBg ? 'bg-white/10 border border-white/20' : 'bg-white border border-slate-200'}`}
                />
              ) : (
                <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center text-base sm:text-lg font-bold shrink-0 ${isDarkBg ? 'bg-white/10 text-white border border-white/20' : 'bg-slate-800 text-white border border-slate-200'}`}>
                  {(restaurantName || 'M').slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className={`font-display font-semibold text-sm sm:text-base truncate max-w-[90px] sm:max-w-[140px] ${isDarkBg ? 'text-white' : 'text-slate-900'}`}>
                {restaurantName || 'Menu'}
              </span>
            </div>
            <nav className="flex-1 min-w-0 flex justify-center overflow-x-auto scrollbar-hide scroll-px-3 -mx-1">
              <div className="flex gap-1.5 sm:gap-2 py-1 px-1">
                {categorizedSections.filter((s) => s.category).map((section) => {
                  const isActive = activeSectionId === section.category!.id
                  return (
                    <button
                      key={section.category!.id}
                      type="button"
                      onClick={() => scrollToSection(section.category!.id)}
                      className={`flex-shrink-0 px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${isActive
                          ? isDarkBg
                            ? 'bg-[var(--menu-accent,theme colors.amber.500)] text-white'
                            : 'bg-slate-800 text-white'
                          : isDarkBg
                            ? 'text-white/80 hover:bg-white/10'
                            : 'text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      {getLocalizedCategoryName(section.category!.name)}
                    </button>
                  )
                })}
              </div>
            </nav>
            <div className="flex-shrink-0 flex items-center gap-1 sm:gap-1.5">
              <CustomerSignInControl isDarkBg={isDarkBg} />
              <Button
                variant="ghost"
                size="sm"
                className={`relative h-9 w-9 p-0 rounded-lg ${isDarkBg ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                onClick={() => setCartOpen(true)}
                aria-label="Open cart"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                {cart.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[var(--menu-accent,#f59e0b)] text-white text-[10px] font-bold flex items-center justify-center">
                    {cart.reduce((n, line) => n + line.quantity, 0)}
                  </span>
                )}
              </Button>
              <Popover open={isLanguageMenuOpen} onOpenChange={setIsLanguageMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-9 w-9 p-0 rounded-lg ${isDarkBg ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                    aria-label={`Language: ${currentLanguageLabel}`}
                  >
                    <Globe className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={8}
                  className={`w-40 rounded-xl p-1 shadow-xl ${isDarkBg ? 'border-white/20 bg-slate-900' : 'border-slate-200 bg-white'} text-sm`}
                >
                  {languageOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setLanguage(option.value)
                        setIsLanguageMenuOpen(false)
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${language === option.value
                          ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                          : isDarkBg ? 'text-white/80 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      <span>{option.label}</span>
                      {language === option.value && <span>✓</span>}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </header>
        </div>

        {/* First top showcase: hero or cards per section setting */}
        {topShowcases.length > 0 && (
          <div className="w-full mt-4">
            <MenuCarousel
              key={topShowcases[0].id}
              title={topShowcases[0].title}
              type={topShowcases[0].type}
              variant={topShowcases[0].displayVariant === 'hero' ? 'hero' : 'default'}
              items={topShowcases[0].items}
              onItemClick={(item) =>
                setSelectedItemForDetail(item as MenuItem)
              }
              getDisplayName={(id) =>
                translationCache[language]?.[id]?.name
              }
              getDescription={(id) =>
                translationCache[language]?.[id]?.aiDescription || menuItems.find((m) => m.id === id)?.description
              }
              getCategoryName={getLocalizedCategoryName}
              accentColor={theme?.accentColor}
              primaryColor={theme?.primaryColor}
              isDarkTheme={isDarkBg}
              displayFontClassName="font-display"
              displayMode={theme?.menuCarouselStyle === 'static' ? 'static' : 'sliding'}
              chefRecommendationLabel={currentCopy.chefRecommendationLabel}
            />
          </div>
        )}

        <div className="relative mx-auto max-w-7xl px-3 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
          {/* Remaining top showcases (non-hero) */}
          {topShowcases.slice(1).map((showcase) => (
            <MenuCarousel
              key={showcase.id}
              title={showcase.title}
              type={showcase.type}
              variant={showcase.displayVariant === 'hero' ? 'hero' : 'default'}
              items={showcase.items}
              onItemClick={(item) =>
                setSelectedItemForDetail(item as MenuItem)
              }
              getDisplayName={(id) =>
                translationCache[language]?.[id]?.name
              }
              getDescription={(id) =>
                translationCache[language]?.[id]?.aiDescription || menuItems.find((m) => m.id === id)?.description
              }
              getCategoryName={getLocalizedCategoryName}
              accentColor={theme?.accentColor}
              primaryColor={theme?.primaryColor}
              isDarkTheme={isDarkBg}
              displayFontClassName="font-display"
              displayMode={theme?.menuCarouselStyle === 'static' ? 'static' : 'sliding'}
              chefRecommendationLabel={currentCopy.chefRecommendationLabel}
            />
          ))}
          {/* "What do you feel like eating today?" section (mood options) */}
          {engineMode !== 'classic' && moods.length > 0 && (
            <section className="w-full space-y-3" aria-label="What do you feel like eating today?">
              <h2 className={`text-base sm:text-lg font-semibold ${isDarkBg ? 'text-white' : 'text-slate-900'}`}>
                {language === 'ar' || language === 'ar_fusha'
                  ? 'ماذا تشتهي أن تأكل؟'
                  : language === 'ku'
                    ? 'حەزت لە چی خواردنە؟'
                    : 'What do you feel like eating?'}
              </h2>
              <MoodSelector
                moods={moods}
                language={language}
                selectedMoodId={selectedMoodId}
                onSelectMood={setSelectedMoodId}
                showAllLabel={currentEngineCopy.showAll}
                isDarkTheme={isDarkBg}
              />
            </section>
          )}

          {/* Search row */}
          <div
            className={`flex flex-col sm:flex-row w-full gap-3 transition duration-300 ${isSmartSearchActive ? 'opacity-0 pointer-events-none' : ''
              }`}
          >
            <div className="flex flex-1 min-w-0 gap-2">
              <Input
                placeholder={currentCopy.searchPlaceholder}
                value={search}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(event) => setSearch(event.target.value)}
                className={`flex-1 h-10 rounded-xl text-sm ${isDarkBg
                    ? 'bg-white/10 border-white/20 text-white placeholder:text-white/50'
                    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-500'
                  }`}
              />
              <Button
                variant="ghost"
                size="sm"
                className={`flex h-10 rounded-xl px-3 sm:px-4 shrink-0 ${isDarkBg
                    ? 'border border-white/20 bg-white/5 text-white hover:bg-white/10'
                    : 'border border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                onClick={() => setIsFilterDialogOpen(true)}
                aria-label={currentCopy.smartSearchFilters}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="ml-1.5 sm:ml-2 text-xs font-semibold uppercase tracking-wider hidden sm:inline">{currentCopy.smartSearchFilters}</span>
              </Button>
            </div>
          </div>

          <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
            <DialogContent className="max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-slate-900">
                  Filters
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  Select categories, dietary attributes, and sort order.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 pt-3">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Categories
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition ${selectedCategory === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                      All
                    </button>
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition ${selectedCategory === category.id
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>
                {allTags.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      Dietary
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedTags.includes(tag)
                              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-900'
                              : 'border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300 hover:text-slate-900'
                            }`}
                        >
                          {getTagIcon(tag)}
                          {getLocalizedTagLabel(tag)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Sort by
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSortBy(option.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${sortBy === option.value
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter className="justify-between pt-4">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedCategory('all')
                    setSelectedTags([])
                    setSortBy('popular')
                  }}
                >
                  Clear filters
                </Button>
                <Button onClick={() => setIsFilterDialogOpen(false)}>
                  Apply
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Active Filters Display */}
          {(selectedCategory !== 'all' || selectedTags.length > 0) && (
            <div className="flex flex-wrap gap-2 justify-center items-center">
              <span className={`text-xs ${isDarkBg ? 'text-white/60' : 'text-slate-500'}`}>{currentCopy.filtersLabel}</span>
              {selectedCategory !== 'all' && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30"
                >
                  {categories.find((c) => c.id === selectedCategory)?.name}
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer"
                    onClick={() => setSelectedCategory('all')}
                  />
                </Badge>
              )}
              {selectedTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="bg-[var(--menu-accent,#f59e0b)]/20 text-[var(--menu-accent,#f59e0b)] border-[var(--menu-accent,#f59e0b)]/30"
                >
                  {getLocalizedTagLabel(tag)}
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer"
                    onClick={() => toggleTag(tag)}
                  />
                </Badge>
              ))}
            </div>
          )}

          {lastOrder && lastOrder.itemIds.length > 0 && (() => {
            const seen = new Set<string>()
            const lastOrderDisplayNames: string[] = []
            for (let i = 0; i < lastOrder.itemIds.length && lastOrderDisplayNames.length < 3; i++) {
              const id = lastOrder.itemIds[i]
              if (seen.has(id)) continue
              seen.add(id)
              lastOrderDisplayNames.push(translationCache[language]?.[id]?.name ?? lastOrder.names[i] ?? '')
            }
            return (
              <div className="px-4 py-2">
                <div className={`rounded-xl border p-3 ${isDarkBg ? 'bg-white/10 border-white/20' : 'bg-slate-100 border-slate-200'}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkBg ? 'text-white/70' : 'text-slate-600'}`}>{currentCopy.lastTimeYouOrdered}</p>
                  <p className={`text-sm mb-3 ${isDarkBg ? 'text-white/90' : 'text-slate-800'}`}>
                    {lastOrderDisplayNames.join(', ')}
                    {lastOrder.itemIds.length > 3 ? '…' : ''}
                  </p>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const byId = new Map(menuItems.map((m) => [m.id, m]))
                          for (const id of lastOrder.itemIds) {
                            const item = byId.get(id)
                            if (item) dispatchCart({ type: 'ADD_ITEM', item })
                          }
                        }}
                        className={
                          isDarkBg
                            ? 'rounded-md border border-white/30 bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25'
                            : 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100'
                        }
                      >
                        {currentCopy.orderAgain}
                      </button>
                      {nextOrderSuggestionLoading && (
                        <span className={`text-xs py-1.5 ${isDarkBg ? 'text-white/60' : 'text-slate-500'}`}>{currentCopy.suggestingLabel}</span>
                      )}
                      {!nextOrderSuggestionLoading && nextOrderSuggestion && (
                        <button
                          type="button"
                          onClick={() => {
                            const item = menuItems.find((m) => m.id === nextOrderSuggestion.itemId)
                            if (item) dispatchCart({ type: 'ADD_ITEM', item })
                          }}
                          className="rounded-md bg-[var(--menu-accent,#f59e0b)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                        >
                          {currentCopy.tryItemLabel} {translationCache[language]?.[nextOrderSuggestion.itemId]?.name ?? nextOrderSuggestion.name}
                        </button>
                      )}
                    </div>
                    {!nextOrderSuggestionLoading && nextOrderSuggestion && (
                      <p className={`text-xs leading-snug ${isDarkBg ? 'text-white/70' : 'text-slate-600'}`}>
                        {nextOrderSuggestion.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {tableSize != null && tableSize > 3 && moods.some((m) => m.id === 'sharing') && (
            <div className="px-4 py-1">
              <button
                type="button"
                onClick={() => setSelectedMoodId('sharing')}
                className={`text-sm font-medium px-3 py-2 rounded-lg w-full text-left transition ${isDarkBg ? 'bg-[var(--menu-accent,#f59e0b)]/20 text-[var(--menu-accent,#f59e0b)] hover:bg-[var(--menu-accent,#f59e0b)]/30' : 'bg-[var(--menu-accent,#f59e0b)]/10 text-[var(--menu-accent,#f59e0b)] hover:bg-[var(--menu-accent,#f59e0b)]/20'}`}
              >
                Dining with a group? Try something to share.
              </button>
            </div>
          )}

          {engineMode !== 'classic' && bundles.length > 0 && (() => {
            const bundleItemNames = Object.fromEntries(
              menuItems.map((i) => [i.id, translationCache[language]?.[i.id]?.name ?? i.name])
            )
            const bundleNameSeparator = (language === 'ar' || language === 'ar_fusha') ? ' و ' : (language === 'ku' ? ' و ' : ' + ')
            return (
              <div className="px-3 sm:px-4">
                <BundleCarousel
                  bundles={bundles}
                  itemNames={bundleItemNames}
                  itemImageUrls={Object.fromEntries(menuItems.map((i) => [i.id, i.imageUrl]))}
                  onAddBundle={(bundle) => {
                    const items = bundle.itemIds.map((id) => menuItems.find((m) => m.id === id)).filter(Boolean) as MenuItem[]
                    if (items.length) dispatchCart({ type: 'ADD_BUNDLE', itemIds: bundle.itemIds, items, bundlePrice: bundle.bundlePrice })
                  }}
                  title={currentEngineCopy.bundlesTitle}
                  addBundleLabel={currentEngineCopy.addBundleLabel}
                  bundleNameSeparator={bundleNameSeparator}
                  getLocalizedSavingsText={getLocalizedSavingsText}
                  isDarkTheme={isDarkBg}
                />
              </div>
            )
          })()}

          {/* Menu Items — grouped by category with carousels between */}
          <div className="space-y-8 sm:space-y-6 relative px-3 sm:px-4">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <p className={isDarkBg ? 'text-white/60' : 'text-slate-500'}>{currentCopy.noItemsMessage}</p>
              </div>
            ) : (
              categorizedSections.map((section) => (
                <div
                  key={section.category?.id || 'uncategorized'}
                  ref={section.category ? setSectionRef(section.category.id) : undefined}
                  className="scroll-mt-24"
                >
                  {section.category && (
                    <div className="mb-4 mt-6 sm:mt-4 first:mt-0">
                      <h2 className={`text-xl sm:text-lg font-bold ${isDarkBg ? 'text-white' : 'text-slate-900'}`}>
                        {getLocalizedCategoryName(section.category.name)}
                      </h2>
                    </div>
                  )}

                  {section.category && categoryAnchorBundle[section.category.id] && (() => {
                    const anchorBundle = categoryAnchorBundle[section.category!.id]
                    if (!anchorBundle) return null
                    const anchorItemNames = Object.fromEntries(
                      menuItems.map((i) => [i.id, translationCache[language]?.[i.id]?.name ?? i.name])
                    )
                    const anchorSeparator = (language === 'ar' || language === 'ar_fusha') ? ' و ' : (language === 'ku' ? ' و ' : ' + ')
                    const anchorDisplayName = anchorBundle.itemIds.map((id) => anchorItemNames[id]).filter(Boolean).join(anchorSeparator) || anchorBundle.name
                    return (
                      <div className="mb-3">
                        <div
                          className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${isDarkBg ? 'bg-white/10 border-white/20' : 'bg-slate-100 border-slate-200'}`}
                        >
                          <div>
                            <p className={`font-semibold ${isDarkBg ? 'text-white/90' : 'text-slate-900'}`}>{anchorDisplayName}</p>
                            <p className={`text-xs ${isDarkBg ? 'text-white/60' : 'text-slate-600'}`}>{getLocalizedSavingsText(anchorBundle.savingsText)}</p>
                          </div>
                          <Button
                            size="sm"
                            className="bg-[var(--menu-accent,#f59e0b)] hover:opacity-90 text-white"
                            onClick={() => {
                              const items = anchorBundle.itemIds.map((id) => menuItems.find((m) => m.id === id)).filter(Boolean) as MenuItem[]
                              if (items.length) dispatchCart({ type: 'ADD_BUNDLE', itemIds: anchorBundle.itemIds, items, bundlePrice: anchorBundle.bundlePrice })
                            }}
                          >
                            {currentEngineCopy.addLabel}
                          </Button>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="grid gap-3">
                    {(() => {
                      const visibleItems =
                        engineMode === 'classic'
                          ? section.items
                          : section.items.filter(
                            (item) => !item._hints?.scrollDepthHide || scrollDepth >= 0.6
                          )
                      const itemsToShow = expandedCategoryIds.has(section.category?.id ?? '')
                        ? visibleItems
                        : visibleItems.slice(0, maxInitialItemsPerCategory)
                      const priceVariant = getVariant('price_format')
                      return itemsToShow.map((item) => {
                        const translation =
                          translationCache[language]?.[item.id]
                        const displayName = translation?.name || item.name
                        const displayDescription =
                          translation?.description || item.description || ''
                        const macroSegments = buildMacroSegments(item, translation)
                        const handleAddToOrder = () => {
                          dispatchCart({ type: 'ADD_ITEM', item })
                          logMenuEvent(restaurantId, 'add_to_cart', { menuItemId: item.id }, getOrCreateGuestId(restaurantId), JSON.stringify(getAllVariants()))
                          const suggestions = upsellMap[item.id]
                          if (suggestions?.length) {
                            setUpsellAfterAdd({ itemId: item.id })
                            setUpsellIndex(0)
                          }
                        }
                        return (
                          <MenuItemCard
                            key={item.id}
                            item={item}
                            hints={item._hints}
                            displayName={displayName}
                            displayDescription={displayDescription}
                            macroSegments={macroSegments}
                            getLocalizedCategoryName={getLocalizedCategoryName}
                            getLocalizedTagLabel={getLocalizedTagLabel}
                            getTagIcon={getTagIcon}
                            onDetail={() => setSelectedItemForDetail(item)}
                            onPairings={() => fetchPairingSuggestions(item)}
                            onAddToOrder={handleAddToOrder}
                            addToOrderLabel={currentEngineCopy.addToOrder}
                            badgeLabels={{
                              signature: currentEngineCopy.signatureBadge,
                              mostLoved: currentEngineCopy.mostLovedBadge,
                              chefSelection: currentEngineCopy.chefSelectionBadge,
                            }}
                            loadingPairings={loadingSuggestions}
                            isSelectedForPairing={selectedItemForPairing?.id === item.id}
                            isDarkTheme={isDarkBg}
                            displayPriceOverride={formatMenuPriceWithVariant(item.price, priceVariant)}
                            forceHideImage={hideImages}
                          />
                        )
                      })
                    })()}
                  </div>

                  {section.category && (() => {
                    const visibleItems =
                      engineMode === 'classic'
                        ? section.items
                        : section.items.filter(
                          (item) => !item._hints?.scrollDepthHide || scrollDepth >= 0.6
                        )
                    return visibleItems.length > maxInitialItemsPerCategory && !expandedCategoryIds.has(section.category.id) ? (
                      <button
                        type="button"
                        onClick={() => setExpandedCategoryIds((prev) => new Set(prev).add(section.category!.id))}
                        className={`mt-2 text-sm font-medium py-2 rounded-lg border ${isDarkBg ? 'border-white/20 text-white/80 hover:bg-white/10' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                      >
                        See more ({visibleItems.length - maxInitialItemsPerCategory} more)
                      </button>
                    ) : null
                  })()}

                  {/* Insert carousels configured for after this category */}
                  {betweenShowcases
                    .filter(
                      (s) =>
                        s.insertAfterCategoryId === section.category?.id
                    )
                    .map((showcase) => (
                      <div key={showcase.id} className="py-4">
                        <MenuCarousel
                          title={showcase.title}
                          type={showcase.type}
                          variant={showcase.displayVariant === 'hero' ? 'hero' : 'default'}
                          items={showcase.items}
                          onItemClick={(item) =>
                            setSelectedItemForDetail(item as MenuItem)
                          }
                          getDisplayName={(id) =>
                            translationCache[language]?.[id]?.name
                          }
                          getDescription={(id) =>
                            translationCache[language]?.[id]?.aiDescription || menuItems.find((m) => m.id === id)?.description
                          }
                          getCategoryName={getLocalizedCategoryName}
                          accentColor={theme?.accentColor}
                          primaryColor={theme?.primaryColor}
                          isDarkTheme={isDarkBg}
                          displayFontClassName="font-display"
                          displayMode={theme?.menuCarouselStyle === 'static' ? 'static' : 'sliding'}
                          chefRecommendationLabel={currentCopy.chefRecommendationLabel}
                        />
                      </div>
                    ))}
                </div>
              ))
            )}
          </div>
          <footer className="pt-10">
            <div className={`flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] ${isDarkBg ? 'text-white/60' : 'text-slate-500'}`}>
              <span>Powered by</span>
              <span className="font-bold bg-gradient-to-r from-emerald-400 to-amber-400 bg-clip-text text-transparent">
                Invisible AI
              </span>
            </div>
          </footer>
        </div>
      </div>

      {isSmartSearchActive && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-10 sm:pt-16">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-3xl"
            onClick={closeSmartSearch}
            aria-hidden
          />
          <div className="relative w-full max-w-4xl">
            <div
              className="relative space-y-6 rounded-[32px] border border-white/10 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-3xl sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="space-y-2">
                <p className="text-[0.65rem] uppercase tracking-[0.5em] text-white/60">
                  {currentCopy.smartSearchLabel}
                </p>
                <h3 className="text-xl font-semibold text-white sm:text-2xl">
                  {trimmedSearch
                    ? `${currentCopy.resultsHeadingPrefix} “${trimmedSearch}”`
                    : currentCopy.smartSearchPrompt}
                </h3>
                <p className="text-sm text-white/60">{smartSearchSummary}</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex h-full flex-1 rounded-2xl border border-white/20 bg-white/5 px-3 py-2 shadow-inner shadow-black/30">
                  <Input
                    ref={searchOverlayInputRef}
                    autoComplete="off"
                    placeholder={currentCopy.smartSearchInputPlaceholder}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={(event) => {
                      if (!event.target.value.trim()) {
                        setIsSearchFocused(false)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        closeSmartSearch()
                        event.currentTarget.blur()
                      }
                    }}
                    className="flex-1 border-0 bg-transparent px-0 text-base text-white placeholder:text-white/60 focus-visible:ring-0"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex h-9 rounded-full border border-white/20 bg-white/5 px-3 py-0.5 text-white transition hover:bg-white/10"
                    onClick={() => {
                      setIsFilterDialogOpen(true)
                      setIsSearchFocused(false)
                    }}
                    aria-label="Open filters"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="ml-2 text-xs font-semibold uppercase tracking-[0.3em]">
                      {currentCopy.smartSearchFilters}
                    </span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={closeSmartSearch}>
                    <span className="text-xs font-semibold uppercase tracking-[0.3em]">
                      {currentCopy.smartSearchClear}
                    </span>
                  </Button>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto pr-1">
                {filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-10 text-center text-white/60">
                    <Sparkles className="h-8 w-8 text-emerald-400" />
                    <p className="text-sm font-semibold text-white">
                      {currentCopy.noMatchesTitle}
                    </p>
                    <p className="text-xs text-white/40">
                      {currentCopy.noMatchesDescription}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filteredItems.map((item) => {
                      const translation =
                        translationCache[language]?.[item.id]
                      const displayName = translation?.name || item.name
                      const displayDescription =
                        translation?.description || item.description || ''
                      return (
                        <article
                          key={item.id}
                          className="group overflow-hidden rounded-3xl border border-white/10 bg-white/10 shadow-2xl transition hover:-translate-y-0.5 hover:shadow-2xl backdrop-blur-2xl"
                        >
                          <div className="relative h-32 overflow-hidden rounded-t-3xl">
                            <img
                              src={
                                item.imageUrl ||
                                'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
                              }
                              alt={item.name}
                              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                            />
                          </div>
                          <div className="space-y-2 px-4 py-4">
                            <div className="flex items-center justify-between gap-2 text-white">
                              <h4 className="text-base font-semibold leading-tight">
                                {displayName}
                              </h4>
                              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
                                {formatCurrency(item.price)}
                              </span>
                            </div>
                            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-white/60">
                              {getLocalizedCategoryName(item.category?.name)}
                            </p>
                            {displayDescription && (
                              <p className="text-[0.8rem] text-white/70 line-clamp-2">
                                {displayDescription}
                              </p>
                            )}
                            {item.tags && item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/60">
                                {item.tags.slice(0, 2).map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full border border-white/20 px-2 py-0.5"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pairing Suggestions Dialog */}
      <Dialog open={showPairingSuggestions} onOpenChange={setShowPairingSuggestions}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              {currentCopy.pairingTitle}{' '}
              <span className="font-semibold">{pairingItemDisplayName}</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              {currentCopy.pairingDescription}
            </DialogDescription>
          </DialogHeader>

          {loadingSuggestions ? (
            <div className="py-12 text-center">
              <Sparkles className="h-8 w-8 animate-spin mx-auto text-emerald-500" />
              <p className="mt-4 text-sm text-slate-500">
                {currentCopy.pairingAnalyzing}
              </p>
            </div>
          ) : pairingSuggestions.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              {currentCopy.pairingNoSuggestions}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {pairingSuggestions.map((item) => {
                const suggestionTranslation =
                  translationCache[language]?.[item.id]
                const suggestionName =
                  suggestionTranslation?.name || item.name
                const suggestionDescription =
                  suggestionTranslation?.description || item.description || ''

                return (
                  <Card key={item.id} className="overflow-hidden">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={suggestionName}
                        className="h-32 w-full object-cover"
                      />
                    )}
                    <CardContent className="space-y-2 pt-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{suggestionName}</h4>
                          <p className="text-xs text-slate-500">
                            {getLocalizedCategoryName(item.category?.name)}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-emerald-700">
                          {formatCurrency(item.price)}
                        </span>
                      </div>
                      {suggestionDescription && (
                        <p className="text-xs text-slate-600 line-clamp-3">
                          {suggestionDescription}
                        </p>
                      )}
                      {item.calories && (
                        <p className="text-xs text-slate-500 font-medium">
                          {item.calories} calories
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={isDetailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItemForDetail(null)
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              {detailTranslation?.name || selectedItemForDetail?.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600 space-y-1">
              <span className="flex items-center gap-2">
                {currentCopy.detailTitle}
                {detailDescriptionText ? ` — ${detailDescriptionText}` : ''}
              </span>
            </DialogDescription>
          </DialogHeader>
          {selectedItemForDetail && (
            <div className="space-y-4 py-2">
              <div className="text-sm text-slate-600">
                <p className="text-xs uppercase text-slate-500">
                  {currentCopy.costLabel}
                </p>
                <p className="text-2xl font-bold text-emerald-700">
                  {formatCurrency(selectedItemForDetail.price)}
                </p>
              </div>
              {detailMacroSegments.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  {detailMacroSegments.map((segment) => (
                    <span key={`detail-${segment}`}>{segment}</span>
                  ))}
                </div>
              )}
              {selectedItemForDetail.imageUrl && (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <img
                    src={selectedItemForDetail.imageUrl}
                    alt={selectedItemForDetail.name}
                    className="w-full h-56 object-cover"
                  />
                </div>
              )}
              {selectedItemForDetail.addOns && selectedItemForDetail.addOns.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 mb-2">
                      {currentCopy.addOnsLabel}
                    </p>
                    <p className="text-xs text-slate-500 mb-3">
                      Enhance your meal with these optional additions
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedItemForDetail.addOns.map((addOn) => (
                      <div
                        key={addOn.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm">
                            {getLocalizedAddOnName(addOn.name)}
                          </p>
                          {addOn.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                              {addOn.description}
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          <p className="text-sm font-bold text-emerald-700 whitespace-nowrap">
                            +{formatCurrency(addOn.price)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedItemForDetail(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        lines={cart}
        total={cart.reduce((s, l) => s + l.price * l.quantity, 0)}
        viewOrderLabel={currentEngineCopy.viewOrder}
        placeOrderLabel={currentEngineCopy.placeOrder}
        cartTitle={currentEngineCopy.cartTitle}
        tables={tables}
        selectedTableNumber={selectedTableNumber}
        onTableChange={setSelectedTableNumber}
        onUpdateQuantity={(menuItemId, delta) =>
          dispatchCart({ type: 'UPDATE_QUANTITY', menuItemId, delta })
        }
        onRemove={(menuItemId) => dispatchCart({ type: 'REMOVE_ITEM', menuItemId })}
        formatPrice={(amount) => formatMenuPriceWithVariant(amount, getVariant('price_format'))}
        onPlaceOrder={async () => {
          if (cart.length === 0) return
          setStoredLastOrder(restaurantId, cart.map((l) => ({ menuItemId: l.menuItemId, name: l.name, quantity: l.quantity })))
          setIsPlacingOrder(true)
          try {
            const res = await fetch('/api/public/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                restaurantId,
                items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
                ...(selectedTableNumber && { tableNumber: selectedTableNumber }),
              }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Order failed')
            dispatchCart({ type: 'CLEAR' })
            setLastOrder(getStoredLastOrder(restaurantId))
            logMenuEvent(restaurantId, 'checkout', { itemCount: cart.length, orderNumber: data.orderNumber }, getOrCreateGuestId(restaurantId), JSON.stringify(getAllVariants()))
            toast({ title: 'Order placed', description: data.orderNumber ? `Order ${data.orderNumber}` : undefined })
          } catch (e: any) {
            toast({ variant: 'destructive', title: 'Order failed', description: e.message })
          } finally {
            setIsPlacingOrder(false)
          }
        }}
        restaurantId={restaurantId}
        isPlacing={isPlacingOrder}
      >
        {engineMode !== 'classic' && cart.length > 0 && (() => {
          const hasBeverage = cart.some((l) => {
            const item = menuItems.find((m) => m.id === l.menuItemId)
            const name = (item?.category?.name ?? '').toLowerCase()
            return /drink|beverage|coffee/.test(name)
          })
          const hasDessert = cart.some((l) => {
            const item = menuItems.find((m) => m.id === l.menuItemId)
            const name = (item?.category?.name ?? '').toLowerCase()
            return name.includes('dessert')
          })
          const topBeverage = menuItems.find((m) => /drink|beverage|coffee/.test((m.category?.name ?? '').toLowerCase()))
          const topDessert = menuItems.find((m) => (m.category?.name ?? '').toLowerCase().includes('dessert'))
          if (!hasBeverage && topBeverage)
            return (
              <CheckoutNudge
                message={currentEngineCopy.checkoutNudgeBeverage}
                itemName={topBeverage.name}
                itemPrice={formatMenuPriceWithVariant(topBeverage.price, getVariant('price_format'))}
                onAdd={() => dispatchCart({ type: 'ADD_ITEM', item: topBeverage })}
                addLabel={currentEngineCopy.addLabel}
                dismissLabel={currentEngineCopy.dismissLabel}
                onDismiss={() => { }}
              />
            )
          if (!hasDessert && topDessert)
            return (
              <CheckoutNudge
                message={currentEngineCopy.checkoutNudgeDessert}
                itemName={topDessert.name}
                itemPrice={formatMenuPriceWithVariant(topDessert.price, getVariant('price_format'))}
                onAdd={() => dispatchCart({ type: 'ADD_ITEM', item: topDessert })}
                addLabel={currentEngineCopy.addLabel}
                dismissLabel={currentEngineCopy.dismissLabel}
                onDismiss={() => { }}
              />
            )
          return null
        })()}
      </CartDrawer>

      {upsellAfterAdd && (() => {
        const suggestions = upsellMap[upsellAfterAdd.itemId] ?? []
        const priceVariant = getVariant('price_format')
        const upsellStrategy = getVariant('upsell_strategy')
        if (upsellStrategy === 'bundled' && suggestions.length > 0) {
          const bundledItems = suggestions.map((s) => {
            const item = menuItems.find((m) => m.id === s.itemId)
            return {
              itemId: s.itemId,
              itemName: item?.name ?? '',
              itemPrice: item ? formatMenuPriceWithVariant(item.price, priceVariant) : '',
              itemImageUrl: item?.imageUrl,
              nudgeText: s.nudgeText,
            }
          }).filter((i) => i.itemName)
          if (bundledItems.length === 0) return null
          return (
            <BundledUpsell
              items={bundledItems}
              addLabel={currentEngineCopy.addLabel}
              skipLabel={currentEngineCopy.skipLabel}
              onAddItem={(id) => {
                const item = menuItems.find((m) => m.id === id)
                if (item) dispatchCart({ type: 'ADD_ITEM', item })
              }}
              onClose={() => setUpsellAfterAdd(null)}
            />
          )
        }
        const current = suggestions[upsellIndex]
        const upsellItem = current ? menuItems.find((m) => m.id === current.itemId) : null
        if (!current || !upsellItem) return null
        return (
          <SequentialUpsell
            suggestions={suggestions}
            currentIndex={upsellIndex}
            itemName={upsellItem.name}
            itemPrice={formatMenuPriceWithVariant(upsellItem.price, priceVariant)}
            itemImageUrl={upsellItem.imageUrl}
            onAccept={() => {
              dispatchCart({ type: 'ADD_ITEM', item: upsellItem })
              if (upsellIndex + 1 < suggestions.length) setUpsellIndex((i) => i + 1)
              else setUpsellAfterAdd(null)
            }}
            onSkip={() => {
              if (upsellIndex + 1 < suggestions.length) setUpsellIndex((i) => i + 1)
              else setUpsellAfterAdd(null)
            }}
            onClose={() => setUpsellAfterAdd(null)}
            addLabel={currentEngineCopy.addLabel}
            skipLabel={currentEngineCopy.skipLabel}
          />
        )
      })()}

      {engineMode !== 'classic' && !idleUpsellDismissed && (() => {
        const cartIds = new Set(cart.map((l) => l.menuItemId))
        const sectionsWithCategory = categorizedSections.filter((s): s is typeof s & { category: NonNullable<typeof s.category> } => !!s.category)
        const currentIndex = activeSectionId ? sectionsWithCategory.findIndex((s) => s.category.id === activeSectionId) : 0
        let suggestedItem: MenuItem | null = null
        if (currentIndex >= 0 && sectionsWithCategory[currentIndex]) {
          const section = sectionsWithCategory[currentIndex]
          suggestedItem = section.items.find((m) => !cartIds.has(m.id)) ?? null
        }
        if (!suggestedItem && sectionsWithCategory.length > 0) {
          for (const section of sectionsWithCategory) {
            suggestedItem = section.items.find((m) => !cartIds.has(m.id)) ?? null
            if (suggestedItem) break
          }
        }
        if (!suggestedItem) {
          suggestedItem = menuItems.find((m) => m._hints?.displayTier === 'hero' || m._hints?.displayTier === 'featured') ?? menuItems[0]
        }
        if (!suggestedItem) return null
        return (
          <IdleUpsellPopup
            starItemName={suggestedItem.name}
            starItemId={suggestedItem.id}
            message={currentEngineCopy.idleMessage}
            idleDelayMs={6000}
            dismissAfterMs={4000}
            onAddItem={(id) => {
              const item = menuItems.find((m) => m.id === id)
              if (item) dispatchCart({ type: 'ADD_ITEM', item })
            }}
            onDismiss={() => setIdleUpsellDismissed(true)}
            show={true}
          />
        )
      })()}
    </div>
  )
}
