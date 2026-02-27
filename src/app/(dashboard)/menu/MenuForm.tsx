'use client'

import { useState, useMemo, useRef, useEffect, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Save, Plus, Trash2, Sparkles, Loader2, ChefHat, Check, AlertCircle, ImagePlus, Search, ChevronLeft, ChevronRight, ChevronDown, BotMessageSquare, FileText, MoreHorizontal, LayoutDashboard, Mic, MicOff, Send } from 'lucide-react'
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
import { useI18n, getTranslatedCategoryName } from '@/lib/i18n'
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
  supplierName?: string | null
  supplierProductId?: string | null
  unitCostCached?: number | null
  currency?: string | null
  lastPricedAt?: string | null
}

/** All possible translation language codes (the dynamic subset is chosen at runtime based on management language) */
const ALL_TRANSLATION_LANGUAGE_CODES = ['en', 'ar', 'ar_fusha', 'ku'] as const

const SAMPLE_AI_PROMPT = `Chicken Biryani. Main course. Price 12,000 IQD. Fragrant basmati rice with tender chicken, layered with saffron, fried onions, and mint. Served with raita. Calories about 450 per serving, 28g protein, 42g carbs. Tags: halal, spicy.
Prep time: 15 minutes. Cook time: 35 minutes.
Steps: Marinate chicken in yogurt and spices. Soak rice 20 min. Fry onions until golden. Layer rice and chicken in pot, add saffron and ghee. Cook on low 25 min. Fluff and serve with raita.
Steps: Marinate chicken in yogurt and spices. Soak rice 20 min. Fry onions until golden. Layer rice and chicken in pot, add saffron and ghee. Cook on low 25 min. Fluff and serve with raita.
Tips: Use aged basmati for best fragrance. Let rest 5 min before opening lid.
Yield: 4 servings`

type LanguageCode = (typeof ALL_TRANSLATION_LANGUAGE_CODES)[number]

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
  hasDefaultBackgroundImage?: boolean
}

interface ParsedAIIngredient {
  name: string
  quantity: number
  unit: string
  pieceCount?: number | null
  /** When creating a new ingredient, cost per unit in IQD (e.g. from Smart Chef asking for price) */
  costPerUnit?: number | null
}

interface ParsedAIResponse {
  name?: string
  description?: string
  price?: number
  categoryName?: string
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  tags?: string[]
  recipeSteps?: string[]
  recipeTips?: string[]
  prepTime?: string | null
  cookTime?: string | null
  recipeYield?: number | null
  ingredients?: ParsedAIIngredient[]
}

interface AssistantMessage {
  role: 'assistant' | 'user'
  text: string
}

export default function MenuForm({
  categories,
  ingredients,
  addOns = [],
  mode,
  menuItem,
  defaultBackgroundPrompt,
  hasDefaultBackgroundImage = false,
}: MenuFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { t, menuTranslationLanguages } = useI18n()

  /** translationLanguages typed for internal use */
  const translationLanguages = menuTranslationLanguages as { code: LanguageCode; label: string }[]

  const [loading, setLoading] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [showPromptDialog, setShowPromptDialog] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  /** When opening Generate Image from Smart Chef after we already asked for dish name, use name inferred from chat */
  const [inferredItemNameForImage, setInferredItemNameForImage] = useState<string | null>(null)
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
  const AI_ASSISTANT_WELCOME =
    "Hi! I'm Smart Chef. Tell me what dish you want to add — I'll handle everything: the name, description, recipe, ingredients, costs, and how it looks on your menu. You can also upload a photo or document and I'll work from that.\n\nJust describe your dish and I'll guide you through the rest. When you're happy, hit **Fill Form Now** to save it all automatically."
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    { role: 'assistant', text: AI_ASSISTANT_WELCOME },
  ])
  const [isListening, setIsListening] = useState(false)
  const speechRecognitionRef = useRef<any>(null)

  // AI Assistant attachment state
  const assistantDocInputRef = useRef<HTMLInputElement>(null)
  const assistantImageInputRef = useRef<HTMLInputElement>(null)
  const assistantMessagesEndRef = useRef<HTMLDivElement>(null)
  const [attachedDocs, setAttachedDocs] = useState<{ name: string, type: string, base64: string }[]>([])
  const [attachedImages, setAttachedImages] = useState<{ name: string, type: string, base64: string }[]>([])

  // Keep latest Smart Chef message in view (like project management chat)
  useEffect(() => {
    assistantMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [assistantMessages])

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
    // Initialize for ALL possible language codes from existing translations
    const allCodes: LanguageCode[] = ['en', 'ar', 'ar_fusha', 'ku']
    return allCodes.reduce((acc, code) => {
      const existing = menuItem?.translations?.find(
        (translation) => translation.language === code
      )

      acc[code] = {
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
      supplierName: null,
      supplierProductId: (ing as any).supplierProductId ?? null,
      unitCostCached: (ing as any).unitCostCached ?? null,
      currency: (ing as any).currency ?? null,
      lastPricedAt: (ing as any).lastPricedAt ? new Date((ing as any).lastPricedAt).toISOString() : null,
    })) || []
  )
  const [activeIngredientPickerIndex, setActiveIngredientPickerIndex] = useState<number | null>(null)
  const [ingredientSearchQuery, setIngredientSearchQuery] = useState('')

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
  const [recipeYield, setRecipeYield] = useState<number>((menuItem as any)?.recipeYield || 1)

  // Track newly created ingredients (so they show in the recipe builder before page refresh)
  const [newlyCreatedIngredients, setNewlyCreatedIngredients] = useState<Ingredient[]>([])

  // Draft / active status (draft = save without blocking on recipe)
  const [menuItemStatus, setMenuItemStatus] = useState<'DRAFT' | 'ACTIVE'>(
    (menuItem as any)?.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT'
  )

  // Selected add-ons for this menu item
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>(
    menuItem?.addOns?.map((ma) => ma.addOn.id) || []
  )

  const toggleAddOn = (addOnId: string) => {
    setSelectedAddOnIds((prev) =>
      prev.includes(addOnId) ? prev.filter((id) => id !== addOnId) : [...prev, addOnId]
    )
  }


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
      .catch(() => { })
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
    setRecipe([{ ingredientId: '', quantity: 0, pieceCount: null, supplierName: null }, ...recipe])
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
    setRecipe((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const applyIngredientSelection = (index: number, ingredientId: string) => {
    setRecipe((prev) => {
      const current = prev[index]
      if (!current) return prev
      const selectedIngredient = allIngredients.find((i) => i.id === ingredientId)
      const nextLine = autoFillSupplierCost(
        {
          ...current,
          ingredientId,
        },
        selectedIngredient
      )
      const next = [...prev]
      next[index] = nextLine
      return next
    })
  }

  const normalizeSearch = (value?: string | null) => (value || '').trim().toLowerCase()

  const getMatchingSupplierProductsForIngredient = (ingredient?: Ingredient) => {
    if (!ingredient) return [] as SupplierProductOption[]
    return supplierProducts.filter((sp) => {
      if (ingredient.globalIngredientId && sp.globalIngredientId) {
        return ingredient.globalIngredientId === sp.globalIngredientId
      }
      const ingredientName = ingredient.name.toLowerCase()
      const productName = sp.name.toLowerCase()
      return (
        productName.includes(ingredientName) ||
        ingredientName.includes(productName)
      )
    })
  }

  const pickBestSupplierProduct = (
    options: SupplierProductOption[],
    supplierName?: string | null
  ) => {
    if (options.length === 0) return null
    const query = normalizeSearch(supplierName)
    const filtered = query
      ? options.filter((sp) => {
        const supplier = sp.supplierName.toLowerCase()
        const product = sp.name.toLowerCase()
        const brand = (sp.brand || '').toLowerCase()
        return (
          supplier.includes(query) ||
          query.includes(supplier) ||
          product.includes(query) ||
          brand.includes(query)
        )
      })
      : options
    const pool = filtered.length > 0 ? filtered : options
    return [...pool].sort((a, b) => {
      const aCost = Number.isFinite(a.unitCost) ? a.unitCost : Number.MAX_SAFE_INTEGER
      const bCost = Number.isFinite(b.unitCost) ? b.unitCost : Number.MAX_SAFE_INTEGER
      if (aCost !== bCost) return aCost - bCost
      return (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER)
    })[0]
  }

  const autoFillSupplierCost = (
    line: RecipeIngredient,
    ingredient?: Ingredient
  ): RecipeIngredient => {
    if (!ingredient) {
      return {
        ...line,
        supplierProductId: null,
        unitCostCached: null,
        currency: null,
        lastPricedAt: null,
      }
    }
    const options = getMatchingSupplierProductsForIngredient(ingredient)
    const selected = pickBestSupplierProduct(options, line.supplierName)
    if (!selected) {
      return {
        ...line,
        supplierProductId: null,
        unitCostCached: null,
        currency: null,
        lastPricedAt: null,
      }
    }
    return {
      ...line,
      supplierProductId: selected.id,
      unitCostCached: selected.unitCost,
      currency: selected.currency,
      lastPricedAt: new Date().toISOString(),
    }
  }

  useEffect(() => {
    if (supplierProducts.length === 0) return
    setRecipe((prev) =>
      prev.map((line) => {
        if (line.supplierName || !line.supplierProductId) return line
        const supplierProduct = supplierProducts.find((sp) => sp.id === line.supplierProductId)
        if (!supplierProduct) return line
        return { ...line, supplierName: supplierProduct.supplierName }
      })
    )
  }, [supplierProducts])

  const refreshAllCosts = () => {
    const newRecipe = recipe.map((item) => {
      const ingredient = allIngredients.find((i) => i.id === item.ingredientId)
      if (!ingredient) return item
      return autoFillSupplierCost(item, ingredient)
    })
    setRecipe(newRecipe)
    toast({ title: 'Costs refreshed', description: 'All recipe costs updated to latest supplier prices' })
  }

  const generateImage = async () => {
    const customPromptTrimmed = customPrompt.trim()
    const promptForUpload =
      customPromptTrimmed || trimmedSavedBackgroundPrompt || undefined
    const useSavedDefaults = customPromptTrimmed.length === 0

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
            useSavedDefaults,
            orientation: imageOrientation,
            sizePreset: imageSizePreset,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Failed to enhance image')
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

    // Generate from scratch: use form name or name inferred from Smart Chef chat
    const itemNameForImage = inferredItemNameForImage?.trim() || formData.name?.trim()
    if (!itemNameForImage) {
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
        customPromptTrimmed || trimmedSavedBackgroundPrompt
      const response = await fetch('/api/menu/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptForGeneration || null,
          useSavedDefaults,
          itemName: itemNameForImage,
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
      setInferredItemNameForImage(null)
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

  const parseMenuWithAI = async (text: string): Promise<ParsedAIResponse> => {
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
    return data as ParsedAIResponse
  }

  const findCategoryIdByName = (name?: string) => {
    if (!name) return ''
    const normalized = name.toLowerCase().trim()
    const exact = categories.find((c) => c.name.toLowerCase().trim() === normalized)
    if (exact) return exact.id
    const partial = categories.find((c) => {
      const cat = c.name.toLowerCase().trim()
      return cat.includes(normalized) || normalized.includes(cat)
    })
    return partial?.id ?? ''
  }

  const applyParsedDataToForm = async (
    data: ParsedAIResponse,
    options?: { autoCreateIngredients?: boolean; quietToast?: boolean },
    additionalIngredients?: Ingredient[]
  ) => {
    const autoCreateIngredients = options?.autoCreateIngredients === true
    const effectiveIngredients = additionalIngredients?.length ? [...allIngredients, ...additionalIngredients] : allIngredients
    const categoryId = findCategoryIdByName(data.categoryName)
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

    let filledRecipeCount = 0
    if (Array.isArray(data.ingredients) && data.ingredients.length > 0) {
      const newRecipe: RecipeIngredient[] = []
      const unmatched: string[] = []
      const createdIngredients: Ingredient[] = []
      const yieldFactor = (data.recipeYield && data.recipeYield > 0) ? data.recipeYield : 1
      if (data.recipeYield && data.recipeYield > 0) setRecipeYield(data.recipeYield)

      for (const ing of data.ingredients) {
        const nameLower = (ing.name || '').toLowerCase().trim()
        let match = effectiveIngredients.find((i) => {
          const n = i.name.toLowerCase().trim()
          return n === nameLower || n.includes(nameLower) || nameLower.includes(n)
        })
        // Closest match: e.g. "Parmesan" in inventory matches "Fresh Parmesan" or "parmesan cheese" in recipe
        if (!match && nameLower.length > 0) {
          const recipeWords = nameLower.split(/\s+/).filter((w) => w.length > 2)
          match = effectiveIngredients.find((i) => {
            const n = i.name.toLowerCase().trim()
            const invWords = n.split(/[\s,]+/).filter((w) => w.length > 2)
            return invWords.some((invW) => nameLower.includes(invW)) || recipeWords.some((rw) => n.includes(rw))
          }) ?? null
        }
        if (match) {
          // If AI has a cost for this ingredient and inventory still shows 0, update it
          if (typeof ing.costPerUnit === 'number' && ing.costPerUnit > 0 && match.costPerUnit === 0) {
            fetch(`/api/inventory/${match.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ costPerUnit: ing.costPerUnit }),
            }).then((r) => {
              if (r.ok) match.costPerUnit = ing.costPerUnit
            }).catch(() => { })
          }
          const converted = convertRecipeUnitToBaseUnit(
            ing.quantity,
            ing.unit,
            match.unit,
            match.name
          )
          newRecipe.push({
            ingredientId: match.id,
            quantity: converted.quantity / yieldFactor,
            pieceCount: converted.pieceCount ? converted.pieceCount / yieldFactor : converted.pieceCount,
          })
          filledRecipeCount++
          continue
        }

        if (!autoCreateIngredients) {
          unmatched.push(ing.name.trim() || ing.name)
          continue
        }

        // Already created in this session (e.g. real-time add from Smart Chef)
        const alreadyCreated = additionalIngredients?.find((i) => (i.name || '').toLowerCase().trim() === nameLower)
        if (alreadyCreated) {
          const converted = convertRecipeUnitToBaseUnit(
            ing.quantity,
            ing.unit,
            alreadyCreated.unit,
            alreadyCreated.name
          )
          newRecipe.push({
            ingredientId: alreadyCreated.id,
            quantity: converted.quantity / yieldFactor,
            pieceCount: converted.pieceCount != null ? converted.pieceCount / yieldFactor : null,
          })
          filledRecipeCount++
          continue
        }

        try {
          const createResponse = await fetch('/api/ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: ing.name,
              unit: ing.unit || 'kg',
              costPerUnit: typeof ing.costPerUnit === 'number' && ing.costPerUnit >= 0 ? ing.costPerUnit : 0,
            }),
          })
          if (!createResponse.ok) {
            unmatched.push(ing.name.trim() || ing.name)
            continue
          }
          const newIngredient = await createResponse.json()
          createdIngredients.push(newIngredient)
          newRecipe.push({
            ingredientId: newIngredient.id,
            quantity: (Number(ing.quantity) || 0) / yieldFactor,
            pieceCount: ing.pieceCount ? ing.pieceCount / yieldFactor : ing.pieceCount,
          })
          filledRecipeCount++
        } catch {
          unmatched.push(ing.name.trim() || ing.name)
        }
      }
      // Merge duplicate ingredients by ingredientId (same ingredient listed twice => one line with summed quantity)
      const mergedByIngredient = new Map<string, RecipeIngredient>()
      for (const line of newRecipe) {
        const existing = mergedByIngredient.get(line.ingredientId)
        if (existing) {
          mergedByIngredient.set(line.ingredientId, {
            ...existing,
            quantity: existing.quantity + line.quantity,
            pieceCount: existing.pieceCount != null && line.pieceCount != null ? existing.pieceCount + line.pieceCount : existing.pieceCount ?? line.pieceCount,
          })
        } else {
          mergedByIngredient.set(line.ingredientId, { ...line })
        }
      }
      const dedupedRecipe = Array.from(mergedByIngredient.values())
      if (createdIngredients.length > 0) {
        setNewlyCreatedIngredients((prev) => [...prev, ...createdIngredients])
      }
      setRecipe(dedupedRecipe)
      setUnmatchedIngredientsFromPrompt(unmatched)
    } else {
      setUnmatchedIngredientsFromPrompt([])
    }

    if (data.recipeYield && data.recipeYield > 1 && !options?.quietToast) {
      toast({
        title: 'Yield Adjusted',
        description: `Quantities divided by ${data.recipeYield} to get per-serving cost.`,
      })
    }

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
      } catch (_) {
        // Non-blocking
      }
    }

    const needsCategory = !categoryId && categories.length > 0
    const needsImage = !formData.imageUrl?.trim()
    const hasUnmatchedIngredients = (data.ingredients?.length ?? 0) > 0 && filledRecipeCount < (data.ingredients?.length ?? 0)
    const needsIngredients = filledRecipeCount === 0

    if (needsCategory) {
      setActiveTab('details')
      setNextStepHighlight('category')
      if (!options?.quietToast) {
        toast({
          title: 'Form filled',
          description: 'Select a category in the Details tab to continue.',
        })
      }
    } else if (needsImage) {
      setActiveTab('details')
      setNextStepHighlight('image')
      if (!options?.quietToast) {
        toast({
          title: 'Form filled',
          description: 'Form and SOP are ready. Add image manually in Details tab (AI Assistant does not auto-generate images).',
        })
      }
    } else if (hasUnmatchedIngredients || needsIngredients) {
      setActiveTab('recipe')
      setNextStepHighlight('recipe')
      if (!options?.quietToast) {
        toast({
          title: 'Form filled',
          description: hasUnmatchedIngredients
            ? 'Some ingredients were not created automatically. Review Recipe tab.'
            : 'Add at least one ingredient in the Recipe tab, then save.',
        })
      }
    } else {
      setActiveTab('details')
      if (!options?.quietToast) {
        toast({ title: 'Form filled', description: 'Review and save when ready.' })
      }
    }
  }

  const buildFollowUpQuestion = (data: ParsedAIResponse): { question: string; ready: boolean } => {
    // With Smart Chef, the AI drives the conversation. 
    // We only consider it 'ready' when explicitly marked or when name, category, and ingredients exist.
    const hasName = data.name && data.name.trim().length > 0
    const hasCategory = !!findCategoryIdByName(data.categoryName)
    const hasIngredients = Array.isArray(data.ingredients) && data.ingredients.length > 0
    const hasPrice = typeof data.price === 'number' && data.price > 0

    const ready = !!hasName && !!hasCategory && !!hasIngredients && !!hasPrice
    return { ready, question: '' }
  }

  const resetAssistantChat = () => {
    setAssistantMessages([{ role: 'assistant', text: AI_ASSISTANT_WELCOME }])
    setAiAssistantText('')
    setAttachedDocs([])
    setAttachedImages([])
  }

  const submitAssistantMessage = async () => {
    const text = aiAssistantText.trim()
    if (!text && attachedDocs.length === 0 && attachedImages.length === 0) return

    setAiParseLoading(true)
    try {
      const userMessage = {
        role: 'user' as const,
        text: text || (attachedDocs.length > 0 || attachedImages.length > 0 ? "Sent attachments" : "")
      }
      const nextMessages = [...assistantMessages, userMessage]
      setAssistantMessages(nextMessages)
      setAiAssistantText('')

      // Prepare attachments for API
      const attachments = [
        ...attachedDocs.map(d => ({ name: d.name, type: d.type, base64: d.base64 })),
        ...attachedImages.map(i => ({ name: i.name, type: i.type, base64: i.base64 }))
      ]

      const response = await fetch('/api/menu/smart-chef', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          categories: categories.map(c => c.name),
          inventory: allIngredients.map(i => ({
            name: i.name,
            unit: i.unit,
            costPerUnit: i.costPerUnit
          })),
          currentData: {
            name: formData.name,
            categoryName: categories.find(c => c.id === formData.categoryId)?.name || '',
            price: parseFloat(formData.price) || 0,
            ingredients: recipe,
            recipeSteps,
            recipeTips,
            recipeYield
          },
          attachments
        }),
      })

      if (!response.ok) throw new Error('Smart Chef failed to respond')
      const result = await response.json()

      // When the AI returns an ingredient with costPerUnit (user just provided cost):
      // - If it already exists in inventory with cost=0, PATCH to update the cost
      // - If it's new, CREATE it with the provided cost
      const createdFromChat: Ingredient[] = []
      const dataIngredients = Array.isArray(result.data?.ingredients) ? result.data.ingredients : []
      const existingNames = new Set(allIngredients.map((i) => i.name.toLowerCase().trim()))
      for (const ing of dataIngredients) {
        const name = (ing.name || '').trim()
        const costPerUnit = typeof ing.costPerUnit === 'number' && ing.costPerUnit > 0 ? ing.costPerUnit : null
        if (!name || costPerUnit == null) continue

        // Check if this ingredient already exists (exact or fuzzy match)
        const nameLower = name.toLowerCase()
        const existingMatch = allIngredients.find((i) => {
          const n = i.name.toLowerCase().trim()
          return n === nameLower || n.includes(nameLower) || nameLower.includes(n)
        })

        if (existingMatch) {
          // Update cost if existing cost is 0 or different
          if (existingMatch.costPerUnit === 0 || existingMatch.costPerUnit !== costPerUnit) {
            try {
              const patchRes = await fetch(`/api/inventory/${existingMatch.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ costPerUnit }),
              })
              if (patchRes.ok) {
                // Update in-memory ingredient so subsequent lookups see the new cost
                existingMatch.costPerUnit = costPerUnit
              }
            } catch {
              // ignore
            }
          }
          existingNames.add(nameLower)
          continue
        }

        // Brand new ingredient — create it
        try {
          const createRes = await fetch('/api/ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              unit: ing.unit || 'g',
              costPerUnit,
            }),
          })
          if (!createRes.ok) continue
          const newIng = await createRes.json()
          createdFromChat.push(newIng)
          existingNames.add(nameLower)
        } catch {
          // ignore
        }
      }
      if (createdFromChat.length > 0) {
        setNewlyCreatedIngredients((prev) => [...prev, ...createdFromChat])
      }

      const replyText = result.message || ''
      if (replyText) {
        setAssistantMessages((prev) => [...prev, { role: 'assistant', text: replyText }])
      }

      // Clear attachments after sending
      setAttachedDocs([])
      setAttachedImages([])

      // When Smart Chef says FINISHED, auto-fill the form with the summary/description
      const isFinished = result.data?.isFinished || (result.message || '').toLowerCase().includes('finished')
      if (isFinished && result.data && typeof result.data === 'object') {
        const d = result.data
        const parsed: ParsedAIResponse = {
          name: d.name,
          description: d.description || undefined,
          price: typeof d.price === 'number' ? d.price : undefined,
          categoryName: d.categoryName,
          recipeSteps: Array.isArray(d.recipeSteps) ? d.recipeSteps : undefined,
          recipeTips: Array.isArray(d.recipeTips) ? d.recipeTips : undefined,
          recipeYield: typeof d.recipeYield === 'number' ? d.recipeYield : undefined,
          ingredients: Array.isArray(d.ingredients)
            ? d.ingredients.map((ing: { name?: string; quantity?: number; unit?: string; pieceCount?: number | null; costPerUnit?: number | null }) => ({
              name: ing.name ?? '',
              quantity: Number(ing.quantity) || 0,
              unit: ing.unit ?? 'g',
              pieceCount: ing.pieceCount ?? null,
              costPerUnit: typeof ing.costPerUnit === 'number' && ing.costPerUnit >= 0 ? ing.costPerUnit : null,
            }))
            : undefined,
        }
        await applyParsedDataToForm(parsed, { autoCreateIngredients: true, quietToast: true }, createdFromChat)
        setInferredItemNameForImage(null)
        setAssistantMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: "I'm done with our conversation — I've filled the form with the summary, description, recipe, and ingredients. **Next step:** generate an image for your dish. I'm opening the image generator for you now; use it to create or upload a photo, then save your menu item when ready.",
          },
        ])
        toast({ title: 'Smart Chef finished', description: 'Form filled. Generating image next — the image dialog will open for you.' })
        setTimeout(() => {
          setActiveTab('ai')
          setShowPromptDialog(true)
        }, 1200)
      }

    } catch (err) {
      toast({
        title: 'Smart Chef Error',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setAiParseLoading(false)
    }
  }

  const startSpeechToText = () => {
    if (typeof window === 'undefined') return
    const RecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!RecognitionClass) {
      toast({
        title: 'Voice input unavailable',
        description: 'Browser speech-to-text is not supported here. Please type your message.',
        variant: 'destructive',
      })
      return
    }
    const recognition = new RecognitionClass()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setAiAssistantText((prev) => `${prev}${prev ? ' ' : ''}${transcript}`.trim())
    }
    speechRecognitionRef.current = recognition
    recognition.start()
  }

  const stopSpeechToText = () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop()
    }
  }

  const handleAssistantFileUpload = async (e: ChangeEvent<HTMLInputElement>, type: 'doc' | 'image') => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newAttachments: { name: string, type: string, base64: string }[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1]) // Remove data URL prefix
        }
      })
      reader.readAsDataURL(file)
      const base64 = await base64Promise
      newAttachments.push({ name: file.name, type: file.type, base64 })
    }

    if (type === 'doc') {
      setAttachedDocs((prev) => [...prev, ...newAttachments])
    } else {
      setAttachedImages((prev) => [...prev, ...newAttachments])
    }

    // Reset input
    e.target.value = ''
  }

  const removeAttachment = (name: string, type: 'doc' | 'image') => {
    if (type === 'doc') {
      setAttachedDocs((prev) => prev.filter((d) => d.name !== name))
    } else {
      setAttachedImages((prev) => prev.filter((i) => i.name !== name))
    }
  }

  const fillFormFromAI = async () => {
    let text = aiAssistantText.trim()

    // If text area is empty, use the whole conversation history for research path
    if (!text && assistantMessages.length > 0) {
      text = assistantMessages
        .filter((m) => m.role === 'user')
        .map((m) => m.text)
        .join('\n')
    }

    if (!text && attachedDocs.length === 0 && attachedImages.length === 0) {
      toast({ title: 'No info to fill', description: 'Please type a dish name, upload a file, or chat with the AI first.', variant: 'destructive' })
      return
    }

    const existingName = formData.name?.trim()
    const firstUserMessage = assistantMessages.find((m) => m.role === 'user')?.text?.trim()
    const firstLineOfText = text.split(/\n/)[0]?.trim()
    const dishName = existingName || firstUserMessage || firstLineOfText || ''

    // If user has been chatting with Smart Chef, use the conversation to fill the form (so agreed ingredients and costs are included)
    const hasConversation = assistantMessages.length > 1 && assistantMessages.some((m) => m.role === 'user')

    setAiParseLoading(true)
    try {
      if (hasConversation) {
        const response = await fetch('/api/menu/smart-chef', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: assistantMessages,
            categories: categories.map(c => c.name),
            inventory: allIngredients.map(i => ({ name: i.name, unit: i.unit, costPerUnit: i.costPerUnit })),
            currentData: {
              name: formData.name,
              categoryName: categories.find(c => c.id === formData.categoryId)?.name || '',
              price: parseFloat(formData.price) || 0,
              ingredients: recipe,
              recipeSteps,
              recipeTips,
              recipeYield
            },
            attachments: [
              ...attachedDocs.map(d => ({ name: d.name, type: d.type, base64: d.base64 })),
              ...attachedImages.map(i => ({ name: i.name, type: i.type, base64: i.base64 }))
            ],
            finalize: true
          }),
        })
        if (!response.ok) throw new Error('Smart Chef failed')
        const result = await response.json()
        const isFinished = result.data?.isFinished || (result.message || '').toLowerCase().includes('finished')
        if (isFinished && result.data && typeof result.data === 'object') {
          const d = result.data
          const parsed = {
            name: d.name,
            description: d.description,
            price: typeof d.price === 'number' ? d.price : undefined,
            categoryName: d.categoryName,
            recipeSteps: Array.isArray(d.recipeSteps) ? d.recipeSteps : undefined,
            recipeTips: Array.isArray(d.recipeTips) ? d.recipeTips : undefined,
            recipeYield: typeof d.recipeYield === 'number' ? d.recipeYield : undefined,
            ingredients: Array.isArray(d.ingredients)
              ? d.ingredients.map((ing: any) => ({
                name: ing.name ?? '',
                quantity: Number(ing.quantity) || 0,
                unit: ing.unit ?? 'g',
                pieceCount: ing.pieceCount ?? null,
                costPerUnit: typeof ing.costPerUnit === 'number' && ing.costPerUnit >= 0 ? ing.costPerUnit : null,
              }))
              : undefined,
          }
          await applyParsedDataToForm(parsed, { autoCreateIngredients: true, quietToast: true })
          setInferredItemNameForImage(null)
          setAssistantMessages((prev) => [
            ...prev,
            { role: 'assistant', text: "I'm done with our conversation — I've filled the form with everything we discussed. **Next step:** generate an image for your dish. I'm opening the image generator for you now; create or upload a photo, then save your menu item when ready." },
          ])
          toast({ title: 'Form filled', description: 'Recipe and ingredients filled. Image dialog opening for you.' })
          setActiveTab('ai')
          setTimeout(() => setShowPromptDialog(true), 1200)
        } else {
          // Fallback to research if Smart Chef didn't return finished data
          const researchRes = await fetch('/api/menu/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              dishName: dishName || undefined,
              categoryNames: categories.map(c => c.name),
              attachments: [
                ...attachedDocs.map(d => ({ name: d.name, type: d.type, base64: d.base64 })),
                ...attachedImages.map(i => ({ name: i.name, type: i.type, base64: i.base64 }))
              ]
            }),
          })
          if (!researchRes.ok) throw new Error('Research failed')
          const data = await researchRes.json()
          await applyParsedDataToForm(data, { autoCreateIngredients: true })
          setInferredItemNameForImage(null)
          setAssistantMessages((prev) => [
            ...prev,
            { role: 'assistant', text: "I'm done — I've researched and filled the form. **Next step:** generate an image for your dish. I'm opening the image generator for you now; create or upload a photo, then save when ready." },
          ])
          toast({ title: 'Form filled', description: 'Recipe and details gathered. Image dialog opening for you.' })
          setActiveTab('ai')
          setTimeout(() => setShowPromptDialog(true), 1200)
        }
      } else {
        const response = await fetch('/api/menu/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            dishName: dishName || undefined,
            categoryNames: categories.map(c => c.name),
            attachments: [
              ...attachedDocs.map(d => ({ name: d.name, type: d.type, base64: d.base64 })),
              ...attachedImages.map(i => ({ name: i.name, type: i.type, base64: i.base64 }))
            ]
          }),
        })
        if (!response.ok) throw new Error('Research failed')
        const data = await response.json()
        await applyParsedDataToForm(data, { autoCreateIngredients: true })
        setInferredItemNameForImage(null)
        setAssistantMessages((prev) => [
          ...prev,
          { role: 'assistant', text: "I'm done — I've researched and filled the full recipe, ingredients, and SOP. **Next step:** generate an image for your dish. I'm opening the image generator for you now; create or upload a photo, then save when ready." },
        ])
        toast({ title: 'Form Research Complete', description: 'Recipe and details filled. Image dialog opening for you.' })
        setActiveTab('ai')
        setTimeout(() => setShowPromptDialog(true), 1200)
      }

      setAttachedDocs([])
      setAttachedImages([])
    } catch (err) {
      toast({
        title: 'Could not research',
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

    const duplicateCounts = new Map<string, number>()
    for (const item of validRecipeLines) {
      duplicateCounts.set(
        item.ingredientId,
        (duplicateCounts.get(item.ingredientId) || 0) + 1
      )
    }
    const duplicateIngredientIds = Array.from(duplicateCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([ingredientId]) => ingredientId)

    if (duplicateIngredientIds.length > 0) {
      const duplicateNames = duplicateIngredientIds.map((ingredientId) => {
        const ingredient = allIngredients.find((ing) => ing.id === ingredientId)
        return ingredient?.name || 'Unknown ingredient'
      })

      const description =
        duplicateNames.length === 1
          ? `${duplicateNames[0]} is inserted twice. Keep one row per ingredient.`
          : `These ingredients are inserted multiple times: ${duplicateNames.join(', ')}. Keep one row per ingredient.`

      toast({
        title: 'Duplicate ingredients',
        description,
        variant: 'destructive',
      })
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
            {t.menu_form_back}
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {mode === 'create' ? t.menu_form_add_title : t.menu_form_edit_title}
          </h1>
          <p className="text-slate-500 mt-1">
            {mode === 'create'
              ? t.menu_form_add_subtitle
              : t.menu_form_edit_subtitle}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant={menuItemStatus === 'ACTIVE' ? 'default' : 'secondary'}>
              {menuItemStatus === 'ACTIVE' ? t.menu_published : t.menu_draft}
            </Badge>
            <Badge variant={validRecipeLines.length > 0 && validRecipeLines.every((r) => r.unitCostCached != null) ? 'default' : 'secondary'}>
              Costing: {validRecipeLines.length > 0 && validRecipeLines.every((r) => r.unitCostCached != null) ? 'Complete' : 'Incomplete'}
            </Badge>
          </div>
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()}>
        <div className={cn('grid gap-6', activeTab === 'ai' ? 'lg:grid-cols-1' : 'lg:grid-cols-3')}>
          <div className={activeTab === 'ai' ? 'w-full' : 'lg:col-span-2'}>
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
                    {t.menu_form_tab_overview}
                  </TabsTrigger>
                ) : (
                  <TabsTrigger value="ai" className="flex items-center gap-2">
                    <BotMessageSquare className="h-4 w-4" />
                    {t.menu_form_tab_smart_chef}
                  </TabsTrigger>
                )}
                <TabsTrigger value="details" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t.menu_form_tab_manual}
                </TabsTrigger>
                <TabsTrigger value="recipe" className="flex items-center gap-2">
                  <ChefHat className="h-4 w-4" />
                  {t.menu_form_tab_recipe}
                </TabsTrigger>
                <TabsTrigger value="more" className="flex items-center gap-2">
                  <MoreHorizontal className="h-4 w-4" />
                  {t.menu_form_tab_translations}
                </TabsTrigger>
              </TabsList>
              {mode === 'edit' && (
                <TabsContent value="overview" className="space-y-4 mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>{t.menu_form_how_it_looks}</CardTitle>
                      <CardDescription>
                        {t.menu_form_preview_description}
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
                            {t.menu_form_no_image}
                          </div>
                        )}
                        <div className="p-4 space-y-2">
                          <p className="text-xs uppercase tracking-wider text-slate-500">
                            {(() => {
                              const cat = categories.find((c) => c.id === formData.categoryId)
                              return cat ? getTranslatedCategoryName(cat.name, t) : t.menu_form_uncategorized
                            })()}
                          </p>
                          <h3 className="text-xl font-semibold text-slate-900">
                            {formData.name || t.menu_form_untitled_item}
                          </h3>
                          <p className="text-sm text-slate-600 line-clamp-3">
                            {formData.description || t.menu_form_no_description}
                          </p>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            {formData.calories != null && formData.calories !== '' && (
                              <span>{formData.calories} cal</span>
                            )}
                            {formData.protein != null && formData.protein !== '' && (
                              <span>{formData.protein}g {t.menu_translation_protein}</span>
                            )}
                            {formData.carbs != null && formData.carbs !== '' && (
                              <span>{formData.carbs}g {t.menu_translation_carbs}</span>
                            )}
                            {formData.tags && formData.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                              <span key={tag} className="rounded-full bg-slate-200 px-2 py-0.5">{tag}</span>
                            ))}
                          </div>
                          <p className="text-lg font-bold text-emerald-700">
                            {formatCurrency(parseFloat(formData.price) || 0)}
                          </p>
                          {selectedAddOnIds.length > 0 && (
                            <div className="pt-2 border-t border-slate-200">
                              <p className="text-xs font-medium text-slate-500 mb-1">{t.menu_form_add_ons_label}</p>
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
                        {t.menu_form_edit_assistant}
                      </CardTitle>
                      <CardDescription>
                        {t.menu_form_edit_assistant_description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Textarea
                        placeholder={t.menu_form_edit_assistant_placeholder}
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
                            {t.menu_form_updating}
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            {t.menu_form_update_form_from_text}
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
              <TabsContent value="ai" className="space-y-4 mt-0">
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header: title + subtitle + action buttons (reference style) */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-6 pb-4 border-b border-slate-200">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">Smart Chef</h2>
                        <p className="text-sm text-slate-500 mt-1">
                          Describe your dish and I&apos;ll fill in everything — name, description, recipe, ingredients, and costs. Upload a photo or document to get started even faster.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          onClick={fillFormFromAI}
                          disabled={aiParseLoading || (!aiAssistantText.trim() && assistantMessages.length <= 1 && attachedDocs.length === 0 && attachedImages.length === 0)}
                        >
                          {aiParseLoading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4 mr-2" />
                          )}
                          {aiParseLoading ? 'Researching...' : 'Fill Form Now'}
                        </Button>
                        <Button type="button" variant="outline" onClick={resetAssistantChat} disabled={aiParseLoading}>
                          <Plus className="h-4 w-4 mr-2" />
                          New Chat
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAiAssistantText(SAMPLE_AI_PROMPT)}
                          disabled={aiParseLoading}
                        >
                          Try sample
                        </Button>
                      </div>
                    </div>

                    {/* Chat area: messages in scrollable area, assistant = teal bubble */}
                    <div className="max-h-[65vh] min-h-[480px] overflow-y-auto px-6 py-4 space-y-4 bg-slate-50/50">
                      {assistantMessages.map((message, index) => (
                        <div
                          key={`${message.role}-${index}`}
                          className={cn(
                            'rounded-xl px-4 py-3 text-sm max-w-[85%]',
                            message.role === 'assistant'
                              ? 'bg-emerald-50 border border-emerald-100 text-slate-800 ml-0 mr-auto'
                              : 'bg-white border border-slate-200 text-slate-700 ml-auto mr-0 shadow-sm'
                          )}
                        >
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {(message.text || '').split(/(\*\*.*?\*\*)/g).map((part, i) => {
                              if (part.startsWith('**') && part.endsWith('**')) {
                                return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
                              }
                              return part
                            })}
                          </div>
                        </div>
                      ))}
                      <div ref={assistantMessagesEndRef} />
                    </div>

                    {/* Attachments row (compact) */}
                    {(attachedDocs.length > 0 || attachedImages.length > 0) && (
                      <div className="flex flex-wrap gap-2 px-6 pt-1">
                        {attachedDocs.map((doc) => (
                          <Badge key={doc.name} variant="secondary" className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            <span className="max-w-[120px] truncate">{doc.name}</span>
                            <Trash2 className="h-3 w-3 cursor-pointer text-red-500 hover:text-red-700" onClick={() => removeAttachment(doc.name, 'doc')} />
                          </Badge>
                        ))}
                        {attachedImages.map((img) => (
                          <Badge key={img.name} variant="secondary" className="flex items-center gap-1 bg-emerald-50 border-emerald-200 text-emerald-700">
                            <ImagePlus className="h-3 w-3" />
                            <span className="max-w-[120px] truncate">{img.name}</span>
                            <Trash2 className="h-3 w-3 cursor-pointer text-red-500 hover:text-red-700" onClick={() => removeAttachment(img.name, 'image')} />
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Input row: placeholder + send */}
                    <div className="p-4 border-t border-slate-200 bg-white">
                      <div className="flex items-end gap-2">
                        <div className="flex-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 min-h-[44px] px-3">
                          <input
                            type="file"
                            ref={assistantDocInputRef}
                            className="hidden"
                            accept=".pdf,.doc,.docx,.txt"
                            multiple
                            onChange={(e) => handleAssistantFileUpload(e, 'doc')}
                          />
                          <input
                            type="file"
                            ref={assistantImageInputRef}
                            className="hidden"
                            accept="image/*,.pdf,application/pdf"
                            multiple
                            onChange={(e) => handleAssistantFileUpload(e, 'image')}
                          />
                          <Textarea
                            placeholder="Ask about item name, description, or upload images, documents, or bills/receipts for price extraction..."
                            value={aiAssistantText}
                            onChange={(e) => setAiAssistantText(e.target.value)}
                            rows={1}
                            className="min-h-[36px] max-h-[120px] resize-y border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 py-2.5 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                submitAssistantMessage()
                              }
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          className="shrink-0 h-11 w-11 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                          onClick={submitAssistantMessage}
                          disabled={aiParseLoading || (!aiAssistantText.trim() && attachedDocs.length === 0 && attachedImages.length === 0)}
                        >
                          {aiParseLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Send className="h-5 w-5" />
                          )}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-slate-500"
                          onClick={() => assistantDocInputRef.current?.click()}
                          disabled={aiParseLoading}
                        >
                          <FileText className="h-3.5 w-3 mr-1" />
                          Document
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-slate-500"
                          onClick={() => assistantImageInputRef.current?.click()}
                          disabled={aiParseLoading}
                          title="Upload photo, dish image, or bill/receipt for price extraction"
                        >
                          <ImagePlus className="h-3.5 w-3 mr-1" />
                          Image / Bill
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-slate-500"
                          onClick={isListening ? stopSpeechToText : startSpeechToText}
                          disabled={aiParseLoading}
                        >
                          {isListening ? <MicOff className="h-3.5 w-3 mr-1" /> : <Mic className="h-3.5 w-3 mr-1" />}
                          {isListening ? 'Stop' : 'Speak'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-slate-500"
                          onClick={() => {
                            const hasDishNameInForm = !!formData.name?.trim()
                            const hasStartedChat = assistantMessages.some((m) => m.role === 'user')
                            // Only count our explicit "ask for dish name" messages, not the welcome (which mentions "Fill Form Now")
                            const hasAlreadyAskedForDishName = assistantMessages.some(
                              (m) => m.role === 'assistant' && (
                                (m.text || '').includes('dish name first') ||
                                (m.text || '').includes('name of the dish before I can generate')
                              )
                            )
                            if (hasDishNameInForm) {
                              setInferredItemNameForImage(null)
                              setUploadedPhoto(null)
                              setPreviewImageUrl(null)
                              setCustomPrompt('')
                              setShowPromptDialog(true)
                              return
                            }
                            // Don't open the dialog until the user has at least said what dish they're adding (in chat or form)
                            if (!hasStartedChat) {
                              setAssistantMessages(prev => [...prev, { role: 'assistant', text: 'I need to know the name of the dish before I can generate an image for it. Tell me what dish you want to add (e.g. "Chicken Biryani" or "I want to add Margherita pizza") and I\'ll use that for the image.' }])
                              return
                            }
                            if (!hasAlreadyAskedForDishName) {
                              setAssistantMessages(prev => [...prev, { role: 'assistant', text: 'Please complete the dish name first (or finish our chat and click "Fill Form Now") so I can create an accurate image for you.' }])
                              return
                            }
                            const firstUserMessage = assistantMessages.find((m) => m.role === 'user')?.text?.trim()
                            const inferredName = firstUserMessage
                              ? firstUserMessage.split(/\n/)[0]?.trim().slice(0, 80) || null
                              : null
                            if (!inferredName) {
                              setAssistantMessages(prev => [...prev, { role: 'assistant', text: 'I need the name of the dish to generate an image. Tell me the dish name (e.g. "Chicken Biryani") or click "Fill Form Now" after we\'re done, then try Generate Image again.' }])
                              return
                            }
                            setInferredItemNameForImage(inferredName)
                            setUploadedPhoto(null)
                            setPreviewImageUrl(null)
                            setCustomPrompt('')
                            setShowPromptDialog(true)
                          }}
                          disabled={aiParseLoading}
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1" />
                          Generate Image
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-slate-500" onClick={() => setActiveTab('details')}>
                          Skip to form
                        </Button>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-center text-xs text-slate-400">
                      Powered by Bab Al Ilm AI
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="details" className="space-y-6 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.menu_form_item_details}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="name">
                          {t.menu_form_item_name} <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="name"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder={t.menu_form_placeholder_name}
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
                            {t.menu_form_select_category_hint}
                          </p>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="categoryId">
                            {t.menu_form_category} <span className="text-red-500">*</span>
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
                              <SelectValue placeholder={t.menu_form_select_category} />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {getTranslatedCategoryName(category.name, t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="price">
                          {t.menu_form_selling_price_iqd} <span className="text-red-500">*</span>
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
                        <Label htmlFor="available">{t.menu_form_status}</Label>
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
                            <SelectItem value="true">{t.menu_available}</SelectItem>
                            <SelectItem value="false">{t.menu_unavailable}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="description">{t.common_description}</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={generateDescription}
                          disabled={generatingDescription || !formData.name}
                          title={!formData.name ? 'Enter item name first' : 'Generate description with AI (uses your Restaurant DNA tone if set)'}
                          className="h-7 px-2 text-xs"
                        >
                          {generatingDescription ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Sparkles className="h-3 w-3 mr-1" />
                          )}
                          {t.menu_form_generate_description}
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500">{t.menu_form_description_helper}</p>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder={t.menu_form_placeholder_description}
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
                          {t.menu_form_add_image_hint}
                        </p>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="imageUrl">{t.menu_form_image_url}</Label>
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
                        <p className="text-xs text-slate-500">
                          {t.menu_form_consistent_backgrounds}{' '}
                          <Link href="/settings#dish-photo-background" className="font-medium text-emerald-700 hover:underline">
                            {t.menu_form_configure_background}
                          </Link>
                          .
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>{t.menu_form_nutrition_optional}</Label>
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
                          {t.menu_form_estimate_nutrition}
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="calories" className="text-xs text-slate-500">{t.menu_form_calories}</Label>
                          <Input
                            id="calories"
                            type="number"
                            value={formData.calories}
                            onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
                            placeholder="e.g., 450"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="protein" className="text-xs text-slate-500">{t.menu_form_protein_g}</Label>
                          <Input
                            id="protein"
                            type="number"
                            value={formData.protein}
                            onChange={(e) => setFormData({ ...formData, protein: e.target.value })}
                            placeholder="e.g., 25"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="carbs" className="text-xs text-slate-500">{t.menu_form_carbs_g}</Label>
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
                      <Label htmlFor="tags">{t.menu_form_dietary_tags}</Label>
                      <Input
                        id="tags"
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        placeholder={t.menu_form_placeholder_tags}
                      />
                      <p className="text-xs text-slate-500">{t.menu_form_comma_separated}</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="more" className="space-y-6 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.menu_translations_title}</CardTitle>
                    <CardDescription>
                      {t.menu_translations_description}
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
                                  {t.menu_translation_edited}
                                </Badge>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => regenerateTranslation(language.code)}
                              disabled={!translationPayload || translation.loading}
                            >
                              {translation.loading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                t.menu_translation_refresh
                              )}
                            </Button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`translation-name-${language.code}`}>{t.menu_translation_name}</Label>
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
                                {t.menu_translation_description_label}
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
                              {t.menu_translation_protein}:{' '}
                              {translation.protein !== null
                                ? `${translation.protein}g`
                                : '—'}
                            </span>
                            <span>
                              {t.menu_translation_carbs}:{' '}
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
                    <CardTitle>SOP</CardTitle>
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
                            const filteredIngredientOptions = allIngredients.filter((ing) => {
                              const query = ingredientSearchQuery.trim().toLowerCase()
                              if (!query) return true
                              return (
                                ing.name.toLowerCase().includes(query) ||
                                ing.unit.toLowerCase().includes(query)
                              )
                            })
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
                                    <Popover
                                      open={activeIngredientPickerIndex === index}
                                      onOpenChange={(open) => {
                                        if (open) {
                                          setActiveIngredientPickerIndex(index)
                                          setIngredientSearchQuery('')
                                        } else if (activeIngredientPickerIndex === index) {
                                          setActiveIngredientPickerIndex(null)
                                          setIngredientSearchQuery('')
                                        }
                                      }}
                                    >
                                      <PopoverTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="w-full h-10 justify-between border-slate-300 bg-white hover:bg-slate-50 px-3"
                                        >
                                          <span className="flex items-center gap-2 min-w-0">
                                            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                            <span className={cn(
                                              'truncate text-sm',
                                              ingredient ? 'text-slate-900' : 'text-slate-500'
                                            )}>
                                              {ingredient ? `${ingredient.name} (${ingredient.unit})` : 'Search ingredient...'}
                                            </span>
                                          </span>
                                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                                        <div className="p-2 border-b border-slate-100">
                                          <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                              autoFocus
                                              value={ingredientSearchQuery}
                                              onChange={(e) => setIngredientSearchQuery(e.target.value)}
                                              placeholder="Type to filter ingredients..."
                                              className="h-9 pl-8 border-slate-200 focus-visible:ring-emerald-500"
                                            />
                                          </div>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto py-1">
                                          {filteredIngredientOptions.map((ing) => (
                                            <button
                                              key={ing.id}
                                              type="button"
                                              onClick={() => {
                                                applyIngredientSelection(index, ing.id)
                                                setActiveIngredientPickerIndex(null)
                                                setIngredientSearchQuery('')
                                              }}
                                              className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center justify-between gap-3"
                                            >
                                              <span className="truncate text-sm text-slate-800">{ing.name}</span>
                                              <span className="flex items-center gap-2 shrink-0">
                                                <span className="text-xs text-slate-500">({ing.unit})</span>
                                                {item.ingredientId === ing.id && (
                                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                                )}
                                              </span>
                                            </button>
                                          ))}
                                          {filteredIngredientOptions.length === 0 && (
                                            <p className="px-3 py-3 text-xs text-slate-500">
                                              No ingredient matches your search.
                                            </p>
                                          )}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
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

                                <div className="grid grid-cols-4 gap-3">
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
                                    <Label>Cost per unit (IQD)</Label>
                                    {ingredient ? (
                                      <>
                                        <Input
                                          type="number"
                                          step="any"
                                          min="0"
                                          className="font-mono h-10"
                                          value={item.unitCostCached != null ? item.unitCostCached : (ingredient.costPerUnit ?? '')}
                                          onChange={(e) => {
                                            const raw = e.target.value
                                            const num = raw === '' ? null : parseFloat(raw)
                                            updateIngredient(index, 'unitCostCached', num != null && !Number.isNaN(num) ? num : null)
                                          }}
                                          onBlur={async () => {
                                            const cost = item.unitCostCached ?? ingredient.costPerUnit
                                            if (ingredient.id && cost != null && cost >= 0) {
                                              try {
                                                const r = await fetch(`/api/inventory/${ingredient.id}`, {
                                                  method: 'PATCH',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ costPerUnit: cost }),
                                                })
                                                if (r.ok) {
                                                  toast({ title: 'Updated', description: `${ingredient.name} cost saved to inventory.` })
                                                } else {
                                                  toast({ title: 'Could not save cost', variant: 'destructive' })
                                                }
                                              } catch {
                                                toast({ title: 'Could not save cost', variant: 'destructive' })
                                              }
                                            }
                                          }}
                                          placeholder="0"
                                        />
                                        <p className="text-xs text-slate-400">Saves to inventory on blur</p>
                                      </>
                                    ) : (
                                      <div className="h-10 px-3 py-2 bg-slate-50 rounded-md text-sm font-mono text-slate-500">
                                        Select an ingredient
                                      </div>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Direct cost</Label>
                                    <div className="h-10 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm font-mono font-medium text-slate-800 flex items-center">
                                      {ingredient ? formatCurrency(itemCost) : '—'}
                                    </div>
                                    <p className="text-xs text-slate-400">Quantity × cost per unit</p>
                                  </div>
                                </div>

                                {/* Supplier name input + auto-priced from supplier database */}
                                {supplierProducts.length > 0 && (
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label className="text-xs">Supplier (optional)</Label>
                                      <Input
                                        value={item.supplierName ?? ''}
                                        onChange={(e) => {
                                          const supplierName = e.target.value
                                          updateIngredient(index, 'supplierName', supplierName)
                                          const nextLine = autoFillSupplierCost(
                                            { ...item, supplierName },
                                            ingredient
                                          )
                                          updateIngredient(index, 'supplierProductId', nextLine.supplierProductId)
                                          updateIngredient(index, 'unitCostCached', nextLine.unitCostCached)
                                          updateIngredient(index, 'currency', nextLine.currency)
                                          updateIngredient(index, 'lastPricedAt', nextLine.lastPricedAt)
                                        }}
                                        placeholder="Type supplier name"
                                        className="h-8 text-xs"
                                      />
                                      <p className="text-[10px] text-slate-400">
                                        We auto-select the best matching supplier price for this ingredient.
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">Supplier price source</Label>
                                      <div className="h-8 px-2 py-1 rounded-md border border-input bg-slate-50 text-xs text-slate-600 flex items-center">
                                        {item.supplierProductId
                                          ? (() => {
                                            const selected = supplierProducts.find((sp) => sp.id === item.supplierProductId)
                                            return selected
                                              ? `${selected.supplierName} — ${selected.name}`
                                              : 'Matched supplier product'
                                          })()
                                          : 'No supplier match (using ingredient base cost)'}
                                      </div>
                                      {item.supplierProductId && item.unitCostCached != null && (
                                        <p className="text-[10px] text-slate-400">
                                          Unit cost: {item.unitCostCached.toFixed(2)} {item.currency}/{ingredient?.unit || 'unit'}
                                          {item.lastPricedAt && ` — priced ${new Date(item.lastPricedAt).toLocaleDateString()}`}
                                        </p>
                                      )}
                                    </div>
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

                  {/* Add-ons Section - Moved from More tab */}
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
                                            onClick={() => toggleAddOn(addOn.id)}
                                            className={cn(
                                              'flex items-start gap-3 border border-dashed border-slate-200 rounded-md p-3 bg-slate-50 cursor-pointer transition-all hover:bg-emerald-50 hover:border-emerald-300',
                                              isSelected && 'bg-emerald-50 border-emerald-400'
                                            )}
                                          >
                                            <div
                                              className={cn(
                                                'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                                                isSelected
                                                  ? 'bg-emerald-500 border-emerald-500'
                                                  : 'border-slate-300 bg-white'
                                              )}
                                            >
                                              {isSelected && <Check className="h-3 w-3 text-white" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-slate-800 truncate">
                                                {addOn.name}
                                              </p>
                                              {addOn.description && (
                                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                                  {addOn.description}
                                                </p>
                                              )}
                                            </div>
                                            <div className="text-sm font-semibold text-emerald-700 shrink-0">
                                              {formatCurrency(addOn.price)}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>

                                    {totalPages > 1 && (
                                      <div className="flex items-center justify-between pt-2">
                                        <p className="text-xs text-slate-500">
                                          Page {addOnPage} of {totalPages}
                                        </p>
                                        <div className="flex gap-1">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setAddOnPage((p) => Math.max(1, p - 1))}
                                            disabled={addOnPage === 1}
                                          >
                                            <ChevronLeft className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setAddOnPage((p) => Math.min(totalPages, p + 1))}
                                            disabled={addOnPage === totalPages}
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
                </div>
              </TabsContent>
              <TabsContent value="more" className="space-y-6 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.menu_translations_title}</CardTitle>
                    <CardDescription>
                      {t.menu_translations_description}
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
                                  {t.menu_translation_edited}
                                </Badge>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => regenerateTranslation(language.code)}
                              disabled={!translationPayload || translation.loading}
                            >
                              {translation.loading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                t.menu_translation_refresh
                              )}
                            </Button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`edit-translation-name-${language.code}`}>{t.menu_translation_name}</Label>
                              <Input
                                id={`edit-translation-name-${language.code}`}
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
                              <Label htmlFor={`edit-translation-description-${language.code}`}>
                                {t.menu_translation_description_label}
                              </Label>
                              <Textarea
                                id={`edit-translation-description-${language.code}`}
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
                              {t.menu_translation_protein}:{' '}
                              {translation.protein !== null
                                ? `${translation.protein}g`
                                : '—'}
                            </span>
                            <span>
                              {t.menu_translation_carbs}:{' '}
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

              </TabsContent>
            </Tabs>
          </div>

          {activeTab !== 'ai' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t.menu_form_cost_analysis}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="text-sm text-slate-500">{t.menu_form_selling_price}</span>
                      <span className="font-mono font-medium">
                        {formatCurrency(parseFloat(formData.price) || 0)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="text-sm text-slate-500">{t.menu_form_total_cost}</span>
                      <span className="font-mono font-medium text-red-600">
                        {formatCurrency(calculations.cost)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="text-sm text-slate-500">{t.menu_form_profit}</span>
                      <span className="font-mono font-bold text-green-600">
                        {formatCurrency(calculations.profit)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-sm font-medium text-slate-700">{t.menu_form_margin}</span>
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
                        {t.menu_form_margin_warning}
                      </p>
                    </div>
                  )}

                  {calculations.margin >= 60 && formData.price && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-800">
                        {t.menu_form_margin_excellent}
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
                  {loading ? t.menu_saving : t.menu_form_save_draft}
                </Button>
                <Button
                  type="button"
                  disabled={loading}
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleSave('ACTIVE')}
                >
                  {loading ? t.menu_saving : mode === 'create' ? t.menu_form_create_publish : t.menu_form_publish}
                </Button>
                <Link href="/dashboard/menu" className="w-full">
                  <Button type="button" variant="outline" disabled={loading} className="w-full border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700">
                    {t.common_cancel}
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* AI Image Generation Dialog */}
      <Dialog open={showPromptDialog} onOpenChange={(open) => {
        setShowPromptDialog(open)
        if (!open) {
          setUploadedPhoto(null)
          setCustomPrompt('')
          setPreviewImageUrl(null)
          setInferredItemNameForImage(null)
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
                        setInferredItemNameForImage(null)
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
                  {(trimmedSavedBackgroundPrompt || hasDefaultBackgroundImage) && (
                    <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                      <p className="leading-relaxed">
                        {trimmedSavedBackgroundPrompt
                          ? 'Saved consistent background style is ready and used by default when prompt is empty.'
                          : 'A saved consistent background image is ready and used by default when prompt is empty.'}
                      </p>
                      {trimmedSavedBackgroundPrompt && (
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
                      )}
                    </div>
                  )}
                  <div className="text-xs text-slate-500">
                    <Link href="/settings#dish-photo-background" className="font-medium text-emerald-700 hover:underline">
                      Configure consistent background prompt or upload a reference image
                    </Link>
                  </div>
                  <p className="text-xs text-slate-500">
                    {uploadedPhoto
                      ? 'Leave prompt empty to use your saved consistent background settings. Add text only if you want a one-time custom style.'
                      : 'Leave prompt empty to use your saved consistent background settings (prompt and/or image).'}
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
                      className={`flex items-center justify-between p-3 rounded-lg border ${ing.isAvailable
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
