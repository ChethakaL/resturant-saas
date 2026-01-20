'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ArrowLeft, Save, Plus, Trash2, Sparkles, Loader2, ChefHat, Check, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { Category, Ingredient, MenuItem, MenuItemIngredient } from '@prisma/client'
import { useToast } from '@/components/ui/use-toast'

interface RecipeIngredient {
  ingredientId: string
  quantity: number
  pieceCount?: number | null
}

interface MenuFormProps {
  categories: Category[]
  ingredients: Ingredient[]
  mode: 'create' | 'edit'
  menuItem?: MenuItem & {
    ingredients: (MenuItemIngredient & { ingredient: Ingredient })[]
  }
}

export default function MenuForm({
  categories,
  ingredients,
  mode,
  menuItem,
}: MenuFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [showPromptDialog, setShowPromptDialog] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  // AI Recipe suggestion state
  const [showRecipeDialog, setShowRecipeDialog] = useState(false)
  const [loadingRecipe, setLoadingRecipe] = useState(false)
  const [suggestedRecipe, setSuggestedRecipe] = useState<any>(null)
  const [recipeInstructions, setRecipeInstructions] = useState('')
  const [creatingIngredients, setCreatingIngredients] = useState(false)
  const [formData, setFormData] = useState({
    name: menuItem?.name || '',
    description: menuItem?.description || '',
    price: menuItem?.price.toString() || '',
    categoryId: menuItem?.categoryId || '',
    available: menuItem?.available ?? true,
    imageUrl: menuItem?.imageUrl || '',
    calories: menuItem?.calories?.toString() || '',
    tags: menuItem?.tags?.join(', ') || '',
  })

  const [recipe, setRecipe] = useState<RecipeIngredient[]>(
    menuItem?.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      quantity: ing.quantity,
      pieceCount: (ing as any).pieceCount || null,
    })) || []
  )

  // Store recipe steps and tips
  const [recipeSteps, setRecipeSteps] = useState<string[]>(menuItem?.recipeSteps || [])
  const [recipeTips, setRecipeTips] = useState<string[]>(menuItem?.recipeTips || [])
  const [prepTime, setPrepTime] = useState(menuItem?.prepTime || '')
  const [cookTime, setCookTime] = useState(menuItem?.cookTime || '')

  // Track newly created ingredients (so they show in the recipe builder before page refresh)
  const [newlyCreatedIngredients, setNewlyCreatedIngredients] = useState<Ingredient[]>([])

  // Combined ingredients list (original + newly created)
  const allIngredients = useMemo(() => {
    const existingIds = new Set(ingredients.map((i) => i.id))
    const newOnes = newlyCreatedIngredients.filter((i) => !existingIds.has(i.id))
    return [...ingredients, ...newOnes]
  }, [ingredients, newlyCreatedIngredients])

  // Calculate real-time cost and margin
  const calculations = useMemo(() => {
    const cost = recipe.reduce((sum, item) => {
      const ingredient = allIngredients.find((i) => i.id === item.ingredientId)
      return sum + (ingredient ? ingredient.costPerUnit * item.quantity : 0)
    }, 0)

    const price = parseFloat(formData.price) || 0
    const profit = price - cost
    const margin = price > 0 ? ((profit / price) * 100) : 0

    return { cost, profit, margin }
  }, [recipe, formData.price, allIngredients])

  const addIngredient = () => {
    // Add new ingredient at the TOP of the list so user can see it
    setRecipe([{ ingredientId: '', quantity: 0, pieceCount: null }, ...recipe])
  }

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

  const generateImage = async (useCustomPrompt: boolean = false) => {
    if (!formData.name) {
      toast({ title: 'Missing Information', description: 'Please enter a menu item name first', variant: 'destructive' })
      return
    }

    setGeneratingImage(true)

    try {
      const category = categories.find((c) => c.id === formData.categoryId)
      const response = await fetch('/api/menu/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: useCustomPrompt ? customPrompt : null,
          itemName: formData.name,
          description: formData.description,
          category: category?.name,
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
      toast({ title: 'Image Generation Failed', description: error instanceof Error ? error.message : 'Failed to generate image', variant: 'destructive' })
    } finally {
      setGeneratingImage(false)
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.categoryId) {
      toast({ title: 'Missing Information', description: 'Please select a category', variant: 'destructive' })
      return
    }

    if (recipe.length === 0) {
      toast({ title: 'Missing Ingredients', description: 'Please add at least one ingredient to the recipe', variant: 'destructive' })
      return
    }

    if (recipe.some((item) => !item.ingredientId || item.quantity <= 0)) {
      toast({ title: 'Invalid Quantities', description: 'Please complete all recipe ingredients with valid quantities', variant: 'destructive' })
      return
    }

    setLoading(true)

    try {
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
          calories: formData.calories ? parseInt(formData.calories) : null,
          tags: formData.tags
            ? formData.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
            : [],
          ingredients: recipe.map((item) => ({
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            pieceCount: item.pieceCount || null,
          })),
          // Recipe details
          prepTime: prepTime || null,
          cookTime: cookTime || null,
          recipeSteps: recipeSteps,
          recipeTips: recipeTips,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save menu item')
      }

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
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
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

                  <div className="space-y-2">
                    <Label htmlFor="categoryId">
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.categoryId}
                      onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
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
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the dish..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Image URL (optional)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="imageUrl"
                      value={formData.imageUrl}
                      onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="calories">Calories (optional)</Label>
                    <Input
                      id="calories"
                      type="number"
                      value={formData.calories}
                      onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
                      placeholder="e.g., 450"
                    />
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
                </div>
              </CardContent>
            </Card>

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

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recipe Builder</CardTitle>
                <div className="flex gap-2">
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
                    No ingredients added. Click "Add Ingredient" or use "AI Recipe" to get suggestions.
                  </div>
                ) : (
                  <div className="space-y-3">
                      {recipe.map((item, index) => {
                        const ingredient = allIngredients.find((i) => i.id === item.ingredientId)
                        const itemCost = ingredient ? ingredient.costPerUnit * item.quantity : 0
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
              <Button type="submit" disabled={loading} size="lg" className="w-full">
                <Save className="h-4 w-4 mr-2" />
                {loading
                  ? 'Saving...'
                  : mode === 'create'
                  ? 'Create Menu Item'
                  : 'Save Changes'}
              </Button>
              <Link href="/dashboard/menu" className="w-full">
                <Button type="button" variant="outline" disabled={loading} className="w-full">
                  Cancel
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </form>

      {/* AI Image Generation Dialog */}
      <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Image with AI</DialogTitle>
            <DialogDescription>
              Choose to auto-generate an image based on your menu item details, or provide a custom
              prompt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {generatingImage ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
                <p className="text-sm text-slate-500">Generating your image with AI...</p>
                <p className="text-xs text-slate-400">This may take a few moments</p>
              </div>
            ) : previewImageUrl ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Generated Image Preview</Label>
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
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setFormData({ ...formData, imageUrl: previewImageUrl })
                        setShowPromptDialog(false)
                        setPreviewImageUrl(null)
                        setCustomPrompt('')
                      }}
                    >
                      Use This Image
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setPreviewImageUrl(null)
                        setCustomPrompt('')
                      }}
                    >
                      Regenerate
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="customPrompt">Custom Prompt (optional)</Label>
                <Textarea
                  id="customPrompt"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g., A gourmet burger with melted cheese, presented on a wooden board..."
                  rows={4}
                  disabled={generatingImage}
                />
                <p className="text-xs text-slate-500">
                  Leave blank to auto-generate based on item name, category, and description.
                </p>
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
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => generateImage(!!customPrompt)}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Image
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
