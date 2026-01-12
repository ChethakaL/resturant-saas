'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { Category, Ingredient, MenuItem, MenuItemIngredient } from '@prisma/client'

interface RecipeIngredient {
  ingredientId: string
  quantity: number
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
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: menuItem?.name || '',
    description: menuItem?.description || '',
    price: menuItem?.price.toString() || '',
    categoryId: menuItem?.categoryId || '',
    available: menuItem?.available ?? true,
    imageUrl: menuItem?.imageUrl || '',
  })

  const [recipe, setRecipe] = useState<RecipeIngredient[]>(
    menuItem?.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      quantity: ing.quantity,
    })) || []
  )

  // Calculate real-time cost and margin
  const calculations = useMemo(() => {
    const cost = recipe.reduce((sum, item) => {
      const ingredient = ingredients.find((i) => i.id === item.ingredientId)
      return sum + (ingredient ? ingredient.costPerUnit * item.quantity : 0)
    }, 0)

    const price = parseFloat(formData.price) || 0
    const profit = price - cost
    const margin = price > 0 ? ((profit / price) * 100) : 0

    return { cost, profit, margin }
  }, [recipe, formData.price, ingredients])

  const addIngredient = () => {
    setRecipe([...recipe, { ingredientId: '', quantity: 0 }])
  }

  const removeIngredient = (index: number) => {
    setRecipe(recipe.filter((_, i) => i !== index))
  }

  const updateIngredient = (index: number, field: keyof RecipeIngredient, value: any) => {
    const newRecipe = [...recipe]
    newRecipe[index] = { ...newRecipe[index], [field]: value }
    setRecipe(newRecipe)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.categoryId) {
      alert('Please select a category')
      return
    }

    if (recipe.length === 0) {
      alert('Please add at least one ingredient to the recipe')
      return
    }

    if (recipe.some((item) => !item.ingredientId || item.quantity <= 0)) {
      alert('Please complete all recipe ingredients with valid quantities')
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
          ingredients: recipe.map((item) => ({
            ingredientId: item.ingredientId,
            quantity: item.quantity,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save menu item')
      }

      router.push('/dashboard/menu')
      router.refresh()
    } catch (error) {
      console.error('Error saving menu item:', error)
      alert('Failed to save menu item. Please try again.')
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
                  <Input
                    id="imageUrl"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recipe Builder</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Ingredient
                </Button>
              </CardHeader>
              <CardContent>
                {recipe.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    No ingredients added. Click "Add Ingredient" to start building your recipe.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recipe.map((item, index) => {
                      const ingredient = ingredients.find((i) => i.id === item.ingredientId)
                      const itemCost = ingredient ? ingredient.costPerUnit * item.quantity : 0

                      return (
                        <div
                          key={index}
                          className="flex items-end gap-3 p-3 border border-slate-200 rounded-md"
                        >
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
                                {ingredients.map((ing) => (
                                  <SelectItem key={ing.id} value={ing.id}>
                                    {ing.name} ({ing.unit})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="w-32 space-y-2">
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              step="0.01"
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
                          </div>

                          <div className="w-32 space-y-2">
                            <Label>Cost</Label>
                            <div className="h-10 px-3 py-2 bg-slate-50 rounded-md text-sm font-mono text-slate-700">
                              {formatCurrency(itemCost)}
                            </div>
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
    </div>
  )
}
