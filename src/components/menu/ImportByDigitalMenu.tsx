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
import { Link2, Loader2, CheckCircle, Sparkles, ImagePlus, Check, Trash2, ChevronDown, ChevronUp, X, AlertCircle, ArrowLeft } from 'lucide-react'
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
import { useI18n } from '@/lib/i18n'
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
  addOnIds?: string[]
}

interface ImportByDigitalMenuProps {
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

const ITEMS_PER_PAGE = 50

function matchCategoryId(categories: Category[], categoryName?: string): string | undefined {
  if (!categoryName) return undefined
  const normalized = categoryName.trim().toLowerCase()
  const match = categories.find(
    (c) => {
      const name = c.name.trim().toLowerCase()
      return name === normalized || name.includes(normalized) || normalized.includes(name)
    }
  )
  return match?.id
}

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

export default function ImportByDigitalMenu({ categories, ingredients, defaultBackgroundPrompt }: ImportByDigitalMenuProps) {
  const { toast } = useToast()
  const { t } = useI18n()
  const [availableCategories, setAvailableCategories] = useState<Category[]>(categories)
  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>(ingredients)
  const [availableAddOns, setAvailableAddOns] = useState<AddOn[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'url' | 'extracting' | 'verifying' | 'complete'>('url')
  const [menuUrl, setMenuUrl] = useState('')
  const [extractedItems, setExtractedItems] = useState<ExtractedMenuItem[]>([])
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)
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
      categoryId: item.categoryId || matchCategoryId(nextCategories, item.categoryName),
    }))
  }

  // --- Bulk verification helpers ---

  const updateItem = (index: number, updates: Partial<ExtractedMenuItem>) => {
    setExtractedItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item))
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
    setExtractedItems(prev => prev.filter((_, i) => i !== index))
    if (expandedIndex === index) {
      setExpandedIndex(null)
      setEditingItem(null)
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1)
    }
  }

  const assignCategoryToUncategorized = (categoryId: string) => {
    let count = 0
    setExtractedItems(prev => prev.map(item => {
      if (!item.categoryId) {
        count++
        return { ...item, categoryId }
      }
      return item
    }))
    if (count > 0) {
      const catName = availableCategories.find(c => c.id === categoryId)?.name
      toast({ title: 'Category assigned', description: `Applied "${catName}" to ${count} uncategorized item${count > 1 ? 's' : ''}.` })
    }
  }

  const itemsWithoutCategory = extractedItems.filter(i => !i.categoryId).length
  const itemsWithIssues = extractedItems.filter(i => !i.categoryId || !i.name.trim() || !i.price || i.price <= 0).length
  const totalPages = Math.max(1, Math.ceil(extractedItems.length / ITEMS_PER_PAGE))
  const pageStart = (currentPage - 1) * ITEMS_PER_PAGE
  const pageItems = extractedItems.slice(pageStart, pageStart + ITEMS_PER_PAGE)
  const visibleEditingItem = smartChefProposal?.draft ?? editingItem

  // --- Image dialog helpers (unchanged) ---

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

  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setUploadedPhoto(reader.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // --- Scrape & extract ---

  const scrapeAndExtract = async () => {
    const url = menuUrl.trim()
    if (!url) {
      toast({ title: 'Enter a URL', description: 'Paste the public menu link', variant: 'destructive' })
      return
    }

    try {
      new URL(url)
    } catch {
      toast({ title: 'Invalid URL', description: 'Please enter a valid link', variant: 'destructive' })
      return
    }

    setIsProcessing(true)
    setStep('extracting')

    try {
      const response = await fetch('/api/menu/import-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          categoryNames: availableCategories.map((c) => c.name),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to import from URL')
      }

      const extracted: ExtractedMenuItem[] = (data.items || []).map((item: any) => ({
        ...item,
        protein: item.protein ?? null,
        carbs: item.carbs ?? null,
        status: item.status || 'ACTIVE',
        available: item.available ?? true,
        ingredients: (item.ingredients || []).map((ingredient: ParsedIngredient) => {
          const existing = availableIngredients.find(
            (available) => normalizeText(available.name) === normalizeText(ingredient.name)
          )
          return {
            ...ingredient,
            ingredientId: existing?.id || ingredient.ingredientId || null,
            unit: existing?.unit || ingredient.unit || 'g',
          }
        }),
        categoryId: item.categoryId || matchCategoryId(availableCategories, item.categoryName),
      }))
      const items = dedupeExtractedItems(await ensureCategoriesAndAssign(extracted))

      setExtractedItems(items)
      setExpandedIndex(null)
      setEditingItem(null)
      setCurrentPage(1)
      if (items.length > 0) {
        setStep('verifying')
      }
    } catch (error) {
      console.error('Import from URL error:', error)
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to import menu from URL',
        variant: 'destructive',
      })
      setStep('url')
    } finally {
      setIsProcessing(false)
    }
  }

  // --- AI image generation (unchanged) ---

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
            itemName: editingItem.name,
            description: editingItem.description,
            category: availableCategories.find((c) => c.id === editingItem.categoryId)?.name,
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
      if (!response.ok) {
        const message = data.details || data.error || 'Smart Chef failed to edit this item'
        const error = new Error(message) as Error & { code?: string; status?: number }
        error.code = data.code
        error.status = response.status
        throw error
      }

      const proposal: SmartChefDraftProposal = {
        summary: data.summary || 'Smart Chef proposed an edit.',
        targetTab: data.targetTab || 'basic',
        changedFields: Array.isArray(data.changedFields) ? data.changedFields : [],
        draft: normalizeProposedDraft(data.draft || editingItem),
      }
      setSmartChefProposal(proposal)
      setActiveDetailTab(proposal.targetTab)
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? (error as { status?: number }).status
          : undefined
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined
      const isAiBusy = status === 503 || code === 'AI_OVERLOADED'
      toast({
        title: isAiBusy ? 'AI is busy' : 'Smart Chef edit failed',
        description: isAiBusy
          ? "We're experiencing high AI usage. Please try again in a minute."
          : error instanceof Error
            ? error.message
            : 'Could not edit this draft',
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

  // --- Create all items ---

  const handleCreateAll = async () => {
    let itemsToValidate = extractedItems

    // Sync expanded item back first
    if (expandedIndex !== null && editingItem) {
      itemsToValidate = extractedItems.map((item, i) => i === expandedIndex ? { ...editingItem } : item)
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

  const createAllItems = async (items: ExtractedMenuItem[]) => {
    setIsProcessing(true)
    try {
      const errors: string[] = []
      const ingredientsResponse = await fetch('/api/ingredients')
      let currentIngredients = availableIngredients
      if (ingredientsResponse.ok) {
        currentIngredients = await ingredientsResponse.json()
        setAvailableIngredients(currentIngredients)
      }

      let ingredientMap = new Map(
        currentIngredients.map((ing) => [ing.name.toLowerCase().trim(), ing])
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
          if (!existingIng) continue
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
        toast({
          title: 'Partial Success',
          description: `Created ${createdCount} of ${items.length} items. Skipped ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? '' : 's'}. Some failed.`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Success',
          description: `Created ${createdCount} menu item${createdCount === 1 ? '' : 's'} successfully.${skippedDuplicates > 0 ? ` Skipped ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? '' : 's'}.` : ''}`,
        })
      }
      setStep('complete')
      setTimeout(() => {
        setIsOpen(false)
        window.location.reload()
      }, 2000)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create menu items',
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const resetModal = () => {
    setStep('url')
    setMenuUrl('')
    setExtractedItems([])
    setExpandedIndex(null)
    setEditingItem(null)
    setCurrentPage(1)
    setActiveDetailTab('basic')
    setSmartChefInstruction('')
    setSmartChefProposal(null)
    setUploadedPhoto(null)
    setPreviewImageUrl(null)
    setCustomPrompt('')
  }

  return (
    <>
      <Button variant="outline" data-tour="menu-import-url" onClick={() => { setIsOpen(true); resetModal(); }}>
        <Link2 className="h-4 w-4 mr-2" />
        {t.menu_import_digital}
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetModal(); setIsOpen(open); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Import Menu from Digital Menu Link</DialogTitle>
            <DialogDescription>
              Paste a public link to a menu page (e.g. your website or a PDF menu). We&apos;ll scrape the page and extract menu items.
            </DialogDescription>
          </DialogHeader>

          {step === 'url' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="menu-url">Public menu URL</Label>
                <Input
                  id="menu-url"
                  type="url"
                  placeholder="https://example.com/menu"
                  value={menuUrl}
                  onChange={(e) => setMenuUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && scrapeAndExtract()}
                />
              </div>
              <Button onClick={scrapeAndExtract} className="w-full" disabled={!menuUrl.trim()}>
                Scrape & Extract Menu Items
              </Button>
            </div>
          )}

          {step === 'extracting' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-16 w-16 animate-spin text-emerald-500" />
              <p className="text-lg font-medium">Opening link and extracting menu...</p>
              <p className="text-sm text-slate-500">This may take a moment</p>
            </div>
          )}

          {step === 'verifying' && extractedItems.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Top summary bar */}
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

              {expandedIndex === null || !editingItem ? (
                <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1">
                  {pageItems.map((item, relativeIndex) => {
                    const index = pageStart + relativeIndex
                    const hasIssues = !item.categoryId || !item.name.trim() || !item.price || item.price <= 0
                    const categoryName = availableCategories.find(c => c.id === item.categoryId)?.name

                    return (
                      <div
                        key={`${index}-${item.name}`}
                        className={`border rounded-lg transition-all ${hasIssues ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'}`}
                      >
                        <div className="flex items-start gap-3 p-3">
                          <span className="text-xs font-medium text-slate-400 mt-1 w-6 text-right shrink-0">
                            {index + 1}
                          </span>
                          <button type="button" className="flex-1 min-w-0 text-left" onClick={() => openItemDetail(index)}>
                            <p className="font-medium text-sm truncate">
                              {item.name || <span className="text-red-400 italic">Unnamed item</span>}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              <span className="text-xs font-medium text-slate-600">
                                IQD {(item.price || 0).toLocaleString()}
                              </span>
                              {categoryName ? (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                                  {categoryName}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                                  <AlertCircle className="h-2.5 w-2.5" />
                                  No category
                                </span>
                              )}
                              {(item.recipeSteps?.length || 0) > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Recipe</Badge>
                              )}
                            </div>
                          </button>
                          <Select value={item.categoryId || ''} onValueChange={(v) => updateItem(index, { categoryId: v })}>
                            <SelectTrigger className="h-8 w-[130px] text-xs shrink-0 bg-white hidden sm:flex">
                              <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableCategories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openItemDetail(index)}>
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-red-50" onClick={() => deleteItem(index)}>
                            <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  {totalPages > 1 && (
                    <div className="sticky bottom-0 bg-white border rounded-lg p-2 flex items-center justify-between gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                        Previous
                      </Button>
                      <span className="text-xs text-slate-500">
                        Page {currentPage} of {totalPages} · showing {pageStart + 1}-{Math.min(pageStart + ITEMS_PER_PAGE, extractedItems.length)} of {extractedItems.length}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-y-auto flex-1 min-h-0 pr-1 space-y-4">
                  <div className="border rounded-lg bg-white p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Button variant="ghost" size="sm" className="px-0" onClick={closeItemDetail}>
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back to full list
                        </Button>
                        <h3 className="font-semibold text-slate-900 mt-2">{visibleEditingItem?.name || 'Unnamed item'}</h3>
                        <p className="text-xs text-slate-500">Edit this imported item before creating it.</p>
                      </div>
                      <Badge variant="secondary">#{expandedIndex + 1}</Badge>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={smartChefInstruction}
                        onChange={(e) => setSmartChefInstruction(e.target.value)}
                        placeholder="Ask Smart Chef to edit this item, e.g. add lemon to the fattoush recipe"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') requestSmartChefDraftEdit()
                        }}
                      />
                      <Button onClick={requestSmartChefDraftEdit} disabled={!smartChefInstruction.trim() || isSmartChefEditing}>
                        {isSmartChefEditing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                        Apply with Smart Chef
                      </Button>
                    </div>

                    {smartChefProposal && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <div>
                          <p className="text-sm font-semibold text-emerald-900">{smartChefProposal.summary}</p>
                          <p className="text-xs text-emerald-700">Changed fields: {smartChefProposal.changedFields.join(', ') || 'draft'}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={approveSmartChefProposal}><Check className="h-4 w-4 mr-1" />Approve</Button>
                          <Button size="sm" variant="outline" onClick={discardSmartChefProposal}>Discard</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <Tabs value={activeDetailTab} onValueChange={(value) => setActiveDetailTab(value as ImportDraftTab)}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="basic">Basic</TabsTrigger>
                      <TabsTrigger value="recipe">Recipe</TabsTrigger>
                      <TabsTrigger value="details">Details</TabsTrigger>
                    </TabsList>

                    <TabsContent value="basic" className="border rounded-lg bg-white p-4 space-y-4">
                      {proposalTouches(['name', 'description', 'price', 'categoryName', 'status', 'available']) && (
                        <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Smart Chef has proposed basic changes. Approve or discard above.</div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Item Name</Label>
                          <Input value={visibleEditingItem?.name || ''} onChange={(e) => updateEditingItem({ name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Price (IQD)</Label>
                          <Input type="number" value={visibleEditingItem?.price ?? ''} onChange={(e) => updateEditingItem({ price: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Category</Label>
                          <Select value={visibleEditingItem?.categoryId || ''} onValueChange={(value) => updateEditingItem({ categoryId: value })}>
                            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                            <SelectContent>
                              {availableCategories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Status</Label>
                          <Select value={visibleEditingItem?.status || 'ACTIVE'} onValueChange={(value) => updateEditingItem({ status: value as 'DRAFT' | 'ACTIVE' })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ACTIVE">Available</SelectItem>
                              <SelectItem value="DRAFT">Draft</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Description</Label>
                        <Textarea value={visibleEditingItem?.description || ''} onChange={(e) => updateEditingItem({ description: e.target.value })} rows={3} />
                      </div>
                    </TabsContent>

                    <TabsContent value="recipe" className="space-y-4">
                      <div className="border rounded-lg bg-white p-4 space-y-4">
                        {proposalTouches(['prepTime', 'cookTime', 'recipeYield', 'recipeSteps', 'recipeTips', 'ingredients']) && (
                          <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Smart Chef has proposed recipe changes. Approve or discard above.</div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-2"><Label className="text-xs">Prep time</Label><Input value={visibleEditingItem?.prepTime ?? ''} onChange={(e) => updateEditingItem({ prepTime: e.target.value })} /></div>
                          <div className="space-y-2"><Label className="text-xs">Cook time</Label><Input value={visibleEditingItem?.cookTime ?? ''} onChange={(e) => updateEditingItem({ cookTime: e.target.value })} /></div>
                          <div className="space-y-2"><Label className="text-xs">Recipe yield</Label><Input type="number" value={visibleEditingItem?.recipeYield ?? ''} onChange={(e) => updateEditingItem({ recipeYield: parseInt(e.target.value) || null })} /></div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div><h4 className="font-semibold">SOP</h4><p className="text-xs text-slate-500">Steps and chef tips for kitchen consistency.</p></div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => updateEditingItem({ recipeSteps: [...(visibleEditingItem?.recipeSteps || []), ''] })}>Add Step</Button>
                            <Button variant="outline" size="sm" onClick={() => updateEditingItem({ recipeTips: [...(visibleEditingItem?.recipeTips || []), ''] })}>Add Tip</Button>
                          </div>
                        </div>
                        {(visibleEditingItem?.recipeSteps || []).map((step, stepIndex) => (
                          <Textarea
                            key={stepIndex}
                            value={step}
                            placeholder={`Step ${stepIndex + 1}`}
                            onChange={(e) => {
                              const next = [...(visibleEditingItem?.recipeSteps || [])]
                              next[stepIndex] = e.target.value
                              updateEditingItem({ recipeSteps: next })
                            }}
                          />
                        ))}
                        {(visibleEditingItem?.recipeTips || []).map((tip, tipIndex) => (
                          <Input
                            key={tipIndex}
                            value={tip}
                            placeholder={`Tip ${tipIndex + 1}`}
                            onChange={(e) => {
                              const next = [...(visibleEditingItem?.recipeTips || [])]
                              next[tipIndex] = e.target.value
                              updateEditingItem({ recipeTips: next })
                            }}
                          />
                        ))}
                      </div>

                      <div className="border rounded-lg bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div><h4 className="font-semibold">Recipe Builder</h4><p className="text-xs text-slate-500">Select inventory ingredients so costing can be calculated.</p></div>
                          <Button variant="outline" size="sm" onClick={() => updateEditingItem({ ingredients: [...(visibleEditingItem?.ingredients || []), { name: '', quantity: 0, unit: 'g', pieceCount: null }] })}>Add ingredient</Button>
                        </div>
                        {(visibleEditingItem?.ingredients || []).length === 0 && (
                          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-500">No ingredients yet. Add manually or ask Smart Chef above.</div>
                        )}
                        {(visibleEditingItem?.ingredients || []).map((ingredient, ingredientIndex) => {
                          const cost = selectedIngredientCost(ingredient)
                          return (
                            <div key={ingredientIndex} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_.8fr_.8fr_auto] gap-2 rounded-lg border p-3">
                              <Select
                                value={ingredient.ingredientId || ''}
                                onValueChange={(value) => {
                                  const selected = availableIngredients.find((ing) => ing.id === value)
                                  const next = [...(visibleEditingItem?.ingredients || [])]
                                  next[ingredientIndex] = { ...next[ingredientIndex], ingredientId: value, name: selected?.name || next[ingredientIndex].name, unit: selected?.unit || next[ingredientIndex].unit }
                                  updateEditingItem({ ingredients: next })
                                }}
                              >
                                <SelectTrigger><SelectValue placeholder="Search ingredient..." /></SelectTrigger>
                                <SelectContent>
                                  {availableIngredients.map((ing) => <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input value={ingredient.name} placeholder="Ingredient" onChange={(e) => {
                                const next = [...(visibleEditingItem?.ingredients || [])]
                                next[ingredientIndex] = { ...next[ingredientIndex], name: e.target.value }
                                updateEditingItem({ ingredients: next })
                              }} />
                              <Input type="number" value={ingredient.quantity} onChange={(e) => {
                                const next = [...(visibleEditingItem?.ingredients || [])]
                                next[ingredientIndex] = { ...next[ingredientIndex], quantity: parseFloat(e.target.value) || 0 }
                                updateEditingItem({ ingredients: next })
                              }} />
                              <Input value={ingredient.unit} onChange={(e) => {
                                const next = [...(visibleEditingItem?.ingredients || [])]
                                next[ingredientIndex] = { ...next[ingredientIndex], unit: e.target.value }
                                updateEditingItem({ ingredients: next })
                              }} />
                              <Button variant="ghost" size="sm" onClick={() => updateEditingItem({ ingredients: (visibleEditingItem?.ingredients || []).filter((_, i) => i !== ingredientIndex) })}><X className="h-4 w-4" /></Button>
                              <p className="sm:col-span-5 text-xs text-slate-500">Cost per unit: {cost ? `${cost.costPerUnit} / ${cost.unit}` : 'Select inventory ingredient'} · Direct cost: {cost ? cost.directCost.toLocaleString() : '-'}</p>
                            </div>
                          )
                        })}
                      </div>

                      <div className="border rounded-lg bg-white p-4 space-y-3">
                        <h4 className="font-semibold">Available Add-ons</h4>
                        {availableAddOns.length === 0 ? <p className="text-xs text-slate-500">No add-ons available yet.</p> : (
                          <div className="flex flex-wrap gap-2">
                            {availableAddOns.map((addOn) => {
                              const selected = (visibleEditingItem?.addOnIds || []).includes(addOn.id)
                              return (
                                <Button key={addOn.id} type="button" variant={selected ? 'default' : 'outline'} size="sm" onClick={() => {
                                  const current = visibleEditingItem?.addOnIds || []
                                  updateEditingItem({ addOnIds: selected ? current.filter((id) => id !== addOn.id) : [...current, addOn.id] })
                                }}>
                                  {addOn.name}
                                </Button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="details" className="border rounded-lg bg-white p-4 space-y-4">
                      {proposalTouches(['calories', 'protein', 'carbs', 'tags', 'imageUrl']) && (
                        <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Smart Chef has proposed detail changes. Approve or discard above.</div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2"><Label className="text-xs">Calories</Label><Input type="number" value={visibleEditingItem?.calories ?? ''} onChange={(e) => updateEditingItem({ calories: parseInt(e.target.value) || null })} /></div>
                        <div className="space-y-2"><Label className="text-xs">Protein (g)</Label><Input type="number" value={visibleEditingItem?.protein ?? ''} onChange={(e) => updateEditingItem({ protein: parseInt(e.target.value) || null })} /></div>
                        <div className="space-y-2"><Label className="text-xs">Carbs (g)</Label><Input type="number" value={visibleEditingItem?.carbs ?? ''} onChange={(e) => updateEditingItem({ carbs: parseInt(e.target.value) || null })} /></div>
                      </div>
                      <div className="space-y-2"><Label className="text-xs">Tags (comma-separated)</Label><Input value={(visibleEditingItem?.tags || []).join(', ')} onChange={(e) => updateEditingItem({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></div>
                      <div className="space-y-2">
                        <Label className="text-xs">Image (optional)</Label>
                        <div className="flex gap-2 flex-wrap">
                          <Input value={visibleEditingItem?.imageUrl?.startsWith('http') ? visibleEditingItem.imageUrl : ''} onChange={(e) => updateEditingItem({ imageUrl: e.target.value.trim() || undefined })} placeholder="https://example.com/image.jpg" className="flex-1 min-w-[180px]" />
                          <Button type="button" variant="outline" size="sm" onClick={() => formUploadRef.current?.click()}><ImagePlus className="h-4 w-4 mr-1" />Upload</Button>
                          <input type="file" accept="image/*" className="hidden" ref={formUploadRef} onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onloadend = () => updateEditingItem({ imageUrl: reader.result as string })
                            reader.readAsDataURL(file)
                            e.target.value = ''
                          }} />
                          <Button type="button" variant="outline" size="sm" onClick={openImageDialog} disabled={isGeneratingImage}><Sparkles className="h-4 w-4 mr-1" />AI Generate</Button>
                        </div>
                        {visibleEditingItem?.imageUrl && <img src={visibleEditingItem.imageUrl} alt={visibleEditingItem.name} className="max-h-[180px] rounded-lg border object-contain" />}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              {/* Sticky footer */}
              <div className="shrink-0 border-t border-slate-200 pt-4 mt-4 flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (expandedIndex !== null) {
                      closeItemDetail()
                    } else {
                      setStep('url')
                      setExpandedIndex(null)
                      setEditingItem(null)
                    }
                  }}
                  className="sm:w-auto"
                >
                  {expandedIndex !== null ? 'Back to full list' : 'Back'}
                </Button>
                <Button
                  onClick={handleCreateAll}
                  className="flex-1"
                  disabled={isProcessing || extractedItems.length === 0}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating {extractedItems.length} items...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Create All {extractedItems.length} Item{extractedItems.length !== 1 ? 's' : ''}
                      {itemsWithIssues > 0 && (
                        <span className="ml-2 text-xs bg-white/20 rounded-full px-2 py-0.5">
                          {itemsWithIssues} need attention
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
              <p className="text-sm text-slate-500">No items were extracted from this URL.</p>
              <Button variant="outline" onClick={() => setStep('url')}>Try Another URL</Button>
            </div>
          )}

          {step === 'complete' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-lg font-medium">All menu items created successfully!</p>
              <p className="text-sm text-slate-500">Redirecting...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Image dialog */}
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
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              Generate Image with AI
            </DialogTitle>
            <DialogDescription>
              Upload your own photo for professional enhancement, or generate a new image from scratch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto min-h-0 flex-1">
            {isGeneratingImage ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
                <p className="text-sm text-slate-500">
                  {uploadedPhoto ? 'Enhancing your photo professionally...' : 'Generating your image with AI...'}
                </p>
                <p className="text-xs text-slate-400">This may take a few moments</p>
              </div>
            ) : previewImageUrl ? (
              <div className="space-y-4">
                <Label>Image Preview</Label>
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
                        setEditingItem({ ...editingItem, imageUrl: previewImageUrl })
                        setExtractedItems(prev =>
                          prev.map((item, i) => i === expandedIndex ? { ...item, imageUrl: previewImageUrl } : item)
                        )
                      }
                      setShowImageDialog(false)
                      setPreviewImageUrl(null)
                      setUploadedPhoto(null)
                      setCustomPrompt('')
                    }}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Use This Image
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPreviewImageUrl(null)}>
                    Try Again
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Upload Photo Section */}
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
                    onChange={handlePhotoUpload}
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

                {/* Custom Prompt */}
                <div className="space-y-2">
                  <Label htmlFor="import-custom-prompt">Custom Prompt (optional)</Label>
                  <Textarea
                    id="import-custom-prompt"
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

                {/* Orientation & Target size */}
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
    </>
  )
}
