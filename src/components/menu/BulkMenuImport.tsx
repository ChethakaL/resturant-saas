'use client'

import { useEffect, useState, useRef, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ImagePlus,
  Upload,
  Loader2,
  CheckCircle,
  Sparkles,
  Check,
  Trash2,
  X,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  imageOrientationOptions,
  imageSizeOptions,
  type ImageOrientation,
  type ImageSizePreset,
} from '@/lib/image-format'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AddOn, Category, Ingredient } from '@prisma/client'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { classifyItemType, type DefaultCategoryKey } from '@/lib/category-suggest'
import { useDynamicTranslate, useI18n } from '@/lib/i18n'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ParsedIngredient {
  name: string
  quantity: number
  unit: string
  pieceCount?: number | null
  ingredientId?: string | null
}

interface ExtractedMenuItem {
  name: string
  description: string
  price: number
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  tags: string[]
  verified: boolean
  available?: boolean
  status?: 'DRAFT' | 'ACTIVE'
  imageUrl?: string
  categoryId?: string
  categoryName?: string
  recipeSteps?: string[]
  recipeTips?: string[]
  prepTime?: string | null
  cookTime?: string | null
  recipeYield?: number | null
  ingredients?: ParsedIngredient[]
  missingIngredients?: string[]
  addOnIds?: string[]
}

interface BulkMenuImportProps {
  categories: Category[]
  ingredients: Ingredient[]
  defaultBackgroundPrompt?: string | null
}

type ImportDraftTab = 'basic' | 'recipe' | 'details'

interface SmartChefDraftProposal {
  summary: string
  targetTab: ImportDraftTab
  changedFields: string[]
  draft: ExtractedMenuItem
}

const POPUP_COPY = {
  en: {
    importTitle: 'Import Menu Items from Image',
    importDescription: "Upload a photo of your menu and we'll extract all items automatically.",
    uploadHint: 'Click anywhere to upload or drag and drop your menu image',
    uploadMeta: 'PNG, JPG up to 10MB',
  },
  ku: {
    importTitle: 'هاوردەکردنی خواردنەکانی مینیو لە وێنەوە',
    importDescription: 'وێنەیەک لە مینیوەکەت باربکە و هەموو خواردنەکان بە خۆکار دەردەهێنین.',
    uploadHint: 'لە هەر شوێنێک کرتە بکە بۆ بارکردن یان وێنەی مینیوەکەت ڕابکێشە و دابنێ',
    uploadMeta: 'PNG، JPG تا 10MB',
  },
  'ar-fusha': {
    importTitle: 'استيراد أصناف القائمة من صورة',
    importDescription: 'حمّل صورة لقائمتك وسنستخرج جميع الأصناف تلقائياً.',
    uploadHint: 'انقر في أي مكان للرفع أو اسحب وأفلت صورة القائمة',
    uploadMeta: 'PNG، JPG حتى 10MB',
  },
  'ar_fusha': {
    importTitle: 'استيراد أصناف القائمة من صورة',
    importDescription: 'حمّل صورة لقائمتك وسنستخرج جميع الأصناف تلقائياً.',
    uploadHint: 'انقر في أي مكان للرفع أو اسحب وأفلت صورة القائمة',
    uploadMeta: 'PNG، JPG حتى 10MB',
  },
} as const

const TYPE_CATEGORY_NAME_CANDIDATES: Record<DefaultCategoryKey, string[]> = {
  'Signature Dishes': ['signature dishes', 'signature dish', 'signature'],
  'Main Dishes': ['main dishes', 'main dish', 'mains', 'main', 'entree', 'entrees'],
  Shareables: ['shareables', 'shareable', 'appetizer', 'appetizers', 'starter', 'starters', 'mezze'],
  'Add-ons': ['add-ons', 'add on', 'addon', 'addons', 'extras', 'extra', 'toppings', 'topping'],
  Drinks: ['drinks', 'drink', 'beverages', 'beverage', 'coffee', 'tea', 'juice', 'mocktail', 'cocktail'],
  Desserts: ['desserts', 'dessert', 'sweet', 'sweets', 'cake', 'pastry', 'pastries'],
  Kids: ['kids', 'kids menu', 'children', 'child'],
  Sides: ['sides', 'side', 'salads', 'salad', 'fries', 'bread'],
}

const ITEM_TEXT_CATEGORY_RULES: Array<{ keywords: string[]; categoryHints: string[] }> = [
  {
    keywords: ['soup', 'soups', 'broth', 'shorba', 'ramen'],
    categoryHints: ['soup', 'soups', 'shorba'],
  },
  {
    keywords: ['grill', 'grilled', 'bbq', 'kebab', 'kebap'],
    categoryHints: ['grill', 'grills', 'bbq', 'kebab'],
  },
  {
    keywords: ['coffee', 'tea', 'latte', 'cappuccino', 'americano', 'mocha', 'juice', 'soda'],
    categoryHints: ['drink', 'drinks', 'beverage', 'beverages', 'coffee', 'tea'],
  },
  {
    keywords: ['dessert', 'cake', 'ice cream', 'sweet', 'pudding', 'kunafa', 'baklava'],
    categoryHints: ['dessert', 'desserts', 'sweet', 'sweets'],
  },
  {
    keywords: ['salad'],
    categoryHints: ['salad', 'salads', 'sides', 'side'],
  },
]

function normalizeText(value?: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizeCategoryName(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function duplicateImportKey(item: Pick<ExtractedMenuItem, 'name' | 'price'>): string {
  const normalizedName = normalizeText(item.name).replace(/\s+/g, ' ')
  const price = Number(item.price)
  return `${normalizedName}|${Number.isFinite(price) ? price.toFixed(2) : '0.00'}`
}

function dedupeExtractedItems(items: ExtractedMenuItem[]): ExtractedMenuItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = duplicateImportKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function matchCategoryId(categories: Category[], categoryName?: string): string | undefined {
  const normalized = normalizeText(categoryName)
  if (!normalized) return undefined

  const exact = categories.find((c) => normalizeText(c.name) === normalized)
  if (exact) return exact.id

  const partial = categories.find((c) => {
    const cat = normalizeText(c.name)
    return cat.includes(normalized) || normalized.includes(cat)
  })
  if (partial) return partial.id

  return undefined
}

function findCategoryIdByCandidates(categories: Category[], candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined
  const normalizedCandidates = candidates.map((c) => normalizeText(c)).filter(Boolean)
  if (normalizedCandidates.length === 0) return undefined

  const exact = categories.find((category) => {
    const name = normalizeText(category.name)
    return normalizedCandidates.includes(name)
  })
  if (exact) return exact.id

  const partial = categories.find((category) => {
    const name = normalizeText(category.name)
    return normalizedCandidates.some((candidate) => name.includes(candidate) || candidate.includes(name))
  })
  if (partial) return partial.id

  return undefined
}

function inferCategoryByItemText(item: ExtractedMenuItem, categories: Category[]): string | undefined {
  const itemText = normalizeText(
    `${item.name} ${item.description} ${item.categoryName ?? ''} ${(item.tags ?? []).join(' ')}`
  )
  if (!itemText) return undefined

  for (const rule of ITEM_TEXT_CATEGORY_RULES) {
    const matchesRule = rule.keywords.some((keyword) => itemText.includes(keyword))
    if (!matchesRule) continue

    const matchedCategoryId = findCategoryIdByCandidates(categories, rule.categoryHints)
    if (matchedCategoryId) return matchedCategoryId
  }

  return undefined
}

function autoAssignCategoryId(item: ExtractedMenuItem, categories: Category[]): string | undefined {
  const fromName = matchCategoryId(categories, item.categoryName)
  if (fromName) return fromName

  const fromItemText = inferCategoryByItemText(item, categories)
  if (fromItemText) return fromItemText

  const type = classifyItemType({
    id: item.name,
    name: item.name,
    categoryName: item.categoryName ?? null,
    marginPercent: 0,
    unitsSold: 0,
  })

  const fromType = findCategoryIdByCandidates(categories, TYPE_CATEGORY_NAME_CANDIDATES[type] ?? [])
  if (fromType) return fromType

  return undefined
}

export default function BulkMenuImport({ categories, ingredients, defaultBackgroundPrompt }: BulkMenuImportProps) {
  const { toast } = useToast()
  const { t, locale } = useI18n()
  const { t: td } = useDynamicTranslate()
  const popupCopy = POPUP_COPY[locale] ?? POPUP_COPY.en
  const [availableCategories, setAvailableCategories] = useState<Category[]>(categories)
  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>(ingredients)
  const [availableAddOns, setAvailableAddOns] = useState<AddOn[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'upload' | 'extracting' | 'verifying' | 'complete'>('upload')
  const [menuImage, setMenuImage] = useState<string | null>(null)
  const [extractedItems, setExtractedItems] = useState<ExtractedMenuItem[]>([])
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [importProgressMessage, setImportProgressMessage] = useState('')
  const [editingItem, setEditingItem] = useState<ExtractedMenuItem | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<ImportDraftTab>('basic')
  const [smartChefInstruction, setSmartChefInstruction] = useState('')
  const [isSmartChefEditing, setIsSmartChefEditing] = useState(false)
  const [smartChefProposal, setSmartChefProposal] = useState<SmartChefDraftProposal | null>(null)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [imageOrientation, setImageOrientation] = useState<ImageOrientation>('landscape')
  const [imageSizePreset, setImageSizePreset] = useState<ImageSizePreset>('medium')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const formUploadRef = useRef<HTMLInputElement | null>(null)
  const [showMissingIngredientsDialog, setShowMissingIngredientsDialog] = useState(false)
  const [missingIngredients, setMissingIngredients] = useState<string[]>([])
  const [pendingExtractionData, setPendingExtractionData] = useState<any>(null)

  useEffect(() => {
    setAvailableCategories(categories)
  }, [categories])

  useEffect(() => {
    setAvailableIngredients(ingredients)
  }, [ingredients])

  useEffect(() => {
    if (!isOpen) return
    fetch('/api/addons')
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setAvailableAddOns(data)
      })
      .catch(() => setAvailableAddOns([]))
  }, [isOpen])

  const ensureCategoriesAndAssign = async (items: ExtractedMenuItem[]): Promise<ExtractedMenuItem[]> => {
    let nextCategories = [...availableCategories]
    const names: string[] = []
    const seen = new Set<string>()

    for (const item of items) {
      const cleaned = normalizeCategoryName(item.categoryName)
      const normalized = normalizeText(cleaned)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      names.push(cleaned)
    }

    if (names.length > 0) {
      let existing = new Set(nextCategories.map((c) => normalizeText(c.name)))
      let missing = names.filter((name) => !existing.has(normalizeText(name)))

      if (missing.length > 0) {
        const refresh = await fetch('/api/categories')
        if (refresh.ok) {
          const refreshed = await refresh.json()
          if (Array.isArray(refreshed)) {
            nextCategories = refreshed as Category[]
            setAvailableCategories(nextCategories)
          }
        }
      }

      existing = new Set(nextCategories.map((c) => normalizeText(c.name)))
      missing = names.filter((name) => !existing.has(normalizeText(name)))

      if (missing.length > 0) {
        let nextOrder =
          nextCategories.reduce((max, c) => (c.displayOrder > max ? c.displayOrder : max), -1) + 1
        for (const name of missing) {
          const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              description: 'Auto-created from menu import',
              displayOrder: nextOrder,
            }),
          })
          if (res.ok) {
            const created = (await res.json()) as Category
            nextCategories = [...nextCategories, created]
            nextOrder += 1
          }
        }

        const finalRefresh = await fetch('/api/categories')
        if (finalRefresh.ok) {
          const refreshed = await finalRefresh.json()
          if (Array.isArray(refreshed)) nextCategories = refreshed as Category[]
        }
        setAvailableCategories(nextCategories)
      }
    }

    return items.map((item) => ({
      ...item,
      categoryId: item.categoryId || autoAssignCategoryId(item, nextCategories),
    }))
  }

  const updateItem = (index: number, updates: Partial<ExtractedMenuItem>) => {
    setExtractedItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)))
  }

  const updateEditingItem = (updates: Partial<ExtractedMenuItem>) => {
    setSmartChefProposal(null)
    setEditingItem((current) => (current ? { ...current, ...updates } : current))
  }

  const openItemDetail = (index: number, tab: ImportDraftTab = 'basic') => {
    if (expandedIndex !== null && editingItem) {
      setExtractedItems((prev) => prev.map((item, i) => (i === expandedIndex ? { ...editingItem } : item)))
    }
    setExpandedIndex(index)
    setEditingItem({ ...extractedItems[index] })
    setActiveDetailTab(tab)
    setSmartChefInstruction('')
    setSmartChefProposal(null)
  }

  const closeItemDetail = () => {
    if (expandedIndex !== null && editingItem) {
      setExtractedItems((prev) => prev.map((item, i) => (i === expandedIndex ? { ...editingItem } : item)))
    }
    setExpandedIndex(null)
    setEditingItem(null)
    setSmartChefInstruction('')
    setSmartChefProposal(null)
    setActiveDetailTab('basic')
  }

  const deleteItem = (index: number) => {
    setExtractedItems((prev) => prev.filter((_, i) => i !== index))
    if (expandedIndex === index) {
      setExpandedIndex(null)
      setEditingItem(null)
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1)
    }
  }

  const assignCategoryToUncategorized = (categoryId: string) => {
    let count = 0
    setExtractedItems((prev) =>
      prev.map((item) => {
        if (!item.categoryId) {
          count += 1
          return { ...item, categoryId }
        }
        return item
      })
    )

    if (count > 0) {
      const categoryName = availableCategories.find((c) => c.id === categoryId)?.name
      toast({
        title: 'Category assigned',
        description: `Applied "${categoryName}" to ${count} uncategorized item${count > 1 ? 's' : ''}.`,
      })
    }
  }

  const itemsWithoutCategory = extractedItems.filter((i) => !i.categoryId).length
  const itemsWithIssues = extractedItems.filter((i) => !i.categoryId || !i.name.trim() || !i.price || i.price <= 0).length
  const visibleEditingItem = smartChefProposal?.draft ?? editingItem

  const openImageDialog = () => {
    setPreviewImageUrl(null)
    setCustomPrompt('')
    const current = editingItem?.imageUrl
    if (current && current.startsWith('data:')) {
      setUploadedPhoto(current)
    } else {
      setUploadedPhoto(null)
    }
    setShowImageDialog(true)
  }

  const handlePhotoUploadDialog = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setUploadedPhoto(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setMenuImage(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const extractMenuItems = async (confirmMissing = false) => {
    if (!menuImage) return

    setIsProcessing(true)
    setStep('extracting')
    setImportProgressMessage('Uploading image to AI...')

    try {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 120000)
      const progressTimers = [
        window.setTimeout(() => setImportProgressMessage('Reading menu text and prices...'), 5000),
        window.setTimeout(() => setImportProgressMessage('Generating categories, recipes, and form details...'), 15000),
        window.setTimeout(() => setImportProgressMessage('Still working. Large menus can take up to two minutes.'), 35000),
        window.setTimeout(() => setImportProgressMessage('This is taking longer than usual. Please keep this window open.'), 70000),
      ]
      let response: Response
      try {
        response = await fetch('/api/menu/extract-from-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          imageData: menuImage,
          confirmMissingIngredients: confirmMissing
        }),
        })
      } finally {
        window.clearTimeout(timeoutId)
        progressTimers.forEach((timer) => window.clearTimeout(timer))
      }

      const data = await response.json()

      if (!response.ok) {
        const message = data.details || data.error || 'Failed to extract menu items'
        const error = new Error(message) as Error & { code?: string; status?: number }
        error.code = data.code
        error.status = response.status
        throw error
      }

      // Check if we need to confirm missing ingredients
      if (data.requiresConfirmation && !confirmMissing) {
        setMissingIngredients(data.missingIngredients || [])
        setPendingExtractionData(data)
        setShowMissingIngredientsDialog(true)
        setIsProcessing(false)
        setStep('upload')
        return
      }

      const extracted: ExtractedMenuItem[] = (data.items || []).map((item: ExtractedMenuItem) => ({
        ...item,
        protein: item.protein ?? null,
        carbs: item.carbs ?? null,
        status: item.status || 'ACTIVE',
        available: item.available ?? true,
        ingredients: (item.ingredients || []).map((ingredient) => {
          const existing = availableIngredients.find(
            (available) => normalizeText(available.name) === normalizeText(ingredient.name)
          )
          return {
            ...ingredient,
            ingredientId: existing?.id || ingredient.ingredientId || null,
            unit: existing?.unit || ingredient.unit || 'g',
          }
        }),
        verified: true,
      }))
      const items = dedupeExtractedItems(await ensureCategoriesAndAssign(extracted))

      setExtractedItems(items)
      setExpandedIndex(null)
      setEditingItem(null)
      setStep('verifying')

      if (items.length > 0) {
        const autoAssigned = items.filter((item) => !!item.categoryId).length
        const ingredientsCreated = data.ingredientsCreated || 0
        toast({
          title: 'Menu extracted',
          description: `Extracted ${items.length} items. Auto-categorized ${autoAssigned}.${ingredientsCreated > 0 ? ` Created ${ingredientsCreated} new ingredients.` : ''}`,
        })
      }
    } catch (error) {
      console.error('Error extracting menu items:', error)
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status?: number }).status
        : undefined
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: string }).code
        : undefined
      const description = isAbort
        ? 'Menu import timed out. Please try importing the same image again, or upload a clearer/smaller image.'
        : status === 503 || code === 'AI_OVERLOADED'
          ? 'AI is overloaded right now. Please wait a minute and try importing the same image again.'
          : status === 504 || code === 'AI_TIMEOUT'
            ? 'The import took too long. Please try again, or upload a clearer/smaller menu image.'
            : error instanceof Error
              ? error.message
              : 'Failed to extract menu items. Please try importing again.'
      toast({
        title: status === 503 || code === 'AI_OVERLOADED' ? 'AI is busy' : 'Import failed',
        description,
        variant: 'destructive',
      })
      setStep('upload')
    } finally {
      setIsProcessing(false)
      setImportProgressMessage('')
    }
  }

  const handleConfirmMissingIngredients = async () => {
    setShowMissingIngredientsDialog(false)
    await extractMenuItems(true)
  }

  const generateOrEnhanceImage = async () => {
    if (!editingItem) return

    setIsGeneratingImage(true)
    setPreviewImageUrl(null)
    try {
      if (uploadedPhoto) {
        const response = await fetch('/api/menu/enhance-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: uploadedPhoto,
            prompt: customPrompt.trim() || defaultBackgroundPrompt?.trim() || undefined,
            orientation: imageOrientation,
            sizePreset: imageSizePreset,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to enhance image')
        setPreviewImageUrl(data.imageUrl)
        toast({ title: 'Image enhanced', description: 'Your photo has been professionally enhanced.' })
      } else {
        const response = await fetch('/api/menu/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemName: visibleEditingItem?.name,
            description: visibleEditingItem?.description,
            category: availableCategories.find((c) => c.id === visibleEditingItem?.categoryId)?.name,
            orientation: imageOrientation,
            sizePreset: imageSizePreset,
            prompt: customPrompt.trim() || defaultBackgroundPrompt?.trim() || null,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to generate image')
        setPreviewImageUrl(data.imageUrl)
      }
    } catch (error) {
      toast({
        title: uploadedPhoto ? 'Enhancement Failed' : 'Image Generation Failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const normalizeProposedDraft = (draft: ExtractedMenuItem): ExtractedMenuItem => {
    const categoryId =
      draft.categoryId ||
      matchCategoryId(availableCategories, draft.categoryName) ||
      editingItem?.categoryId

    return {
      ...(editingItem ?? {}),
      ...draft,
      categoryId,
      verified: true,
      tags: Array.isArray(draft.tags) ? draft.tags.filter(Boolean) : [],
      recipeSteps: Array.isArray(draft.recipeSteps) ? draft.recipeSteps.filter(Boolean) : [],
      recipeTips: Array.isArray(draft.recipeTips) ? draft.recipeTips.filter(Boolean) : [],
      ingredients: Array.isArray(draft.ingredients)
        ? draft.ingredients.filter((ingredient) => ingredient.name.trim())
        : [],
    }
  }

  const requestSmartChefDraftEdit = async () => {
    if (!editingItem || !smartChefInstruction.trim()) return

    setIsSmartChefEditing(true)
    setSmartChefProposal(null)
    try {
      const response = await fetch('/api/menu/import-draft-smart-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: editingItem,
          instruction: smartChefInstruction.trim(),
          categories: availableCategories.map((category) => category.name),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Smart Chef failed to edit this item')

      const proposal: SmartChefDraftProposal = {
        summary: data.summary || 'Smart Chef proposed an edit.',
        targetTab: data.targetTab || 'basic',
        changedFields: Array.isArray(data.changedFields) ? data.changedFields : [],
        draft: normalizeProposedDraft(data.draft || editingItem),
      }
      setSmartChefProposal(proposal)
      setActiveDetailTab(proposal.targetTab)
    } catch (error) {
      toast({
        title: 'Smart Chef edit failed',
        description: error instanceof Error ? error.message : 'Could not edit this draft',
        variant: 'destructive',
      })
    } finally {
      setIsSmartChefEditing(false)
    }
  }

  const approveSmartChefProposal = () => {
    if (!smartChefProposal) return
    setEditingItem(smartChefProposal.draft)
    setSmartChefProposal(null)
    setSmartChefInstruction('')
    toast({ title: 'Smart Chef edit applied', description: smartChefProposal.summary })
  }

  const discardSmartChefProposal = () => {
    setSmartChefProposal(null)
    toast({ title: 'Smart Chef edit discarded' })
  }

  const proposalTouches = (fields: string[]) =>
    smartChefProposal?.changedFields.some((field) => fields.includes(field)) ?? false

  const addRecipeStep = () => {
    updateEditingItem({ recipeSteps: [...(editingItem?.recipeSteps || []), ''] })
  }

  const addRecipeTip = () => {
    updateEditingItem({ recipeTips: [...(editingItem?.recipeTips || []), ''] })
  }

  const selectedIngredientCost = (ingredient: ParsedIngredient) => {
    const existing = availableIngredients.find((item) => item.id === ingredient.ingredientId || normalizeText(item.name) === normalizeText(ingredient.name))
    if (!existing) return null
    return {
      unit: existing.unit,
      costPerUnit: existing.costPerUnit,
      directCost: (Number(ingredient.quantity) || 0) * existing.costPerUnit,
    }
  }

  const trimmedSavedBackgroundPrompt = (defaultBackgroundPrompt ?? '').trim()
  const currentOrientationOption =
    imageOrientationOptions.find((o) => o.value === imageOrientation) ?? imageOrientationOptions[0]
  const currentSizeOption =
    imageSizeOptions.find((o) => o.value === imageSizePreset) ?? imageSizeOptions[1]

  const createAllItems = async (items: ExtractedMenuItem[]) => {
    setIsProcessing(true)

    try {
      const errors: string[] = []

      // Refresh ingredients list to get newly created ones
      const ingredientsResponse = await fetch('/api/ingredients')
      let currentIngredients = availableIngredients
      if (ingredientsResponse.ok) {
        currentIngredients = await ingredientsResponse.json()
        setAvailableIngredients(currentIngredients)
      }

      let ingredientMap = new Map(
        currentIngredients.map(ing => [ing.name.toLowerCase().trim(), ing])
      )

      const uniqueItems = dedupeExtractedItems(items)
      let skippedDuplicates = items.length - uniqueItems.length

      for (const item of uniqueItems) {
        if (!item.categoryId) {
          errors.push(`${item.name}: Missing category`)
          continue
        }

        const ingredientData = []
        for (const ing of item.ingredients || []) {
          let existingIng = ing.ingredientId
            ? currentIngredients.find((ingredient) => ingredient.id === ing.ingredientId)
            : ingredientMap.get(ing.name.toLowerCase().trim())
          if (!existingIng) {
            const createIngredientResponse = await fetch('/api/ingredients', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: ing.name,
                unit: ing.unit || 'g',
                costPerUnit: 0,
                stockQuantity: 0,
                minStockLevel: 0,
              }),
            })
            if (createIngredientResponse.ok) {
              existingIng = await createIngredientResponse.json()
              currentIngredients = [...currentIngredients, existingIng]
              ingredientMap = new Map(currentIngredients.map((ingredient) => [ingredient.name.toLowerCase().trim(), ingredient]))
            }
          }
          if (!existingIng) {
            console.warn(`Ingredient not found: ${ing.name}`)
            continue
          }
          ingredientData.push({
            ingredientId: existingIng.id,
            quantity: ing.quantity,
            unit: existingIng.unit || ing.unit,
            pieceCount: ing.pieceCount,
          })
        }

        const response = await fetch('/api/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.name,
            description: item.description || '',
            price: Number(item.price) || 0,
            categoryId: item.categoryId,
            imageUrl: item.imageUrl || '',
            calories: item.calories ? Number(item.calories) : null,
            protein: item.protein ? Number(item.protein) : null,
            carbs: item.carbs ? Number(item.carbs) : null,
            tags: item.tags || [],
            available: item.available ?? true,
            status: item.status || 'ACTIVE',
            ingredients: ingredientData,
            recipeSteps: item.recipeSteps || [],
            recipeTips: item.recipeTips || [],
            prepTime: item.prepTime || null,
            cookTime: item.cookTime || null,
            addOnIds: item.addOnIds || [],
            dedupeExisting: true,
          }),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          errors.push(`${item.name}: ${data.error || 'Failed to create'}`)
        } else if (data.duplicate || data.skipped) {
          skippedDuplicates += 1
        }
      }

      const createdCount = items.length - errors.length - skippedDuplicates

      if (errors.length > 0) {
        console.error('Errors creating items:', errors)
        toast({
          title: 'Partial Success',
          description: `Created ${createdCount} of ${items.length} items. Skipped ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? '' : 's'}. Some items failed.`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Success',
          description: `Created ${createdCount} menu item${createdCount === 1 ? '' : 's'} successfully with recipes.${skippedDuplicates > 0 ? ` Skipped ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? '' : 's'}.` : ''}`,
        })
      }

      setStep('complete')
      setTimeout(() => {
        setIsOpen(false)
        window.location.reload()
      }, 2000)
    } catch (error) {
      console.error('Error creating menu items:', error)
      toast({ title: 'Error', description: 'Failed to create some menu items', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCreateAll = async () => {
    let itemsToValidate = extractedItems

    if (expandedIndex !== null && editingItem) {
      itemsToValidate = extractedItems.map((item, i) => (i === expandedIndex ? { ...editingItem } : item))
      setExtractedItems(itemsToValidate)
      setExpandedIndex(null)
      setEditingItem(null)
    }

    itemsToValidate = await ensureCategoriesAndAssign(itemsToValidate)
    setExtractedItems(itemsToValidate)

    const issues: string[] = []
    itemsToValidate.forEach((item, i) => {
      if (!item.name.trim()) issues.push(`Item ${i + 1}: Missing name`)
      if (!item.price || item.price <= 0) issues.push(`${item.name || `Item ${i + 1}`}: Invalid price`)
      if (!item.categoryId) issues.push(`${item.name || `Item ${i + 1}`}: No category`)
    })

    if (issues.length > 0) {
      toast({
        title: `${issues.length} issue${issues.length > 1 ? 's' : ''} found`,
        description: issues.length <= 3 ? issues.join('. ') : `${issues.slice(0, 3).join('. ')} and ${issues.length - 3} more.`,
        variant: 'destructive',
      })
      return
    }

    await createAllItems(itemsToValidate)
  }

  const resetModal = () => {
    setStep('upload')
    setMenuImage(null)
    setExtractedItems([])
    setExpandedIndex(null)
    setEditingItem(null)
    setIsProcessing(false)
    setImportProgressMessage('')
    setUploadedPhoto(null)
    setPreviewImageUrl(null)
    setCustomPrompt('')
    setSmartChefInstruction('')
    setSmartChefProposal(null)
    setActiveDetailTab('basic')
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setIsOpen(true); resetModal() }}>
        <ImagePlus className="h-4 w-4 mr-2" />
        {t.menu_add_by_image}
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetModal(); setIsOpen(open) }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0 sm:rounded-lg">
          <DialogHeader className="shrink-0">
            <div className="px-6 pt-6">
              <DialogTitle>{popupCopy.importTitle}</DialogTitle>
            </div>
            <DialogDescription>
              <div className="px-6 pb-2">
                {popupCopy.importDescription}
              </div>
            </DialogDescription>
          </DialogHeader>

          {step === 'upload' && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
              <Label htmlFor="menu-image" className="block cursor-pointer">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors">
                  <Upload className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                  <div className="text-sm text-slate-600 mb-2 font-medium">
                    {popupCopy.uploadHint}
                  </div>
                  <div className="text-xs text-slate-500">{popupCopy.uploadMeta}</div>
                </div>
              </Label>
              <Input
                id="menu-image"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              {menuImage && (
                <div className="space-y-4">
                  <div className="border rounded-lg overflow-hidden max-h-[360px] flex items-center justify-center bg-slate-50">
                    <img src={menuImage} alt="Menu" className="max-w-full w-auto max-h-[360px] object-contain" />
                  </div>
                  <Button onClick={() => extractMenuItems()} className="w-full" disabled={isProcessing}>
                    {td('Extract Menu Items')}
                  </Button>
                </div>
              )}
              </div>
            </div>
          )}

          {step === 'extracting' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-16 w-16 animate-spin text-emerald-500" />
              <p className="text-lg font-medium">{td('Analyzing your menu...')}</p>
              <div className="w-full max-w-sm space-y-3 px-6">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-500" />
                </div>
                <p className="text-center text-sm text-slate-500">
                  {td(importProgressMessage || 'This may take a few moments')}
                </p>
                <p className="text-center text-xs text-slate-400">
                  {td('If the AI is overloaded, we will tell you to try again instead of failing silently.')}
                </p>
              </div>
            </div>
          )}

          {step === 'verifying' && extractedItems.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="shrink-0 space-y-3 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      {extractedItems.length} item{extractedItems.length !== 1 ? 's' : ''} extracted
                    </p>
                    {itemsWithoutCategory > 0 && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {itemsWithoutCategory} item{itemsWithoutCategory !== 1 ? 's' : ''} missing a category
                      </p>
                    )}
                  </div>
                  {itemsWithoutCategory > 0 && (
                    <Select onValueChange={assignCategoryToUncategorized}>
                      <SelectTrigger className="w-full sm:w-[220px] text-xs h-9 bg-white">
                        <SelectValue placeholder={`Set category for ${itemsWithoutCategory} uncategorized`} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 pr-1">
                {expandedIndex === null || !editingItem ? (
                  <div className="space-y-2">
                    {extractedItems.map((item, index) => {
                      const hasIssues = !item.categoryId || !item.name.trim() || !item.price || item.price <= 0
                      const categoryName = availableCategories.find((c) => c.id === item.categoryId)?.name

                      return (
                        <div
                          key={index}
                          className={`border rounded-lg transition-all ${hasIssues
                            ? 'border-amber-300 bg-amber-50/30'
                            : 'border-slate-200 bg-white'
                            }`}
                        >
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 p-3 text-left"
                            onClick={() => openItemDetail(index)}
                          >
                            <span className="text-xs font-medium text-slate-400 mt-1 w-6 text-right shrink-0">
                              {index + 1}
                            </span>

                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {item.name || <span className="text-red-400 italic">{td('Unnamed item')}</span>}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                <span className="text-xs font-medium text-slate-600">
                                  IQD {(item.price || 0).toLocaleString('en-US')}
                                </span>
                                {categoryName ? (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                                    {categoryName}
                                  </Badge>
                                ) : (
                                  <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                                    <AlertCircle className="h-2.5 w-2.5" />
                                    {td('No category')}
                                  </span>
                                )}
                                {(item.ingredients?.length ?? 0) > 0 && (
                                  <span className="text-[10px] text-emerald-700">
                                    {item.ingredients?.length} {td('ingredients')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
                            <Select
                              value={item.categoryId || ''}
                              onValueChange={(value) => updateItem(index, { categoryId: value })}
                            >
                              <SelectTrigger className="h-8 w-[160px] text-xs shrink-0 bg-white">
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableCategories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-red-50"
                              onClick={() => deleteItem(index)}
                            >
                              <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={closeItemDetail}>
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            {td('Back to full list')}
                          </Button>
                          <h3 className="truncate text-base font-semibold text-slate-900">
                            {visibleEditingItem?.name || td('Unnamed item')}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {td('Edit this imported item before creating it.')}
                          </p>
                        </div>
                        <Badge variant="secondary">#{expandedIndex + 1}</Badge>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input
                          value={smartChefInstruction}
                          onChange={(event) => setSmartChefInstruction(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault()
                              requestSmartChefDraftEdit()
                            }
                          }}
                          placeholder={td('Ask Smart Chef to edit this item, e.g. add lemon to the fattoush recipe')}
                          disabled={isSmartChefEditing}
                        />
                        <Button onClick={requestSmartChefDraftEdit} disabled={isSmartChefEditing || !smartChefInstruction.trim()}>
                          {isSmartChefEditing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          {td('Apply with Smart Chef')}
                        </Button>
                      </div>

                      {smartChefProposal && (
                        <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-emerald-900">{smartChefProposal.summary}</p>
                            <p className="text-xs text-emerald-700">
                              {td('Changed fields')}: {smartChefProposal.changedFields.join(', ') || td('draft')}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={approveSmartChefProposal}>
                              <Check className="h-4 w-4 mr-1" />
                              {td('Approve')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={discardSmartChefProposal}>
                              {td('Discard')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <Tabs value={activeDetailTab} onValueChange={(value) => setActiveDetailTab(value as ImportDraftTab)}>
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="basic">{td('Basic')}</TabsTrigger>
                        <TabsTrigger value="recipe">{td('Recipe')}</TabsTrigger>
                        <TabsTrigger value="details">{td('Details')}</TabsTrigger>
                      </TabsList>

                      <TabsContent value="basic" className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
                        {proposalTouches(['name', 'description', 'price', 'categoryName']) && (
                          <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            {td('Smart Chef has proposed changes on this tab. Approve or discard above.')}
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs">{t.common_name}</Label>
                            <Input value={visibleEditingItem?.name} onChange={(e) => updateEditingItem({ name: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">{t.common_price} (IQD)</Label>
                            <Input
                              type="number"
                              value={visibleEditingItem?.price}
                              onChange={(e) => updateEditingItem({ price: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs">{t.common_category}</Label>
                            <Select value={visibleEditingItem?.categoryId || ''} onValueChange={(value) => updateEditingItem({ categoryId: value })}>
                              <SelectTrigger>
                                <SelectValue placeholder={td('Select category')} />
                              </SelectTrigger>
                              <SelectContent>
                                {availableCategories.map((category) => (
                                  <SelectItem key={category.id} value={category.id}>
                                    {category.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">{td('Status')}</Label>
                            <Select
                              value={visibleEditingItem?.status || 'ACTIVE'}
                              onValueChange={(value) => updateEditingItem({
                                status: value as 'DRAFT' | 'ACTIVE',
                                available: value === 'ACTIVE',
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ACTIVE">{td('Available')}</SelectItem>
                                <SelectItem value="DRAFT">{td('Draft')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">{t.common_description}</Label>
                          <Textarea
                            value={visibleEditingItem?.description}
                            onChange={(e) => updateEditingItem({ description: e.target.value })}
                            rows={3}
                          />
                        </div>
                      </TabsContent>

                      <TabsContent value="recipe" className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
                        {proposalTouches(['ingredients', 'recipeSteps', 'recipeTips', 'recipeYield', 'prepTime', 'cookTime']) && (
                          <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            {td('Smart Chef has proposed recipe changes. Approve or discard above.')}
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs">{td('Prep time')}</Label>
                            <Input value={visibleEditingItem?.prepTime ?? ''} onChange={(e) => updateEditingItem({ prepTime: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">{td('Cook time')}</Label>
                            <Input value={visibleEditingItem?.cookTime ?? ''} onChange={(e) => updateEditingItem({ cookTime: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">{td('Recipe yield')}</Label>
                            <Input
                              type="number"
                              value={visibleEditingItem?.recipeYield ?? ''}
                              onChange={(e) => updateEditingItem({ recipeYield: parseFloat(e.target.value) || null })}
                            />
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{td('SOP')}</p>
                              <p className="text-xs text-slate-500">{td('Steps and chef tips for kitchen consistency.')}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={addRecipeStep}>
                                {td('Add Step')}
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={addRecipeTip}>
                                {td('Add Tip')}
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs">{td('Steps')}</Label>
                            {(visibleEditingItem?.recipeSteps || []).length === 0 ? (
                              <p className="rounded-md border border-dashed border-slate-200 py-4 text-center text-xs text-slate-500">
                                {td('No steps yet. Add manually or ask Smart Chef above.')}
                              </p>
                            ) : (
                              (visibleEditingItem?.recipeSteps || []).map((step, stepIndex) => (
                                <div key={stepIndex} className="space-y-2 rounded-md border border-slate-100 p-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-500">{td('Step')} {stepIndex + 1}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-red-500 hover:text-red-700"
                                      onClick={() => updateEditingItem({ recipeSteps: (visibleEditingItem?.recipeSteps || []).filter((_, i) => i !== stepIndex) })}
                                    >
                                      {td('Remove')}
                                    </Button>
                                  </div>
                                  <Textarea
                                    value={step}
                                    onChange={(e) => {
                                      const next = [...(visibleEditingItem?.recipeSteps || [])]
                                      next[stepIndex] = e.target.value
                                      updateEditingItem({ recipeSteps: next })
                                    }}
                                    rows={2}
                                    placeholder={td('e.g., Sweat onions until translucent...')}
                                  />
                                </div>
                              ))
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs">{td('Tips')}</Label>
                            {(visibleEditingItem?.recipeTips || []).length === 0 ? (
                              <p className="text-xs text-slate-500">{td('Add a few tips to help the team serve the dish consistently.')}</p>
                            ) : (
                              (visibleEditingItem?.recipeTips || []).map((tip, tipIndex) => (
                                <div key={tipIndex} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                                  <Textarea
                                    value={tip}
                                    onChange={(e) => {
                                      const next = [...(visibleEditingItem?.recipeTips || [])]
                                      next[tipIndex] = e.target.value
                                      updateEditingItem({ recipeTips: next })
                                    }}
                                    rows={2}
                                    placeholder={td('e.g., Garnish with parsley...')}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-700"
                                    onClick={() => updateEditingItem({ recipeTips: (visibleEditingItem?.recipeTips || []).filter((_, i) => i !== tipIndex) })}
                                  >
                                    {td('Remove')}
                                  </Button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{td('Recipe Builder')}</p>
                              <p className="text-xs text-slate-500">{td('Select inventory ingredients so costing can be calculated.')}</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                updateEditingItem({
                                  ingredients: [...(visibleEditingItem?.ingredients || []), { name: '', quantity: 0, unit: 'g', pieceCount: null }],
                                })
                              }
                            >
                              {td('Add ingredient')}
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {(visibleEditingItem?.ingredients || []).map((ingredient, ingredientIndex) => {
                              const cost = selectedIngredientCost(ingredient)
                              return (
                                <div key={ingredientIndex} className="space-y-3 rounded-md border border-slate-100 p-3">
                                  <div className="grid gap-2 sm:grid-cols-[1fr_120px_100px_100px_90px_32px]">
                                    <Select
                                      value={ingredient.ingredientId || ''}
                                      onValueChange={(value) => {
                                        const selected = availableIngredients.find((item) => item.id === value)
                                        const next = [...(visibleEditingItem?.ingredients || [])]
                                        next[ingredientIndex] = {
                                          ...ingredient,
                                          ingredientId: selected?.id || null,
                                          name: selected?.name || ingredient.name,
                                          unit: selected?.unit || ingredient.unit,
                                        }
                                        updateEditingItem({ ingredients: next })
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder={td('Search ingredient...')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableIngredients.map((item) => (
                                          <SelectItem key={item.id} value={item.id}>
                                            {item.name} ({item.unit})
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      value={ingredient.name}
                                      placeholder={td('Ingredient')}
                                      onChange={(e) => {
                                        const next = [...(visibleEditingItem?.ingredients || [])]
                                        next[ingredientIndex] = { ...ingredient, name: e.target.value, ingredientId: null }
                                        updateEditingItem({ ingredients: next })
                                      }}
                                    />
                                    <Input
                                      type="number"
                                      value={ingredient.pieceCount ?? ''}
                                      placeholder={td('Count')}
                                      onChange={(e) => {
                                        const next = [...(visibleEditingItem?.ingredients || [])]
                                        next[ingredientIndex] = { ...ingredient, pieceCount: parseFloat(e.target.value) || null }
                                        updateEditingItem({ ingredients: next })
                                      }}
                                    />
                                    <Input
                                      type="number"
                                      value={ingredient.quantity}
                                      placeholder={td('Qty')}
                                      onChange={(e) => {
                                        const next = [...(visibleEditingItem?.ingredients || [])]
                                        next[ingredientIndex] = { ...ingredient, quantity: parseFloat(e.target.value) || 0 }
                                        updateEditingItem({ ingredients: next })
                                      }}
                                    />
                                    <Input
                                      value={ingredient.unit}
                                      placeholder={td('Unit')}
                                      onChange={(e) => {
                                        const next = [...(visibleEditingItem?.ingredients || [])]
                                        next[ingredientIndex] = { ...ingredient, unit: e.target.value }
                                        updateEditingItem({ ingredients: next })
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 w-9 p-0 hover:bg-red-50"
                                      onClick={() => updateEditingItem({ ingredients: (visibleEditingItem?.ingredients || []).filter((_, i) => i !== ingredientIndex) })}
                                    >
                                      <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
                                    </Button>
                                  </div>
                                  <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                                    <span>{td('Cost per unit')}: {cost ? `IQD ${cost.costPerUnit.toLocaleString('en-US')} / ${cost.unit}` : td('Select inventory ingredient')}</span>
                                    <span>{td('Direct cost')}: {cost ? `IQD ${Math.round(cost.directCost).toLocaleString('en-US')}` : '-'}</span>
                                    <span>{td('Recipe unit')}: {ingredient.quantity || 0} {ingredient.unit}</span>
                                  </div>
                                </div>
                              )
                            })}
                            {(visibleEditingItem?.ingredients || []).length === 0 && (
                              <p className="rounded-md border border-dashed border-slate-200 py-4 text-center text-xs text-slate-500">
                                {td('No ingredients yet. Add manually or ask Smart Chef above.')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                          <p className="text-sm font-semibold text-slate-900">{td('Available Add-ons')}</p>
                          {availableAddOns.length === 0 ? (
                            <p className="text-xs text-slate-500">{td('No add-ons available yet.')}</p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {availableAddOns.map((addOn) => {
                                const selected = (visibleEditingItem?.addOnIds || []).includes(addOn.id)
                                return (
                                  <button
                                    key={addOn.id}
                                    type="button"
                                    onClick={() => {
                                      const current = visibleEditingItem?.addOnIds || []
                                      updateEditingItem({
                                        addOnIds: selected
                                          ? current.filter((id) => id !== addOn.id)
                                          : [...current, addOn.id],
                                      })
                                    }}
                                    className={`rounded-md border p-3 text-left text-sm transition ${selected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                                  >
                                    <span className="block font-medium text-slate-900">{addOn.name}</span>
                                    <span className="text-xs text-slate-500">IQD {addOn.price.toLocaleString('en-US')}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="details" className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
                        {proposalTouches(['calories', 'tags']) && (
                          <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            {td('Smart Chef has proposed detail changes. Approve or discard above.')}
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs">{td('Calories (optional)')}</Label>
                            <Input
                              type="number"
                              value={visibleEditingItem?.calories ?? ''}
                              onChange={(e) => updateEditingItem({ calories: parseInt(e.target.value) || undefined })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">{td('Protein (g)')}</Label>
                            <Input
                              type="number"
                              value={visibleEditingItem?.protein ?? ''}
                              onChange={(e) => updateEditingItem({ protein: parseInt(e.target.value) || undefined })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">{td('Carbs (g)')}</Label>
                            <Input
                              type="number"
                              value={visibleEditingItem?.carbs ?? ''}
                              onChange={(e) => updateEditingItem({ carbs: parseInt(e.target.value) || undefined })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs">{td('Tags (comma-separated)')}</Label>
                            <Input
                              value={(visibleEditingItem?.tags || []).join(', ')}
                              onChange={(e) => updateEditingItem({ tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
	                              placeholder="halal, spicy"
	                            />
	                          </div>
	                        </div>

	                        <div className="space-y-2">
                          <Label className="text-xs">{td('Image (optional)')}</Label>
                          <div className="flex gap-2 flex-wrap">
                            <Input
                              value={visibleEditingItem?.imageUrl?.startsWith('http') ? visibleEditingItem?.imageUrl : ''}
                              onChange={(e) => updateEditingItem({ imageUrl: e.target.value.trim() || undefined })}
                              placeholder="https://example.com/image.jpg"
                              className="flex-1 min-w-[180px]"
                            />
                            <Button type="button" variant="outline" size="sm" onClick={() => formUploadRef.current?.click()}>
                              <ImagePlus className="h-4 w-4 mr-1" />
                              {t.common_upload}
                            </Button>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              ref={formUploadRef}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                const reader = new FileReader()
                                reader.onloadend = () => updateEditingItem({ imageUrl: reader.result as string })
                                reader.readAsDataURL(file)
                                e.target.value = ''
                              }}
                            />
                            <Button type="button" variant="outline" size="sm" onClick={openImageDialog} disabled={isGeneratingImage}>
                              <Sparkles className="h-4 w-4 mr-1" />
                              {t.common_ai_generate}
                            </Button>
                          </div>
                          {visibleEditingItem?.imageUrl && (
                            <div className="border rounded-lg overflow-auto bg-white flex items-start justify-center min-h-[80px] max-h-[220px]">
                              <img
                                src={visibleEditingItem?.imageUrl}
                                alt={visibleEditingItem?.name}
                                className="max-w-full w-auto max-h-[210px] object-contain"
                                onError={(e) => {
                                  e.currentTarget.src = ''
                                  updateEditingItem({ imageUrl: undefined })
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-200 pt-4 mt-4 flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (expandedIndex !== null) {
                      closeItemDetail()
                      return
                    }
                    setStep('upload')
                    setExpandedIndex(null)
                    setEditingItem(null)
                  }}
                  className="sm:w-auto"
                >
                  {expandedIndex !== null ? td('Back to full list') : t.common_back}
                </Button>
                <Button
                  onClick={handleCreateAll}
                  className="flex-1"
                  disabled={isProcessing || extractedItems.length === 0}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {td('Creating')} {extractedItems.length} {td('items')}...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {td('Create All')} {extractedItems.length} {td('Items')}
                      {itemsWithIssues > 0 && (
                        <span className="ml-2 text-xs bg-white/20 rounded-full px-2 py-0.5">
                          {itemsWithIssues} {td('need attention')}
                        </span>
                      )}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 'verifying' && extractedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <p className="text-sm text-slate-500">{td('No items were extracted from this image.')}</p>
              <Button variant="outline" onClick={() => setStep('upload')}>{td('Try Another Image')}</Button>
            </div>
          )}

          {step === 'complete' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-lg font-medium">{td('All menu items created successfully!')}</p>
              <p className="text-sm text-slate-500">{td('Redirecting...')}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showImageDialog}
        onOpenChange={(open) => {
          setShowImageDialog(open)
          if (!open) {
            setUploadedPhoto(null)
            setCustomPrompt('')
            setPreviewImageUrl(null)
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              {t.common_ai_generate}
            </DialogTitle>
            <DialogDescription>
              {td('Upload your own photo for professional enhancement, or generate a new image from scratch.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto min-h-0 flex-1">
            {isGeneratingImage ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
                <p className="text-sm text-slate-500">
                  {uploadedPhoto ? td('Enhancing your photo professionally...') : td('Generating your image with AI...')}
                </p>
                <p className="text-xs text-slate-400">{td('This may take a few moments')}</p>
              </div>
            ) : previewImageUrl ? (
              <div className="space-y-4">
                <Label>{td('Image Preview')}</Label>
                <div className="border rounded-lg overflow-hidden">
                  <img src={previewImageUrl} alt="Generated preview" className="w-full h-auto" />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    className="flex-1"
                    onClick={() => {
                      if (editingItem && expandedIndex !== null) {
                        const nextEditingItem = { ...editingItem, imageUrl: previewImageUrl }
                        setEditingItem(nextEditingItem)
                        setExtractedItems((prev) =>
                          prev.map((item, i) => (i === expandedIndex ? { ...item, imageUrl: previewImageUrl } : item))
                        )
                      }
                      setShowImageDialog(false)
                      setPreviewImageUrl(null)
                      setUploadedPhoto(null)
                      setCustomPrompt('')
                    }}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {td('Use This Image')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPreviewImageUrl(null)}>
                    {td('Try Again')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Upload Your Photo (Recommended)</Label>
                  <p className="text-xs text-slate-500">
                    Upload a photo of your actual dish and our AI will enhance it to look professionally shot.
                    This helps customers see exactly what they&apos;ll receive!
                  </p>
                  <div className="flex gap-2 items-center">
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <ImagePlus className="h-4 w-4 mr-2" />
                      Select Photo
                    </Button>
                    {uploadedPhoto && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setUploadedPhoto(null)}>
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handlePhotoUploadDialog}
                  />
                  {uploadedPhoto && (
                    <div className="mt-2 rounded-lg border-2 border-emerald-500/50 overflow-hidden">
                      <img src={uploadedPhoto} alt="Uploaded preview" className="w-full h-48 object-cover" />
                      <div className="px-3 py-2 bg-emerald-500/10 text-xs text-emerald-700 flex items-center gap-2">
                        <Check className="h-3 w-3" />
                        Photo ready for AI enhancement
                      </div>
                    </div>
                  )}
                </div>

                {!uploadedPhoto && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-slate-500">or generate from scratch</span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="bulk-import-custom-prompt">Custom Prompt (optional)</Label>
                  <Textarea
                    id="bulk-import-custom-prompt"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Describe subtle adjustments or recreate the scene from scratch..."
                    rows={3}
                    disabled={isGeneratingImage}
                  />
                  {trimmedSavedBackgroundPrompt && (
                    <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                      <p className="leading-relaxed">
                        Default background prompt ready. Apply it to speed up every menu image.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCustomPrompt(trimmedSavedBackgroundPrompt)}
                        disabled={isGeneratingImage}
                        className="rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-600"
                      >
                        Use default prompt
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    {uploadedPhoto
                      ? 'Tell us how to tweak the uploaded photo (lighting, crop, mood, minor edits).'
                      : 'Leave blank to auto-generate based on item name, category, and description.'}
                  </p>
                </div>

                <div className="space-y-3 border-t border-dashed border-slate-200 pt-3">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      Orientation
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {imageOrientationOptions.map((option) => {
                        const isActive = option.value === imageOrientation
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setImageOrientation(option.value)}
                            className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${isActive
                              ? 'border-emerald-500 bg-emerald-100 text-slate-900'
                              : 'border-slate-200 bg-white/5 text-slate-500 hover:border-slate-400'
                              }`}
                          >
                            <span className="block text-sm">{option.label}</span>
                            <span className="text-[10px] text-slate-400">{option.aspect}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-slate-500 italic">
                      {currentOrientationOption.description}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      Target size
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {imageSizeOptions.map((option) => {
                        const isActive = option.value === imageSizePreset
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setImageSizePreset(option.value)}
                            className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${isActive
                              ? 'border-emerald-500 bg-emerald-100 text-slate-900'
                              : 'border-slate-200 bg-white/5 text-slate-400 hover:border-slate-400'
                              }`}
                          >
                            <span className="block text-sm">{option.label}</span>
                            <span className="text-[10px] text-slate-400">{`${option.pixels}px`}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-slate-500 italic">
                      {currentSizeOption.description}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          {!isGeneratingImage && !previewImageUrl && (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowImageDialog(false)
                  setUploadedPhoto(null)
                  setCustomPrompt('')
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={generateOrEnhanceImage} disabled={!editingItem}>
                <Sparkles className="h-4 w-4 mr-2" />
                {uploadedPhoto ? 'Enhance Photo' : 'Generate Image'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showMissingIngredientsDialog} onOpenChange={setShowMissingIngredientsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Missing Ingredients Detected
            </DialogTitle>
            <DialogDescription>
              The following ingredients are not in your inventory. Would you like to add them automatically?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-[300px] overflow-y-auto">
              <ul className="space-y-2">
                {missingIngredients.map((ingredient, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="font-medium">{ingredient}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              These ingredients will be added to your inventory with zero stock. You can update quantities later.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMissingIngredientsDialog(false)
                setMissingIngredients([])
                setPendingExtractionData(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmMissingIngredients}>
              Add Ingredients & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
