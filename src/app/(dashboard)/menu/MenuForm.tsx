'use client'

import { useState, useMemo, useRef, useEffect, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Save, Plus, Trash2, Sparkles, Loader2, ChefHat, Check, AlertCircle, ImagePlus, Search, ChevronLeft, ChevronRight, BotMessageSquare, FileText, MoreHorizontal, LayoutDashboard } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { formatCurrency, formatPercentage, cn } from '@/lib/utils'
import {
  Category,
  Ingredient,
  MenuItem,
  MenuItemIngredient,
  AddOn,
  MenuItemAddOn,
  MenuItemTranslation,
} from '@prisma/client'
import { RefreshCw } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { buildTranslationSeed, TranslationSeedPayload } from '@/lib/menu-translation-seed'
import {
  ImageOrientation,
  ImageSizePreset,
  imageOrientationOptions,
  imageOrientationPrompts,
  imageSizeOptions,
  imageSizePrompts,
} from '@/lib/image-format'

interface RecipeIngredient {
  ingredientId: string
  quantity: number
  pieceCount?: number | null
  unit?: string | null
  supplierProductId?: string | null
  unitCostCached?: number | null
  currency?: string | null
  lastPricedAt?: string | null
}

const translationLanguages = [
  { code: 'ar_fusha', label: 'Arabic' },
  { code: 'ku', label: 'Sorani Kurdish' },
] as const

const SAMPLE_AI_PROMPT = `Chicken Biryani. Main course. Price 12,000 IQD. Fragrant basmati rice with tender chicken, layered with saffron, fried onions, and mint. Served with raita. Calories about 450 per serving, 28g protein, 42g carbs. Tags: halal, spicy.
Prep time: 15 minutes. Cook time: 35 minutes.
Steps: Marinate chicken in yogurt and spices. Soak rice 20 min. Fry onions until golden. Layer rice and chicken in pot, add saffron and ghee. Cook on low 25 min. Fluff and serve with raita.
Tips: Use aged basmati for best fragrance. Let rest 5 min before opening lid.`

type LanguageCode = (typeof translationLanguages)[number]['code']

interface TranslationDraft {
  name: string
  description: string
  aiDescription: string
  protein: number | null
  carbs: number | null
  loading: boolean
  error?: string
  dirty: boolean
  signature: string
}

interface MenuFormProps {
  categories: Category[]
  ingredients: Ingredient[]
  addOns?: AddOn[]
  mode: 'create' | 'edit'
  menuItem?: MenuItem & {
    ingredients: (MenuItemIngredient & { ingredient: Ingredient })[]
    addOns?: (MenuItemAddOn & { addOn: AddOn })[]
    translations?: MenuItemTranslation[]
  }
  defaultBackgroundPrompt?: string | null
}

export default function MenuForm({
  categories,
  ingredients,
  addOns = [],
  mode,
  menuItem,
  defaultBackgroundPrompt,
}: MenuFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [showPromptDialog, setShowPromptDialog] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [imageOrientation, setImageOrientation] = useState<ImageOrientation>('landscape')
  const [imageSizePreset, setImageSizePreset] = useState<ImageSizePreset>('medium')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const translationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentOrientationOption =
    imageOrientationOptions.find((option) => option.value === imageOrientation) ??
    imageOrientationOptions[0]
  const currentSizeOption =
    imageSizeOptions.find((option) => option.value === imageSizePreset) ??
    imageSizeOptions[1]

  const [savedBackgroundPrompt, setSavedBackgroundPrompt] = useState(
    defaultBackgroundPrompt ?? ''
  )
  const [defaultBackgroundDraft, setDefaultBackgroundDraft] = useState(
    defaultBackgroundPrompt ?? ''
  )
  const [savingBackgroundPrompt, setSavingBackgroundPrompt] = useState(false)

  useEffect(() => {
    const prompt = defaultBackgroundPrompt ?? ''
    setDefaultBackgroundDraft(prompt)
    setSavedBackgroundPrompt(prompt)
  }, [defaultBackgroundPrompt])

  const trimmedSavedBackgroundPrompt = savedBackgroundPrompt.trim()

  // AI Recipe suggestion state
  const [showRecipeDialog, setShowRecipeDialog] = useState(false)
  const [loadingRecipe, setLoadingRecipe] = useState(false)
  const [suggestedRecipe, setSuggestedRecipe] = useState<any>(null)
  const [recipeInstructions, setRecipeInstructions] = useState('')
  const [creatingIngredients, setCreatingIngredients] = useState(false)

  // AI description and nutrition state
  const [generatingDescription, setGeneratingDescription] = useState(false)
  const [estimatingNutrition, setEstimatingNutrition] = useState(false)

  // AI Assistant tab: free-text → auto-fill form
  const [aiAssistantText, setAiAssistantText] = useState('')
  const [aiParseLoading, setAiParseLoading] = useState(false)

  // Guided next-step: which tab to show and which field to highlight after AI fill
  const [activeTab, setActiveTab] = useState<string>(mode === 'edit' ? 'overview' : 'ai')
  const [nextStepHighlight, setNextStepHighlight] = useState<'category' | 'image' | 'recipe' | null>(null)
  // Ingredients from AI prompt that weren't found in inventory (show in Recipe tab with glow)
  const [unmatchedIngredientsFromPrompt, setUnmatchedIngredientsFromPrompt] = useState<string[]>([])

  const initialFormData = {
    name: menuItem?.name || '',
    description: menuItem?.description || '',
    price: menuItem?.price?.toString() || '',
    categoryId: menuItem?.categoryId || '',
    available: menuItem?.available ?? true,
    imageUrl: menuItem?.imageUrl || '',
    calories: menuItem?.calories?.toString() || '',
    protein: (menuItem as any)?.protein?.toString() || '',
    carbs: (menuItem as any)?.carbs?.toString() || '',
    tags: menuItem?.tags?.join(', ') || '',
  }

  const [formData, setFormData] = useState(initialFormData)

  const initialCategoryName = categories.find(
    (category) => category.id === initialFormData.categoryId
  )?.name

  const initialTranslationSeed = buildTranslationSeed({
    name: initialFormData.name,
    description: initialFormData.description,
    categoryName: initialCategoryName,
    price: initialFormData.price,
    calories: initialFormData.calories,
    protein: initialFormData.protein,
    carbs: initialFormData.carbs,
  })

  const translationBaseSignature =
    mode === 'edit' ? initialTranslationSeed?.signature ?? '' : ''

  const [translationsState, setTranslationsState] = useState<
    Record<LanguageCode, TranslationDraft>
  >(() => {
    return translationLanguages.reduce((acc, language) => {
      const existing = menuItem?.translations?.find(
        (translation) => translation.language === language.code
      )

      acc[language.code] = {
        name: existing?.translatedName || '',
        description: existing?.translatedDescription || '',
        aiDescription: existing?.aiDescription || '',
        protein: existing?.protein ?? null,
        carbs: existing?.carbs ?? null,
        loading: false,
        error: undefined,
        dirty: false,
        signature: translationBaseSignature,
      }
      return acc
    }, {} as Record<LanguageCode, TranslationDraft>)
  })

  const translationSeed = useMemo(() => {
    const selectedCategoryName = categories.find(
      (category) => category.id === formData.categoryId
    )?.name

    return buildTranslationSeed({
      name: formData.name,
      description: formData.description,
      categoryName: selectedCategoryName,
      price: formData.price,
      calories: formData.calories,
      protein: formData.protein,
      carbs: formData.carbs,
    })
  }, [
    categories,
    formData.name,
    formData.description,
    formData.categoryId,
    formData.price,
    formData.calories,
    formData.protein,
    formData.carbs,
  ])

  const translationPayload = translationSeed?.payload
  const translationSignature = translationSeed?.signature ?? ''

  const updateTranslationField = (
    language: LanguageCode,
    field: 'name' | 'description',
    value: string
  ) => {
    setTranslationsState((prev) => ({
      ...prev,
      [language]: {
        ...prev[language],
        [field]: value,
        dirty: true,
      },
    }))
  }

  const translateSingleLanguage = async (
    language: LanguageCode,
    payload: TranslationSeedPayload,
    signature: string
  ) => {
    setTranslationsState((prev) => ({
      ...prev,
      [language]: {
        ...prev[language],
        loading: true,
        error: undefined,
      },
    }))

    try {
      const response = await fetch('/api/menu/translate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          name: payload.name,
          description: payload.description,
          category: payload.category,
          price: payload.price,
          calories: payload.calories,
          protein: payload.protein,
          carbs: payload.carbs,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Translation failed')
      }

      setTranslationsState((prev) => ({
        ...prev,
        [language]: {
          ...prev[language],
          name: data.name || prev[language].name,
          description: data.description || prev[language].description,
          aiDescription: data.aiDescription || prev[language].aiDescription,
          protein:
            typeof data.protein === 'number'
              ? data.protein
              : prev[language].protein,
          carbs:
            typeof data.carbs === 'number'
              ? data.carbs
              : prev[language].carbs,
          loading: false,
          error: undefined,
          dirty: false,
          signature,
        },
      }))
    } catch (error) {
      setTranslationsState((prev) => ({
        ...prev,
        [language]: {
          ...prev[language],
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to translate text',
        },
      }))
    }
  }

  const regenerateTranslation = (language: LanguageCode) => {
    if (!translationPayload) {
      return
    }

    setTranslationsState((prev) => ({
      ...prev,
      [language]: {
        ...prev[language],
        dirty: false,
      },
    }))

    translateSingleLanguage(language, translationPayload, translationSignature)
  }

  useEffect(() => {
    if (!translationPayload) {
      return
    }

    if (translationTimerRef.current) {
      clearTimeout(translationTimerRef.current)
    }

    translationTimerRef.current = setTimeout(() => {
      const languagesToUpdate = translationLanguages.filter((language) => {
        const state = translationsState[language.code]
        if (!state || state.dirty) {
          return false
        }

        if (!state.signature) {
          return true
        }

        if (state.signature !== translationSignature) {
          return true
        }

        if (!state.name && !state.description) {
          return true
        }

        return false
      })

      if (languagesToUpdate.length === 0) {
        return
      }

      languagesToUpdate.forEach((language) => {
        translateSingleLanguage(language.code, translationPayload, translationSignature)
      })
    }, 900)

    return () => {
      if (translationTimerRef.current) {
        clearTimeout(translationTimerRef.current)
      }
    }
  }, [translationPayload, translationSignature])

  const [recipe, setRecipe] = useState<RecipeIngredient[]>(
    menuItem?.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      quantity: ing.quantity,
      pieceCount: (ing as any).pieceCount || null,
      unit: (ing as any).unit ?? null,
      supplierProductId: (ing as any).supplierProductId ?? null,
      unitCostCached: (ing as any).unitCostCached ?? null,
      currency: (ing as any).currency ?? null,
      lastPricedAt: (ing as any).lastPricedAt ? new Date((ing as any).lastPricedAt).toISOString() : null,
    })) || []
  )

  // Data loss prevention: warn before navigating away with unsaved changes (must run after formData and recipe are declared)
  const formDirtyRef = useRef(false)
  const initialLoadRef = useRef(true)
  useEffect(() => {
    if (initialLoadRef.current) { initialLoadRef.current = false; return }
    formDirtyRef.current = true
  }, [formData, recipe])
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (formDirtyRef.current) { e.preventDefault() }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Store recipe steps and tips
  const [recipeSteps, setRecipeSteps] = useState<string[]>(menuItem?.recipeSteps || [])
  const [recipeTips, setRecipeTips] = useState<string[]>(menuItem?.recipeTips || [])
  const [prepTime, setPrepTime] = useState(menuItem?.prepTime || '')
  const [cookTime, setCookTime] = useState(menuItem?.cookTime || '')

  // Track newly created ingredients (so they show in the recipe builder before page refresh)
  const [newlyCreatedIngredients, setNewlyCreatedIngredients] = useState<Ingredient[]>([])

  // Draft / active status (draft = save without blocking on recipe)
  const [menuItemStatus, setMenuItemStatus] = useState<'DRAFT' | 'ACTIVE'>(
    (menuItem as any)?.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT'
  )

  // Selected add-ons for this menu item
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>(
    menuItem?.addOns?.map((a) => a.addOnId) || []
  )

  // Add-ons list (can grow when creating new add-on inline)
  const [addOnsList, setAddOnsList] = useState<AddOn[]>(addOns)

  // Create add-on inline dialog
  const [createAddOnOpen, setCreateAddOnOpen] = useState(false)
  const [createAddOnName, setCreateAddOnName] = useState('')
  const [createAddOnPrice, setCreateAddOnPrice] = useState('')
  const [createAddOnDescription, setCreateAddOnDescription] = useState('')
  const [createAddOnLoading, setCreateAddOnLoading] = useState(false)

  // Add-ons search and pagination
  const [addOnSearchQuery, setAddOnSearchQuery] = useState('')
  const [addOnPage, setAddOnPage] = useState(1)
  const addOnsPerPage = 6

  // Combined ingredients list (original + newly created)
  const allIngredients = useMemo(() => {
    const existingIds = new Set(ingredients.map((i) => i.id))
    const newOnes = newlyCreatedIngredients.filter((i) => !existingIds.has(i.id))
    return [...ingredients, ...newOnes]
  }, [ingredients, newlyCreatedIngredients])

  // Supplier products for recipe costing (4.1)
  type SupplierProductOption = {
    id: string; name: string; packSize: number; packUnit: string; supplierName: string;
    supplierId: string; price: number | null; currency: string; unitCost: number;
    globalIngredientId: string | null; category: string; brand: string | null
  }
  const [supplierProducts, setSupplierProducts] = useState<SupplierProductOption[]>([])
  useEffect(() => {
    fetch('/api/recipe-supplier-products')
      .then((r) => r.ok ? r.json() : [])
      .then(setSupplierProducts)
      .catch(() => {})
  }, [])

  // Valid recipe lines (ingredient + quantity > 0) for submit and badges
  const validRecipeLines = useMemo(
    () => recipe.filter((item) => item.ingredientId && item.quantity > 0),
    [recipe]
  )

  // Calculate real-time cost and margin — prefer supplier unitCost, fall back to ingredient.costPerUnit
  const getItemCost = (item: RecipeIngredient) => {
    // If supplier product selected and has cached cost, use it
    if (item.unitCostCached != null && item.unitCostCached > 0) {
      return item.unitCostCached * item.quantity
    }
    // If supplier product selected, compute from supplier product data
    if (item.supplierProductId) {
      const sp = supplierProducts.find((p) => p.id === item.supplierProductId)
      if (sp && sp.unitCost > 0) return sp.unitCost * item.quantity
    }
    // Fall back to ingredient base cost
    const ingredient = allIngredients.find((i) => i.id === item.ingredientId)
    return ingredient ? ingredient.costPerUnit * item.quantity : 0
  }

  const calculations = useMemo(() => {
    const cost = recipe.reduce((sum, item) => sum + getItemCost(item), 0)
    const price = parseFloat(formData.price) || 0
    const profit = price - cost
    const margin = price > 0 ? ((profit / price) * 100) : 0
    return { cost, profit, margin }
  }, [recipe, formData.price, allIngredients, supplierProducts])

  const addIngredient = () => {
    // Add new ingredient at the TOP of the list so user can see it
    setRecipe([{ ingredientId: '', quantity: 0, pieceCount: null }, ...recipe])
    setNextStepHighlight(null)
  }

  // Clear next-step highlight when user has added ingredients or after 10s
  useEffect(() => {
    if (nextStepHighlight === 'recipe' && recipe.length > 0) {
      setNextStepHighlight(null)
    }
  }, [nextStepHighlight, recipe.length])

  useEffect(() => {
    if (nextStepHighlight === 'image' && formData.imageUrl?.trim()) {
      setNextStepHighlight(null)
    }
  }, [nextStepHighlight, formData.imageUrl])

  useEffect(() => {
    if (!nextStepHighlight) return
    const t = setTimeout(() => setNextStepHighlight(null), 10000)
    return () => clearTimeout(t)
  }, [nextStepHighlight])

  const addRecipeStep = () => {
    setRecipeSteps((prev) => [...prev, ''])
  }

  const updateRecipeStep = (index: number, value: string) => {
    setRecipeSteps((prev) =>
      prev.map((step, stepIndex) => (stepIndex === index ? value : step))
    )
  }

  const removeRecipeStep = (index: number) => {
    setRecipeSteps((prev) => prev.filter((_, stepIndex) => stepIndex !== index))
  }

  const addRecipeTip = () => {
    setRecipeTips((prev) => [...prev, ''])
  }

  const updateRecipeTip = (index: number, value: string) => {
    setRecipeTips((prev) =>
      prev.map((tip, tipIndex) => (tipIndex === index ? value : tip))
    )
  }

  const removeRecipeTip = (index: number) => {
    setRecipeTips((prev) => prev.filter((_, tipIndex) => tipIndex !== index))
  }

  const removeIngredient = (index: number) => {
    setRecipe(recipe.filter((_, i) => i !== index))
  }

  const updateIngredient = (index: number, field: keyof RecipeIngredient, value: any) => {
    const newRecipe = [...recipe]
    newRecipe[index] = { ...newRecipe[index], [field]: value }
    setRecipe(newRecipe)
  }

  const selectSupplierProduct = (index: number, supplierProductId: string) => {
    const sp = supplierProducts.find((p) => p.id === supplierProductId)
    const newRecipe = [...recipe]
    if (sp) {
      newRecipe[index] = {
        ...newRecipe[index],
        supplierProductId,
        unitCostCached: sp.unitCost,
        currency: sp.currency,
        lastPricedAt: new Date().toISOString(),
      }
    } else {
      // Cleared supplier
      newRecipe[index] = {
        ...newRecipe[index],
        supplierProductId: null,
        unitCostCached: null,
        currency: null,
        lastPricedAt: null,
      }
    }
    setRecipe(newRecipe)
  }

  const refreshAllCosts = () => {
    const newRecipe = recipe.map((item) => {
      if (!item.supplierProductId) return item
      const sp = supplierProducts.find((p) => p.id === item.supplierProductId)
      if (!sp) return item
      return {
        ...item,
        unitCostCached: sp.unitCost,
        currency: sp.currency,
        lastPricedAt: new Date().toISOString(),
      }
    })
    setRecipe(newRecipe)
    toast({ title: 'Costs refreshed', description: 'All recipe costs updated to latest supplier prices' })
  }

  const generateImage = async () => {
    const promptForUpload =
      customPrompt.trim() || trimmedSavedBackgroundPrompt || undefined

    // If there's an uploaded photo, enhance it instead of generating from scratch
    if (uploadedPhoto) {
      setGeneratingImage(true)
      try {
        const response = await fetch('/api/menu/enhance-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: uploadedPhoto,
            prompt: promptForUpload,
            orientation: imageOrientation,
            sizePreset: imageSizePreset,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to enhance image')
        }

        setPreviewImageUrl(data.imageUrl)
        toast({
          title: 'Image enhanced',
          description: 'Your photo has been professionally enhanced!',
        })
      } catch (error) {
        console.error('Error enhancing image:', error)
        toast({
          title: 'Enhancement Failed',
          description:
            error instanceof Error ? error.message : 'Failed to enhance image',
          variant: 'destructive',
        })
      } finally {
        setGeneratingImage(false)
      }
      return
    }

    // Generate from scratch
    if (!formData.name) {
      toast({
        title: 'Missing Information',
        description: 'Please enter a menu item name first',
        variant: 'destructive',
      })
      return
    }

    setGeneratingImage(true)

    try {
      const category = categories.find((c) => c.id === formData.categoryId)
      const promptForGeneration =
        customPrompt.trim() || trimmedSavedBackgroundPrompt
      const response = await fetch('/api/menu/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptForGeneration || null,
          itemName: formData.name,
          description: formData.description,
          category: category?.name,
          orientation: imageOrientation,
          sizePreset: imageSizePreset,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image')
      }

      setPreviewImageUrl(data.imageUrl)
      setCustomPrompt('')
    } catch (error) {
      console.error('Error generating image:', error)
      toast({
        title: 'Image Generation Failed',
        description:
          error instanceof Error ? error.message : 'Failed to generate image',
        variant: 'destructive',
      })
    } finally {
      setGeneratingImage(false)
    }
  }

  const saveBackgroundPrompt = async () => {
    if (savingBackgroundPrompt) {
      return
    }

    setSavingBackgroundPrompt(true)
    try {
      const response = await fetch('/api/user/background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: defaultBackgroundDraft,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save background prompt')
      }

      const savedValue = data.defaultBackgroundPrompt ?? ''
      setSavedBackgroundPrompt(savedValue)
      setDefaultBackgroundDraft(savedValue)

      toast({
        title: 'Default background saved',
        description: 'Your prompt will now be reused for future menu images.',
      })
    } catch (error) {
      console.error('Error saving background prompt:', error)
      toast({
        title: 'Save Failed',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to save background prompt. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingBackgroundPrompt(false)
    }
  }

  const handlePhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setUploadedPhoto(reader.result as string)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const normalizeIngredientQuantities = (ingredients: any[]) => {
    const vegKeywords = ['tomato', 'onion', 'parsley', 'cilantro', 'pepper', 'carrot', 'cucumber', 'lettuce', 'garlic']
    const spiceKeywords = ['turmeric', 'cumin', 'coriander', 'black pepper', 'cardamom', 'cinnamon', 'saffron']
    const dryKeywords = ['lentil', 'rice', 'beans', 'chickpea', 'bulgur', 'flour']

    return ingredients.map((ing) => {
      const name = (ing.name || '').toLowerCase()
      const unit = (ing.unit || '').toLowerCase()
      let quantity = Number(ing.quantity) || 0
      let note = ing.notes

      if (unit.includes('kg') || unit.includes('g')) {
        const isVeg = vegKeywords.some((keyword) => name.includes(keyword))
        if (isVeg) {
          const limit = unit.includes('g') ? 250 : 0.25
          if (quantity > limit) {
            quantity = limit
            note = note || 'Adjusted to realistic serving size'
          }
        } else if (spiceKeywords.some((keyword) => name.includes(keyword))) {
          const limit = unit.includes('g') ? 10 : 0.02
          if (quantity > limit) {
            quantity = limit
            note = note || 'Spices kept to single-serving scale'
          }
        }
      }

      if (unit.includes('cup')) {
        const limit = 2
        if (quantity > limit) {
          quantity = limit
          note = note || 'Capped to 2 cups per serving'
        }
      }

      if (!ing.pieceCount && vegKeywords.some((keyword) => name.includes(keyword))) {
        note = note || 'Count inferred from recipe instructions'
      }

      return {
        ...ing,
        quantity,
        notes: note,
      }
    })
  }

  const fetchRecipeSuggestion = async () => {
    if (!formData.name) {
      toast({ title: 'Missing Information', description: 'Please enter a menu item name first', variant: 'destructive' })
      return
    }

    setLoadingRecipe(true)
    setSuggestedRecipe(null)

    try {
      const response = await fetch('/api/menu/suggest-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: formData.name,
          description: formData.description,
          additionalInstructions: recipeInstructions,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get recipe suggestion')
      }

      setSuggestedRecipe({
        ...data.recipe,
        ingredients: normalizeIngredientQuantities(data.recipe.ingredients || []),
      })

      // Update calories and tags if not already set
      if (!formData.calories && data.recipe.calories) {
        setFormData((prev) => ({ ...prev, calories: data.recipe.calories.toString() }))
      }
      if (!formData.tags && data.recipe.dietaryTags?.length > 0) {
        setFormData((prev) => ({ ...prev, tags: data.recipe.dietaryTags.join(', ') }))
      }
    } catch (error) {
      console.error('Error fetching recipe:', error)
      toast({ title: 'Recipe Suggestion Failed', description: error instanceof Error ? error.message : 'Failed to get recipe suggestion', variant: 'destructive' })
    } finally {
      setLoadingRecipe(false)
    }
  }

  const generateDescription = async () => {
    if (!formData.name) {
      toast({ title: 'Missing Information', description: 'Please enter a menu item name first', variant: 'destructive' })
      return
    }

    setGeneratingDescription(true)

    try {
      const category = categories.find((c) => c.id === formData.categoryId)
      const response = await fetch('/api/menu/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: formData.name,
          category: category?.name,
          tags: formData.tags,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate description')
      }

      setFormData((prev) => ({ ...prev, description: data.description }))
      toast({ title: 'Description Generated', description: 'AI has created a menu description for you' })
    } catch (error) {
      console.error('Error generating description:', error)
      toast({ title: 'Generation Failed', description: error instanceof Error ? error.message : 'Failed to generate description', variant: 'destructive' })
    } finally {
      setGeneratingDescription(false)
    }
  }

  const estimateNutrition = async () => {
    if (!formData.name) {
      toast({ title: 'Missing Information', description: 'Please enter a menu item name first', variant: 'destructive' })
      return
    }

    setEstimatingNutrition(true)

    try {
      const category = categories.find((c) => c.id === formData.categoryId)
      const response = await fetch('/api/menu/estimate-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: formData.name,
          description: formData.description,
          category: category?.name,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to estimate nutrition')
      }

      setFormData((prev) => ({
        ...prev,
        calories: data.calories.toString(),
        protein: data.protein.toString(),
        carbs: data.carbs.toString(),
      }))
      toast({ title: 'Nutrition Estimated', description: data.reasoning || 'AI has estimated the nutritional values' })
    } catch (error) {
      console.error('Error estimating nutrition:', error)
      toast({ title: 'Estimation Failed', description: error instanceof Error ? error.message : 'Failed to estimate nutrition', variant: 'destructive' })
    } finally {
      setEstimatingNutrition(false)
    }
  }

  const fillFormFromAI = async () => {
    const text = aiAssistantText.trim()
    if (!text) {
      toast({ title: 'Enter a description', description: 'Paste or type the menu item info you have (name, price, description, etc.)', variant: 'destructive' })
      return
    }
    setAiParseLoading(true)
    try {
      const res = await fetch('/api/menu/parse-with-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          categoryNames: categories.map((c) => c.name),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to parse')
      const categoryId = data.categoryName
        ? categories.find(
            (c) => c.name.toLowerCase() === (data.categoryName as string).toLowerCase()
          )?.id ?? ''
        : ''
      setFormData((prev) => ({
        ...prev,
        name: data.name || prev.name,
        description: data.description || prev.description,
        price: data.price != null ? String(data.price) : prev.price,
        categoryId: categoryId || prev.categoryId,
        calories: data.calories != null ? String(data.calories) : prev.calories,
        protein: data.protein != null ? String(data.protein) : prev.protein,
        carbs: data.carbs != null ? String(data.carbs) : prev.carbs,
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : prev.tags,
      }))
      if (Array.isArray(data.recipeSteps) && data.recipeSteps.length > 0) {
        setRecipeSteps(data.recipeSteps)
      }
      if (Array.isArray(data.recipeTips) && data.recipeTips.length > 0) {
        setRecipeTips(data.recipeTips)
      }
      if (data.prepTime) setPrepTime(data.prepTime)
      if (data.cookTime) setCookTime(data.cookTime)

      // Match parsed ingredients to inventory and fill recipe; track unmatched for UI
      let filledRecipeCount = 0
      if (Array.isArray(data.ingredients) && data.ingredients.length > 0) {
        const newRecipe: RecipeIngredient[] = []
        const unmatched: string[] = []
        for (const ing of data.ingredients) {
          const nameLower = (ing.name || '').toLowerCase().trim()
          const match = allIngredients.find((i) => {
            const n = i.name.toLowerCase().trim()
            return n === nameLower || n.includes(nameLower) || nameLower.includes(n)
          })
          if (match) {
            const converted = convertRecipeUnitToBaseUnit(
              ing.quantity,
              ing.unit,
              match.unit,
              match.name
            )
            newRecipe.push({
              ingredientId: match.id,
              quantity: converted.quantity,
              pieceCount: converted.pieceCount,
            })
            filledRecipeCount++
          } else {
            unmatched.push(ing.name.trim() || ing.name)
          }
        }
        setRecipe(newRecipe)
        setUnmatchedIngredientsFromPrompt(unmatched)
      } else {
        setUnmatchedIngredientsFromPrompt([])
      }

      // If nutrition or tags were not in the prompt, estimate nutrition and suggest tags
      const missingNutrition =
        data.calories == null || data.protein == null || data.carbs == null
      const missingTags = !Array.isArray(data.tags) || data.tags.length === 0
      const categoryName = categories.find((c) => c.id === categoryId)?.name

      if ((missingNutrition || missingTags) && (data.name || data.description)) {
        try {
          if (missingNutrition) {
            const nutRes = await fetch('/api/menu/estimate-nutrition', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                itemName: data.name || '',
                description: data.description || '',
                category: categoryName,
              }),
            })
            const nutData = await nutRes.json()
            if (nutRes.ok && (nutData.calories != null || nutData.protein != null || nutData.carbs != null)) {
              setFormData((prev) => ({
                ...prev,
                ...(nutData.calories != null && { calories: String(nutData.calories) }),
                ...(nutData.protein != null && { protein: String(nutData.protein) }),
                ...(nutData.carbs != null && { carbs: String(nutData.carbs) }),
              }))
            }
          }
          // Tags: parse API now always suggests when missing; no extra call needed
        } catch (_) {
          // Non-blocking; form still has parsed data
        }
      }

      // Guide user to the next required step (category → image → recipe)
      const needsCategory = !categoryId && categories.length > 0
      const needsImage = !formData.imageUrl?.trim()
      const hasUnmatchedIngredients = (data.ingredients?.length ?? 0) > 0 && filledRecipeCount < (data.ingredients?.length ?? 0)
      const needsIngredients = filledRecipeCount === 0
      if (needsCategory) {
        setActiveTab('details')
        setNextStepHighlight('category')
        toast({
          title: 'Form filled',
          description: 'Select a category in the Details tab to continue.',
        })
      } else if (needsImage) {
        setActiveTab('details')
        setNextStepHighlight('image')
        toast({
          title: 'Form filled',
          description: 'Add an image in the Details tab, then continue to Recipe.',
        })
      } else if (hasUnmatchedIngredients || needsIngredients) {
        setActiveTab('recipe')
        setNextStepHighlight('recipe')
        toast({
          title: 'Form filled',
          description: hasUnmatchedIngredients
            ? 'Some ingredients weren\'t found in your inventory. See the Recipe tab to add them or use AI Recipe.'
            : 'Add at least one ingredient in the Recipe tab, then save.',
        })
      } else {
        setActiveTab('details')
        toast({ title: 'Form filled', description: 'Review and save when ready.' })
      }
    } catch (err) {
      toast({
        title: 'Could not parse',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setAiParseLoading(false)
    }
  }

  // Convert recipe units to ingredient base units
  const convertRecipeUnitToBaseUnit = (
    recipeQuantity: number,
    recipeUnit: string,
    ingredientUnit: string,
    ingredientName: string
  ): { quantity: number; pieceCount: number | null; recipeUnit: string | null } => {
    const recipeUnitLower = (recipeUnit || '').toLowerCase()
    const ingredientUnitLower = (ingredientUnit || '').toLowerCase()
    const nameLower = (ingredientName || '').toLowerCase()

    // If units match, no conversion needed
    if (recipeUnitLower === ingredientUnitLower) {
      return { quantity: recipeQuantity, pieceCount: null, recipeUnit: null }
    }

    // Conversion factors
    // Spices: 1 tsp ≈ 0.005 kg (5g), 1 tbsp ≈ 0.015 kg (15g)
    // Salt: 1 tsp ≈ 0.006 kg (6g)
    // Liquids: 1 cup ≈ 0.24 L, 1 tbsp ≈ 0.015 L, 1 tsp ≈ 0.005 L
    // Dry goods: 1 cup rice/lentils ≈ 0.2 kg

    // Spices stored in kg, recipe in tsp/tbsp
    if ((ingredientUnitLower === 'kg' || ingredientUnitLower === 'kilogram') && 
        (recipeUnitLower === 'tsp' || recipeUnitLower === 'teaspoon' || recipeUnitLower === 'teaspoons')) {
      const isSalt = nameLower.includes('salt')
      const tspToKg = isSalt ? 0.006 : 0.005 // Salt is slightly denser
      return {
        quantity: recipeQuantity * tspToKg,
        pieceCount: recipeQuantity,
        recipeUnit: 'tsp'
      }
    }

    if ((ingredientUnitLower === 'kg' || ingredientUnitLower === 'kilogram') && 
        (recipeUnitLower === 'tbsp' || recipeUnitLower === 'tablespoon' || recipeUnitLower === 'tablespoons')) {
      const tbspToKg = 0.015
      return {
        quantity: recipeQuantity * tbspToKg,
        pieceCount: recipeQuantity,
        recipeUnit: 'tbsp'
      }
    }

    // Liquids stored in L, recipe in ml/cups/tbsp/tsp
    if ((ingredientUnitLower === 'liter' || ingredientUnitLower === 'l') && recipeUnitLower === 'ml') {
      return {
        quantity: recipeQuantity / 1000,
        pieceCount: recipeQuantity,
        recipeUnit: 'ml'
      }
    }

    if ((ingredientUnitLower === 'liter' || ingredientUnitLower === 'l') && 
        (recipeUnitLower === 'tsp' || recipeUnitLower === 'teaspoon')) {
      return {
        quantity: recipeQuantity * 0.005,
        pieceCount: recipeQuantity,
        recipeUnit: 'tsp'
      }
    }

    if ((ingredientUnitLower === 'liter' || ingredientUnitLower === 'l') && 
        (recipeUnitLower === 'tbsp' || recipeUnitLower === 'tablespoon')) {
      return {
        quantity: recipeQuantity * 0.015,
        pieceCount: recipeQuantity,
        recipeUnit: 'tbsp'
      }
    }

    // Dry goods stored in kg, recipe in cups
    const dryGoodsKeywords = ['rice', 'lentil', 'bean', 'bulgur', 'wheat', 'flour', 'chickpea']
    const isDryGood = dryGoodsKeywords.some(keyword => nameLower.includes(keyword))
    if (isDryGood && (ingredientUnitLower === 'kg' || ingredientUnitLower === 'kilogram') && 
        (recipeUnitLower === 'cup' || recipeUnitLower === 'cups')) {
      return {
        quantity: recipeQuantity * 0.2, // 1 cup ≈ 0.2 kg
        pieceCount: recipeQuantity,
        recipeUnit: 'cups'
      }
    }

    // No conversion needed or unknown conversion - use original pieceCount if provided
    return { quantity: recipeQuantity, pieceCount: null, recipeUnit: null }
  }

  const applyRecipeIngredients = async () => {
    if (!suggestedRecipe) return

    setCreatingIngredients(true)

    try {
      const newRecipe: RecipeIngredient[] = []
      const missingIngredients: string[] = []
      const createdIngredients: Ingredient[] = []

      for (const ing of suggestedRecipe.ingredients) {
        if (ing.existingIngredientId) {
          // Find the existing ingredient to get its unit
          const existingIngredient = ingredients.find(i => i.id === ing.existingIngredientId)
          
          // Convert recipe unit to ingredient base unit
          const converted = convertRecipeUnitToBaseUnit(
            ing.quantity,
            ing.unit,
            existingIngredient?.unit || 'kg',
            existingIngredient?.name || ing.name
          )

          // Ingredient exists, add to recipe with converted values
          newRecipe.push({
            ingredientId: ing.existingIngredientId,
            quantity: converted.quantity,
            pieceCount: converted.pieceCount !== null ? converted.pieceCount : (ing.pieceCount || null),
          })
        } else {
          // Need to create this ingredient
          missingIngredients.push(`${ing.name} (${ing.quantity} ${ing.unit})`)

          // Create the ingredient
          const createResponse = await fetch('/api/ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: ing.name,
              unit: ing.unit,
              costPerUnit: 0, // Default cost, user can update later
            }),
          })

          if (createResponse.ok) {
            const newIngredient = await createResponse.json()
            // For new ingredients, use the recipe unit as-is (no conversion needed)
            newRecipe.push({
              ingredientId: newIngredient.id,
              quantity: ing.quantity,
              pieceCount: ing.pieceCount || null,
            })
            // Track newly created ingredients for display
            createdIngredients.push(newIngredient)
          }
        }
      }

      setRecipe(newRecipe)

      // Add newly created ingredients to our local state so they show in the dropdown
      if (createdIngredients.length > 0) {
        setNewlyCreatedIngredients((prev) => [...prev, ...createdIngredients])
      }

      // Store recipe steps and tips
      if (suggestedRecipe.steps?.length > 0) {
        setRecipeSteps(suggestedRecipe.steps)
      }
      if (suggestedRecipe.tips?.length > 0) {
        setRecipeTips(suggestedRecipe.tips)
      }
      if (suggestedRecipe.prepTime) {
        setPrepTime(suggestedRecipe.prepTime)
      }
      if (suggestedRecipe.cookTime) {
        setCookTime(suggestedRecipe.cookTime)
      }

      if (missingIngredients.length > 0) {
        toast({
          title: 'Recipe Applied',
          description: `Created ${missingIngredients.length} new ingredient(s). Click "Save Changes" to save the recipe. You can update costs later in Inventory.`,
        })
      } else {
        toast({
          title: 'Recipe Applied',
          description: 'All ingredients have been added. Click "Save Changes" to save the recipe.',
        })
      }

      setShowRecipeDialog(false)
      setSuggestedRecipe(null)
      setRecipeInstructions('')

      // Note: We don't reload the page anymore because we have the new ingredient IDs
      // The ingredients dropdown may not show the new ingredients until page refresh,
      // but the recipe will save correctly with the correct ingredient IDs
    } catch (error) {
      console.error('Error applying recipe:', error)
      toast({ title: 'Error', description: 'Failed to apply recipe ingredients', variant: 'destructive' })
    } finally {
      setCreatingIngredients(false)
    }
  }

  const handleSave = async (saveStatus: 'DRAFT' | 'ACTIVE') => {
    if (!formData.categoryId) {
      toast({ title: 'Missing Information', description: 'Please select a category', variant: 'destructive' })
      return
    }

    // Allow save without recipe (draft). Only validate recipe lines when present.
    if (recipe.length > 0 && recipe.some((item) => item.ingredientId && item.quantity <= 0)) {
      toast({ title: 'Invalid Quantities', description: 'Please set valid quantities for all ingredients or remove empty lines', variant: 'destructive' })
      return
    }

    setLoading(true)

    try {
      const preparedTranslations = translationLanguages
        .map((language) => {
          const translation = translationsState[language.code]
          if (!translation) return null

          const hasContent =
            translation.name.trim().length > 0 ||
            translation.description.trim().length > 0

          if (!hasContent) {
            return null
          }

          return {
            language: language.code,
            name: translation.name.trim(),
            description: translation.description.trim(),
            aiDescription: translation.aiDescription,
            protein: translation.protein,
            carbs: translation.carbs,
          }
        })
        .filter(Boolean)

      const url = mode === 'create' ? '/api/menu' : `/api/menu/${menuItem?.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          price: parseFloat(formData.price),
          categoryId: formData.categoryId,
          available: formData.available,
          imageUrl: formData.imageUrl || null,
          status: saveStatus,
          calories: formData.calories ? parseInt(formData.calories) : null,
          protein: formData.protein ? parseInt(formData.protein) : null,
          carbs: formData.carbs ? parseInt(formData.carbs) : null,
          tags: formData.tags
            ? formData.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
            : [],
          ingredients: validRecipeLines.map((item) => ({
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            pieceCount: item.pieceCount || null,
            unit: item.unit || null,
            supplierProductId: item.supplierProductId || null,
            unitCostCached: item.unitCostCached ?? null,
            currency: item.currency || null,
            lastPricedAt: item.lastPricedAt || null,
          })),
          prepTime: prepTime || null,
          cookTime: cookTime || null,
          recipeSteps: recipeSteps,
          recipeTips: recipeTips,
          addOnIds: selectedAddOnIds,
          translations: preparedTranslations,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save menu item')
      }

      if (saveStatus === 'ACTIVE') {
        setMenuItemStatus('ACTIVE')
      }
      formDirtyRef.current = false
      router.push('/dashboard/menu')
      router.refresh()
    } catch (error) {
      console.error('Error saving menu item:', error)
      toast({ title: 'Save Failed', description: 'Failed to save menu item. Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const getMarginColor = (margin: number) => {
    if (margin >= 60) return 'text-green-600'
    if (margin >= 40) return 'text-amber-600'
    if (margin >= 20) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getCountLabelForIngredient = (ingredient?: Ingredient, pieceCount?: number | null, quantity?: number) => {
    if (!ingredient) return 'item'
    const lowerName = ingredient.name.toLowerCase()
    const ingredientUnit = ingredient.unit.toLowerCase()
    
    // Check if pieceCount represents a recipe unit (tsp, tbsp, cups) based on quantity and pieceCount relationship
    // When recipe unit is tsp/tbsp/cups, we store the recipe quantity in pieceCount and converted value in quantity
    if (pieceCount !== null && pieceCount !== undefined && quantity !== undefined) {
      // Spices: if pieceCount is a small decimal (0.1-5) and quantity is very small (< 0.1 kg), likely tsp/tbsp
      const spiceKeywords = ['turmeric', 'cumin', 'cinnamon', 'cardamom', 'black pepper', 'salt', 'paprika', 'coriander', 'sumac', 'za\'atar', 'pepper']
      const isSpice = spiceKeywords.some(keyword => lowerName.includes(keyword))
      
      if (isSpice && (ingredientUnit === 'kg' || ingredientUnit === 'kilogram') && quantity < 0.1) {
        // Check the ratio: if pieceCount/quantity ratio is around 200 (tsp) or 67 (tbsp)
        const ratio = pieceCount / quantity
        if (ratio > 100) {
          // Very high ratio means tsp (1 tsp = 0.005 kg, so ratio = 200)
          return 'tsp'
        } else if (ratio > 30) {
          // Medium ratio means tbsp (1 tbsp = 0.015 kg, so ratio = 67)
          return 'tbsp'
        }
      }
      
      // Dry goods: if pieceCount is 0.5-2 and quantity matches cup conversion (pieceCount * 0.2 ≈ quantity)
      const dryGoodsKeywords = ['rice', 'lentil', 'bean', 'bulgur', 'wheat', 'flour', 'chickpea']
      const isDryGood = dryGoodsKeywords.some(keyword => lowerName.includes(keyword))
      if (isDryGood && (ingredientUnit === 'kg' || ingredientUnit === 'kilogram') && pieceCount <= 2 && pieceCount > 0) {
        const expectedQuantity = pieceCount * 0.2 // 1 cup ≈ 0.2 kg
        if (Math.abs(quantity - expectedQuantity) < 0.05) { // Within 0.05 kg tolerance
          return 'cup'
        }
      }
      
      // Liquids: if pieceCount is large (> 10) and quantity matches ml conversion
      if ((ingredientUnit === 'liter' || ingredientUnit === 'l') && pieceCount > 10) {
        const expectedQuantity = pieceCount / 1000 // ml to L
        if (Math.abs(quantity - expectedQuantity) < 0.001) { // Within 0.001 L tolerance
          return 'ml'
        }
      }
    }
    
    // Default logic for countable items (when pieceCount is a whole number and represents actual pieces)
    if (pieceCount !== null && pieceCount !== undefined && Number.isInteger(pieceCount) && pieceCount > 0 && pieceCount <= 10) {
      const cupKeywords = ['lentil', 'rice', 'bean', 'dal', 'chickpea', 'bulgur', 'grain', 'flour']
      if (cupKeywords.some((keyword) => lowerName.includes(keyword))) {
        return 'cup'
      }
      const pieceKeywords = ['onion', 'tomato', 'pepper', 'egg', 'carrot', 'potato', 'cucumber', 'slice', 'pita']
      if (
        pieceKeywords.some((keyword) => lowerName.includes(keyword)) ||
        ['piece', 'pieces', 'pcs'].includes(ingredientUnit)
      ) {
        return 'piece'
      }
    }
    
    return 'item'
  }

  const formatCountLabel = (label: string, count?: number) => {
    if (!label) return ''
    if (count === 1) {
      return label
    }
    if (label.endsWith('s')) {
      return label
    }
    return `${label}s`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/menu">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {mode === 'create' ? 'Add New Menu Item' : 'Edit Menu Item'}
          </h1>
          <p className="text-slate-500 mt-1">
            {mode === 'create'
              ? 'Create a new menu item with recipe'
              : 'Update menu item details and recipe'}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant={menuItemStatus === 'ACTIVE' ? 'default' : 'secondary'}>
              {menuItemStatus === 'ACTIVE' ? 'Published' : 'Draft'}
            </Badge>
            <Badge variant={validRecipeLines.length > 0 && validRecipeLines.every((r) => r.unitCostCached != null) ? 'default' : 'secondary'}>
              Costing: {validRecipeLines.length > 0 && validRecipeLines.every((r) => r.unitCostCached != null) ? 'Complete' : 'Incomplete'}
            </Badge>
          </div>
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v)
                setNextStepHighlight(null)
              }}
              className="space-y-4"
            >
              <TabsList className="grid w-full grid-cols-4">
                {mode === 'edit' ? (
                  <TabsTrigger value="overview" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Overview
                  </TabsTrigger>
                ) : (
                  <TabsTrigger value="ai" className="flex items-center gap-2">
                    <BotMessageSquare className="h-4 w-4" />
                    AI Assistant
                  </TabsTrigger>
                )}
                <TabsTrigger value="details" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="recipe" className="flex items-center gap-2">
                  <ChefHat className="h-4 w-4" />
                  Recipe
                </TabsTrigger>
                <TabsTrigger value="more" className="flex items-center gap-2">
                  <MoreHorizontal className="h-4 w-4" />
                  More
                </TabsTrigger>
              </TabsList>
              {mode === 'edit' && (
              <TabsContent value="overview" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle>How it looks</CardTitle>
                    <CardDescription>
                      Preview of this menu item. Use the other tabs to edit, or the Edit assistant below to update from new text.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                      {(formData.imageUrl || menuItem?.imageUrl) ? (
                        <div className="aspect-[4/3] relative w-full">
                          <img
                            src={formData.imageUrl || menuItem?.imageUrl || ''}
                            alt={formData.name || 'Menu item'}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'
                            }}
                          />
                        </div>
                      ) : (
                        <div className="aspect-[4/3] bg-slate-200 flex items-center justify-center text-slate-500 text-sm">
                          No image
                        </div>
                      )}
                      <div className="p-4 space-y-2">
                        <p className="text-xs uppercase tracking-wider text-slate-500">
                          {categories.find((c) => c.id === formData.categoryId)?.name || 'Uncategorized'}
                        </p>
                        <h3 className="text-xl font-semibold text-slate-900">
                          {formData.name || 'Untitled item'}
                        </h3>
                        <p className="text-sm text-slate-600 line-clamp-3">
                          {formData.description || 'No description.'}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          {formData.calories && <span>{formData.calories} cal</span>}
                          {formData.protein && <span>{formData.protein}g protein</span>}
                          {formData.carbs && <span>{formData.carbs}g carbs</span>}
                          {formData.tags && formData.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-200 px-2 py-0.5">{tag}</span>
                          ))}
                        </div>
                        <p className="text-lg font-bold text-emerald-700">
                          {formatCurrency(parseFloat(formData.price) || 0)}
                        </p>
                        {selectedAddOnIds.length > 0 && (
                          <div className="pt-2 border-t border-slate-200">
                            <p className="text-xs font-medium text-slate-500 mb-1">Add-ons</p>
                            <div className="flex flex-wrap gap-1">
                              {addOnsList.filter((a) => selectedAddOnIds.includes(a.id)).map((addOn) => (
                                <span key={addOn.id} className="text-xs text-slate-600">
                                  +{addOn.name} ({formatCurrency(addOn.price)})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-emerald-500" />
                      Edit assistant
                    </CardTitle>
                    <CardDescription>
                      Paste updated info (e.g. new description or price) and we&apos;ll update the form. Then review in Details, Recipe, or More.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder="e.g.: Update price to 14,000 IQD. New description: Slow-cooked with saffron..."
                      value={aiAssistantText}
                      onChange={(e) => setAiAssistantText(e.target.value)}
                      rows={5}
                      className="resize-y"
                    />
                    <Button
                      type="button"
                      onClick={fillFormFromAI}
                      disabled={aiParseLoading || !aiAssistantText.trim()}
                    >
                      {aiParseLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Update form from text
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
              )}
              <TabsContent value="ai" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-emerald-500" />
                      AI Assistant
                    </CardTitle>
                    <CardDescription>
                      Paste or type any info you have about the dish (name, price, description, ingredients, steps). We&apos;ll fill the form for you. You can then review and edit in the other tabs.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm text-slate-600">Your description</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAiAssistantText(SAMPLE_AI_PROMPT)}
                      >
                        Try sample prompt
                      </Button>
                    </div>
                    <Textarea
                      placeholder="e.g.: Chicken Biryani, 12,000 IQD. Main course. Spiced rice with chicken, served with raita. Calories ~450. Prep 15 min, cook 35 min. Steps: marinate chicken, fry onions..."
                      value={aiAssistantText}
                      onChange={(e) => setAiAssistantText(e.target.value)}
                      rows={8}
                      className="resize-y"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        onClick={fillFormFromAI}
                        disabled={aiParseLoading || !aiAssistantText.trim()}
                      >
                        {aiParseLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Submit
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setActiveTab('details')}
                      >
                        Next
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="details" className="space-y-6 mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Menu Item Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Item Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Chicken Biryani"
                    />
                  </div>

                  <div
                    className={cn(
                      'rounded-lg p-3 transition-all duration-300',
                      nextStepHighlight === 'category' && 'ring-2 ring-emerald-400 ring-offset-2 bg-emerald-50/70'
                    )}
                  >
                    {nextStepHighlight === 'category' && (
                      <p className="text-sm font-medium text-emerald-700 mb-2 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Select a category to continue
                      </p>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="categoryId">
                        Category <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={formData.categoryId}
                        onValueChange={(value) => {
                          setFormData({ ...formData, categoryId: value })
                          setNextStepHighlight(null)
                        }}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price">
                      Selling Price (IQD) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      required
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="available">Status</Label>
                    <Select
                      value={formData.available.toString()}
                      onValueChange={(value) =>
                        setFormData({ ...formData, available: value === 'true' })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Available</SelectItem>
                        <SelectItem value="false">Unavailable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description">Description</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={generateDescription}
                      disabled={generatingDescription || !formData.name}
                      title={!formData.name ? 'Enter item name first' : 'Generate description with AI (max 18 words)'}
                      className="h-7 px-2 text-xs"
                    >
                      {generatingDescription ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      AI Write
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">Max 18 words. Leave blank to auto-generate when you save (sensory, texture, heat, origin, scarcity).</p>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the dish..."
                    rows={3}
                  />
                </div>

                <div
                  className={cn(
                    'rounded-lg p-3 transition-all duration-300',
                    nextStepHighlight === 'image' && 'ring-2 ring-emerald-400 ring-offset-2 bg-emerald-50/70'
                  )}
                >
                  {nextStepHighlight === 'image' && (
                    <p className="text-sm font-medium text-emerald-700 mb-2 flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Add an image for this item (paste a URL or generate with AI)
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="imageUrl">Image URL (optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="imageUrl"
                        value={formData.imageUrl}
                        onChange={(e) => {
                          setFormData({ ...formData, imageUrl: e.target.value })
                          setNextStepHighlight(null)
                        }}
                        placeholder="https://example.com/image.jpg"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowPromptDialog(true)}
                        disabled={generatingImage}
                        title="Generate image with AI"
                      >
                        {generatingImage ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {formData.imageUrl && (
                      <div className="mt-2 border rounded-md p-2">
                        <img
                          src={formData.imageUrl}
                          alt="Menu item preview"
                          className="w-full h-48 object-cover rounded"
                          onError={(e) => {
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Nutrition (optional)</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={estimateNutrition}
                      disabled={estimatingNutrition || !formData.name}
                      title={!formData.name ? 'Enter item name first' : 'Estimate nutrition with AI'}
                      className="h-7 px-2 text-xs"
                    >
                      {estimatingNutrition ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      AI Estimate
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="calories" className="text-xs text-slate-500">Calories</Label>
                      <Input
                        id="calories"
                        type="number"
                        value={formData.calories}
                        onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
                        placeholder="e.g., 450"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="protein" className="text-xs text-slate-500">Protein (g)</Label>
                      <Input
                        id="protein"
                        type="number"
                        value={formData.protein}
                        onChange={(e) => setFormData({ ...formData, protein: e.target.value })}
                        placeholder="e.g., 25"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="carbs" className="text-xs text-slate-500">Carbs (g)</Label>
                      <Input
                        id="carbs"
                        type="number"
                        value={formData.carbs}
                        onChange={(e) => setFormData({ ...formData, carbs: e.target.value })}
                        placeholder="e.g., 40"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">Dietary Tags (optional)</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="e.g., vegan, gluten-free, spicy"
                  />
                  <p className="text-xs text-slate-500">Comma-separated tags</p>
                </div>
              </CardContent>
            </Card>
              </TabsContent>
              <TabsContent value="more" className="space-y-6 mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Menu Translations</CardTitle>
                <CardDescription>
                  Auto-generate Iraqi Arabic and Sorani Kurdish names and descriptions.
                  You can always edit them before saving.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {translationLanguages.map((language) => {
                  const translation = translationsState[language.code]
                  if (!translation) return null

                  return (
                    <div
                      key={language.code}
                      className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">
                            {language.label}
                          </p>
                          {translation.dirty && (
                            <Badge variant="destructive" className="text-[10px] uppercase">
                              Edited
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => regenerateTranslation(language.code)}
                          disabled={!translationPayload || translation.loading}
                        >
                          {translation.loading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Refresh'
                          )}
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`translation-name-${language.code}`}>Name</Label>
                          <Input
                            id={`translation-name-${language.code}`}
                            value={translation.name}
                            onChange={(event) =>
                              updateTranslationField(
                                language.code,
                                'name',
                                event.target.value
                              )
                            }
                            placeholder={`Auto translated name (${language.label})`}
                          />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor={`translation-description-${language.code}`}>
                            Description
                          </Label>
                          <Textarea
                            id={`translation-description-${language.code}`}
                            rows={2}
                            value={translation.description}
                            onChange={(event) =>
                              updateTranslationField(
                                language.code,
                                'description',
                                event.target.value
                              )
                            }
                            placeholder={`Auto translated description (${language.label})`}
                          />
                        </div>
                      </div>

                      {translation.aiDescription && (
                        <p className="text-xs italic text-slate-500">
                          {translation.aiDescription}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>
                          Protein:{' '}
                          {translation.protein !== null
                            ? `${translation.protein}g`
                            : '—'}
                        </span>
                        <span>
                          Carbs:{' '}
                          {translation.carbs !== null ? `${translation.carbs}g` : '—'}
                        </span>
                      </div>

                      {translation.error && (
                        <p className="text-xs text-red-600">{translation.error}</p>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Consistent Background Prompt</CardTitle>
                <CardDescription>
                  Describe a background treatment you'd like to reuse for every menu photo. Leave it blank to start from scratch each time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  rows={3}
                  value={defaultBackgroundDraft}
                  onChange={(event) => setDefaultBackgroundDraft(event.target.value)}
                  placeholder="e.g., Moody restaurant lighting, a warm wooden table, and soft steam rising from the dish."
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {trimmedSavedBackgroundPrompt
                      ? 'This prompt is automatically applied whenever you do not provide a custom prompt.'
                      : 'Set a default background description to reuse across menu images.'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveBackgroundPrompt}
                    disabled={
                      savingBackgroundPrompt ||
                      defaultBackgroundDraft.trim() === trimmedSavedBackgroundPrompt
                    }
                  >
                    {savingBackgroundPrompt ? 'Saving…' : 'Save default background'}
                  </Button>
                </div>
              </CardContent>
            </Card>
              </TabsContent>
              <TabsContent value="recipe" className="space-y-6 mt-0">
            {unmatchedIngredientsFromPrompt.length > 0 && (
              <div
                className={cn(
                  'rounded-lg p-4 transition-all duration-300',
                  nextStepHighlight === 'recipe' && 'ring-2 ring-amber-400 ring-offset-2 bg-amber-50'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      These ingredients from your description weren&apos;t found in your inventory:
                    </p>
                    <p className="mt-1 text-sm text-amber-700">
                      {unmatchedIngredientsFromPrompt.join(', ')}
                    </p>
                    <p className="mt-2 text-xs text-amber-600">
                      Add them under Inventory first, or use &quot;AI Recipe&quot; below to create a full recipe with suggestions.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setUnmatchedIngredientsFromPrompt([])}
                    className="text-amber-700 hover:text-amber-900 shrink-0"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            <Card>
              <CardHeader className="flex items-center justify-between gap-3">
                <CardTitle>Recipe Instructions</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={addRecipeStep}>
                    <Plus className="h-3 w-3 mr-2" />
                    Add Step
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addRecipeTip}>
                    <Plus className="h-3 w-3 mr-2" />
                    Add Tip
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Steps</p>
                    <p className="text-xs text-slate-400">Describe the cooking sequence</p>
                  </div>
                  {recipeSteps.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No steps yet. Use the &quot;Add Step&quot; button to outline the recipe.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {recipeSteps.map((step, index) => (
                        <div
                          key={`step-${index}`}
                          className="border border-slate-200 rounded-md p-3 bg-white"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-500">
                              Step {index + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeRecipeStep(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              Remove
                            </Button>
                          </div>
                          <Textarea
                            rows={2}
                            placeholder="e.g., Sweat onions until translucent..."
                            value={step}
                            onChange={(e) => updateRecipeStep(index, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Tips</p>
                    <p className="text-xs text-slate-400">Chef notes for great results</p>
                  </div>
                  {recipeTips.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Add a few tips to help the team serve the dish consistently.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {recipeTips.map((tip, index) => (
                        <div
                          key={`tip-${index}`}
                          className="flex items-start gap-3 border border-dashed border-slate-200 rounded-md p-3 bg-slate-50"
                        >
                          <Badge variant="outline" className="text-xs uppercase">
                            Tip {index + 1}
                          </Badge>
                          <div className="flex-1 space-y-2">
                            <Textarea
                              rows={2}
                              placeholder="e.g., Garnish with parsley..."
                              value={tip}
                              onChange={(e) => updateRecipeTip(index, e.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRecipeTip(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div
              className={cn(
                'rounded-lg p-3 transition-all duration-300',
                nextStepHighlight === 'recipe' && 'ring-2 ring-emerald-400 ring-offset-2 bg-emerald-50/70'
              )}
            >
              {nextStepHighlight === 'recipe' && (
                <p className="text-sm font-medium text-emerald-700 mb-3 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Add at least one ingredient to continue (or use AI Recipe)
                </p>
              )}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recipe Builder</CardTitle>
                <div className="flex gap-2">
                  {recipe.some((r) => r.supplierProductId) && (
                    <Button type="button" variant="outline" size="sm" onClick={refreshAllCosts} title="Refresh all supplier costs to latest prices">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Costs
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRecipeDialog(true)}
                    disabled={!formData.name}
                    title={!formData.name ? 'Enter item name first' : 'Get AI recipe suggestion'}
                  >
                    <ChefHat className="h-4 w-4 mr-2" />
                    AI Recipe
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Ingredient
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recipe.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    No ingredients added. Click &quot;Add Ingredient&quot; or use &quot;AI Recipe&quot; to get suggestions.
                  </div>
                ) : (
                  <div className="space-y-3">
                      {recipe.map((item, index) => {
                        const ingredient = allIngredients.find((i) => i.id === item.ingredientId)
                        const itemCost = getItemCost(item)
                        const matchingSupplierProducts = supplierProducts.filter((sp) => {
                          if (!ingredient) return true
                          // Match by globalIngredientId or by name similarity
                          if (ingredient.globalIngredientId && sp.globalIngredientId) {
                            return ingredient.globalIngredientId === sp.globalIngredientId
                          }
                          return sp.name.toLowerCase().includes(ingredient.name.toLowerCase()) ||
                            ingredient.name.toLowerCase().includes(sp.name.toLowerCase())
                        })
                        const allSPOptions = matchingSupplierProducts.length > 0 ? matchingSupplierProducts : supplierProducts
                        const countLabel = formatCountLabel(
                          getCountLabelForIngredient(ingredient, item.pieceCount, item.quantity),
                          item.pieceCount || undefined
                        )

                        // Format display: If pieceCount exists and represents a recipe unit (tsp, tbsp, cups),
                        // show it with the count label, otherwise show quantity with ingredient unit
                        let displayQuantity: string
                        
                        if (item.pieceCount !== null && item.pieceCount !== undefined) {
                          // pieceCount exists - check if it's a recipe unit (tsp, tbsp, cups) or a piece count
                          const recipeUnitLabel = getCountLabelForIngredient(ingredient, item.pieceCount, item.quantity)
                          
                          // If the label is tsp, tbsp, or cups, it's a recipe unit - show pieceCount with that unit
                          if (['tsp', 'tbsp', 'cups', 'cup'].includes(recipeUnitLabel)) {
                            const unitDisplay = recipeUnitLabel === 'cup' && item.pieceCount !== 1 ? 'cups' : 
                                               recipeUnitLabel === 'tsp' && item.pieceCount !== 1 ? 'tsp' :
                                               recipeUnitLabel === 'tbsp' && item.pieceCount !== 1 ? 'tbsp' :
                                               recipeUnitLabel
                            displayQuantity = `${item.pieceCount} ${unitDisplay} (${item.quantity.toFixed(4)} ${ingredient?.unit || ''})`
                          } else {
                            // It's a piece count (onions, tomatoes, etc.)
                            displayQuantity = `${item.pieceCount} ${countLabel} (${item.quantity} ${ingredient?.unit || ''})`
                          }
                        } else {
                          // No pieceCount - just show quantity with ingredient unit
                          displayQuantity = `${item.quantity} ${ingredient?.unit || ''}`
                        }

                        return (
                        <div
                          key={index}
                          className="p-3 border border-slate-200 rounded-md space-y-3"
                        >
                          <div className="flex items-end gap-3">
                            <div className="flex-1 space-y-2">
                              <Label>Ingredient</Label>
                              <Select
                                value={item.ingredientId}
                                onValueChange={(value) =>
                                  updateIngredient(index, 'ingredientId', value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select ingredient" />
                                </SelectTrigger>
                                <SelectContent>
                                  {allIngredients.map((ing) => (
                                    <SelectItem key={ing.id} value={ing.id}>
                                      {ing.name} ({ing.unit})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeIngredient(index)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2">
                              <Label>Count (optional)</Label>
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                value={item.pieceCount ?? ''}
                                onChange={(e) =>
                                  updateIngredient(
                                    index,
                                    'pieceCount' as any,
                                    e.target.value ? Number(e.target.value) : null
                                  )
                                }
                                placeholder="e.g., 2"
                              />
                              <p className="text-xs text-slate-400">
                                Use cups for dry goods (lentils, rice) or pieces for countable veggies.
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label>Quantity ({ingredient?.unit || 'unit'})</Label>
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                value={item.quantity || ''}
                                onChange={(e) =>
                                  updateIngredient(
                                    index,
                                    'quantity',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                placeholder="0.00"
                              />
                              <p className="text-xs text-slate-400">Weight/Volume</p>
                            </div>

                            <div className="space-y-2">
                              <Label>Cost</Label>
                              <div className="h-10 px-3 py-2 bg-slate-50 rounded-md text-sm font-mono text-slate-700">
                                {formatCurrency(itemCost)}
                              </div>
                            </div>
                          </div>

                          {/* Supplier product selection (4.1) */}
                          {supplierProducts.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs">Supplier product</Label>
                              <select
                                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                                value={item.supplierProductId ?? ''}
                                onChange={(e) => selectSupplierProduct(index, e.target.value)}
                              >
                                <option value="">No supplier (use base cost)</option>
                                {allSPOptions.map((sp) => (
                                  <option key={sp.id} value={sp.id}>
                                    {sp.name} — {sp.supplierName} ({sp.packSize}{sp.packUnit} @ {sp.price ?? 0} {sp.currency})
                                  </option>
                                ))}
                              </select>
                              {item.supplierProductId && item.unitCostCached != null && (
                                <p className="text-[10px] text-slate-400">
                                  Unit cost: {item.unitCostCached.toFixed(2)} {item.currency}/{ingredient?.unit || 'unit'}
                                  {item.lastPricedAt && ` — priced ${new Date(item.lastPricedAt).toLocaleDateString()}`}
                                </p>
                              )}
                            </div>
                          )}

                          {ingredient && (
                            <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
                              Display: <strong>{ingredient.name}</strong> - {displayQuantity}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
              </TabsContent>
              <TabsContent value="more" className="space-y-6 mt-0">
            {/* Add-ons Section */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex items-center gap-2">
                  <CardTitle>Available Add-ons</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setCreateAddOnName('')
                      setCreateAddOnPrice('')
                      setCreateAddOnDescription('')
                      setCreateAddOnOpen(true)
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Create new add-on
                  </Button>
                </div>
                {selectedAddOnIds.length > 0 && (
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                    {selectedAddOnIds.length} selected
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                {addOnsList.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">
                    <p className="text-sm">No add-ons available.</p>
                    <p className="text-xs mt-2 mb-3">Create an add-on to offer extras with this menu item.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        setCreateAddOnName('')
                        setCreateAddOnPrice('')
                        setCreateAddOnDescription('')
                        setCreateAddOnOpen(true)
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Create new add-on
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search add-ons..."
                        value={addOnSearchQuery}
                        onChange={(e) => {
                          setAddOnSearchQuery(e.target.value)
                          setAddOnPage(1)
                        }}
                        className="pl-9"
                      />
                    </div>

                    {(() => {
                      const filteredAddOns = addOnsList.filter(
                        (addOn) =>
                          addOn.name.toLowerCase().includes(addOnSearchQuery.toLowerCase()) ||
                          addOn.description?.toLowerCase().includes(addOnSearchQuery.toLowerCase())
                      )
                      const totalPages = Math.ceil(filteredAddOns.length / addOnsPerPage)
                      const startIndex = (addOnPage - 1) * addOnsPerPage
                      const paginatedAddOns = filteredAddOns.slice(startIndex, startIndex + addOnsPerPage)

                      return (
                        <>
                          {filteredAddOns.length === 0 ? (
                            <div className="text-center py-6 text-slate-500">
                              <p className="text-sm">No add-ons match your search.</p>
                            </div>
                          ) : (
                            <>
                              <div className="grid gap-2">
                                {paginatedAddOns.map((addOn) => {
                                  const isSelected = selectedAddOnIds.includes(addOn.id)
                                  return (
                                    <div
                                      key={addOn.id}
                                      onClick={() => {
                                        if (isSelected) {
                                          setSelectedAddOnIds(selectedAddOnIds.filter((id) => id !== addOn.id))
                                        } else {
                                          setSelectedAddOnIds([...selectedAddOnIds, addOn.id])
                                        }
                                      }}
                                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                                        isSelected
                                          ? 'border-emerald-500 bg-emerald-50'
                                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div
                                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                            isSelected
                                              ? 'bg-emerald-500 border-emerald-500'
                                              : 'border-slate-300'
                                          }`}
                                        >
                                          {isSelected && <Check className="h-3 w-3 text-white" />}
                                        </div>
                                        <div>
                                          <p className="font-medium text-slate-800">{addOn.name}</p>
                                          {addOn.description && (
                                            <p className="text-xs text-slate-500 line-clamp-1">{addOn.description}</p>
                                          )}
                                        </div>
                                      </div>
                                      <span className="font-mono text-sm text-slate-600 whitespace-nowrap">
                                        +{formatCurrency(addOn.price)}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>

                              {/* Pagination */}
                              {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                                  <p className="text-xs text-slate-500">
                                    Showing {startIndex + 1}-{Math.min(startIndex + addOnsPerPage, filteredAddOns.length)} of {filteredAddOns.length}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setAddOnPage(Math.max(1, addOnPage - 1))}
                                      disabled={addOnPage === 1}
                                      className="h-8 w-8 p-0"
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-sm text-slate-600 px-2">
                                      {addOnPage} / {totalPages}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setAddOnPage(Math.min(totalPages, addOnPage + 1))}
                                      disabled={addOnPage === totalPages}
                                      className="h-8 w-8 p-0"
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Create add-on dialog (inline from menu form) */}
            <Dialog open={createAddOnOpen} onOpenChange={setCreateAddOnOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create new add-on</DialogTitle>
                  <DialogDescription>Add an extra that guests can choose with this menu item.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-addon-name">Name</Label>
                    <Input
                      id="create-addon-name"
                      value={createAddOnName}
                      onChange={(e) => setCreateAddOnName(e.target.value)}
                      placeholder="e.g. Extra cheese"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-addon-price">Price</Label>
                    <Input
                      id="create-addon-price"
                      type="number"
                      min={0}
                      step={0.01}
                      value={createAddOnPrice}
                      onChange={(e) => setCreateAddOnPrice(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-addon-desc">Description (optional)</Label>
                    <Textarea
                      id="create-addon-desc"
                      rows={2}
                      value={createAddOnDescription}
                      onChange={(e) => setCreateAddOnDescription(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateAddOnOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={createAddOnLoading || !createAddOnName.trim() || !createAddOnPrice.trim()}
                    onClick={async () => {
                      const price = parseFloat(createAddOnPrice)
                      if (Number.isNaN(price) || price < 0) {
                        toast({ title: 'Enter a valid price', variant: 'destructive' })
                        return
                      }
                      setCreateAddOnLoading(true)
                      try {
                        const res = await fetch('/api/addons', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: createAddOnName.trim(),
                            price,
                            description: createAddOnDescription.trim() || null,
                          }),
                        })
                        if (!res.ok) throw new Error('Failed to create')
                        const newAddOn = await res.json()
                        setAddOnsList((prev) => [...prev, newAddOn].sort((a, b) => a.name.localeCompare(b.name)))
                        setSelectedAddOnIds((prev) => [...prev, newAddOn.id])
                        setCreateAddOnOpen(false)
                        setCreateAddOnName('')
                        setCreateAddOnPrice('')
                        setCreateAddOnDescription('')
                        toast({ title: 'Add-on created', description: `${newAddOn.name} added and selected for this item.` })
                      } catch {
                        toast({ title: 'Could not create add-on', variant: 'destructive' })
                      } finally {
                        setCreateAddOnLoading(false)
                      }
                    }}
                  >
                    {createAddOnLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Create add-on
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cost Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm text-slate-500">Selling Price:</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(parseFloat(formData.price) || 0)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm text-slate-500">Total Cost:</span>
                    <span className="font-mono font-medium text-red-600">
                      {formatCurrency(calculations.cost)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm text-slate-500">Profit:</span>
                    <span className="font-mono font-bold text-green-600">
                      {formatCurrency(calculations.profit)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-medium text-slate-700">Margin:</span>
                    <span
                      className={`font-mono font-bold text-xl ${getMarginColor(
                        calculations.margin
                      )}`}
                    >
                      {formatPercentage(calculations.margin)}
                    </span>
                  </div>
                </div>

                {calculations.margin < 20 && formData.price && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-800">
                      <strong>Warning:</strong> Margin is below 20%. Consider increasing the
                      price or reducing recipe costs.
                    </p>
                  </div>
                )}

                {calculations.margin >= 60 && formData.price && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm text-green-800">
                      <strong>Excellent:</strong> This item has a healthy profit margin.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                size="lg"
                className="w-full bg-amber-500 hover:bg-amber-600 text-white border-amber-600 hover:border-amber-700"
                onClick={() => handleSave('DRAFT')}
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : 'Save as draft'}
              </Button>
              <Button
                type="button"
                disabled={loading}
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleSave('ACTIVE')}
              >
                {loading ? 'Saving...' : mode === 'create' ? 'Create & publish to menu' : 'Publish to menu'}
              </Button>
              <Link href="/dashboard/menu" className="w-full">
                <Button type="button" variant="outline" disabled={loading} className="w-full border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700">
                  Cancel
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </form>

      {/* AI Image Generation Dialog */}
      <Dialog open={showPromptDialog} onOpenChange={(open) => {
        setShowPromptDialog(open)
        if (!open) {
          setUploadedPhoto(null)
          setCustomPrompt('')
          setPreviewImageUrl(null)
        }
      }}>
          <DialogContent className="max-w-lg max-h-[80vh]">
            <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              Generate Image with AI
            </DialogTitle>
            <DialogDescription>
              Upload your own photo for professional enhancement, or generate a new image from scratch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {generatingImage ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
                <p className="text-sm text-slate-500">
                  {uploadedPhoto ? 'Enhancing your photo professionally...' : 'Generating your image with AI...'}
                </p>
                <p className="text-xs text-slate-400">This may take a few moments</p>
              </div>
            ) : previewImageUrl ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Image Preview</Label>
                  <div className="border rounded-lg overflow-hidden">
                    <img
                      src={previewImageUrl}
                      alt="Generated preview"
                      className="w-full h-auto"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="default"
                      className="flex-1"
                      onClick={() => {
                        setFormData({ ...formData, imageUrl: previewImageUrl })
                        setShowPromptDialog(false)
                        setPreviewImageUrl(null)
                        setCustomPrompt('')
                        setUploadedPhoto(null)
                      }}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Use This Image
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setPreviewImageUrl(null)
                      }}
                    >
                      Try Again
                    </Button>
                  </div>
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="h-4 w-4 mr-2" />
                      Select Photo
                    </Button>
                    {uploadedPhoto && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setUploadedPhoto(null)}
                      >
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
                      <img
                        src={uploadedPhoto}
                        alt="Uploaded preview"
                        className="w-full h-48 object-cover"
                      />
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
                  <Label htmlFor="customPrompt">Custom Prompt (optional)</Label>
                  <Textarea
                    id="customPrompt"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Describe subtle adjustments or recreate the scene from scratch..."
                    rows={3}
                    disabled={generatingImage}
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
                        disabled={generatingImage}
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
                            className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                              isActive
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
                            className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                              isActive
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
          {!generatingImage && !previewImageUrl && (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowPromptDialog(false)
                  setCustomPrompt('')
                  setPreviewImageUrl(null)
                  setUploadedPhoto(null)
                }}
              >
                Cancel
              </Button>
                      <Button
                        type="button"
                        onClick={generateImage}
                      >
                <Sparkles className="h-4 w-4 mr-2" />
                {uploadedPhoto ? 'Enhance Photo' : 'Generate Image'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Recipe Suggestion Dialog */}
      <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-emerald-600" />
              AI Recipe Suggestion for "{formData.name}"
            </DialogTitle>
            <DialogDescription>
              Get a recipe suggestion from AI based on your menu item
            </DialogDescription>
          </DialogHeader>

          {!suggestedRecipe && !loadingRecipe && (
            <div className="space-y-4 py-4">
              <div className="text-center py-4">
                <ChefHat className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
                <p className="text-slate-600 mb-4">
                  Let AI find the perfect recipe for <strong>"{formData.name}"</strong>
                </p>
              </div>
              <Button onClick={fetchRecipeSuggestion} className="w-full">
                <ChefHat className="h-4 w-4 mr-2" />
                Get Recipe Suggestion
              </Button>
            </div>
          )}

          {loadingRecipe && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
              <p className="text-sm text-slate-500">Searching for the perfect recipe...</p>
            </div>
          )}

          {suggestedRecipe && (
            <div className="space-y-6 py-4">
              {/* Recipe Header */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h3 className="font-semibold text-emerald-800 text-lg">{suggestedRecipe.recipeName}</h3>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-emerald-700">
                  <span>Prep: {suggestedRecipe.prepTime}</span>
                  <span>Cook: {suggestedRecipe.cookTime}</span>
                  <span>Servings: {suggestedRecipe.servings}</span>
                  {suggestedRecipe.calories && <span>{suggestedRecipe.calories} calories</span>}
                </div>
                {suggestedRecipe.dietaryTags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {suggestedRecipe.dietaryTags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Ingredients */}
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                  Ingredients
                  <span className="text-xs font-normal text-slate-500">
                    ({suggestedRecipe.ingredients?.filter((i: any) => i.isAvailable).length || 0} available,{' '}
                    {suggestedRecipe.ingredients?.filter((i: any) => !i.isAvailable).length || 0} need to be created)
                  </span>
                </h4>
                <div className="space-y-2">
                  {suggestedRecipe.ingredients?.map((ing: any, index: number) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        ing.isAvailable
                          ? 'bg-green-50 border-green-200'
                          : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {ing.isAvailable ? (
                          <Check className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-amber-600" />
                        )}
                        <div>
                          <span className="font-medium">{ing.name}</span>
                          <span className="text-slate-500 ml-2">
                            {ing.pieceCount ? (
                              <>{ing.pieceCount} items ({ing.quantity} {ing.unit})</>
                            ) : (
                              <>{ing.quantity} {ing.unit}</>
                            )}
                          </span>
                          {ing.notes && (
                            <span className="text-xs text-slate-400 ml-2">({ing.notes})</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs">
                        {ing.isAvailable ? (
                          <span className="text-green-600">In inventory</span>
                        ) : (
                          <span className="text-amber-600">Will be created</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cooking Steps */}
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-800">Cooking Steps</h4>
                <ol className="space-y-2">
                  {suggestedRecipe.steps?.map((step: string, index: number) => (
                    <li
                      key={index}
                      className="flex gap-3 p-3 bg-slate-50 rounded-lg"
                    >
                      <span className="flex-shrink-0 w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </span>
                      <span className="text-slate-700">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Tips */}
              {suggestedRecipe.tips?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-800">Tips</h4>
                  <ul className="space-y-1">
                    {suggestedRecipe.tips.map((tip: string, index: number) => (
                      <li key={index} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="text-emerald-500">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ask for modifications */}
              <div className="space-y-3 border-t pt-4">
                <Label className="text-base font-medium">Want to modify this recipe?</Label>
                <p className="text-sm text-slate-500">
                  Tell us what you'd like to add, remove, or change
                </p>
                <Textarea
                  value={recipeInstructions}
                  onChange={(e) => setRecipeInstructions(e.target.value)}
                  placeholder="e.g., Add more garlic and onions, use olive oil instead of butter, make it less spicy, add cumin and coriander..."
                  rows={2}
                  className="resize-none"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchRecipeSuggestion}
                  disabled={loadingRecipe || !recipeInstructions.trim()}
                  className="w-full"
                >
                  {loadingRecipe ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating Recipe...
                    </>
                  ) : (
                    <>
                      <ChefHat className="h-4 w-4 mr-2" />
                      Update Recipe with Changes
                    </>
                  )}
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowRecipeDialog(false)
                    setSuggestedRecipe(null)
                    setRecipeInstructions('')
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={applyRecipeIngredients}
                  disabled={creatingIngredients}
                  className="flex-1"
                >
                  {creatingIngredients ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Apply Recipe Ingredients
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
