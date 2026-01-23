'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatCurrency } from '@/lib/utils'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Flame, Leaf, X, Loader2, Globe, Funnel } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'

interface MenuItem {
  id: string
  name: string
  description?: string | null
  price: number
  imageUrl?: string | null
  calories?: number | null
  cost?: number | null
  tags?: string[]
  popularityScore?: number
  margin?: number
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
}

interface SmartMenuProps {
  restaurantId: string
  menuItems: MenuItem[]
}

type LanguageCode = 'en' | 'ar' | 'ku'

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
  { value: 'ar', label: 'عربي' },
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

export default function SmartMenu({
  restaurantId,
  menuItems,
}: SmartMenuProps) {
  // Safety check for menuItems
  if (!menuItems || !Array.isArray(menuItems)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <p className="text-white/70">Loading menu...</p>
      </div>
    )
  }

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
    ku: 0,
  })
  const [selectedItemForDetail, setSelectedItemForDetail] =
    useState<MenuItem | null>(null)
  const { toast } = useToast()
  const isDetailOpen = Boolean(selectedItemForDetail)
  const [descriptionCache, setDescriptionCache] = useState<
    Record<LanguageCode, Record<string, string>>
  >({
    en: {},
    ar: {},
    ku: {},
  })
  const [descriptionLoadingItem, setDescriptionLoadingItem] =
    useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
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

  useEffect(() => {
    fetchTranslations('en')
  }, [fetchTranslations])

  useEffect(() => {
    // Preload all supported languages so cross-language queries match translations.
    fetchTranslations('ar')
    fetchTranslations('ku')
  }, [fetchTranslations])

  useEffect(() => {
    // Always fetch translations when language changes, even if cache exists
    // The fetchTranslations function will check if items are actually translated
    fetchTranslations(language)
  }, [language, fetchTranslations])

  useEffect(() => {
    if (isSmartSearchActive && searchOverlayInputRef.current) {
      searchOverlayInputRef.current.focus({ preventScroll: true })
    }
  }, [isSmartSearchActive])

  const currentCopy = uiCopyMap[language]
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
  const highlightItemIds = useMemo(() => {
    const topCandidates = [...menuItems].sort((a, b) => {
      const popularityDiff =
        (b.popularityScore || 0) - (a.popularityScore || 0)
      if (popularityDiff !== 0) {
        return popularityDiff
      }

      return (b.margin || 0) - (a.margin || 0)
    })

    return topCandidates.slice(0, 5).map((item) => item.id)
  }, [menuItems])

  const highMarginItems = useMemo(() => {
    return [...menuItems]
      .filter((item) => item.margin != null)
      .sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))
      .slice(0, 6)
  }, [menuItems])

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

    const highlightSet = new Set(highlightItemIds)
    const highlighted: MenuItem[] = []
    const others: MenuItem[] = []

    items.forEach((item) => {
      if (highlightSet.has(item.id)) {
        highlighted.push(item)
      } else {
        others.push(item)
      }
    })

    return [...highlighted, ...others]
  }, [
    menuItems,
    searchTokens,
    selectedCategory,
    selectedTags,
    sortBy,
    highlightItemIds,
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

  const generateDescription = useCallback(
    async (item: MenuItem, lang: LanguageCode) => {
      setDescriptionError(null)
      setDescriptionLoadingItem(item.id)
      try {
        const response = await fetch('/api/public/menu/item-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            menuItemId: item.id,
            language: lang,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to generate AI description')
        }

        const description = (data.description || '').trim()
        if (!description) {
          throw new Error('AI description was empty')
        }

        setDescriptionCache((prev) => ({
          ...prev,
          [lang]: {
            ...(prev[lang] || {}),
            [item.id]: description,
          },
        }))
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to generate AI description'
        setDescriptionError(message)
        toast({
          title: 'AI description failed',
          description: message,
          variant: 'destructive',
        })
      } finally {
        setDescriptionLoadingItem((current) =>
          current === item.id ? null : current
        )
      }
    },
    [toast]
  )

  const generatedDescription =
    selectedItemForDetail && descriptionCache[language]
      ? descriptionCache[language][selectedItemForDetail.id]
      : undefined

  useEffect(() => {
    if (!selectedItemForDetail || generatedDescription) {
      return
    }
    generateDescription(selectedItemForDetail, language)
  }, [
    selectedItemForDetail,
    language,
    generatedDescription,
    generateDescription,
  ])

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
  return tagTranslations[normalized]?.[language] || tag
}

const getLocalizedCategoryName = (category?: string | null) => {
  if (!category) return 'General'
  if (language === 'en') return category
  const normalized = category.toLowerCase()
  return categoryTranslations[normalized]?.[language] || category
}

const getLocalizedAddOnName = (name: string) => {
  if (language === 'en') return name
  const normalized = name.toLowerCase()
  return addOnTranslations[normalized]?.[language] || name
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
  const isDescriptionLoading =
    Boolean(selectedItemForDetail) &&
    descriptionLoadingItem === selectedItemForDetail?.id
  const detailDescriptionText =
    generatedDescription ||
    detailTranslation?.aiDescription ||
    selectedItemForDetail?.description ||
    'An AI-crafted description is on the way.'

  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div
        className={`relative overflow-hidden transition-all duration-300 ${
          isSmartSearchActive ? 'pointer-events-none blur-sm' : 'pointer-events-auto'
        }`}
      >
        {/* Background Effects */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-32 left-10 h-72 w-72 rounded-full bg-emerald-400 blur-[140px]" />
          <div className="absolute top-20 right-10 h-80 w-80 rounded-full bg-amber-400 blur-[160px]" />
          <div className="absolute bottom-20 left-1/2 h-60 w-60 rounded-full bg-blue-400 blur-[140px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-4 sm:py-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-6">
              <div className="flex-shrink-0">
                <Image
                  src="/logo.png"
                  width={42}
                  height={42}
                  alt="iServePlus logo"
                  className="w-16 h-16 rounded-full border border-white/20 bg-white/5 p-1 shadow-lg object-contain"
                />
              </div>
              <div className="flex-1 text-center">
                <p className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                  Menu
                </p>
              </div>
              <div className="flex-shrink-0">
                <Popover open={isLanguageMenuOpen} onOpenChange={setIsLanguageMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 p-0 text-slate-100 transition hover:bg-white/10"
                      size="sm"
                      aria-label={`Display language: ${currentLanguageLabel}`}
                    >
                      <Globe className="h-4 w-4 text-emerald-200" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="w-40 rounded-lg border border-white/20 bg-slate-950/95 p-1 text-[13px] text-white shadow-2xl"
                  >
                    {languageOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setLanguage(option.value)
                          setIsLanguageMenuOpen(false)
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left transition ${
                          language === option.value
                            ? 'bg-emerald-500/20 text-white'
                            : 'text-white/70 hover:bg-white/5'
                        }`}
                      >
                        <span>{option.label}</span>
                        {language === option.value && (
                          <span className="text-emerald-300">✓</span>
                        )}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {highMarginItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-4">
                  <p className="text-xs uppercase tracking-[0.4em] text-white/60">
                    Highlights
                  </p>
                  <span className="text-xs text-emerald-300">Chef picks</span>
                </div>
                <div className="overflow-x-auto px-4">
                  <div className="flex gap-3 py-2">
                    {highMarginItems.map((item) => {
                      const translation =
                        translationCache[language]?.[item.id]
                      const displayName = translation?.name || item.name

                      return (
                        <div
                          key={item.id}
                          className="min-w-[170px] flex-shrink-0 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-black/40 backdrop-blur"
                        >
                          <div className="h-28 w-full overflow-hidden rounded-t-2xl">
                            <img
                              src={
                                item.imageUrl ||
                                'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=60'
                              }
                              alt={item.name}
                              className="h-28 w-full object-cover transition duration-200 hover:scale-105"
                            />
                          </div>
                          <div className="space-y-1 px-3 py-3 text-sm">
                            <p className="font-semibold text-white line-clamp-2">
                              {displayName}
                            </p>
                            <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                              {getLocalizedCategoryName(item.category?.name)}
                            </p>
                            <div className="flex items-center justify-between text-xs text-white/70">
                              <span>{formatCurrency(item.price)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {/* Search + Filter */}
            <div className="flex justify-center">
              <div
                className={`flex w-full max-w-md items-center gap-3 transition duration-300 ${
                  isSmartSearchActive ? 'opacity-0 pointer-events-none' : ''
                }`}
              >
                <Input
                  placeholder={currentCopy.searchPlaceholder}
                  value={search}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(event) => setSearch(event.target.value)}
                  className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 h-10 text-sm"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex h-9 rounded-full border border-white/20 bg-white/5 px-3 py-0.5 text-white transition hover:bg-white/10"
                  onClick={() => setIsFilterDialogOpen(true)}
                  aria-label="Open filters"
                >
                  <Funnel className="h-4 w-4" />
                  <span className="ml-2 text-xs font-semibold uppercase tracking-[0.3em]">
                    Discover
                  </span>
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
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                          selectedCategory === 'all'
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
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                            selectedCategory === category.id
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
                            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              selectedTags.includes(tag)
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
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                            sortBy === option.value
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
                <span className="text-xs text-white/60">{currentCopy.filtersLabel}</span>
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
                    className="bg-amber-500/20 text-amber-200 border-amber-500/30"
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

            {/* Menu Items Grid */}
            <div className="space-y-4 relative px-4">
              {filteredItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">{currentCopy.noItemsMessage}</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredItems.map((item) => {
                    const translation =
                      translationCache[language]?.[item.id]
                    const displayName = translation?.name || item.name
                    const displayDescription =
                      translation?.description || item.description || ''
                    const macroSegments = buildMacroSegments(item, translation)
                    return (
                      <Card
                        key={item.id}
                        className="overflow-hidden bg-white/95 backdrop-blur text-slate-900 hover:shadow-xl transition-all relative"
                      >
                        <div className="relative">
                          <img
                            src={
                              item.imageUrl ||
                              'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
                            }
                            alt={item.name}
                            className="h-48 w-full object-cover"
                          />
                          {item.popularityScore != null && item.popularityScore > 50 && (
                            <Badge className="absolute top-2 right-2 bg-amber-500 text-white">
                              Popular
                            </Badge>
                          )}
                        </div>
                        <CardContent className="space-y-4 pt-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-semibold leading-tight">
                                {displayName}
                              </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {getLocalizedCategoryName(item.category?.name)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[0.6rem] uppercase tracking-[0.3em] text-slate-500 mt-1">
                                {currentCopy.costLabel}
                              </p>
                              <p className="text-2xl font-bold text-emerald-700 leading-tight">
                                {formatCurrency(item.price)}
                              </p>
                            </div>
                          </div>

                          {macroSegments.length > 0 && (
                            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                              {macroSegments.map((segment) => (
                                <span key={segment}>{segment}</span>
                              ))}
                            </div>
                          )}

                          {displayDescription && (
                            <p className="text-sm text-slate-600 line-clamp-3">
                              {displayDescription}
                            </p>
                          )}

                          {item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {item.tags.map((tag) => {
                                const tagLabel = getLocalizedTagLabel(tag)
                                const hasTranslation = tagTranslations[tag.toLowerCase()]?.[language]
                                const isTagTranslated = language === 'en' || Boolean(hasTranslation)
                                return (
                                  <Badge
                                    key={tag}
                                    variant="secondary"
                                    className={`text-xs py-0 px-2 ${!isTagTranslated ? 'opacity-60' : ''}`}
                                  >
                                    {getTagIcon(tag)}
                                    <span className="ml-1">
                                      {tagLabel}
                                    </span>
                                  </Badge>
                                )
                              })}
                            </div>
                          )}

                          {item.addOns && item.addOns.length > 0 && (
                            <div className="space-y-2 pt-1 border-t border-slate-200">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {currentCopy.addOnsLabel}
                          </p>
                              <div className="flex flex-wrap gap-2">
                                {item.addOns.map((addOn) => (
                                  <div
                                    key={addOn.id}
                                    className="flex items-center gap-1.5 rounded-md bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-700">
                                      {getLocalizedAddOnName(addOn.name)}
                                    </span>
                                    <span className="text-emerald-600 font-semibold">
                                      +{formatCurrency(addOn.price)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fetchPairingSuggestions(item)}
                              disabled={
                                loadingSuggestions &&
                                selectedItemForPairing?.id === item.id
                              }
                              className="w-full"
                            >
                              {loadingSuggestions &&
                              selectedItemForPairing?.id === item.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  {currentCopy.loadingLabel}
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-4 w-4 mr-2" />
                                  {currentCopy.whatGoesWithThis}
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full text-slate-700"
                              onClick={() => setSelectedItemForDetail(item)}
                            >
                              {currentCopy.viewDetails}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
            <footer className="pt-10">
              <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-white/60">
                <span>Powered by</span>
                <span className="font-bold bg-gradient-to-r from-emerald-400 to-amber-400 bg-clip-text text-transparent">
                  Invisible AI
                </span>
              </div>
            </footer>
          </div>
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
                    <Funnel className="h-4 w-4" />
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
            setDescriptionError(null)
            setDescriptionLoadingItem(null)
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
                {currentCopy.detailTitle} —{' '}
                {isDescriptionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    Generating AI description...
                  </>
                ) : (
                  detailDescriptionText
                )}
              </span>
              {descriptionError && (
                <span className="text-xs text-red-300">
                  {descriptionError}
                </span>
              )}
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
    </div>
  )
}
