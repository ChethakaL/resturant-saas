'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import Snowfall from 'react-snowfall'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatCurrency, formatMenuPriceWithVariant } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Flame, Leaf, X, Loader2, Globe, SlidersHorizontal, User, LayoutGrid, Rows3, ShoppingBag, Minus, Plus, Clock3, ChefHat, GlassWater, Handshake, IceCreamCone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { MenuCarousel } from './MenuCarousel'
import { MenuItemCard } from './MenuItemCard'
import { MoodSelector } from './MoodSelector'
import { getOrCreateGuestId, setStoredLastOrder } from './MenuPersonalizationWrapper'
import { getAllVariants, getVariant } from '@/lib/experiments'
import { logMenuEvent } from '@/lib/menu-events'
import { googleFontUrl, resolveGoogleFont } from '@/lib/google-fonts'
import type { ItemDisplayHints, BundleHint, MoodOption, UpsellSuggestion } from '@/types/menu-engine'
import type { MenuFeelingContext } from '@/lib/menu-feeling-message'
import { getCurrentTimeSlot, getHourInTimeZone, mapSlotToGreetingContext, type SlotTimes } from '@/lib/time-slots'

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
  /** When this carousel is shown only in a time slot (e.g. "6am–10am"), label shown under the title */
  activeTimeRange?: string
  /** Optional decorative badge (e.g. "🎄 Christmas Special") */
  label?: string
  /** Per-dish AI-regenerated photos (same prompt = consistent scene). Key = menuItem.id */
  seasonalItemImages?: Record<string, string>
  items: MenuItem[]
}

interface CategorySection {
  id: string
  name: string
  displayOrder: number
  /** If set, this category only appears during specific time contexts (morning/lunch/evening). */
  availableContexts?: string[]
}

interface MenuTheme {
  primaryColor?: string
  accentColor?: string
  chefPickColor?: string
  borderColor?: string
  backgroundStyle?: 'dark' | 'light' | 'gradient'
  fontFamily?: 'sans' | 'serif' | 'display'
  logoUrl?: string | null
  backgroundImageUrl?: string | null
  menuCarouselStyle?: string
  menuLayout?: 'list' | 'grid'
  /** When false, Kurdish is hidden from the language selector (default true). */
  showKurdishOnMenu?: boolean
  /** When false, Arabic is hidden from the language selector (default true). */
  showArabicOnMenu?: boolean
}

interface SmartMenuProps {
  restaurantId: string
  menuItems: MenuItem[]
  initialLanguage?: LanguageCode
  initialTranslationCache?: TranslationCache
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
  menuTimezone?: string
  slotTimes?: SlotTimes | null
  tableSize?: number
  /** When menu is opened from a table (e.g. QR code), pass table number so the order is assigned to that table. */
  tableNumber?: string
  /** Tables available for guest to select (e.g. for order assignment). */
  tables?: { id: string; number: string; status?: string }[]
  categoryAnchorBundle?: Record<string, BundleHint>
  maxInitialItemsPerCategory?: number
  smartSearchFeelingContext?: MenuFeelingContext
  /** Snowfall / seasonal effects settings */
  snowfallSettings?: { enabled: boolean; start: string; end: string } | null
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

const LANGUAGE_OPTIONS_ALL: { value: LanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ku', label: 'كوردي' },
  { value: 'ar_fusha', label: 'العربية' },
]

function getAutoContextForTimeZone(timeZone?: string | null, preferBrowserTimeZone = false): 'morning' | 'lunch' | 'evening' {
  try {
    const browserTimeZone =
      preferBrowserTimeZone && typeof window !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : null
    const effectiveTimeZone = browserTimeZone || timeZone || 'Asia/Baghdad'
    const hour = parseInt(
      new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        hour12: false,
        timeZone: effectiveTimeZone,
      }).format(new Date()),
      10
    )

    if (hour >= 6 && hour < 11) return 'morning'
    if (hour >= 11 && hour < 16) return 'lunch'
    return 'evening'
  } catch {
    return 'morning'
  }
}

function getTimeContextForHour(hour: number): 'morning' | 'lunch' | 'evening' {
  if (hour >= 6 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 16) return 'lunch'
  return 'evening'
}

function isSupportedLanguage(value: string | null): value is LanguageCode {
  return value === 'en' || value === 'ku' || value === 'ar' || value === 'ar_fusha'
}

/** Common dietary options always shown in Discover (hardcoded). Menu items can add more. */
const DISCOVER_DIETARY_OPTIONS: string[] = [
  'vegetarian',
  'vegan',
  'halal',
  'gluten-free',
  'nut-free',
  'dairy-free',
  'high-protein',
  'keto',
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
    { value: 'popular', label: 'sortPopular' },
    { value: 'price-low', label: 'sortPriceLow' },
    { value: 'price-high', label: 'sortPriceHigh' },
    { value: 'protein-high', label: 'sortProteinHigh' },
    { value: 'carbs-high', label: 'sortCarbsHigh' },
    { value: 'protein-low', label: 'sortProteinLow' },
    { value: 'carbs-low', label: 'sortCarbsLow' },
    { value: 'calories-low', label: 'sortCaloriesLow' },
  ]

const tagTranslations: Record<string, Partial<Record<LanguageCode, string>>> = {
  spicy: { en: 'Spicy', ar: 'حار', ku: 'تێز' },
  'non-vegetarian': { ar: 'غير نباتي', ku: 'نەخۆشی' },
  'high-protein': { en: 'High protein', ar: 'عالي البروتين', ku: 'پڕۆتینی زۆر' },
  'gluten-free': { en: 'Gluten free', ar: 'خالٍ من الغلوتين', ku: 'بێ گلووتین' },
  'gluten-free-optional': { ar: 'خالٍ من الغلوتين (اختياري)', ku: 'بێ گلووتین (هەڵبژاردە)' },
  'nut-free': { en: 'Nut free', ar: 'خالٍ من المكسرات', ku: 'بێ چەرەسوور' },
  'dairy-free': { en: 'Dairy free', ar: 'خالٍ من الألبان', ku: 'بێ شیر' },
  'soy-free': { en: 'Soy free', ar: 'خالٍ من فول الصويا', ku: 'بێ سۆیا' },
  'egg-free': { en: 'Egg free', ar: 'خالٍ من البيض', ku: 'بێ هێلکە' },
  kosher: { en: 'Kosher', ar: 'كوشير', ku: 'کۆشەر' },
  halal: { en: 'Halal', ar: 'حلال', ku: 'حەلال' },
  vegetarian: { en: 'Vegetarian', ar: 'نباتي', ku: 'نباتی' },
  vegan: { en: 'Vegan', ar: 'نباتي بالكامل', ku: 'هەموو تێ‌مەند' },
  keto: { en: 'Keto', ar: 'كيتو', ku: 'کیتۆ' },
  'low-carb': { en: 'Low carb', ar: 'قليل الكربوهيدرات', ku: 'کاربۆهیدرەتی کەم' },
  pescatarian: { en: 'Pescatarian', ar: 'سمكي', ku: 'ماسیخۆر' },
  seafood: { en: 'Seafood', ar: 'مأكولات بحرية', ku: 'خۆراکی دەریایی' },
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
    signatureBadge: string
    chefsRecBadge: string
    guestFavoriteBadge: string
    pairingsButtonLabel: string
    moreInfoButtonLabel: string
    limitedTodayLabel: string
    optionalAddOnsDescription: string
    closeLabel: string
    signInLabel: string
    myVisitsLabel: string
    signOutLabel: string
    groupDiningLabel: string
    filterDialogTitle: string
    filterDialogDescription: string
    filterCategoriesLabel: string
    filterAllLabel: string
    filterDietaryLabel: string
    filterSortByLabel: string
    filterClearLabel: string
    filterApplyLabel: string
    sortPopular: string
    sortPriceLow: string
    sortPriceHigh: string
    sortProteinHigh: string
    sortProteinLow: string
    sortCarbsHigh: string
    sortCarbsLow: string
    sortCaloriesLow: string
    ordersLabel: string
    seeMoreDishesLabel: string
    seeMoreDrinksLabel: string
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
    signatureBadge: 'Signature',
    chefsRecBadge: "Chef's Recommendation",
    guestFavoriteBadge: 'Guest Favorite',
    pairingsButtonLabel: 'Pairings',
    moreInfoButtonLabel: 'More info',
    limitedTodayLabel: 'Limited Today',
    optionalAddOnsDescription: 'Enhance your meal with these optional additions',
    closeLabel: 'Close',
    signInLabel: 'Sign in',
    myVisitsLabel: 'My visits',
    signOutLabel: 'Sign out',
    groupDiningLabel: 'Dining with a group? Try something to share.',
    filterDialogTitle: 'Filters',
    filterDialogDescription: 'Select categories, dietary attributes, and sort order.',
    filterCategoriesLabel: 'Categories',
    filterAllLabel: 'All',
    filterDietaryLabel: 'Dietary',
    filterSortByLabel: 'Sort by',
    filterClearLabel: 'Clear filters',
    filterApplyLabel: 'Apply',
    sortPopular: 'Most Popular',
    sortPriceLow: 'Price: Low → High',
    sortPriceHigh: 'Price: High → Low',
    sortProteinHigh: 'Protein: High → Low',
    sortProteinLow: 'Protein: Low → High',
    sortCarbsHigh: 'Carbs: High → Low',
    sortCarbsLow: 'Carbs: Low → High',
    sortCaloriesLow: 'Calories: Low → High',
    ordersLabel: 'orders',
    seeMoreDishesLabel: 'See {count} more dishes →',
    seeMoreDrinksLabel: 'See {count} more drinks →',
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
    signatureBadge: 'الطبق المميز',
    chefsRecBadge: 'توصية الشيف',
    guestFavoriteBadge: 'الأكثر طلبًا',
    pairingsButtonLabel: 'مقترحات',
    moreInfoButtonLabel: 'مزيد من المعلومات',
    limitedTodayLabel: 'محدود اليوم',
    optionalAddOnsDescription: 'حسّن وجبتك بهذه الإضافات الاختيارية',
    closeLabel: 'إغلاق',
    signInLabel: 'تسجيل الدخول',
    myVisitsLabel: 'زياراتي',
    signOutLabel: 'تسجيل الخروج',
    groupDiningLabel: 'تتناول الطعام مع مجموعة؟ جرّب شيئًا للمشاركة.',
    filterDialogTitle: 'الفلاتر',
    filterDialogDescription: 'اختر الفئات والخيارات الغذائية وطريقة الترتيب.',
    filterCategoriesLabel: 'الفئات',
    filterAllLabel: 'الكل',
    filterDietaryLabel: 'خيارات غذائية',
    filterSortByLabel: 'الترتيب حسب',
    filterClearLabel: 'مسح الفلاتر',
    filterApplyLabel: 'تطبيق',
    sortPopular: 'الأكثر طلبًا',
    sortPriceLow: 'السعر: من الأقل إلى الأعلى',
    sortPriceHigh: 'السعر: من الأعلى إلى الأقل',
    sortProteinHigh: 'البروتين: من الأعلى إلى الأقل',
    sortProteinLow: 'البروتين: من الأقل إلى الأعلى',
    sortCarbsHigh: 'الكربوهيدرات: من الأعلى إلى الأقل',
    sortCarbsLow: 'الكربوهيدرات: من الأقل إلى الأعلى',
    sortCaloriesLow: 'السعرات: من الأقل إلى الأعلى',
    ordersLabel: 'طلبات',
    seeMoreDishesLabel: 'عرض {count} طبقًا إضافيًا ←',
    seeMoreDrinksLabel: 'عرض {count} مشروبًا إضافيًا ←',
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
    signatureBadge: 'الطبق المميز',
    chefsRecBadge: 'توصية الشيف',
    guestFavoriteBadge: 'الأكثر طلبًا',
    pairingsButtonLabel: 'مقترحات',
    moreInfoButtonLabel: 'مزيد من المعلومات',
    limitedTodayLabel: 'محدود اليوم',
    optionalAddOnsDescription: 'حسّن وجبتك بهذه الإضافات الاختيارية',
    closeLabel: 'إغلاق',
    signInLabel: 'تسجيل الدخول',
    myVisitsLabel: 'زياراتي',
    signOutLabel: 'تسجيل الخروج',
    groupDiningLabel: 'تتناول الطعام مع مجموعة؟ جرّب شيئًا للمشاركة.',
    filterDialogTitle: 'الفلاتر',
    filterDialogDescription: 'اختر الفئات والخيارات الغذائية وطريقة الترتيب.',
    filterCategoriesLabel: 'الفئات',
    filterAllLabel: 'الكل',
    filterDietaryLabel: 'الخيارات الغذائية',
    filterSortByLabel: 'الترتيب حسب',
    filterClearLabel: 'مسح الفلاتر',
    filterApplyLabel: 'تطبيق',
    sortPopular: 'الأكثر طلبًا',
    sortPriceLow: 'السعر: من الأقل إلى الأعلى',
    sortPriceHigh: 'السعر: من الأعلى إلى الأقل',
    sortProteinHigh: 'البروتين: من الأعلى إلى الأقل',
    sortProteinLow: 'البروتين: من الأقل إلى الأعلى',
    sortCarbsHigh: 'الكربوهيدرات: من الأعلى إلى الأقل',
    sortCarbsLow: 'الكربوهيدرات: من الأقل إلى الأعلى',
    sortCaloriesLow: 'السعرات: من الأقل إلى الأعلى',
    ordersLabel: 'طلبات',
    seeMoreDishesLabel: 'عرض {count} طبقًا إضافيًا ←',
    seeMoreDrinksLabel: 'عرض {count} مشروبًا إضافيًا ←',
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
    signatureBadge: 'تایبەت',
    chefsRecBadge: 'پێشنیاری چێشتلێنەر',
    guestFavoriteBadge: 'دڵخوازی میوانەکان',
    pairingsButtonLabel: 'پێشنیارە هاوپەیوەندەکان',
    moreInfoButtonLabel: 'زانیاری زیاتر',
    limitedTodayLabel: 'تەنها بۆ ئەمڕۆ',
    optionalAddOnsDescription: 'ئەم زیادکارییانە هەڵبژێرە بۆ باشترکردنی خواردنەکەت',
    closeLabel: 'داخستن',
    signInLabel: 'چوونەژوورەوە',
    myVisitsLabel: 'سەردانەکانم',
    signOutLabel: 'چوونەدەرەوە',
    groupDiningLabel: 'لەگەڵ گروپێک خواردن دەخۆیت؟ شتێک بۆ هاوبەشکردن تاقی بکە.',
    filterDialogTitle: 'فلتەرەکان',
    filterDialogDescription: 'هاوپۆلەکان، تایبەتمەندییە خواردنییەکان و شێوازی ڕیزکردن هەڵبژێرە.',
    filterCategoriesLabel: 'هاوپۆلەکان',
    filterAllLabel: 'هەموو',
    filterDietaryLabel: 'تایبەتمەندیی خواردن',
    filterSortByLabel: 'ڕیزکردن بەپێی',
    filterClearLabel: 'پاککردنەوەی فلتەرەکان',
    filterApplyLabel: 'جێبەجێکردن',
    sortPopular: 'زۆرترین داواکراو',
    sortPriceLow: 'نرخ: لە کەمەوە بۆ زۆر',
    sortPriceHigh: 'نرخ: لە زۆرەوە بۆ کەم',
    sortProteinHigh: 'پڕۆتین: لە زۆرەوە بۆ کەم',
    sortProteinLow: 'پڕۆتین: لە کەمەوە بۆ زۆر',
    sortCarbsHigh: 'کاربوهایدرات: لە زۆرەوە بۆ کەم',
    sortCarbsLow: 'کاربوهایدرات: لە کەمەوە بۆ زۆر',
    sortCaloriesLow: 'کالۆری: لە کەمەوە بۆ زۆر',
    ordersLabel: 'داواکراو',
    seeMoreDishesLabel: '{count} خواردنی زیاتر ببینە ←',
    seeMoreDrinksLabel: '{count} خواردنەوەی زیاتر ببینە ←',
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
    removeLabel: string
    tableLabel: string
    selectTableLabel: string
    changeLabel: string
    optionalLabel: string
    selectYourTableLabel: string
    tableHelperLabel: string
    noTableLabel: string
    totalLabel: string
    placingLabel: string
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
    chefSelectionBadge: "CHEF'S SELECTION",
    removeLabel: 'Remove',
    tableLabel: 'Table',
    selectTableLabel: 'Select table',
    changeLabel: 'Change',
    optionalLabel: 'Optional',
    selectYourTableLabel: 'Select your table',
    tableHelperLabel: 'Tap your table on the layout, or choose not to select.',
    noTableLabel: "I'm not at a table",
    totalLabel: 'Total',
    placingLabel: 'Placing…',
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
    chefSelectionBadge: 'اختيار الشيف',
    removeLabel: 'إزالة',
    tableLabel: 'الطاولة',
    selectTableLabel: 'اختر الطاولة',
    changeLabel: 'تغيير',
    optionalLabel: 'اختياري',
    selectYourTableLabel: 'اختر طاولتك',
    tableHelperLabel: 'اضغط على طاولتك في المخطط أو اختر عدم التحديد.',
    noTableLabel: 'لست على طاولة',
    totalLabel: 'الإجمالي',
    placingLabel: 'جارٍ الإرسال…',
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
    chefSelectionBadge: 'اختيار الشيف',
    removeLabel: 'إزالة',
    tableLabel: 'الطاولة',
    selectTableLabel: 'اختر الطاولة',
    changeLabel: 'تغيير',
    optionalLabel: 'اختياري',
    selectYourTableLabel: 'اختر طاولتك',
    tableHelperLabel: 'اضغط على طاولتك في المخطط أو اختر عدم التحديد.',
    noTableLabel: 'لست على طاولة',
    totalLabel: 'الإجمالي',
    placingLabel: 'جارٍ الإرسال…',
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
    chefSelectionBadge: 'هەڵبژاردنی چێشتلێنەر',
    removeLabel: 'لابردن',
    tableLabel: 'مێز',
    selectTableLabel: 'مێز هەڵبژێرە',
    changeLabel: 'گۆڕین',
    optionalLabel: 'ئیختیاری',
    selectYourTableLabel: 'مێزەکەت هەڵبژێرە',
    tableHelperLabel: 'لە نەخشەکەدا لەسەر مێزەکەت بکە یان هەڵنەبژێرە.',
    noTableLabel: 'لەسەر مێزێک نیم',
    totalLabel: 'کۆی گشتی',
    placingLabel: 'دادەنرێت…',
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

function hexToRgba(hex: string | undefined | null, alpha: number): string {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) {
    return `rgba(0,0,0,${alpha})`
  }
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Sign in / My visits control. Icon-only on mobile to avoid header overlap. */
function CustomerSignInControl({
  isDarkBg,
  signInLabel,
  myVisitsLabel,
  signOutLabel,
}: {
  isDarkBg: boolean
  signInLabel: string
  myVisitsLabel: string
  signOutLabel: string
}) {
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
        <Button variant="ghost" size="sm" className={`h-9 w-9 sm:w-auto sm:px-3 p-0 sm:py-2 text-xs sm:text-sm shrink-0 ${btnClass}`} aria-label={signInLabel}>
          <User className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline">{signInLabel}</span>
        </Button>
      </Link>
    )
  }
  if (session?.user?.type === 'customer') {
    return (
      <>
        <Link href="/customer/me">
          <Button variant="ghost" size="sm" className={`h-9 w-9 sm:w-auto sm:px-3 p-0 sm:py-2 text-xs sm:text-sm shrink-0 ${btnClass}`} aria-label={myVisitsLabel}>
            <User className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">{myVisitsLabel}</span>
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className={`h-9 px-2 sm:px-2.5 text-xs shrink-0 ${btnClass}`}
          onClick={() => signOut({ callbackUrl })}
        >
          {signOutLabel}
        </Button>
      </>
    )
  }
  return (
    <Link href={`/customer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
      <Button variant="ghost" size="sm" className={`h-9 w-9 sm:w-auto sm:px-3 p-0 sm:py-2 text-xs sm:text-sm shrink-0 ${btnClass}`} aria-label={signInLabel}>
        <User className="h-4 w-4 sm:hidden" />
        <span className="hidden sm:inline">{signInLabel}</span>
      </Button>
    </Link>
  )
}

export default function SmartMenu({
  restaurantId,
  menuItems,
  initialLanguage = 'en',
  initialTranslationCache,
  showcases,
  categories: categoriesProp,
  theme,
  restaurantName,
  restaurantLogo,
  engineMode = 'classic',
  moods = [],
  categoryOrder,
  menuTimezone,
  slotTimes,
  tableSize,
  tableNumber,
  tables,
  maxInitialItemsPerCategory = 3,
  smartSearchFeelingContext,
  forceShowImages = false,
  snowfallSettings,
}: SmartMenuProps) {
  // Safety check for menuItems
  if (!menuItems || !Array.isArray(menuItems)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <p className="text-white/70">Loading menu...</p>
      </div>
    )
  }

  const pathname = usePathname()
  const languageStorageKey = `smart-menu-language:${restaurantId}:${pathname || '/'}`

  // Compute the current time context early so category time-bounding can use it
  // before the full resolveAutoContext + autoContext memos are available.
  const earlyTimeContext = useMemo(() => {
    try {
      const tz = menuTimezone || 'Asia/Baghdad'
      const slot = getCurrentTimeSlot(tz, slotTimes)
      const hour = getHourInTimeZone(tz)
      return mapSlotToGreetingContext(slot, hour)
    } catch {
      return getAutoContextForTimeZone(menuTimezone)
    }
  }, [menuTimezone, slotTimes])

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
  const [language, setLanguage] = useState<LanguageCode>(initialLanguage)
  const [translationCache, setTranslationCache] = useState<TranslationCache>(() => initialTranslationCache ?? {})
  const translationCacheRef = useRef<TranslationCache>(initialTranslationCache ?? {})
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationError, setTranslationError] = useState<string | null>(null)
  const [translatedCount, setTranslatedCount] = useState<Record<LanguageCode, number>>({
    en: 0,
    ar: 0,
    ar_fusha: 0,
    ku: 0,
  })
  const [cart, setCart] = useState<Record<string, number>>({})
  const [basketOpen, setBasketOpen] = useState(false)
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [selectedTableNumber, setSelectedTableNumber] = useState<string | null>(tableNumber ?? null)
  const [liveTables, setLiveTables] = useState(() => tables ?? [])
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderSuccessMessage, setOrderSuccessMessage] = useState<string | null>(null)
  const [selectedItemForDetail, setSelectedItemForDetail] =
    useState<MenuItem | null>(null)
  const { toast } = useToast()
  const isDetailOpen = Boolean(selectedItemForDetail)
  const [selectedMoodId, setSelectedMoodId] = useState<string | null>(null)
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set())
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const menuListRef = useRef<HTMLDivElement | null>(null)
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [navActiveSectionId, setNavActiveSectionId] = useState<string | null>(null)
  const [scrollDepth, setScrollDepth] = useState(0)
  const [menuListFlash, setMenuListFlash] = useState(false)
  const navScrollTargetRef = useRef<string | null>(null)
  const navScrollResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedStoredLanguageRef = useRef(false)
  const [isLanguageReady, setIsLanguageReady] = useState(false)
  /** AI weather line from `/api/public/menu-feeling-ai` (after first paint; does not block SSR). */
  const [heroAiLine, setHeroAiLine] = useState<string | null>(null)

  const visibleLanguageOptions = useMemo(() => {
    return LANGUAGE_OPTIONS_ALL.filter((o) => {
      if (o.value === 'ku' && theme?.showKurdishOnMenu === false) return false
      if (o.value === 'ar_fusha' && theme?.showArabicOnMenu === false) return false
      return true
    })
  }, [theme?.showKurdishOnMenu, theme?.showArabicOnMenu])

  useEffect(() => {
    if (language === 'ku' && theme?.showKurdishOnMenu === false) setLanguage('en')
    if (language === 'ar_fusha' && theme?.showArabicOnMenu === false) setLanguage('en')
  }, [theme?.showKurdishOnMenu, theme?.showArabicOnMenu, language])

  useEffect(() => {
    if (hasLoadedStoredLanguageRef.current) {
      return
    }
    hasLoadedStoredLanguageRef.current = true

    try {
      const storedLanguage = localStorage.getItem(languageStorageKey)
      if (!isSupportedLanguage(storedLanguage) || storedLanguage === language) {
        return
      }

      const isVisibleOption = visibleLanguageOptions.some((option) => option.value === storedLanguage)
      if (isVisibleOption) {
        setLanguage(storedLanguage)
      }
    } catch {
      // Ignore storage access issues and keep the server-provided default.
    } finally {
      setIsLanguageReady(true)
    }
  }, [languageStorageKey, visibleLanguageOptions, language])

  useEffect(() => {
    try {
      localStorage.setItem(languageStorageKey, language)
    } catch {
      // Ignore storage write failures.
    }
  }, [languageStorageKey, language])

  useEffect(() => {
    setSelectedTableNumber(tableNumber ?? null)
  }, [tableNumber])

  useEffect(() => {
    setLiveTables(tables ?? [])
  }, [tables])

  useEffect(() => {
    if (!restaurantId) return
    setHeroAiLine(null)
    const langParam =
      language === 'ku' ? 'ku' : language === 'ar_fusha' || language === 'ar' ? 'ar_fusha' : 'en'
    const tz = encodeURIComponent(menuTimezone || 'Asia/Baghdad')
    const ac = new AbortController()
    fetch(
      `/api/public/menu-feeling-ai?restaurantId=${encodeURIComponent(restaurantId)}&lang=${encodeURIComponent(langParam)}&tz=${tz}`,
      { signal: ac.signal }
    )
      .then((r) => r.json())
      .then((data: { message?: string | null }) => {
        if (typeof data?.message === 'string' && data.message.trim()) {
          setHeroAiLine(data.message.trim())
        }
      })
      .catch(() => {})
    return () => ac.abort()
  }, [restaurantId, language, menuTimezone])

  const refreshTables = useCallback(async () => {
    if (!restaurantId) return

    try {
      const res = await fetch(`/api/public/tables?restaurantId=${encodeURIComponent(restaurantId)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return

      const data = await res.json()
      setLiveTables(data)
    } catch {
      // Silent fail for background sync.
    }
  }, [restaurantId])

  useEffect(() => {
    if (!tables || tables.length === 0) return

    void refreshTables()

    const interval = window.setInterval(() => {
      void refreshTables()
    }, 15000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshTables()
      }
    }

    window.addEventListener('focus', refreshTables)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshTables)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshTables, tables])

  useEffect(() => {
    if (!selectedTableNumber) return

    const selectedTable = liveTables.find((table) => table.number === selectedTableNumber)
    if (selectedTable && selectedTable.status && selectedTable.status !== 'AVAILABLE') {
      setSelectedTableNumber(null)
      toast({
        title: 'Table no longer available',
        description: `Table ${selectedTable.number} was updated by staff. Please choose another table.`,
        variant: 'destructive',
      })
    }
  }, [liveTables, selectedTableNumber, toast])

  const selectableTables = useMemo(
    () => liveTables.filter((table) => (table.status ?? 'AVAILABLE') === 'AVAILABLE'),
    [liveTables]
  )

  const hideImages = !forceShowImages && getVariant('photo_visibility') === 'hide'
  const setSectionRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(id, el)
    else sectionRefs.current.delete(id)
  }, [])

  const addToCart = useCallback((itemId: string) => {
    setCart((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? 0) + 1,
    }))
    setOrderSuccessMessage(null)
  }, [])

  const updateCartQuantity = useCallback((itemId: string, delta: number) => {
    setCart((prev) => {
      const next = { ...prev }
      const qty = (next[itemId] ?? 0) + delta
      if (qty <= 0) delete next[itemId]
      else next[itemId] = qty
      return next
    })
  }, [])

  const removeFromCart = useCallback((itemId: string) => {
    setCart((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }, [])

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
    const sectionEl = sectionRefs.current.get(categoryId)
    if (!sectionEl) return
    const stickyHeaderHeight = stickyHeaderRef.current?.offsetHeight ?? 0
    const targetTop = sectionEl.getBoundingClientRect().top + window.scrollY - stickyHeaderHeight - 12
    navScrollTargetRef.current = categoryId
    setNavActiveSectionId(categoryId)
    setActiveSectionId(categoryId)
    if (navScrollResetTimerRef.current) {
      clearTimeout(navScrollResetTimerRef.current)
    }
    navScrollResetTimerRef.current = setTimeout(() => {
      navScrollTargetRef.current = null
      setNavActiveSectionId(null)
      navScrollResetTimerRef.current = null
    }, 900)
    window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
  }, [])

  const hasCompleteTranslations = useCallback(
    (lang: LanguageCode) => {
      if (lang === 'en') return true
      const langCache = translationCache[lang]
      if (!langCache) return false
      return menuItems.every((item) => {
        const translation = langCache[item.id]
        return Boolean(translation?.name && translation?.description !== undefined)
      })
    },
    [menuItems, translationCache]
  )

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
        menuItems.every((item) => {
          const translation = existingCache[item.id]
          return Boolean(translation?.name && translation?.description !== undefined)
        })
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
            dbOnly: true,
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

  const languageContentReady = hasCompleteTranslations(language)

  const currentCopy = uiCopyMap[language]
  const currentEngineCopy = engineCopyMap[language]
  const localizedSortOptions = sortOptions.map((option) => ({
    ...option,
    label: currentCopy[option.label as keyof typeof currentCopy] as string,
  }))
  const currentLanguageLabel =
    visibleLanguageOptions.find((option) => option.value === language)?.label || ''
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

  const getDisplayNameForItem = useCallback((item: MenuItem) => {
    return translationCache[language]?.[item.id]?.name || item.name
  }, [language, translationCache])

  const getDisplayDescriptionForItem = useCallback((item: MenuItem) => {
    return translationCache[language]?.[item.id]?.description || item.description || ''
  }, [language, translationCache])

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

  // Main dietary attributes for Discover filter (no spicy — it's a taste, not a dietary). High protein / protein-rich shown as one.
  const DIETARY_WHITELIST = useMemo(
    () =>
      new Set(
        [
          'vegetarian',
          'vegan',
          'halal',
          'kosher',
          'gluten-free',
          'dairy-free',
          'nut-free',
          'soy-free',
          'egg-free',
          'keto',
          'low-carb',
          'high protein',
          'protein-rich',
          'high-protein',
          'seafood',
          'pescatarian',
        ].map((t) => t.toLowerCase())
      ),
    []
  )

  const getCanonicalDietaryTag = (tag: string): string => {
    const lower = tag.toLowerCase().trim().replace(/\s+/g, '-')
    if (lower === 'high-protein' || lower === 'protein-rich' || tag.toLowerCase().trim() === 'high protein') return 'high-protein'
    return lower
  }

  const allTags = useMemo(() => {
    const seen = new Set<string>(DISCOVER_DIETARY_OPTIONS)
    const normalize = (t: string) => t.toLowerCase().trim().replace(/\s+/g, '-')
    menuItems.forEach((item) => {
      item.tags?.forEach((tag) => {
        const lower = tag.toLowerCase().trim()
        const norm = normalize(tag)
        if (DIETARY_WHITELIST.has(lower) || DIETARY_WHITELIST.has(norm)) {
          seen.add(getCanonicalDietaryTag(tag))
        }
      })
    })
    return Array.from(seen).sort()
  }, [menuItems, DIETARY_WHITELIST])

  const getItemCanonicalTags = (item: MenuItem): string[] => {
    const out: string[] = []
    const normalize = (t: string) => t.toLowerCase().trim().replace(/\s+/g, '-')
    item.tags?.forEach((tag) => {
      const lower = tag.toLowerCase().trim()
      const norm = normalize(tag)
      if (DIETARY_WHITELIST.has(lower) || DIETARY_WHITELIST.has(norm)) {
        out.push(getCanonicalDietaryTag(tag))
      }
    })
    return Array.from(new Set(out))
  }

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([itemId, quantity]) => {
        const item = menuItems.find((entry) => entry.id === itemId)
        if (!item) return null
        return {
          item,
          quantity,
          translation: translationCache[language]?.[item.id],
        }
      })
      .filter(Boolean) as Array<{
        item: MenuItem
        quantity: number
        translation?: MenuItemTranslation
      }>
  }, [cart, language, menuItems, translationCache])

  const cartCount = useMemo(
    () => cartItems.reduce((sum, line) => sum + line.quantity, 0),
    [cartItems]
  )

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, line) => sum + line.item.price * line.quantity, 0),
    [cartItems]
  )

  const availableMoods = useMemo<MoodOption[]>(() => {
    const isBreakfastMenuItem = (item: MenuItem) => {
      const bucket = `${item.name} ${item.category?.name || ''} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
      return /breakfast|egg|toast|croissant|jam|cream cheese|kaymak|qaymak|honey|olives|breakfast for|family breakfast/.test(bucket)
    }

    const keywordMap: Record<string, string[]> = {
      light: ['salad', 'soup', 'appetizer', 'starter', 'light', 'juice', 'drink', 'beverage', 'tea', 'coffee'],
      filling: ['main', 'grill', 'burger', 'pasta', 'rice', 'dish', 'sandwich', 'wrap', 'kebab', 'steak', 'meal'],
      sharing: ['platter', 'share', 'sharing', 'starter', 'appetizer', 'family', 'combo'],
      drinks: ['drink', 'beverage', 'juice', 'coffee', 'tea', 'smoothie', 'latte', 'espresso', 'mocha', 'lemonade', 'water', 'mocktail', 'soda', 'ayran'],
      sweet: ['dessert', 'sweet', 'cake', 'cookie', 'ice cream', 'icecream', 'kunafa', 'baklava', 'pudding', 'brownie', 'chocolate'],
    }

    const isDrinkLike = (item: MenuItem) => {
      const bucket = `${item.name} ${item.category?.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
      return keywordMap.drinks.some((keyword) => bucket.includes(keyword))
    }

    const isLightLike = (item: MenuItem) => {
      const bucket = `${item.name} ${item.category?.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
      const isHeavy = /steak|beef|lamb|mixed grill|grill|kebab|shawarma|burger|pasta|rice platter|platter|tenderloin/.test(bucket)
      const isActuallyLight =
        /salad|soup|appetizer|starter|toast|egg|falafel|croissant|yogurt|granola|fruit|fresh|mix salad/.test(bucket)
      return !isHeavy && (isActuallyLight || isDrinkLike(item) || keywordMap.light.some((keyword) => bucket.includes(keyword)))
    }

    const isSharingLike = (item: MenuItem) => {
      const bucket = `${item.name} ${item.category?.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
      return (
        keywordMap.sharing.some((keyword) => bucket.includes(keyword)) ||
        /for two|for 2|two persons?|two people|for four|for 4|four persons?|four people|family|group|tray|breakfast for/.test(bucket)
      )
    }

    const isFillingLike = (item: MenuItem) => {
      const bucket = `${item.name} ${item.category?.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
      return keywordMap.filling.some((keyword) => bucket.includes(keyword))
    }

    const isSweetLike = (item: MenuItem) => {
      const bucket = `${item.name} ${item.category?.name || ''} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
      return keywordMap.sweet.some((keyword) => bucket.includes(keyword))
    }

    const inferMoodIds = (moodId: keyof typeof keywordMap) =>
      menuItems
        .filter((item) => {
          if (moodId === 'sharing') {
            if (earlyTimeContext !== 'morning' && isBreakfastMenuItem(item)) return false
            return isSharingLike(item)
          }
          if (moodId === 'light') return isLightLike(item)
          if (moodId === 'drinks') return isDrinkLike(item)
          if (moodId === 'sweet') return isSweetLike(item)
          const bucket = `${item.name} ${item.category?.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
          return keywordMap[moodId].some((keyword) => bucket.includes(keyword))
        })
        .map((item) => item.id)

    const serverMoodMap = new Map(moods.map((mood) => [mood.id, mood]))
    const fallbackDefinitions: MoodOption[] = [
      { id: 'light', label: { en: 'Light', ar: 'خفيف', ku: 'سووک' }, itemIds: inferMoodIds('light') },
      { id: 'filling', label: { en: 'Filling', ar: 'مشبع', ku: 'تێرکەر' }, itemIds: inferMoodIds('filling') },
      { id: 'sharing', label: { en: 'Sharing', ar: 'للمشاركة', ku: 'هاوبەشکردن' }, itemIds: inferMoodIds('sharing') },
      { id: 'drinks', label: { en: 'Drinks', ar: 'مشروبات', ku: 'خواردنەوە' }, itemIds: inferMoodIds('drinks') },
      { id: 'sweet', label: { en: 'Sweet', ar: 'حلويات', ku: 'شیرین' }, itemIds: inferMoodIds('sweet') },
    ]

    const resolved = fallbackDefinitions
      .map((fallbackMood) => {
        const serverMood = serverMoodMap.get(fallbackMood.id)
        let itemIds = serverMood?.itemIds?.length ? serverMood.itemIds : fallbackMood.itemIds

        if (fallbackMood.id === 'light') {
          itemIds = itemIds.filter((id) => {
            const item = menuItems.find((entry) => entry.id === id)
            return item ? isLightLike(item) : false
          })
        }

        if (fallbackMood.id === 'drinks') {
          itemIds = itemIds.filter((id) => {
            const item = menuItems.find((entry) => entry.id === id)
            return item ? isDrinkLike(item) : false
          })
        }

        if (fallbackMood.id === 'sweet') {
          itemIds = itemIds.filter((id) => {
            const item = menuItems.find((entry) => entry.id === id)
            return item ? isSweetLike(item) : false
          })
        }

        if (fallbackMood.id === 'sharing' && itemIds.length === 0) {
          itemIds = menuItems
            .filter((item) => {
              if (earlyTimeContext !== 'morning' && isBreakfastMenuItem(item)) return false
              const bucket = `${item.name} ${item.category?.name || ''} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
              const isBreakfastLike = /breakfast|egg|toast|croissant|jam|cream cheese|kaymak|qaymak|honey|olives|breakfast for|family breakfast/.test(bucket)
              const pairingLike = /combo|platter|meal|mixed grill|grill|kebab|shawarma|burger|pasta|rice|chicken|beef|lamb|fish|seafood|starter|appetizer|mezze|sampler/.test(bucket)
              return isSharingLike(item) || (!isDrinkLike(item) && !isBreakfastLike && pairingLike)
            })
            .map((item) => item.id)
            .slice(0, 8)
        }

        if (fallbackMood.id === 'sharing' && itemIds.length > 0 && earlyTimeContext !== 'morning') {
          itemIds = itemIds.filter((id) => {
            const item = menuItems.find((entry) => entry.id === id)
            return item ? !isBreakfastMenuItem(item) : false
          })
        }

        if (fallbackMood.id === 'light' && itemIds.length === 0) {
          itemIds = menuItems
            .filter((item) => isLightLike(item) || isDrinkLike(item))
            .map((item) => item.id)
            .slice(0, 8)
        }

        if (fallbackMood.id === 'filling' && itemIds.length === 0) {
          itemIds = menuItems
            .filter((item) => isFillingLike(item) || (!isDrinkLike(item) && !isLightLike(item)))
            .map((item) => item.id)
            .slice(0, 8)
        }

        if (fallbackMood.id === 'drinks' && itemIds.length === 0) {
          itemIds = menuItems
            .filter((item) => isDrinkLike(item))
            .map((item) => item.id)
            .slice(0, 8)
        }

        if (fallbackMood.id === 'sweet' && itemIds.length === 0) {
          itemIds = menuItems
            .filter((item) => isSweetLike(item))
            .map((item) => item.id)
            .slice(0, 8)
        }

        return {
          ...fallbackMood,
          itemIds,
        }
      })
    return resolved
  }, [menuItems, moods, earlyTimeContext])

  // Filter and sort menu items before mood selection.
  const baseFilteredItems = useMemo(() => {
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

    // Tags filter (canonical tags — high protein / protein-rich count as one)
    if (selectedTags.length > 0) {
      items = items.filter((item) => {
        const canonical = getItemCanonicalTags(item)
        return selectedTags.every((sel) => canonical.includes(sel))
      })
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
    sortBy,
    language,
    translationCache,
  ])

  const filteredItems = useMemo(() => {
    const breakfastLike = (item: MenuItem) => {
      const bucket = `${item.name} ${item.category?.name ?? ''} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
      return /breakfast|egg|toast|croissant|jam|cream cheese|kaymak|qaymak|honey|olives|breakfast for|family breakfast/.test(bucket)
    }

    let items = baseFilteredItems
    if (!selectedMoodId) return items

    const mood = availableMoods.find((entry) => entry.id === selectedMoodId)
    if (!mood) return items

    if (mood.itemIds.length > 0) {
      const moodIds = new Set(mood.itemIds)
      items = items.filter((item) => moodIds.has(item.id))
      if (selectedMoodId === 'sharing' && earlyTimeContext !== 'morning') {
        items = items.filter((item) => !breakfastLike(item))
      }
      return items
    }

    const moodKeywords: Record<string, string[]> = {
      light: ['salad', 'soup', 'appetizer', 'starter', 'light'],
      filling: ['main', 'grill', 'burger', 'pasta', 'rice', 'dish'],
      sharing: ['platter', 'share', 'sharing', 'appetizer', 'starter', 'combo'],
      drinks: ['drink', 'beverage', 'juice', 'coffee', 'tea', 'smoothie', 'latte', 'espresso'],
      sweet: ['dessert', 'sweet', 'cake', 'cookie', 'ice cream', 'baklava', 'pudding'],
    }
    const keywords = moodKeywords[mood.id] ?? []
    if (keywords.length === 0) return items

    return items.filter((item) => {
      const bucket = `${item.name} ${item.category?.name ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
      if (mood.id === 'sharing') {
        if (earlyTimeContext !== 'morning' && breakfastLike(item)) return false
        return (
          keywords.some((keyword) => bucket.includes(keyword)) ||
          /for two|for 2|two persons?|two people|for four|for 4|four persons?|four people|family|group|tray|breakfast for/.test(bucket)
        )
      }
      return keywords.some((keyword) => bucket.includes(keyword))
    })
  }, [availableMoods, baseFilteredItems, earlyTimeContext, selectedMoodId])

  const selectedMood = useMemo(
    () => (selectedMoodId ? availableMoods.find((m) => m.id === selectedMoodId) ?? null : null),
    [availableMoods, selectedMoodId]
  )
  const selectedMoodLabel = selectedMood
    ? (selectedMood.label[language === 'ar_fusha' ? 'ar' : language] ?? selectedMood.label.en)
    : ''

  useEffect(() => {
    if (!selectedMoodId) return
    let flashTimer: number | undefined
    const scrollTimer = window.setTimeout(() => {
      menuListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setMenuListFlash(true)
      flashTimer = window.setTimeout(() => setMenuListFlash(false), 1200)
    }, 80)

    return () => {
      window.clearTimeout(scrollTimer)
      if (flashTimer) window.clearTimeout(flashTimer)
    }
  }, [selectedMoodId, filteredItems.length])


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
    const normalized = tag.toLowerCase()
    const lang = language === 'ar_fusha' ? 'ar' : language
    const translated = tagTranslations[normalized]?.[lang]
    if (translated) return translated
    if (language === 'en') return tag.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    return tag
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

  // Theme computation: CSS vars for colors and granular fonts
  const themeStyle = useMemo((): React.CSSProperties => {
    const t = theme as any || {}
    const getFontStr = (val: string | undefined | null, fallback: string) => `"${resolveGoogleFont(val || fallback)}", sans-serif`
    
    return {
      '--menu-primary': t.primaryColor || '#10b981',
      '--menu-accent': t.accentColor || '#f59e0b',
      '--menu-chef-pick': t.chefPickColor || '#dc2626',
      '--menu-border': t.borderColor || '#1e40af',
      '--font-body': getFontStr(t.fontFamily, 'DM Sans'),
      '--font-display': getFontStr(t.fontFamily, 'DM Sans'), // Legacy fallback
      '--font-menu-title': getFontStr(t.fontMenuTitle, t.fontFamily || 'DM Sans'),
      '--font-category-header': getFontStr(t.fontCategoryHeader, t.fontFamily || 'DM Sans'),
      '--font-item-name': getFontStr(t.fontItemName, t.fontFamily || 'DM Sans'),
      '--font-description': getFontStr(t.fontDescription, t.fontFamily || 'DM Sans'),
      '--font-price': getFontStr(t.fontPrice, t.fontFamily || 'DM Sans'),
    } as React.CSSProperties
  }, [theme])

  const activeFontLinks = useMemo(() => {
    const t = theme as any || {}
    const families = [
      t.fontFamily,
      t.fontMenuTitle,
      t.fontCategoryHeader,
      t.fontItemName,
      t.fontDescription,
      t.fontPrice
    ]
      .map(f => resolveGoogleFont(f || 'DM Sans'))
      .filter((v, i, a) => a.indexOf(v) === i) // unique

    return families.map(f => googleFontUrl(f))
  }, [theme])

  const fontClass = 'font-body'

  const bgClass =
    theme?.backgroundStyle === 'light'
      ? 'bg-slate-100 text-slate-900'
      : theme?.backgroundStyle === 'gradient'
        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white'
        : 'bg-slate-950 text-white'
  const priceVariant = getVariant('price_format')

  const isDarkBg = theme?.backgroundStyle !== 'light'
  const defaultMenuLayout = theme?.menuLayout === 'grid' ? 'grid' : 'list'
  const [menuLayout, setMenuLayout] = useState<'list' | 'grid'>(defaultMenuLayout)
  const bgImageStyle = theme?.backgroundImageUrl
    ? {
      backgroundImage: `url(${theme.backgroundImageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
    : undefined

  useEffect(() => {
    setMenuLayout(defaultMenuLayout)
  }, [defaultMenuLayout])

  // Tier order for placement: hero=0, featured=1, standard=2, minimal=3 (DOG last)
  const tierOrder = (tier: ItemDisplayHints['displayTier']) =>
    tier === 'hero' ? 0 : tier === 'featured' ? 1 : tier === 'standard' ? 2 : 3

  const isDrinkItem = useCallback((item: MenuItem) => {
    const bucket = `${item.name} ${item.category?.name ?? ''} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
    return /drink|beverage|juice|coffee|tea|smoothie|soda|cocktail|mocktail|water|lemonade|espresso|latte|mocha|frappuccino|americano|cappuccino|macchiato|milkshake|hot chocolate|ice chocolate/.test(bucket)
  }, [])

  const isDessertItem = useCallback((item: MenuItem) => {
    const bucket = `${item.name} ${item.category?.name ?? ''} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
    return /dessert|sweet|cake|cookie|ice cream|icecream|kunafa|baklava|pudding|brownie|waffle|crepe|donut|chocolate cream|white chocolate cream/.test(bucket)
  }, [])

  const isMainItem = useCallback((item: MenuItem) => {
    if (isDrinkItem(item) || isDessertItem(item)) return false
    const bucket = `${item.name} ${item.category?.name ?? ''} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
    return /main|grill|burger|steak|pasta|rice|dish|kebab|shawarma|platter|seafood|chicken|beef|lamb|fish|salad|breakfast|egg|falafel|sandwich/.test(bucket)
  }, [isDessertItem, isDrinkItem])

  const isSweetItem = useCallback((item: MenuItem) => {
    const bucket = `${item.name} ${item.category?.name ?? ''} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
    return /dessert|sweet|cake|cookie|ice cream|icecream|kunafa|baklava|pudding|brownie|waffle|crepe|donut|chocolate|mocha|cream|frappuccino|caramel|vanilla|hazelnut|white chocolate|condensed milk|latte/.test(bucket)
  }, [])

  const getRecommendationKind = useCallback((item: MenuItem): 'main' | 'drink' | 'sweet' => {
    if (isDrinkItem(item)) return 'drink'
    if (isSweetItem(item)) return 'sweet'
    return 'main'
  }, [isDrinkItem, isSweetItem])

  const isBreakfastItem = useCallback((item: MenuItem) => {
    const bucket = `${item.name} ${item.category?.name ?? ''} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
    return /breakfast|egg|toast|croissant|jam|cream cheese|kaymak|qaymak|honey|olives|breakfast for|family breakfast/.test(bucket)
  }, [])

  const isSharingCandidate = useCallback((item: MenuItem, context?: ContextKey) => {
    const bucket = `${item.name} ${item.category?.name ?? ''} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
    const explicitSharing =
      /platter|share|sharing|starter|appetizer|combo|for two|for 2|two persons?|two people|for four|for 4|four persons?|four people|family|group|tray|mezze|sampler/.test(bucket)
    const pairingLike =
      /grill|mixed grill|kebab|shawarma|burger|pasta|rice|chicken|beef|lamb|fish|seafood|meal/.test(bucket)

    if (!explicitSharing && !pairingLike) return false
    if (context && context !== 'morning' && isBreakfastItem(item)) return false
    return true
  }, [isBreakfastItem])

  const getSweetPriorityScore = useCallback((item: MenuItem) => {
    const bucket = `${item.name} ${item.category?.name ?? ''} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
    let score = 0

    if (/white chocolate cream|chocolate cream|white hot chocolate|hot chocolate|ice chocolate/.test(bucket)) score += 160
    if (/chocolate|white chocolate/.test(bucket)) score += 80
    if (/mocha|frappuccino|cream/.test(bucket)) score += 60
    if (/caramel|vanilla|hazelnut|condensed milk|sweet/.test(bucket)) score += 40
    if (isDessertItem(item)) score += 35
    if (isDrinkItem(item)) score += 20
    if ((item._hints?.popularityScore ?? 0) > 0) score += Math.min(20, (item._hints?.popularityScore ?? 0) * 20)
    score += Math.min(15, item.price / 2000)

    return score
  }, [isDessertItem, isDrinkItem])

  const getMoodPriorityScore = useCallback((item: MenuItem) => {
    if (!selectedMoodId) return 0
    const bucket = `${item.name} ${item.category?.name ?? ''} ${(item.tags ?? []).join(' ')} ${item.description ?? ''}`.toLowerCase()

    if (selectedMoodId === 'sharing') {
      if (/for four|for 4|four persons?|four people|family tray|family platter|family breakfast/.test(bucket)) return 120
      if (/for two|for 2|two persons?|two people/.test(bucket)) return 110
      if (/platter|share|sharing|combo|tray|family|group/.test(bucket)) return 100
      return 0
    }

    if (selectedMoodId === 'drinks') return isDrinkItem(item) ? 100 : 0

    if (selectedMoodId === 'light') {
      return /salad|soup|appetizer|starter|toast|egg|falafel|croissant|yogurt|granola|fruit|fresh/.test(bucket) ? 100 : 0
    }

    if (selectedMoodId === 'filling') {
      if (/main|grill|burger|steak|pasta|rice|dish|kebab|shawarma|platter|seafood|chicken|beef|lamb|fish/.test(bucket)) return 100
      return 0
    }

    if (selectedMoodId === 'sweet') return getSweetPriorityScore(item)

    return 0
  }, [getSweetPriorityScore, isDrinkItem, selectedMoodId])

  // Category sections: when user picked a sort (price-low, etc.), preserve filteredItems order.
  // When sortBy === 'popular', use engine order: anchor first, then position, then tier.
  const categorizedSections = useMemo(() => {
    if (!categoriesProp || categoriesProp.length === 0) {
      return [{ category: null as CategorySection | null, items: filteredItems }]
    }

    // Hide categories that are only available at a specific time of day
    const timeVisibleCategories = categoriesProp.filter((cat) => {
      if (!cat.availableContexts || cat.availableContexts.length === 0) return true
      return cat.availableContexts.includes(earlyTimeContext)
    })

    const sections: Array<{ category: CategorySection | null; items: MenuItem[] }> = []
    const sortedCategories =
      categoryOrder && categoryOrder.length > 0
        ? [...timeVisibleCategories].sort(
          (a, b) =>
            (categoryOrder.indexOf(a.id) === -1 ? 999 : categoryOrder.indexOf(a.id)) -
            (categoryOrder.indexOf(b.id) === -1 ? 999 : categoryOrder.indexOf(b.id))
        )
        : [...timeVisibleCategories].sort((a, b) => a.displayOrder - b.displayOrder)

    const useEngineOrder = sortBy === 'popular'

    for (const cat of sortedCategories) {
      const categoryItems = filteredItems.filter(
        (item) => item.category?.id === cat.id
      )
      const orderedBase = useEngineOrder
        ? [...categoryItems].sort((a, b) => {
            const hintsA = a._hints
            const hintsB = b._hints
            if (hintsA?.isAnchor && !hintsB?.isAnchor) return -1
            if (!hintsA?.isAnchor && hintsB?.isAnchor) return 1
            const posA = hintsA?.position ?? 999
            const posB = hintsB?.position ?? 999
            if (posA !== posB) return posA - posB
            return tierOrder(hintsA?.displayTier ?? 'standard') - tierOrder(hintsB?.displayTier ?? 'standard')
          })
        : categoryItems
      const ordered = selectedMoodId
        ? [...orderedBase].sort((a, b) => {
            const moodDelta = getMoodPriorityScore(b) - getMoodPriorityScore(a)
            if (moodDelta !== 0) return moodDelta
            return orderedBase.indexOf(a) - orderedBase.indexOf(b)
          })
        : orderedBase
      if (ordered.length > 0) {
        sections.push({ category: cat, items: ordered })
      }
    }

    const visibleCategoryIds = new Set(timeVisibleCategories.map((category) => category.id))
    const allCategoryIds = new Set(categoriesProp.map((category) => category.id))
    const uncategorized = filteredItems.filter((item) => {
      const categoryId = item.category?.id
      if (!categoryId) return true
      if (visibleCategoryIds.has(categoryId)) return false
      return !allCategoryIds.has(categoryId)
    })
    if (uncategorized.length > 0) {
      sections.push({ category: null, items: uncategorized })
    }

    return sections
  }, [filteredItems, categoriesProp, categoryOrder, sortBy, earlyTimeContext, getMoodPriorityScore, selectedMoodId])

  // Highlight which section is in view (for the sticky nav)
  useEffect(() => {
    const sections = categorizedSections.filter((s): s is typeof s & { category: NonNullable<typeof s.category> } => !!s.category)
    if (sections.length === 0) return
    const firstId = sections[0]?.category.id ?? null
    setActiveSectionId((prev) => prev ?? firstId)
    setNavActiveSectionId((prev) => prev ?? firstId)
    const stickyHeaderHeight = stickyHeaderRef.current?.offsetHeight ?? 0
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const id = (entry.target as HTMLElement).getAttribute('data-section-id')
          if (id) {
            setActiveSectionId(id)
            setNavActiveSectionId(id)
            if (navScrollTargetRef.current === id) {
              navScrollTargetRef.current = null
              if (navScrollResetTimerRef.current) {
                clearTimeout(navScrollResetTimerRef.current)
                navScrollResetTimerRef.current = null
              }
            }
          }
        }
      },
      { rootMargin: `-${Math.max(stickyHeaderHeight + 8, 80)}px 0px -55% 0px`, threshold: 0 }
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

  useEffect(() => {
    return () => {
      if (navScrollResetTimerRef.current) {
        clearTimeout(navScrollResetTimerRef.current)
      }
    }
  }, [])

  const topShowcases = useMemo(
    () => (showcases || []).filter((s) => s.position === 'top'),
    [showcases]
  )

  const betweenShowcases = useMemo(
    () => (showcases || []).filter((s) => s.position === 'between-categories'),
    [showcases]
  )

  const heroItems = useMemo(() => {
    const showcaseItems = topShowcases.flatMap((showcase) => showcase.items)
    const source = showcaseItems.length > 0 ? showcaseItems : baseFilteredItems
    const unique = new Map<string, MenuItem>()
    source.forEach((item) => {
      if (!unique.has(item.id)) unique.set(item.id, item)
    })
    return Array.from(unique.values())
  }, [baseFilteredItems, topShowcases])

  const logoSrc = theme?.logoUrl || restaurantLogo || '/logo.png'

  // Snowfall: active when enabled and today is within the configured date range
  const showSnowfall = useMemo(() => {
    if (!snowfallSettings?.enabled) return false
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const today = `${mm}-${dd}`
    const start = snowfallSettings.start || '12-15'
    const end = snowfallSettings.end || '01-07'
    // Handle wrap-around (e.g. Dec 15 – Jan 7)
    if (start <= end) return today >= start && today <= end
    return today >= start || today <= end
  }, [snowfallSettings])

  const placeOrder = useCallback(async () => {
    if (cartItems.length === 0 || isPlacingOrder) return

    setIsPlacingOrder(true)
    setOrderSuccessMessage(null)

    try {
      const response = await fetch('/api/public/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          restaurantId,
          tableNumber: selectedTableNumber ?? undefined,
          items: cartItems.map((line) => ({
            menuItemId: line.item.id,
            quantity: line.quantity,
          })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to place order')
      }

      setStoredLastOrder(
        restaurantId,
        cartItems.map((line) => ({
          menuItemId: line.item.id,
          name: getDisplayNameForItem(line.item),
          quantity: line.quantity,
        }))
      )

      setCart({})
      setBasketOpen(false)
      setOrderSuccessMessage(
        data?.orderNumber
          ? `Order ${data.orderNumber} sent. Your waiter has been notified.`
          : 'Order sent. Your waiter has been notified.'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to place order'
      toast({
        title: 'Order failed',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsPlacingOrder(false)
    }
  }, [cartItems, getDisplayNameForItem, isPlacingOrder, restaurantId, selectedTableNumber, toast])

  const getMoodLabel = (mood: MoodOption) =>
    mood.label[language === 'ar_fusha' ? 'ar' : language] ?? mood.label.en

  const contextCopyMap = {
    en: {
      morning: {
        label: 'Morning',
        tone: 'Good Morning',
        heroOpening: 'It is a fresh morning.',
        heroTail: 'A light breakfast and a smooth coffee would feel just right.',
        heroTitle: "Chef's Recommendation for Breakfast",
        picksTitle: 'Excellent Morning Picks',
      },
      lunch: {
        label: 'Lunch',
        tone: 'Good Afternoon',
        heroOpening: 'It is a lively afternoon.',
        heroTail: 'This is a good time for a satisfying meal with a refreshing cold drink.',
        heroTitle: 'Lunch Chef Selection',
        picksTitle: 'Smart Lunch Picks',
      },
      hot: {
        label: 'Hot Day',
        tone: 'Hot Day',
        heroOpening: 'It is a warm day.',
        heroTail: 'Crisp flavors and an icy drink would feel especially refreshing.',
        heroTitle: 'Hot Day Selections',
        picksTitle: 'Brilliant Hot-Day Picks',
      },
      evening: {
        label: 'Evening',
        tone: 'Good Evening',
        heroOpening: 'It is a relaxed evening.',
        heroTail: 'A rich meal and a satisfying drink would suit the mood well.',
        heroTitle: "Chef's Selection Tonight",
        picksTitle: 'Excellent Evening Picks',
      },
      rainy: {
        label: 'Rainy',
        tone: 'Rainy Evening',
        heroOpening: 'It is a rainy moment.',
        heroTail: 'A comforting meal and a soothing drink would feel especially welcome.',
        heroTitle: 'Rainy Day Selection',
        picksTitle: 'Smart Rainy-Day Picks',
      },
      cold: {
        label: 'Cold',
        tone: 'Cold Night',
        heroOpening: 'It is a cool moment.',
        heroTail: 'A warm meal and a cozy drink would feel especially comforting.',
        heroTitle: 'Cold Weather Selection',
        picksTitle: 'Brilliant Cold-Day Picks',
      },
      moodPrompt: 'What are you in the mood for?',
      everything: 'Everything',
      listJoiner: ' and ',
      standingOutSuffix: 'are standing out on the menu right now.',
      mainRecommendation: 'Main recommendation',
      drinkRecommendation: 'Drink recommendation',
      sweetRecommendation: 'Sweet recommendation',
    },
    ar_fusha: {
      morning: {
        label: 'الصباح',
        tone: 'صباح الخير',
        heroOpening: 'إنه صباح منعش.',
        heroTail: 'وجبة فطور خفيفة مع قهوة ناعمة ستكون مناسبة تماماً.',
        heroTitle: 'توصية الشيف للفطور',
        picksTitle: 'اختيارات صباحية ممتازة',
      },
      lunch: {
        label: 'الغداء',
        tone: 'مساء الخير',
        heroOpening: 'إنها فترة بعد ظهر حيوية.',
        heroTail: 'هذا وقت مناسب لوجبة مشبعة مع مشروب بارد ومنعش.',
        heroTitle: 'اختيار الشيف للغداء',
        picksTitle: 'اختيارات غداء ذكية',
      },
      hot: {
        label: 'يوم حار',
        tone: 'أجواء حارة',
        heroOpening: 'إنه يوم دافئ.',
        heroTail: 'النكهات الخفيفة مع مشروب مثلج ستكون منعشة جداً.',
        heroTitle: 'اختيارات اليوم الحار',
        picksTitle: 'اختيارات ذكية للأجواء الحارة',
      },
      evening: {
        label: 'المساء',
        tone: 'مساء الخير',
        heroOpening: 'إنه مساء هادئ.',
        heroTail: 'وجبة غنية مع مشروب مناسب ستلائم الأجواء جيداً.',
        heroTitle: 'اختيار الشيف لهذه الليلة',
        picksTitle: 'اختيارات مسائية ممتازة',
      },
      rainy: {
        label: 'ممطر',
        tone: 'أمسية ممطرة',
        heroOpening: 'إنها لحظة ممطرة.',
        heroTail: 'وجبة مريحة مع مشروب دافئ ستكون مرحباً بها جداً الآن.',
        heroTitle: 'اختيارات اليوم الماطر',
        picksTitle: 'اختيارات ذكية لليوم الماطر',
      },
      cold: {
        label: 'بارد',
        tone: 'ليلة باردة',
        heroOpening: 'إنها لحظة باردة.',
        heroTail: 'وجبة دافئة مع مشروب مريح ستكون مناسبة جداً.',
        heroTitle: 'اختيارات الطقس البارد',
        picksTitle: 'اختيارات رائعة للطقس البارد',
      },
      moodPrompt: 'ما الذي تشتهيه اليوم؟',
      everything: 'الكل',
      listJoiner: ' و',
      standingOutSuffix: 'تتألق في القائمة الآن.',
      mainRecommendation: 'الترشيح الرئيسي',
      drinkRecommendation: 'ترشيح المشروب',
      sweetRecommendation: 'ترشيح الحلوى',
    },
    ku: {
      morning: {
        label: 'بەیانی',
        tone: 'بەیانی باش',
        heroOpening: 'بەیانییەکی تازەیە.',
        heroTail: 'نانێکی بەیانی سووک لەگەڵ قاوەیەکی نەرم زۆر گونجاو دەبێت.',
        heroTitle: 'پێشنیاری شێف بۆ نانی بەیانی',
        picksTitle: 'هەڵبژاردەی باشی بەیانی',
      },
      lunch: {
        label: 'نیوەڕۆ',
        tone: 'نیوەڕۆ باش',
        heroOpening: 'نیوەڕۆیەکی زیندووە.',
        heroTail: 'ئەمە کاتێکی باشە بۆ خواردنێکی تێرکەر لەگەڵ خواردنەوەیەکی سارد و فریش.',
        heroTitle: 'هەڵبژاردنی شێف بۆ نیوەڕۆ',
        picksTitle: 'هەڵبژاردەی زیرەکی نیوەڕۆ',
      },
      hot: {
        label: 'ڕۆژی گەرم',
        tone: 'هەوای گەرم',
        heroOpening: 'ڕۆژێکی گەرمە.',
        heroTail: 'تامە سووکەکان لەگەڵ خواردنەوەیەکی سارد زۆر فریش دەبن.',
        heroTitle: 'هەڵبژاردەی ڕۆژی گەرم',
        picksTitle: 'هەڵبژاردەی زیرەک بۆ هەوای گەرم',
      },
      evening: {
        label: 'ئێوارە',
        tone: 'ئێوارە باش',
        heroOpening: 'ئێوارەیەکی ئارامە.',
        heroTail: 'خواردنێکی دەوڵەمەند لەگەڵ خواردنەوەیەکی گونجاو زۆر لە جێی خۆیدایە.',
        heroTitle: 'هەڵبژاردنی شێف بۆ ئەم ئێوارەیە',
        picksTitle: 'هەڵبژاردەی باشی ئێوارە',
      },
      rainy: {
        label: 'باراناوی',
        tone: 'ئێوارەی باراناوی',
        heroOpening: 'ساتێکی باراناویە.',
        heroTail: 'خواردنێکی ئارامبەخش لەگەڵ خواردنەوەیەکی گەرم زۆر پێویستە.',
        heroTitle: 'هەڵبژاردەی ڕۆژی باراناوی',
        picksTitle: 'هەڵبژاردەی زیرەک بۆ ڕۆژی باراناوی',
      },
      cold: {
        label: 'سارد',
        tone: 'شەوی سارد',
        heroOpening: 'ساتێکی ساردە.',
        heroTail: 'خواردنێکی گەرم لەگەڵ خواردنەوەیەکی خۆش زۆر ئارامبەخش دەبێت.',
        heroTitle: 'هەڵبژاردەی هەوای سارد',
        picksTitle: 'هەڵبژاردەی ناوازە بۆ هەوای سارد',
      },
      moodPrompt: 'ئەمڕۆ حەزت لە چییە؟',
      everything: 'هەموو',
      listJoiner: ' و ',
      standingOutSuffix: 'ئێستا لە مێنیووەکەدا دیارن.',
      mainRecommendation: 'پێشنیاری سەرەکی',
      drinkRecommendation: 'پێشنیاری خواردنەوە',
      sweetRecommendation: 'پێشنیاری شیرینی',
    },
  } as const
  const contextLanguage = language === 'ar' ? 'ar_fusha' : language
  const localizedContextCopy = contextCopyMap[contextLanguage]
  const contextOptions = [
    { key: 'morning', label: localizedContextCopy.morning.label, tone: localizedContextCopy.morning.tone },
    { key: 'lunch', label: localizedContextCopy.lunch.label, tone: localizedContextCopy.lunch.tone },
    { key: 'hot', label: localizedContextCopy.hot.label, tone: localizedContextCopy.hot.tone },
    { key: 'evening', label: localizedContextCopy.evening.label, tone: localizedContextCopy.evening.tone },
    { key: 'rainy', label: localizedContextCopy.rainy.label, tone: localizedContextCopy.rainy.tone },
    { key: 'cold', label: localizedContextCopy.cold.label, tone: localizedContextCopy.cold.tone },
  ] as const
  type ContextKey = (typeof contextOptions)[number]['key']

  const resolveAutoContext = useCallback(
    (preferBrowserTimeZone = false): ContextKey => {
      const weatherLabel = smartSearchFeelingContext?.weatherLabel
      const temperatureFeel = smartSearchFeelingContext?.temperatureFeel

      if (weatherLabel === 'rain' || weatherLabel === 'storm' || weatherLabel === 'snow') return 'rainy'
      if (temperatureFeel === 'cold') return 'cold'
      if (temperatureFeel === 'hot') return 'hot'

      try {
        const browserTimeZone =
          preferBrowserTimeZone && typeof window !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : null
        const effectiveTimeZone = browserTimeZone || menuTimezone || 'Asia/Baghdad'
        const slot = getCurrentTimeSlot(effectiveTimeZone, slotTimes)
        const hour = getHourInTimeZone(effectiveTimeZone)
        return mapSlotToGreetingContext(slot, hour)
      } catch {
        return getAutoContextForTimeZone(menuTimezone)
      }
    },
    [menuTimezone, slotTimes, smartSearchFeelingContext]
  )

  const autoContext = useMemo<ContextKey>(() => resolveAutoContext(false), [resolveAutoContext])
  const selectedContext = autoContext
  const currentContext = contextOptions.find((option) => option.key === autoContext) ?? contextOptions[0]
  const contextHeroMessageMap: Record<ContextKey, string> = {
    morning: localizedContextCopy.morning.heroOpening,
    lunch: localizedContextCopy.lunch.heroOpening,
    hot: localizedContextCopy.hot.heroOpening,
    evening: localizedContextCopy.evening.heroOpening,
    rainy: localizedContextCopy.rainy.heroOpening,
    cold: localizedContextCopy.cold.heroOpening,
  }
  const contextHeroTailMap: Record<ContextKey, string> = {
    morning: localizedContextCopy.morning.heroTail,
    lunch: localizedContextCopy.lunch.heroTail,
    hot: localizedContextCopy.hot.heroTail,
    evening: localizedContextCopy.evening.heroTail,
    rainy: localizedContextCopy.rainy.heroTail,
    cold: localizedContextCopy.cold.heroTail,
  }
  const localizedHeroTail =
    contextLanguage === 'en'
      ? smartSearchFeelingContext?.aiTail || contextHeroTailMap[selectedContext]
      : contextHeroTailMap[selectedContext]
  /** Server composes weather + slot copy in menu-feeling-message (Open-Meteo + restaurant lat/lng + menu timezone). */
  const fallbackHeroMessage = `${contextHeroMessageMap[selectedContext]} ${localizedHeroTail}`.replace(/\s+/g, ' ').trim()
  const activeHeroMessage = smartSearchFeelingContext?.message?.trim()
    ? smartSearchFeelingContext.message.trim()
    : fallbackHeroMessage
  const displayHeroMessage = heroAiLine ?? activeHeroMessage
  const summaryTemplate =
    filteredItems.length === 1
      ? currentCopy.resultsSummarySingular
      : currentCopy.resultsSummaryPlural
  const smartSearchSummary = trimmedSearch
    ? formatTemplate(summaryTemplate, {
      count: filteredItems.length.toString(),
      query: trimmedSearch,
    })
    : displayHeroMessage || currentCopy.smartSearchDescription

  const contextRankedItems = useMemo(() => {
    const scoreItem = (item: MenuItem) => {
      let score = 0
      const name = item.name.toLowerCase()
      const category = (item.category?.name || '').toLowerCase()
      const tags = (item.tags || []).join(' ').toLowerCase()
      const bucket = `${name} ${category} ${tags}`
      const isDrink = isDrinkItem(item)
      const isMain = isMainItem(item)
      const isHeavyMain = /steak|beef|lamb|platter|mixed grill|grill|kebab|shawarma|burger|pasta|rice/.test(bucket)
      const isLightFood = /light|salad|soup|starter|appetizer|toast|egg|falafel|croissant|yogurt|granola/.test(bucket)

      if (item._hints?.isAnchor) score += 30
      if (item._hints?.displayTier === 'hero') score += 24
      if (item._hints?.displayTier === 'featured') score += 18
      if (item._hints?.displayTier === 'standard') score += 10
      if (item._hints?.subGroup?.toLowerCase().includes('chef')) score += 16
      if (item._hints?.subGroup?.toLowerCase().includes('signature')) score += 12
      score += Math.min(item.popularityScore || 0, 40)
      score += Math.min(item.price / 1000, 18)

      if (selectedContext === 'morning') {
        if (isDrink) score += 38
        if (isLightFood) score += 28
        if (/coffee|tea|espresso|latte|cappuccino|americano|juice/.test(bucket)) score += 30
        if (/breakfast|egg|toast|falafel|pastry/.test(bucket)) score += 18
        if (isHeavyMain) score -= 70
        if (isMain && !isLightFood) score -= 30
      }
      if (selectedContext === 'lunch') {
        if (/juice|lemonade|ayran|tea/.test(bucket)) score += 18
        if (/grill|rice|burger|kebab|shawarma|platter|main|fish|chicken|beef|lamb/.test(bucket)) score += 34
      }
      if (selectedContext === 'hot') {
        if (/juice|lemonade|iced|cold|ayran|smoothie|water/.test(bucket)) score += 32
        if (/salad|grill|fish|light|chicken/.test(bucket)) score += 20
      }
      if (selectedContext === 'evening') {
        if (/tea|coffee|juice|mocktail|ayran/.test(bucket)) score += 18
        if (/grill|steak|kebab|fish|lamb|beef|main/.test(bucket)) score += 30
      }
      if (selectedContext === 'rainy' || selectedContext === 'cold') {
        if (isDrink) score += 18
        if (/coffee|tea|espresso|americano|cappuccino|hot chocolate|hot|mocha|latte/.test(bucket)) score += 42
        if (/soup|stew|grill|kebab|lamb|beef|pasta|rice/.test(bucket)) score += 28
      }

      return score
    }

    return baseFilteredItems
      .map((item) => ({ item, score: scoreItem(item) }))
      .sort((a, b) => b.score - a.score)
  }, [baseFilteredItems, isDrinkItem, isMainItem, selectedContext])

  const contextSuggestedCards = useMemo(() => {
    // Score items from the mood-filtered pool so Excellent Picks change when a mood is selected.
    // Hero cards (contextHeroItems) still use baseFilteredItems via contextRankedItems.
    const scoreItem = (item: MenuItem) => {
      const bucket = `${item.name} ${item.category?.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
      let score = 0
      if (item._hints?.isAnchor) score += 30
      if (item._hints?.displayTier === 'hero') score += 24
      if (item._hints?.displayTier === 'featured') score += 18
      score += Math.min(item.popularityScore || 0, 40)
      score += Math.min(item.price / 1000, 18)
      if (selectedContext === 'morning') {
        if (/coffee|tea|espresso|latte|juice/.test(bucket)) score += 30
        if (/breakfast|egg|toast|falafel|pastry/.test(bucket)) score += 18
        if (/steak|beef|lamb|platter|mixed grill/.test(bucket)) score -= 50
      }
      if (selectedContext === 'lunch') {
        if (/juice|lemonade|ayran/.test(bucket)) score += 18
        if (/grill|rice|burger|kebab|shawarma|platter|chicken|beef|lamb|fish/.test(bucket)) score += 34
        if (isBreakfastItem(item)) score -= 80
      }
      if (selectedContext === 'hot') {
        if (/juice|lemonade|iced|cold|ayran|smoothie/.test(bucket)) score += 32
        if (/salad|light|chicken|fish/.test(bucket)) score += 20
        if (isBreakfastItem(item)) score -= 60
      }
      if (selectedContext === 'evening') {
        if (/tea|coffee|juice|mocktail|ayran/.test(bucket)) score += 18
        if (/grill|steak|kebab|fish|lamb|beef|main/.test(bucket)) score += 30
        if (isBreakfastItem(item)) score -= 100
      }
      if (selectedContext === 'rainy' || selectedContext === 'cold') {
        if (/coffee|tea|espresso|cappuccino|hot chocolate|mocha|latte/.test(bucket)) score += 42
        if (/soup|stew|grill|kebab|lamb|beef|pasta|rice/.test(bucket)) score += 28
        if (isBreakfastItem(item)) score -= 80
      }
      return score
    }

    const rankedFromMood = filteredItems
      .map((item) => ({ item, score: scoreItem(item) }))
      .sort((a, b) => b.score - a.score)

    const moodSpecificMains = rankedFromMood.filter(({ item }) => {
      const bucket = `${item.name} ${item.category?.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
      if (selectedMoodId === 'drinks') return false
      if (selectedMoodId === 'light') {
        return !isDrinkItem(item) && !/steak|beef|lamb|mixed grill|grill|kebab|shawarma|burger|pasta|platter|tenderloin/.test(bucket)
      }
      if (selectedMoodId === 'sweet') return isSweetItem(item)
      if (selectedMoodId === 'sharing') return isSharingCandidate(item, selectedContext)
      if (selectedMoodId === 'filling') return isMainItem(item)
      return isMainItem(item)
    })
    const drinks = rankedFromMood.filter(({ item }) => isDrinkItem(item))
    const mains = moodSpecificMains

    if (selectedMoodId === 'sweet') {
      return rankedFromMood
        .filter(({ item }) => isSweetItem(item))
        .sort((a, b) => getSweetPriorityScore(b.item) - getSweetPriorityScore(a.item))
        .slice(0, 2)
        .map(({ item }) => ({ item, kind: getRecommendationKind(item) }))
    }

    if (selectedMoodId === 'drinks') {
      return drinks.slice(0, 2).map(({ item }) => ({ item, kind: 'drink' as const }))
    }

    if (selectedMoodId === 'sweet') {
      return rankedFromMood
        .filter(({ item }) => /dessert|sweet|cake|cookie|ice cream|icecream|kunafa|baklava|pudding|brownie|chocolate|cream/.test(`${item.name} ${item.category?.name || ''} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase()))
        .slice(0, 2)
        .map(({ item }) => ({ item, kind: 'main' as const }))
    }

    if (selectedMoodId === 'sharing') {
      return rankedFromMood
        .filter(({ item }) => isSharingCandidate(item, selectedContext))
        .slice(0, 2)
        .map(({ item }) => ({ item, kind: 'main' as const }))
    }

    const picks: Array<{ item: MenuItem; kind: 'main' | 'drink' | 'sweet' }> = []
    const topMain = mains[0]?.item ?? null
    const topDrink = drinks.find(({ item }) => item.id !== topMain?.id)?.item ?? null
    const topSweet = rankedFromMood
      .filter(({ item }) => item.id !== topMain?.id && item.id !== topDrink?.id)
      .filter(({ item }) => isSweetItem(item))
      .sort((a, b) => getSweetPriorityScore(b.item) - getSweetPriorityScore(a.item))[0]?.item ?? null
    if (topMain) picks.push({ item: topMain, kind: getRecommendationKind(topMain) })
    if (topDrink) {
      picks.push({ item: topDrink, kind: getRecommendationKind(topDrink) })
    } else if (topSweet) {
      picks.push({ item: topSweet, kind: getRecommendationKind(topSweet) })
    }
    return picks
  }, [filteredItems, getRecommendationKind, getSweetPriorityScore, isBreakfastItem, isDrinkItem, isMainItem, isSharingCandidate, isSweetItem, selectedContext, selectedMoodId])

  const contextHeroItems = useMemo(() => {
    if (selectedContext === 'rainy' || selectedContext === 'cold') {
      const topWarmDrink = contextRankedItems.find(({ item }) =>
        isDrinkItem(item) &&
        /coffee|tea|espresso|americano|cappuccino|hot chocolate|mocha|latte/.test(
          `${item.name} ${item.category?.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
        )
      )?.item
      const topMain = contextRankedItems.find(({ item }) => isMainItem(item))?.item
      const ordered = [
        ...(topWarmDrink ? [topWarmDrink] : []),
        ...(topMain ? [topMain] : []),
        ...contextRankedItems.map(({ item }) => item),
      ]
      const unique = new Map<string, MenuItem>()
      ordered.forEach((item) => {
        if (!unique.has(item.id)) unique.set(item.id, item)
      })
      return Array.from(unique.values())
    }

    const unique = new Map<string, MenuItem>()
    contextRankedItems.forEach(({ item }) => {
      if (!unique.has(item.id)) unique.set(item.id, item)
    })
    return Array.from(unique.values()).slice(0, 3)
  }, [contextRankedItems, isDrinkItem, isMainItem, selectedContext])
  const heroTitleMap: Record<ContextKey, string> = {
    morning: localizedContextCopy.morning.heroTitle,
    lunch: localizedContextCopy.lunch.heroTitle,
    hot: localizedContextCopy.hot.heroTitle,
    evening: localizedContextCopy.evening.heroTitle,
    rainy: localizedContextCopy.rainy.heroTitle,
    cold: localizedContextCopy.cold.heroTitle,
  }
  const contextPicksTitleMap: Record<ContextKey, string> = {
    morning: localizedContextCopy.morning.picksTitle,
    lunch: localizedContextCopy.lunch.picksTitle,
    hot: localizedContextCopy.hot.picksTitle,
    evening: localizedContextCopy.evening.picksTitle,
    rainy: localizedContextCopy.rainy.picksTitle,
    cold: localizedContextCopy.cold.picksTitle,
  }
  const selectedContextShowcase = useMemo(() => {
    const matchesTitle = (showcase: ShowcaseSection) => {
      const title = `${showcase.title} ${showcase.activeTimeRange || ''} ${showcase.label || ''}`.toLowerCase()
      if (selectedContext === 'morning') return /breakfast|morning/.test(title)
      if (selectedContext === 'lunch') return /lunch/.test(title)
      if (selectedContext === 'evening') return /evening|dinner|night/.test(title)
      if (selectedContext === 'hot') return /hot|summer|cold drink|cool/.test(title)
      if (selectedContext === 'rainy') return /rain|rainy|warm|comfort/.test(title)
      if (selectedContext === 'cold') return /cold|winter|warm/.test(title)
      return false
    }

    if (selectedContext === 'hot') {
      return topShowcases.find(matchesTitle) || topShowcases.find((showcase) => /lunch|day/.test(showcase.title.toLowerCase())) || null
    }
    if (selectedContext === 'rainy' || selectedContext === 'cold') {
      return topShowcases.find(matchesTitle) || topShowcases.find((showcase) => /evening|dinner|night/.test(showcase.title.toLowerCase())) || null
    }
    return topShowcases.find(matchesTitle) || null
  }, [selectedContext, topShowcases])

  const activeHeroItems = selectedContextShowcase?.items?.length
    ? selectedContextShowcase.items
    : contextHeroItems.length > 0
      ? contextHeroItems
      : heroItems

  const featuredItems = useMemo(() => {
    const excluded = new Set(activeHeroItems.map((item) => item.id))
    const source = baseFilteredItems.filter((item) => !excluded.has(item.id))
    return source.slice(0, 3)
  }, [activeHeroItems, baseFilteredItems])

  const pairingItems = useMemo(() => {
    const source = baseFilteredItems.filter((item) => !activeHeroItems.some((hero) => hero.id === item.id))
    return source.slice(0, 5)
  }, [activeHeroItems, baseFilteredItems])

  const heroTitle =
    contextLanguage === 'en'
      ? selectedContextShowcase?.title || heroTitleMap[selectedContext] || topShowcases[0]?.title || currentCopy.chefRecommendationLabel
      : heroTitleMap[selectedContext] || currentCopy.chefRecommendationLabel
  const isLanguageLoading = language !== 'en' && (!languageContentReady || isTranslating)
  const realStandingOutItems = useMemo(() => {
    const candidates = activeHeroItems.filter((item) => {
      const hints = item._hints
      const isHighPriority =
        hints?.isAnchor ||
        hints?.displayTier === 'hero' ||
        hints?.displayTier === 'featured'
      return isHighPriority && (item.popularityScore || 0) > 0
    })

    return [...candidates]
      .sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0))
      .slice(0, 2)
  }, [activeHeroItems])

  const scarcityItem = baseFilteredItems.find((item) => item._hints?.badgeText === 'Limited Today') || null
  const themePrimary = theme?.primaryColor || '#1c1c1e'
  const themeAccent = theme?.accentColor || '#E8440A'
  const themeChef = theme?.chefPickColor || themeAccent
  const themeBorder = theme?.borderColor || '#d7c9bf'
  const pageBg = theme?.backgroundStyle === 'dark' ? '#151515' : '#fff7f2'
  const surfaceBg = theme?.backgroundStyle === 'dark' ? '#211d1b' : '#ffffff'
  const surfaceSoft = theme?.backgroundStyle === 'dark' ? '#2d2826' : '#fff3ec'
  const textMain = theme?.backgroundStyle === 'dark' ? '#fff8f3' : '#1a0a06'
  const textMuted = theme?.backgroundStyle === 'dark' ? 'rgba(255,248,243,0.68)' : '#9A6A58'
  const headerBg = theme?.backgroundStyle === 'light' ? themePrimary : themePrimary
  const dividerColor = hexToRgba(themeBorder, theme?.backgroundStyle === 'dark' ? 0.28 : 0.45)
  const accentSoft = hexToRgba(themeAccent, theme?.backgroundStyle === 'dark' ? 0.16 : 0.1)
  const accentBorder = hexToRgba(themeAccent, theme?.backgroundStyle === 'dark' ? 0.35 : 0.24)

  const getRecommendationLabel = useCallback((kind: 'main' | 'drink' | 'sweet') => {
    if (kind === 'drink') return localizedContextCopy.drinkRecommendation
    if (kind === 'sweet') return localizedContextCopy.sweetRecommendation
    return localizedContextCopy.mainRecommendation
  }, [localizedContextCopy])

  const getSectionSeeMoreLabel = useCallback((section: { category: CategorySection | null; items: MenuItem[] }) => {
    const categoryName = section.category?.name ?? ''
    const hasDrinkCategoryName = /\b(drink|drinks|beverage|beverages|juice|coffee|tea|smoothie|soda|cocktail|mocktail|hot drinks?|cold drinks?|soft drinks?|ice tea|iced tea|mojito|خواردنەوە|مشروب|مشروبات)\b/i.test(categoryName)
    const visibleKinds = section.items.slice(0, Math.min(section.items.length, 6)).map(getRecommendationKind)
    const drinkCount = visibleKinds.filter((kind) => kind === 'drink').length
    return hasDrinkCategoryName || (visibleKinds.length > 0 && drinkCount >= Math.ceil(visibleKinds.length / 2))
      ? currentCopy.seeMoreDrinksLabel
      : currentCopy.seeMoreDishesLabel
  }, [currentCopy.seeMoreDishesLabel, currentCopy.seeMoreDrinksLabel, getRecommendationKind])

  if (!isLanguageReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: pageBg }}>
        <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen"
      style={
        {
          ...themeStyle,
          backgroundColor: pageBg,
          color: textMain,
        } as React.CSSProperties
      }
    >
      {activeFontLinks.map((url) => (
        <link key={url} href={url} rel="stylesheet" />
      ))}

      {isLanguageLoading && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/92 px-6 py-5 shadow-lg">
            <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            <p className="text-sm font-medium text-slate-700">{currentCopy.loadingLabel}</p>
          </div>
        </div>
      )}

      <div className={`mx-auto min-h-screen max-w-6xl px-4 py-4 transition-[filter,opacity] duration-200 sm:px-6 lg:px-8 ${isLanguageLoading ? 'pointer-events-none blur-[2px]' : ''}`}>
        <div
          className="overflow-hidden rounded-[28px] shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_24px_70px_rgba(0,0,0,0.14)]"
          style={{ backgroundColor: pageBg }}
        >
        <header className="sticky top-0 z-40 text-white" style={{ backgroundColor: headerBg }}>
          <div className="px-5 pb-3 pt-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-menu-title truncate text-[1.3rem] font-bold sm:text-[1.7rem]">
                  {restaurantName || 'Menu'}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.14em] text-white/55">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{currentContext.tone}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Popover open={isLanguageMenuOpen} onOpenChange={setIsLanguageMenuOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-full border"
                      style={{ borderColor: hexToRgba('#ffffff', 0.12), backgroundColor: hexToRgba('#ffffff', 0.05) }}
                      aria-label={`Language: ${currentLanguageLabel}`}
                    >
                      <Globe className="h-4 w-4 text-white" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="w-40 rounded-xl border border-white/15 bg-slate-950/95 p-1 text-sm text-white shadow-xl"
                  >
                    {visibleLanguageOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          if (option.value === language) {
                            setIsLanguageMenuOpen(false)
                            return
                          }
                          setLanguage(option.value)
                          setIsLanguageMenuOpen(false)
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${
                          language === option.value ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5'
                        }`}
                      >
                        <span>{option.label}</span>
                        {language === option.value && <span>✓</span>}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                <button
                  type="button"
                  onClick={() => setTablePickerOpen(true)}
                  className="flex items-center gap-1 rounded-full border px-3 py-1.5"
                  style={{ borderColor: hexToRgba('#ffffff', 0.12), backgroundColor: hexToRgba('#ffffff', 0.05) }}
                >
                  <span className="text-[0.66rem] text-white/55">{currentEngineCopy.tableLabel}</span>
                  <span className="text-[0.8rem] font-bold" style={{ color: themeAccent }}>
                    {selectedTableNumber || '--'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setBasketOpen(true)}
                  className="relative flex h-11 w-11 items-center justify-center rounded-full shadow-[0_10px_25px_rgba(0,0,0,0.24)]"
                  style={{ background: `linear-gradient(135deg, ${themeAccent}, ${themeChef})` }}
                  aria-label={currentEngineCopy.viewOrder}
                >
                  <ShoppingBag className="h-4.5 w-4.5 text-white" />
                  {cartCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full border-2 bg-white px-1 text-[0.65rem] font-bold" style={{ borderColor: headerBg, color: themeChef }}>
                      {cartCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="px-5 pb-3 sm:px-6 lg:px-8">
            <div className="rounded-2xl border p-4" style={{ borderColor: hexToRgba('#ffffff', 0.1), backgroundColor: hexToRgba('#ffffff', 0.06) }}>
              <p className="text-[0.82rem] leading-6 text-white/72">
                {displayHeroMessage || currentCopy.smartSearchDescription}
              </p>
            </div>
          </div>

          <section className="pb-5">
            <div className="px-5 text-[0.64rem] font-bold uppercase tracking-[0.2em] text-white/45 sm:px-6 lg:px-8">
              {heroTitle}
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide sm:gap-3 sm:px-6 lg:px-8">
              {activeHeroItems.slice(0, 3).map((item, index) => {
                const translation = translationCache[language]?.[item.id]
                // 3-slot behavioral economics framework:
                // 0 = Signature (price anchor, gold), 1 = Chef's Recommendation (target, brand), 2 = Guest Favorite (social proof, warm)
                const BADGE_CONFIG = [
                  { label: currentCopy.signatureBadge, bg: 'linear-gradient(135deg, #7A5A0A, #D6A93A)', color: '#FFF8E1', border: '1px solid rgba(255, 243, 204, 0.5)' },
                  { label: currentCopy.chefsRecBadge, bg: `linear-gradient(135deg, ${themeAccent}, ${themeChef})`, color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.18)' },
                  { label: currentCopy.guestFavoriteBadge, bg: 'linear-gradient(135deg, #8B5E3C, #C28A5A)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.18)' },
                ] as const
                const badge = BADGE_CONFIG[index] ?? BADGE_CONFIG[1]
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemForDetail(item)}
                    className="relative h-[152px] w-[31vw] min-w-[112px] max-w-[140px] flex-shrink-0 overflow-hidden rounded-[18px] text-left shadow-[0_18px_46px_rgba(26,10,6,0.24)] sm:h-[188px] sm:w-[33vw] sm:min-w-0 sm:max-w-none lg:h-[220px] lg:w-[calc((100%-1.5rem)/3)]"
                  >
                    <img
                      src={item.imageUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80'}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-black/75" />
                    <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[0.46rem] font-bold uppercase tracking-[0.06em] shadow-[0_4px_10px_rgba(0,0,0,0.22)]"
                        style={{ background: badge.bg, color: badge.color, border: badge.border }}
                      >
                        {badge.label}
                      </span>
                      <span className="flex items-center gap-1 rounded-full bg-black/35 px-1.5 py-0.5 text-[0.52rem] text-white/85">
                        <Flame className="h-2.5 w-2.5" />
                        {item.popularityScore || 0}
                      </span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <div className="font-item text-[0.74rem] font-bold leading-tight text-white sm:text-[1rem]">
                          {translation?.name || item.name}
                        </div>
                        <div className="mt-0.5 text-[0.62rem] text-white/70">
                          {formatMenuPriceWithVariant(item.price, priceVariant)}
                        </div>
                      </div>
                      <span
                        className="inline-flex h-7 w-7 min-h-[1.75rem] min-w-[1.75rem] shrink-0 aspect-square items-center justify-center rounded-full text-base text-white shadow-[0_8px_20px_rgba(0,0,0,0.2)] sm:h-9 sm:w-9 sm:min-h-[2.25rem] sm:min-w-[2.25rem] sm:text-lg"
                        style={{ background: badge.bg }}
                      >
                        +
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        </header>

        <main className="relative pb-36" style={{ backgroundColor: pageBg }}>
          <div className="absolute inset-x-0 top-0 h-6 rounded-t-[26px]" style={{ backgroundColor: pageBg }} />

          {availableMoods.length > 0 && (
            <section className="px-5 pt-7 sm:px-6 lg:px-8">
              <div className="mb-3 text-[0.62rem] font-bold uppercase tracking-[0.16em]" style={{ color: textMuted }}>
                {localizedContextCopy.moodPrompt}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  type="button"
                  onClick={() => setSelectedMoodId(null)}
                  className="flex min-w-[76px] flex-shrink-0 flex-col items-center gap-1 rounded-2xl border px-4 py-3 text-center shadow-sm"
                  style={{
                    borderColor: selectedMoodId == null ? accentBorder : dividerColor,
                    backgroundColor: selectedMoodId == null ? accentSoft : surfaceBg,
                  }}
                >
                  <Sparkles className="h-5 w-5" style={{ color: selectedMoodId == null ? themeAccent : textMain }} />
                  <span className="text-[0.68rem] font-semibold" style={{ color: selectedMoodId == null ? themeAccent : textMain }}>
                    {localizedContextCopy.everything}
                  </span>
                </button>
                {availableMoods.map((mood) => {
                  const active = selectedMoodId === mood.id
                  const MoodIcon =
                    mood.id === 'light' ? Leaf :
                    mood.id === 'filling' ? ChefHat :
                    mood.id === 'sharing' || mood.id === 'share' ? Handshake :
                    mood.id === 'drinks' ? GlassWater :
                    mood.id === 'sweet' ? IceCreamCone :
                    Sparkles
                  return (
                    <button
                      key={mood.id}
                      type="button"
                      onClick={() => setSelectedMoodId(active ? null : mood.id)}
                      className="flex min-w-[76px] flex-shrink-0 flex-col items-center gap-1 rounded-2xl border px-4 py-3 text-center shadow-sm"
                      style={{
                        borderColor: active ? accentBorder : dividerColor,
                        backgroundColor: active ? accentSoft : surfaceBg,
                      }}
                    >
                      <MoodIcon className="h-5 w-5" style={{ color: active ? themeAccent : textMain }} />
                      <span className="text-[0.68rem] font-semibold" style={{ color: active ? themeAccent : textMain }}>
                        {getMoodLabel(mood)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          <section className="space-y-2 px-5 pt-4 sm:px-6 lg:px-8">
            {realStandingOutItems.length > 0 && (
              <div className="flex items-start gap-3 rounded-2xl border p-4" style={{ borderColor: accentBorder, backgroundColor: accentSoft }}>
                <Flame className="mt-0.5 h-4 w-4" style={{ color: themeAccent }} />
                <p className="text-[0.8rem] leading-6" style={{ color: textMain }}>
                  <strong className="font-bold" style={{ color: themeChef }}>
                    {realStandingOutItems.map((item) => getDisplayNameForItem(item)).join(localizedContextCopy.listJoiner)}
                  </strong>{' '}
                  {localizedContextCopy.standingOutSuffix}
                </p>
              </div>
            )}
            {scarcityItem && (
              <div className="flex items-center gap-3 rounded-2xl border p-4" style={{ borderColor: accentBorder, backgroundColor: accentSoft }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: themeAccent }} />
                <p className="text-[0.8rem] leading-6" style={{ color: textMain }}>
                  <strong className="font-bold" style={{ color: themeChef }}>
                    {getDisplayNameForItem(scarcityItem)}
                  </strong>{' '}
                  {currentCopy.limitedTodayLabel.toLowerCase()}.
                </p>
              </div>
            )}
          </section>

          {contextSuggestedCards.length > 0 && (
            <section className="px-5 pt-6 sm:px-6 lg:px-8">
              <div className="mb-3 flex items-end justify-between">
                <h2 className="font-category text-[1.4rem] font-bold" style={{ color: textMain }}>
                  {contextPicksTitleMap[selectedContext]}
                </h2>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {contextSuggestedCards.map(({ item, kind }) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedItemForDetail(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedItemForDetail(item)
                      }
                    }}
                    className="flex items-center gap-3 rounded-[22px] border p-3 text-left shadow-[0_4px_18px_rgba(26,10,6,0.06)]"
                    style={{ borderColor: dividerColor, backgroundColor: surfaceBg }}
                  >
                    <img
                      src={item.imageUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80'}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                      className="h-20 w-20 rounded-2xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-item text-[0.95rem] font-bold" style={{ color: textMain }}>
                        {getDisplayNameForItem(item)}
                      </div>
                      <div className="mt-1 text-[0.72rem]" style={{ color: textMuted }}>
                        {translationCache[language]?.[item.id]?.description || item.description || `${getRecommendationLabel(kind)}.`}
                      </div>
                      <div className="mt-2 text-[0.9rem] font-bold" style={{ color: textMain }}>
                        {formatMenuPriceWithVariant(item.price, priceVariant)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        addToCart(item.id)
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-white"
                      style={{ background: `linear-gradient(135deg, ${themeAccent}, ${themeChef})` }}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Most Ordered section temporarily disabled. Keep featuredItems logic intact for later re-enable. */}

          {categorizedSections.map((section) => {
            const sectionId = section.category?.id || 'uncategorized'
            const expanded = section.category ? expandedCategoryIds.has(section.category.id) : true
            const visibleItems = expanded ? section.items : section.items.slice(0, maxInitialItemsPerCategory)
            const categoryBadgeByItemId = (() => {
              const badgeMap = new Map<string, { label: string; bg: string; color: string; border: string }>()
              const categoryItems = section.items
              if (categoryItems.length === 0) return badgeMap

              const remaining = [...categoryItems]
              const takeItem = (predicate: (item: MenuItem) => boolean, fallback?: (items: MenuItem[]) => MenuItem | null) => {
                const found = remaining.find(predicate) ?? fallback?.(remaining) ?? null
                if (!found) return null
                const next = remaining.filter((item) => item.id !== found.id)
                remaining.splice(0, remaining.length, ...next)
                return found
              }

              const signatureItem = takeItem(
                (item) => item._hints?.isAnchor === true,
                (items) => items.slice().sort((a, b) => b.price - a.price)[0] ?? null
              )
              if (signatureItem) {
                badgeMap.set(signatureItem.id, {
                  label: currentCopy.signatureBadge,
                  bg: 'linear-gradient(135deg, #7A5A0A, #D6A93A)',
                  color: '#FFF8E1',
                  border: '1px solid rgba(255, 243, 204, 0.5)',
                })
              }

              const chefRecItem = takeItem(
                (item) => item._hints?.displayTier === 'featured',
                (items) =>
                  items
                    .slice()
                    .sort((a, b) => {
                      const popularityDelta = (b.popularityScore || 0) - (a.popularityScore || 0)
                      if (popularityDelta !== 0) return popularityDelta
                      return b.price - a.price
                    })[0] ?? null
              )
              if (chefRecItem) {
                badgeMap.set(chefRecItem.id, {
                  label: currentCopy.chefsRecBadge,
                  bg: `linear-gradient(135deg, ${themeAccent}, ${themeChef})`,
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                })
              }

              const guestFavoriteItem = takeItem(
                (item) => (item.popularityScore || 0) > 0,
                (items) =>
                  items
                    .slice()
                    .sort((a, b) => {
                      const priceDelta = a.price - b.price
                      if (priceDelta !== 0) return priceDelta
                      return (b.popularityScore || 0) - (a.popularityScore || 0)
                    })[0] ?? null
              )
              if (guestFavoriteItem) {
                badgeMap.set(guestFavoriteItem.id, {
                  label: currentCopy.guestFavoriteBadge,
                  bg: 'linear-gradient(135deg, #8B5E3C, #C28A5A)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                })
              }

              return badgeMap
            })()
            return (
              <section key={sectionId} ref={section.category ? setSectionRef(section.category.id) : undefined} className="px-5 pt-6 sm:px-6 lg:px-8">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h2 className="font-category text-[1.45rem] font-bold" style={{ color: textMain }}>
                    {section.category ? getLocalizedCategoryName(section.category.name) : 'Menu'}
                  </h2>
                  {section.items.length > maxInitialItemsPerCategory && section.category && !expanded && (
                    <button
                      type="button"
                      onClick={() => setExpandedCategoryIds((prev) => new Set(prev).add(section.category!.id))}
                      className="text-[0.76rem] font-semibold"
                      style={{ color: themeAccent }}
                    >
                      {engineCopyMap[language].showAll}
                    </button>
                  )}
                </div>
                <div className="overflow-hidden rounded-[22px] border shadow-[0_4px_18px_rgba(26,10,6,0.06)]" style={{ borderColor: dividerColor, backgroundColor: surfaceBg }}>
                  {visibleItems.map((item, index) => {
                    const translation = translationCache[language]?.[item.id]
                    const displayName = translation?.name || item.name
                    const displayDescription = translation?.description || item.description || ''
                    const ruleBasedBadge = categoryBadgeByItemId.get(item.id) ?? null
                    const fallbackBadge =
                      item._hints?.isLimitedToday
                        ? { label: currentCopy.limitedTodayLabel, bg: `linear-gradient(135deg, ${themeAccent}, ${themeChef})`, color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.18)' }
                        : null
                    const badge = ruleBasedBadge ?? fallbackBadge
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedItemForDetail(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedItemForDetail(item)
                          }
                        }}
                        className="grid w-full grid-cols-[98px_1fr] text-left sm:grid-cols-[120px_1fr]"
                        style={index !== visibleItems.length - 1 ? { borderBottom: `1px solid ${dividerColor}` } : undefined}
                      >
                        <div className="relative overflow-hidden">
                          <img
                            src={item.imageUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80'}
                            alt={item.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                          {badge && (
                            <span
                              className="absolute bottom-2 left-2 rounded-full px-2 py-1 text-[0.52rem] font-bold uppercase tracking-[0.06em] shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
                              style={{ background: badge.bg, color: badge.color, border: badge.border }}
                            >
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div className="flex min-h-[104px] flex-col justify-between p-3">
                          <div>
                            <div className="font-item text-[0.98rem] font-bold leading-5" style={{ color: textMain }}>
                              {displayName}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[0.72rem] leading-5" style={{ color: textMuted }}>
                              {displayDescription}
                            </div>
                          </div>
                          <div className="mt-3 flex items-end justify-between gap-3">
                            <div>
                              <div className="text-[0.95rem] font-bold" style={{ color: textMain }}>
                                {formatMenuPriceWithVariant(item.price, priceVariant)}
                              </div>
                              <div className="flex items-center gap-1 text-[0.64rem]" style={{ color: textMuted }}>
                                <Flame className="h-3 w-3" />
                                <span>{item.popularityScore || 0} {currentCopy.ordersLabel}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                addToCart(item.id)
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
                              style={{ background: `linear-gradient(135deg, ${themeAccent}, ${themeChef})` }}
                              aria-label={currentEngineCopy.addToOrder}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {section.items.length > maxInitialItemsPerCategory && section.category && !expanded && (
                    <button
                      type="button"
                      onClick={() => setExpandedCategoryIds((prev) => new Set(prev).add(section.category!.id))}
                      className="w-full px-4 py-3 text-[0.78rem] font-semibold"
                      style={{ borderTop: `1px solid ${dividerColor}`, backgroundColor: surfaceSoft, color: themeAccent }}
                    >
                      {formatTemplate(
                        getSectionSeeMoreLabel(section),
                        { count: String(section.items.length - maxInitialItemsPerCategory) }
                      )}
                    </button>
                  )}
                </div>
              </section>
            )
          })}

          {pairingItems.length > 0 && (
            <section className="px-5 pt-5 sm:px-6 lg:px-8">
              <div className="rounded-2xl border p-4" style={{ borderColor: accentBorder, backgroundColor: accentSoft }}>
                <div className="mb-3 text-[0.62rem] font-bold uppercase tracking-[0.14em]" style={{ color: textMuted }}>
                  Complete your meal
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {pairingItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addToCart(item.id)}
                      className="flex flex-shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 shadow-sm"
                      style={{ borderColor: dividerColor, backgroundColor: surfaceBg }}
                    >
                      <img
                        src={item.imageUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80'}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <span className="text-left">
                        <span className="block text-[0.72rem] font-semibold" style={{ color: textMain }}>
                          {getDisplayNameForItem(item)}
                        </span>
                        <span className="block text-[0.64rem]" style={{ color: textMuted }}>
                          {formatMenuPriceWithVariant(item.price, priceVariant)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {orderSuccessMessage && (
            <div className="px-5 pt-5 sm:px-6 lg:px-8">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                {orderSuccessMessage}
              </div>
            </div>
          )}
        </main>

        {cartCount > 0 && (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-6xl px-5 pb-5 sm:px-6 lg:px-8">
            <div className="pointer-events-auto rounded-[18px] p-[1px] shadow-[0_16px_36px_rgba(0,0,0,0.24)]" style={{ background: `linear-gradient(135deg, ${themeAccent}, ${themeChef})` }}>
              <button
                type="button"
                onClick={() => setBasketOpen(true)}
                className="flex w-full items-center justify-between rounded-[17px] bg-transparent px-4 py-4 text-white"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[0.75rem] font-bold">
                    {cartCount}
                  </span>
                  <span className="text-[0.92rem] font-bold">{currentEngineCopy.viewOrder}</span>
                </span>
                <span className="text-[0.92rem] font-bold">
                  {formatMenuPriceWithVariant(cartTotal, priceVariant)}
                </span>
              </button>
            </div>
          </div>
        )}

        {(basketOpen || selectedItemForDetail || tablePickerOpen) && (
          <div className="fixed inset-0 z-50 bg-[rgba(26,10,6,0.55)] backdrop-blur-sm" onClick={() => { setBasketOpen(false); setSelectedItemForDetail(null); setTablePickerOpen(false) }} />
        )}

        {tablePickerOpen && (
          <div className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-h-[70vh] max-w-2xl flex-col overflow-hidden rounded-t-[28px]" style={{ backgroundColor: pageBg }}>
            <div className="mx-auto mt-3 h-1 w-10 rounded-full" style={{ backgroundColor: dividerColor }} />
            <div className="flex items-center justify-between px-5 py-4 sm:px-6" style={{ borderBottom: `1px solid ${dividerColor}` }}>
              <div>
                <h3 className="font-menu-title text-[1.2rem] font-bold" style={{ color: textMain }}>
                  {currentEngineCopy.selectYourTableLabel}
                </h3>
                <p className="mt-1 text-sm" style={{ color: textMuted }}>
                  {currentEngineCopy.tableHelperLabel}
                </p>
              </div>
              <button type="button" onClick={() => setTablePickerOpen(false)} className="rounded-full p-2" style={{ backgroundColor: surfaceSoft, color: textMuted }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                {liveTables.map((table) => {
                  const isAvailable = (table.status ?? 'AVAILABLE') === 'AVAILABLE'
                  return (
                  <button
                    key={table.id}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => {
                      if (!isAvailable) return
                      setSelectedTableNumber(table.number)
                      setTablePickerOpen(false)
                    }}
                    className="aspect-square rounded-2xl text-sm font-semibold transition"
                    style={{
                      backgroundColor: !isAvailable ? surfaceSoft : selectedTableNumber === table.number ? themeAccent : surfaceBg,
                      color: !isAvailable ? textMuted : selectedTableNumber === table.number ? '#ffffff' : textMain,
                      border: `1px solid ${!isAvailable ? dividerColor : selectedTableNumber === table.number ? themeAccent : dividerColor}`,
                      opacity: isAvailable ? 1 : 0.5,
                      cursor: isAvailable ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <span className="block">{table.number}</span>
                    {!isAvailable && (
                      <span className="mt-1 block text-[0.62rem] font-medium uppercase tracking-[0.08em]">
                        {table.status === 'OCCUPIED' ? 'Occupied' : 'Reserved'}
                      </span>
                    )}
                  </button>
                )})}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTableNumber(null)
                  setTablePickerOpen(false)
                }}
                className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold"
                style={{ backgroundColor: surfaceSoft, color: textMain }}
              >
                {currentEngineCopy.noTableLabel}
              </button>
            </div>
          </div>
        )}

        {basketOpen && (
          <div className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-h-[88vh] max-w-4xl flex-col overflow-hidden rounded-t-[28px]" style={{ backgroundColor: pageBg }}>
            <div className="mx-auto mt-3 h-1 w-10 rounded-full" style={{ backgroundColor: dividerColor }} />
            <div className="flex items-center justify-between px-5 py-4 sm:px-6 lg:px-8" style={{ borderBottom: `1px solid ${dividerColor}` }}>
              <h3 className="font-menu-title text-[1.3rem] font-bold" style={{ color: textMain }}>{currentEngineCopy.cartTitle}</h3>
              <button type="button" onClick={() => setBasketOpen(false)} className="rounded-full p-2" style={{ backgroundColor: surfaceSoft, color: textMuted }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 sm:px-6 lg:px-8">
              {cartItems.length === 0 ? (
                <div className="py-14 text-center" style={{ color: textMuted }}>{currentCopy.noItemsMessage}</div>
              ) : (
                <div className="space-y-4">
                  {cartItems.map((line) => (
                    <div key={line.item.id} className="flex items-center gap-3 pb-4" style={{ borderBottom: `1px solid ${dividerColor}` }}>
                      <img
                        src={line.item.imageUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80'}
                        alt={line.item.name}
                        loading="lazy"
                        decoding="async"
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.9rem] font-semibold" style={{ color: textMain }}>
                          {line.translation?.name || line.item.name}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <button type="button" onClick={() => updateCartQuantity(line.item.id, -1)} className="flex h-6 w-6 items-center justify-center rounded-full border" style={{ borderColor: dividerColor, backgroundColor: surfaceBg, color: textMain }}>
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-[18px] text-center text-sm font-bold" style={{ color: textMain }}>{line.quantity}</span>
                          <button type="button" onClick={() => updateCartQuantity(line.item.id, 1)} className="flex h-6 w-6 items-center justify-center rounded-full border" style={{ borderColor: dividerColor, backgroundColor: surfaceBg, color: textMain }}>
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[0.88rem] font-bold" style={{ color: textMain }}>
                          {formatMenuPriceWithVariant(line.item.price * line.quantity, priceVariant)}
                        </div>
                        <button type="button" onClick={() => removeFromCart(line.item.id)} className="mt-1 text-[0.68rem]" style={{ color: textMuted }}>
                          {currentEngineCopy.removeLabel}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-4 sm:px-6 lg:px-8" style={{ borderTop: `1px solid ${dividerColor}` }}>
              {liveTables.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.14em]" style={{ color: textMuted }}>
                    {currentEngineCopy.tableLabel}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                      type="button"
                      onClick={() => setSelectedTableNumber(null)}
                      className="rounded-full border px-3 py-2 text-[0.72rem] font-semibold"
                      style={{
                        borderColor: selectedTableNumber == null ? accentBorder : dividerColor,
                        backgroundColor: selectedTableNumber == null ? accentSoft : surfaceBg,
                        color: selectedTableNumber == null ? themeAccent : textMain,
                      }}
                    >
                      {currentEngineCopy.noTableLabel}
                    </button>
                    {liveTables.map((table) => {
                      const isAvailable = (table.status ?? 'AVAILABLE') === 'AVAILABLE'
                      return (
                      <button
                        key={table.id}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => setSelectedTableNumber(table.number)}
                        className="rounded-full border px-3 py-2 text-[0.72rem] font-semibold"
                        style={{
                          borderColor: !isAvailable ? dividerColor : selectedTableNumber === table.number ? accentBorder : dividerColor,
                          backgroundColor: !isAvailable ? surfaceSoft : selectedTableNumber === table.number ? accentSoft : surfaceBg,
                          color: !isAvailable ? textMuted : selectedTableNumber === table.number ? themeAccent : textMain,
                          opacity: isAvailable ? 1 : 0.55,
                          cursor: isAvailable ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {currentEngineCopy.tableLabel} {table.number}{!isAvailable ? ` · ${table.status === 'OCCUPIED' ? 'Occupied' : 'Reserved'}` : ''}
                      </button>
                    )})}
                  </div>
                  {selectableTables.length === 0 && (
                    <p className="mt-2 text-[0.72rem]" style={{ color: textMuted }}>
                      No tables are currently available. You can still place the order without selecting one.
                    </p>
                  )}
                </div>
              )}
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[0.84rem]" style={{ color: textMuted }}>{currentEngineCopy.totalLabel}</span>
                <span className="font-menu-title text-[1.25rem] font-bold" style={{ color: textMain }}>
                  {formatMenuPriceWithVariant(cartTotal, priceVariant)}
                </span>
              </div>
              <button
                type="button"
                onClick={placeOrder}
                disabled={cartItems.length === 0 || isPlacingOrder}
                className="w-full rounded-2xl px-4 py-4 text-[0.92rem] font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: headerBg }}
              >
                {isPlacingOrder ? currentEngineCopy.placingLabel : currentEngineCopy.placeOrder}
              </button>
            </div>
          </div>
        )}

        {selectedItemForDetail && (
          <div className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-h-[90vh] max-w-4xl flex-col overflow-hidden rounded-t-[28px]" style={{ backgroundColor: pageBg }}>
            <div className="mx-auto mt-3 h-1 w-10 rounded-full" style={{ backgroundColor: dividerColor }} />
            <img
              src={selectedItemForDetail.imageUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80'}
              alt={selectedItemForDetail.name}
              loading="lazy"
              decoding="async"
              className="h-[270px] w-full object-cover sm:h-[320px]"
            />
            <div className="overflow-y-auto px-5 py-5 sm:px-6 lg:px-8">
              <div className="mb-3 flex flex-wrap gap-2">
                {selectedItemForDetail._hints?.isAnchor && (
                  <span className="rounded-full px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.08em] text-white" style={{ background: `linear-gradient(135deg, ${themeAccent}, ${themeChef})` }}>
                    {currentEngineCopy.signatureBadge}
                  </span>
                )}
                {selectedItemForDetail._hints?.displayTier === 'featured' && (
                  <span className="rounded-full px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.08em] text-white" style={{ backgroundColor: headerBg }}>
                    {currentEngineCopy.mostLovedBadge}
                  </span>
                )}
                {selectedItemForDetail._hints?.isLimitedToday && (
                  <span className="rounded-full px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.08em] text-white" style={{ backgroundColor: themeChef }}>
                    {currentCopy.limitedTodayLabel}
                  </span>
                )}
              </div>
              <h3 className="font-menu-title text-[1.6rem] font-bold leading-tight" style={{ color: textMain }}>
                {getDisplayNameForItem(selectedItemForDetail)}
              </h3>
              <p className="mt-3 text-[0.88rem] leading-7" style={{ color: textMuted }}>
                {getDisplayDescriptionForItem(selectedItemForDetail)}
              </p>
              <div className="mt-5 flex items-center justify-between">
                <div className="font-menu-title text-[1.55rem] font-bold" style={{ color: textMain }}>
                  {formatMenuPriceWithVariant(selectedItemForDetail.price, priceVariant)}
                </div>
                <div className="flex items-center gap-1 text-[0.74rem]" style={{ color: textMuted }}>
                  <Flame className="h-3.5 w-3.5" />
                  <span>{selectedItemForDetail.popularityScore || 0} {currentCopy.ordersLabel}</span>
                </div>
              </div>
              {selectedItemForDetail.addOns && selectedItemForDetail.addOns.length > 0 && (
                <div className="mt-6">
                  <div className="mb-3 text-[0.64rem] font-bold uppercase tracking-[0.14em]" style={{ color: textMuted }}>
                    {currentCopy.addOnsLabel}
                  </div>
                  <div className="space-y-2">
                    {selectedItemForDetail.addOns.map((addOn) => (
                      <div key={addOn.id} className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: dividerColor, backgroundColor: surfaceBg }}>
                        <div>
                          <div className="text-sm font-semibold" style={{ color: textMain }}>{getLocalizedAddOnName(addOn.name)}</div>
                          {addOn.description && <div className="text-xs" style={{ color: textMuted }}>{addOn.description}</div>}
                        </div>
                        <div className="text-sm font-bold" style={{ color: textMain }}>+{formatMenuPriceWithVariant(addOn.price, priceVariant)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  addToCart(selectedItemForDetail.id)
                  setSelectedItemForDetail(null)
                }}
                className="mt-6 w-full rounded-2xl px-4 py-4 text-[0.94rem] font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)]"
                style={{ background: `linear-gradient(135deg, ${themeAccent}, ${themeChef})` }}
              >
                {currentEngineCopy.addToOrder}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )

  return (
    <div
      className={`min-h-screen ${bgClass} ${fontClass}`}
      style={{ ...themeStyle, ...bgImageStyle }}
    >
      {activeFontLinks.map(url => (
        <link key={url} href={url} rel="stylesheet" />
      ))}

      {!isLanguageReady ? (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className={`h-7 w-7 animate-spin ${isDarkBg ? 'text-white/70' : 'text-slate-500'}`} />
        </div>
      ) : (
        <>
      {showSnowfall && (
        <Snowfall
          snowflakeCount={120}
          style={{ position: 'fixed', width: '100vw', height: '100vh', zIndex: 9999, pointerEvents: 'none' }}
        />
      )}
      {theme?.backgroundImageUrl && (
        <div className="fixed inset-0 bg-black/40 pointer-events-none z-0" aria-hidden />
      )}
      {/* Sticky header outside overflow-hidden so it can stick when scrolling */}
      <div ref={stickyHeaderRef} className={`sticky top-0 z-40 w-full ${bgClass}`}>
        <div className="relative mx-auto max-w-7xl px-3 sm:px-6 pt-3 sm:pt-6">
          {/* Header: on mobile stack so categories get space; on desktop single row */}
          <header className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
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
                <span className={`font-menu-title font-semibold text-sm sm:text-base truncate max-w-[120px] sm:max-w-[140px] ${isDarkBg ? 'text-white' : 'text-slate-900'}`}>
                  {restaurantName || 'Menu'}
                </span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 ml-auto">
                <CustomerSignInControl
                  isDarkBg={isDarkBg}
                  signInLabel={currentCopy.signInLabel}
                  myVisitsLabel={currentCopy.myVisitsLabel}
                  signOutLabel={currentCopy.signOutLabel}
                />
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
                    {visibleLanguageOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          if (option.value === language) {
                            setIsLanguageMenuOpen(false)
                            return
                          }
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
            </div>
            <nav className="flex-1 min-w-0 flex justify-center overflow-x-auto sm:overflow-visible scrollbar-hide scroll-px-3 -mx-1">
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 py-1 px-1">
                {categorizedSections.filter((s) => s.category).map((section) => {
                  const isActive = (navActiveSectionId ?? activeSectionId) === section.category!.id
                  return (
                    <button
                      key={section.category!.id}
                      type="button"
                      onClick={() => scrollToSection(section.category!.id)}
                      className={`flex-shrink-0 px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${isActive
                          ? isDarkBg
                            ? 'bg-white/14 text-white shadow-sm ring-1 ring-white/12'
                            : 'bg-slate-800 text-white shadow-sm'
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
          </header>
        </div>
      </div>

      <div
        className={`relative overflow-hidden transition-all duration-300 ${theme?.backgroundImageUrl ? 'z-10' : ''} ${isSmartSearchActive ? 'pointer-events-none blur-sm' : 'pointer-events-auto'}`}
      >
        {language !== 'en' && (!languageContentReady || isTranslating) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/88 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/90 px-6 py-5 shadow-lg">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-slate-700">{currentCopy.loadingLabel}</p>
            </div>
          </div>
        )}

        {/* Background Effects */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-32 left-10 h-72 w-72 rounded-full bg-emerald-400 blur-[140px]" />
          <div className="absolute top-20 right-10 h-80 w-80 rounded-full bg-amber-400 blur-[160px]" />
          <div className="absolute bottom-20 left-1/2 h-60 w-60 rounded-full bg-blue-400 blur-[140px]" />
        </div>

        {/* Top of menu: hero carousel (hidden in classic mode — basic menu only). */}
        {topShowcases.length > 0 && engineMode !== 'classic' && (
          <div className="w-full mt-4">
            <MenuCarousel
              key={topShowcases[0].id}
              title={topShowcases[0].title}
              type={topShowcases[0].type}
              variant="hero"
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
              displayFontClassName="font-item"
              displayMode={theme?.menuCarouselStyle === 'static' ? 'static' : 'sliding'}
              chefRecommendationLabel={currentCopy.chefRecommendationLabel}
              activeTimeRange={topShowcases[0].activeTimeRange}
              label={topShowcases[0].label}
              seasonalItemImages={topShowcases[0].seasonalItemImages}
            />
          </div>
        )}

        <div className="relative mx-auto max-w-7xl px-3 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
          {/* Remaining top showcases (hidden in classic mode) */}
          {engineMode !== 'classic' && topShowcases.slice(1).map((showcase) => (
            <MenuCarousel
              key={showcase.id}
              title={showcase.title}
              type={showcase.type}
              variant="hero"
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
              displayFontClassName="font-item"
              displayMode={theme?.menuCarouselStyle === 'static' ? 'static' : 'sliding'}
              chefRecommendationLabel={currentCopy.chefRecommendationLabel}
              activeTimeRange={showcase.activeTimeRange}
              label={showcase.label}
              seasonalItemImages={showcase.seasonalItemImages}
            />
          ))}
          {/* "What do you feel like eating today?" section (mood options) */}
          {engineMode !== 'classic' && availableMoods.length > 0 && (
            <section className="w-full space-y-3" aria-label="What do you feel like eating today?">
              <h2 className={`font-category text-base sm:text-lg font-semibold ${isDarkBg ? 'text-white' : 'text-slate-900'}`}>
                {language === 'ar' || language === 'ar_fusha'
                  ? 'ماذا تشتهي أن تأكل؟'
                  : language === 'ku'
                    ? 'حەزت لە چی خواردنە؟'
                    : 'What do you feel like eating?'}
              </h2>
              <MoodSelector
                moods={availableMoods}
                language={language}
                selectedMoodId={selectedMoodId}
                onSelectMood={setSelectedMoodId}
                showAllLabel={currentEngineCopy.showAll}
                isDarkTheme={isDarkBg}
              />
              {selectedMood && (
                <p className={`text-xs ${isDarkBg ? 'text-white/70' : 'text-slate-600'}`}>
                  Showing {filteredItems.length} items for <strong>{selectedMoodLabel}</strong>. Scrolling to results...
                </p>
              )}
            </section>
          )}

          {/* Search row (always shown; filters button is part of search) */}
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

          <div className="flex justify-end">
            <div
              className={`inline-flex rounded-2xl border p-1 ${
                isDarkBg ? 'border-white/15 bg-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.22)]' : 'border-slate-200 bg-white shadow-sm'
              }`}
              aria-label="Menu layout"
            >
              <button
                type="button"
                onClick={() => setMenuLayout('list')}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition sm:px-4 ${
                  menuLayout === 'list'
                    ? isDarkBg
                      ? 'bg-white/12 text-white'
                      : 'bg-slate-900 text-white'
                    : isDarkBg
                      ? 'text-white/70 hover:bg-white/8'
                      : 'text-slate-600 hover:bg-slate-100'
                }`}
                aria-pressed={menuLayout === 'list'}
              >
                <Rows3 className="h-4 w-4" />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => setMenuLayout('grid')}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition sm:px-4 ${
                  menuLayout === 'grid'
                    ? isDarkBg
                      ? 'bg-white/12 text-white'
                      : 'bg-slate-900 text-white'
                    : isDarkBg
                      ? 'text-white/70 hover:bg-white/8'
                      : 'text-slate-600 hover:bg-slate-100'
                }`}
                aria-pressed={menuLayout === 'grid'}
              >
                <LayoutGrid className="h-4 w-4" />
                <span>Grid</span>
              </button>
            </div>
          </div>

          <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
            <DialogContent className="max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-slate-900">
                  {currentCopy.filterDialogTitle}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  {currentCopy.filterDialogDescription}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 pt-3">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    {currentCopy.filterCategoriesLabel}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition ${selectedCategory === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                      {currentCopy.filterAllLabel}
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
                        {getLocalizedCategoryName(category.name)}
                      </button>
                    ))}
                  </div>
                </div>
                {allTags.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      {currentCopy.filterDietaryLabel}
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
                    {currentCopy.filterSortByLabel}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {localizedSortOptions.map((option) => (
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
                  {currentCopy.filterClearLabel}
                </Button>
                <Button onClick={() => setIsFilterDialogOpen(false)}>
                  {currentCopy.filterApplyLabel}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Active Filters Display (hidden in classic mode) */}
          {engineMode !== 'classic' && (selectedCategory !== 'all' || selectedTags.length > 0) && (
            <div className="flex flex-wrap gap-2 justify-center items-center">
              <span className={`text-xs ${isDarkBg ? 'text-white/60' : 'text-slate-500'}`}>{currentCopy.filtersLabel}</span>
              {selectedCategory !== 'all' && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30"
                >
                  {getLocalizedCategoryName(categories.find((c) => c.id === selectedCategory)?.name)}
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

          {tableSize != null && tableSize > 3 && availableMoods.some((m) => m.id === 'sharing') && (
            <div className="px-4 py-1">
              <button
                type="button"
                onClick={() => setSelectedMoodId('sharing')}
                className={`text-sm font-medium px-3 py-2 rounded-lg w-full text-left transition ${isDarkBg ? 'bg-[var(--menu-accent,#f59e0b)]/20 text-[var(--menu-accent,#f59e0b)] hover:bg-[var(--menu-accent,#f59e0b)]/30' : 'bg-[var(--menu-accent,#f59e0b)]/10 text-[var(--menu-accent,#f59e0b)] hover:bg-[var(--menu-accent,#f59e0b)]/20'}`}
              >
                {currentCopy.groupDiningLabel}
              </button>
            </div>
          )}

          {/* Menu Items — grouped by category with carousels between */}
          <div
            ref={menuListRef}
            className={`space-y-8 sm:space-y-6 relative px-3 sm:px-4 scroll-mt-28 sm:scroll-mt-24 transition-all ${
              menuListFlash ? 'ring-2 ring-[var(--menu-accent,#f59e0b)]/40 rounded-xl p-2' : ''
            }`}
          >
            {filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <p className={isDarkBg ? 'text-white/60' : 'text-slate-500'}>{currentCopy.noItemsMessage}</p>
              </div>
            ) : (
              categorizedSections.map((section) => (
                <div
                  key={section.category?.id || 'uncategorized'}
                  ref={section.category ? setSectionRef(section.category.id) : undefined}
                  className="scroll-mt-28 sm:scroll-mt-24"
                >
                  {section.category && (
                    <div className="mb-4 mt-6 sm:mt-4 first:mt-0">
                      <h2 className={`font-category text-xl sm:text-lg font-bold ${isDarkBg ? 'text-white' : 'text-slate-900'}`}>
                        {getLocalizedCategoryName(section.category.name)}
                      </h2>
                    </div>
                  )}

                  <div className={menuLayout === 'grid' ? 'grid grid-cols-2 gap-3 xl:grid-cols-3' : 'grid gap-3'}>
                    {(() => {
                      const visibleItems =
                        engineMode === 'classic'
                          ? section.items
                          : section.items.filter(
                            (item) => !item._hints?.scrollDepthHide || scrollDepth >= 0.6
                          )
                      const expanded = expandedCategoryIds.has(section.category?.id ?? '')
                      const extraItemIds = new Set(
                        visibleItems.slice(maxInitialItemsPerCategory).map((item) => item.id)
                      )
                      const itemsToShow =
                        engineMode === 'classic'
                          ? visibleItems
                          : expandedCategoryIds.has(section.category?.id ?? '')
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
                        const isExtraRevealedItem = expanded && extraItemIds.has(item.id)
                        const resolvedHints =
                          isExtraRevealedItem && item._hints
                            ? ({
                                ...item._hints,
                                showImage: true,
                                displayTier: 'standard',
                                badgeText: undefined,
                              } as ItemDisplayHints)
                            : item._hints
                        return (
                          <MenuItemCard
                            key={item.id}
                            item={item}
                            hints={resolvedHints}
                            displayName={displayName}
                            displayDescription={displayDescription}
                            macroSegments={macroSegments}
                            getLocalizedCategoryName={getLocalizedCategoryName}
                            getLocalizedTagLabel={getLocalizedTagLabel}
                            getTagIcon={getTagIcon}
                            onDetail={() => setSelectedItemForDetail(item)}
                            onPairings={() => fetchPairingSuggestions(item)}
                            pairingsLabel={currentCopy.pairingsButtonLabel}
                            moreInfoLabel={currentCopy.moreInfoButtonLabel}
                            limitedTodayLabel={currentCopy.limitedTodayLabel}
                            badgeLabels={engineMode === 'classic' || isExtraRevealedItem || resolvedHints?.suppressBadge
                              ? { signature: '', mostLoved: '', chefSelection: '' }
                              : {
                                  signature: currentEngineCopy.signatureBadge,
                                  mostLoved: currentEngineCopy.mostLovedBadge,
                                  chefSelection: currentEngineCopy.chefSelectionBadge,
                                }}
                            loadingPairings={loadingSuggestions}
                            isSelectedForPairing={selectedItemForPairing?.id === item.id}
                            isDarkTheme={isDarkBg}
                            displayPriceOverride={formatMenuPriceWithVariant(item.price, priceVariant)}
                            forceHideImage={hideImages}
                            layout={menuLayout}
                          />
                        )
                      })
                    })()}
                  </div>

                  {section.category && engineMode !== 'classic' && (() => {
                    const visibleItems = section.items.filter(
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

                  {/* Insert carousels between categories (hidden in classic mode) */}
                  {engineMode !== 'classic' && betweenShowcases
                    .filter(
                      (s) =>
                        s.insertAfterCategoryId === section.category?.id
                    )
                    .map((showcase) => (
                      <div key={showcase.id} className="py-4">
                        <MenuCarousel
                          title={showcase.title}
                          type={showcase.type}
                          variant="default"
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
                          displayFontClassName="font-item"
                          displayMode={theme?.menuCarouselStyle === 'static' ? 'static' : 'sliding'}
                          chefRecommendationLabel={currentCopy.chefRecommendationLabel}
                          activeTimeRange={showcase.activeTimeRange}
                          label={showcase.label}
                          seasonalItemImages={showcase.seasonalItemImages}
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
                              loading="lazy"
                              decoding="async"
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
                        loading="lazy"
                        decoding="async"
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
                <div className="rounded-md border border-slate-200 overflow-hidden bg-slate-50 h-64 flex items-center justify-center">
                  <img
                    src={selectedItemForDetail.imageUrl}
                    alt={selectedItemForDetail.name}
                    loading="lazy"
                    decoding="async"
                    className="max-w-full max-h-64 object-contain"
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
                      {currentCopy.optionalAddOnsDescription}
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
              {currentCopy.closeLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}

    </div>
  )
}
