'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { Sparkles, Flame, Leaf, X, Loader2 } from 'lucide-react'
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
  { value: 'ar', label: 'العربية (العراق)' },
  { value: 'ku', label: 'کوردی (سۆرانی)' },
]

const sortOptions: { value: 'popular' | 'price-low' | 'price-high'; label: string }[] = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'price-low', label: 'Price: Low → High' },
  { value: 'price-high', label: 'Price: High → Low' },
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
    viewDetails: string
    detailTitle: string
  }
> = {
  en: {
    searchPlaceholder: 'Search dishes…',
    filtersLabel: 'Active filters:',
    whatGoesWithThis: 'What goes well with this?',
    noItemsMessage: 'No items match your filters',
    languageLabel: 'Display language',
    costLabel: 'Cost',
    proteinLabel: 'Protein',
    carbsLabel: 'Carbs',
    viewDetails: 'See the full AI description',
    detailTitle: 'Chef insights',
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
    viewDetails: 'عرض الوصف الكامل من الذكاء الاصطناعي',
    detailTitle: 'لمحات الشيف',
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
    viewDetails: 'وەسفی تەواوی AI ببینە',
    detailTitle: 'هەڵەکانی خواردن',
  },
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
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<'popular' | 'price-low' | 'price-high'>(
    'popular'
  )
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

        const translatedMap = data.items.reduce<
          Record<string, MenuItemTranslation>
        >((acc, translated) => {
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
    // Always fetch translations when language changes, even if cache exists
    // The fetchTranslations function will check if items are actually translated
    fetchTranslations(language)
  }, [language, fetchTranslations])

  const currentCopy = uiCopyMap[language]
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

  const filteredItems = useMemo(() => {
    let items = menuItems

    // Search filter
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term)
      )
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
    items = [...items].sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return (b.popularityScore || 0) - (a.popularityScore || 0)
        case 'price-low':
          return a.price - b.price
        case 'price-high':
          return b.price - a.price
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
    search,
    selectedCategory,
    selectedTags,
    sortBy,
    highlightItemIds,
  ])


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
    return tagTranslations[normalized]?.[language] || tag
  }

  const detailTranslation = selectedItemForDetail
    ? translationCache[language]?.[selectedItemForDetail.id]
    : undefined
  const detailMacroSegments = selectedItemForDetail
    ? buildMacroSegments(selectedItemForDetail, detailTranslation)
    : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-32 left-10 h-72 w-72 rounded-full bg-emerald-400 blur-[140px]" />
          <div className="absolute top-20 right-10 h-80 w-80 rounded-full bg-amber-400 blur-[160px]" />
          <div className="absolute bottom-20 left-1/2 h-60 w-60 rounded-full bg-blue-400 blur-[140px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-4 sm:py-6 space-y-3">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/30 bg-gradient-to-r from-emerald-500/20 to-amber-500/20">
              <span className="text-xs font-medium text-emerald-200">Powered by</span>
              <span className="text-sm font-bold bg-gradient-to-r from-emerald-400 to-amber-400 bg-clip-text text-transparent">Invisible AI</span>
            </div>
            <div className="flex flex-col items-center gap-4">
              <Image
                src="/logo.png"
                width={160}
                height={160}
                alt="iServePlus logo"
                className="w-32 h-32 rounded-full border border-white/20 bg-white/5 p-2 shadow-lg"
              />
              <div className="space-y-1">
                <p className="text-4xl sm:text-6xl font-bold tracking-tight text-white">
                  Menu
                </p>
                <p className="text-sm sm:text-base text-white/70 max-w-2xl mx-auto">
                  Discover the menu in English, Iraqi Arabic, or Sorani Kurdish — all translated with care and kept in clear digits.
                </p>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto">
            <Input
              placeholder={currentCopy.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-10 text-sm"
            />
          </div>

          {/* Bubble Filters - Categories */}
          <div className="overflow-x-auto px-4">
            <div className="flex gap-3 pb-3">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  selectedCategory === 'all'
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/50'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                    selectedCategory === category.id
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/50'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* Dietary Tags Filters */}
          {allTags.length > 0 && (
            <div className="overflow-x-auto px-4">
              <div className="flex gap-2 pb-3">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                      selectedTags.includes(tag)
                        ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/50'
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {getTagIcon(tag)}
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sort Options */}
          <div className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex-1 space-y-1">
                <span className="text-xs uppercase tracking-[0.3em] text-white/60">
                  {currentCopy.languageLabel}
                </span>
                <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
                  {languageOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setLanguage(option.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap ${
                        language === option.value
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <span className="text-xs uppercase tracking-[0.3em] text-white/60">
                  Sort
                </span>
                <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
                  {sortOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setSortBy(option.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap ${
                        sortBy === option.value
                          ? 'bg-white text-slate-900 shadow-lg shadow-white/40'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {translationCache[language] && (
              <p className="text-xs text-center text-emerald-200 flex items-center justify-center gap-2">
                {isTranslating && language !== 'en' ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>
                      Translating... (
                      {translatedCount[language] || 0}/{menuItems.length})
                    </span>
                  </>
                ) : (
                  `Language ready: ${
                    languageOptions.find((option) => option.value === language)
                      ?.label
                  }`
                )}
              </p>
            )}
          </div>
          {translationError && (
            <p className="text-xs text-center text-red-300">
              {translationError}
            </p>
          )}

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
          <div className="space-y-4 relative">
              {filteredItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">{currentCopy.noItemsMessage}</p>
                </div>
              ) : (
                <>
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
                                {item.category?.name || 'General'}
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
                                  Loading...
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pairing Suggestions Dialog */}
      <Dialog open={showPairingSuggestions} onOpenChange={setShowPairingSuggestions}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              Perfect Pairings for {selectedItemForPairing?.name}
            </DialogTitle>
            <DialogDescription>
              AI-powered recommendations based on flavor profiles and popular combinations
            </DialogDescription>
          </DialogHeader>

          {loadingSuggestions ? (
            <div className="py-12 text-center">
              <Sparkles className="h-8 w-8 animate-spin mx-auto text-emerald-500" />
              <p className="mt-4 text-sm text-slate-500">
                Analyzing flavor profiles...
              </p>
            </div>
          ) : pairingSuggestions.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              No suggestions available at the moment.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {pairingSuggestions.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-32 w-full object-cover"
                    />
                  )}
                  <CardContent className="space-y-2 pt-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{item.name}</h4>
                        <p className="text-xs text-slate-500">
                          {item.category?.name || 'General'}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-emerald-700">
                        {formatCurrency(item.price)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-slate-600 line-clamp-3">
                        {item.description}
                      </p>
                    )}
                    {item.calories && (
                      <p className="text-xs text-slate-500 font-medium">
                        {item.calories} calories
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
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
            <DialogDescription className="text-sm text-slate-600">
              {currentCopy.detailTitle} —{' '}
              {detailTranslation?.aiDescription ||
                selectedItemForDetail?.description ||
                'An AI-crafted description is on the way.'}
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
