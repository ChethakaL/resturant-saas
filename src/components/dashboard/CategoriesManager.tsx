'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { Trash, Eye, EyeOff, Loader2, Sparkles, GripVertical } from 'lucide-react'
import { Category } from '@prisma/client'

export interface CategoryWithItems extends Category {
  menuItems: { id: string; name: string }[]
}

interface CategoriesManagerProps {
  initialCategories: CategoryWithItems[]
}

export default function CategoriesManager({ initialCategories }: CategoriesManagerProps) {
  const router = useRouter()
  const [categories, setCategories] = useState<CategoryWithItems[]>(initialCategories)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletingIds, setDeletingIds] = useState<string[]>([])
  const [updatingVisibilityIds, setUpdatingVisibilityIds] = useState<string[]>([])
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [movingItemId, setMovingItemId] = useState<string | null>(null)
  const { toast } = useToast()

  const toggleShowOnMenu = async (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return
    const next = !(cat.showOnMenu !== false)
    setUpdatingVisibilityIds((prev) => [...prev, categoryId])
    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showOnMenu: next }),
      })
      if (!response.ok) throw new Error('Failed to update')
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, showOnMenu: next } : c))
      )
      toast({
        title: next ? 'Section visible on menu' : 'Section hidden from menu',
      })
    } catch {
      toast({ title: 'Could not update visibility', variant: 'destructive' })
    } finally {
      setUpdatingVisibilityIds((prev) => prev.filter((id) => id !== categoryId))
    }
  }

  const handleAddCategory = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({ title: 'Name is required', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
          displayOrder: categories.length,
        }),
      })
      if (!response.ok) throw new Error('Failed to create category')
      const data = await response.json()
      setCategories((prev) => [...prev, { ...data, menuItems: [] }])
      setName('')
      setDescription('')
      toast({ title: 'Category added' })
    } catch (error) {
      console.error('Add category failed', error)
      toast({
        title: 'Could not add category',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Remove this category?')) return
    setDeletingIds((prev) => [...prev, categoryId])
    try {
      const response = await fetch(`/api/categories/${categoryId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete category')
      setCategories((prev) => prev.filter((c) => c.id !== categoryId))
      toast({ title: 'Category removed', variant: 'destructive' })
    } catch (error) {
      toast({
        title: 'Could not remove category',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== categoryId))
    }
  }

  const startEditName = (cat: CategoryWithItems) => {
    setEditingNameId(cat.id)
    setEditingNameValue(cat.name)
  }

  const saveEditName = async () => {
    if (!editingNameId) return
    const trimmed = editingNameValue.trim()
    if (!trimmed) {
      setEditingNameId(null)
      return
    }
    try {
      const response = await fetch(`/api/categories/${editingNameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!response.ok) throw new Error('Failed to update')
      setCategories((prev) =>
        prev.map((c) => (c.id === editingNameId ? { ...c, name: trimmed } : c))
      )
      toast({ title: 'Category name updated' })
    } catch {
      toast({ title: 'Could not update name', variant: 'destructive' })
    } finally {
      setEditingNameId(null)
    }
  }

  const moveItemToCategory = async (menuItemId: string, categoryId: string) => {
    setMovingItemId(menuItemId)
    try {
      const response = await fetch(`/api/menu/${menuItemId}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId }),
      })
      if (!response.ok) throw new Error('Failed to move')
      setCategories((prev) =>
        prev.map((c) => {
          if (c.id === categoryId) {
            const item = [...(c.menuItems || [])].find((m) => m.id === menuItemId)
            if (item) return c
            const sourceCat = prev.find((cat) => cat.menuItems.some((m) => m.id === menuItemId))
            const itemData = sourceCat?.menuItems.find((m) => m.id === menuItemId)
            if (!itemData) return c
            return { ...c, menuItems: [...(c.menuItems || []), itemData].sort((a, b) => a.name.localeCompare(b.name)) }
          }
          return {
            ...c,
            menuItems: (c.menuItems || []).filter((m) => m.id !== menuItemId),
          }
        })
      )
      toast({ title: 'Item moved' })
    } catch {
      toast({ title: 'Could not move item', variant: 'destructive' })
    } finally {
      setMovingItemId(null)
    }
  }

  const runAiSuggest = async () => {
    setAiSuggestLoading(true)
    try {
      const response = await fetch('/api/categories/ai-suggest', { method: 'POST' })
      if (!response.ok) throw new Error('Failed to run')
      const data = await response.json()
      toast({ title: `AI categorization applied`, description: `${data.updated} items updated across ${data.categories} categories.` })
      router.refresh()
    } catch {
      toast({ title: 'Could not run AI categorization', variant: 'destructive' })
    } finally {
      setAiSuggestLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card data-tour="tour-ai-categorization">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>AI categorization</CardTitle>
              <CardDescription>
                Auto-assign menu items into: Signature Dishes (2 top mains + 1 shareable), Main Dishes, Shareables, Add-ons, Drinks, Desserts, Kids, Sides.
              </CardDescription>
            </div>
            <Button onClick={runAiSuggest} disabled={aiSuggestLoading} className="gap-2">
              {aiSuggestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Run AI categorization
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card data-tour="tour-add-category">
        <CardHeader>
          <CardTitle>Add Category</CardTitle>
          <CardDescription>Give your menu a new section</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Main Courses"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <Textarea
                id="category-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional grouping hint for your front-of-house team."
              />
            </div>
          </div>
          <Button onClick={handleAddCategory} disabled={loading} className="self-start">
            {loading ? 'Saving…' : 'Create category'}
          </Button>
        </CardContent>
      </Card>

      <Card data-tour="tour-current-categories">
        <CardHeader>
          <CardTitle>Current Categories</CardTitle>
          <CardDescription>
            See which dishes are in each category. Edit names or move items to another category.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">No categories yet.</p>
          ) : (
            categories.map((category, index) => (
              <div
                key={category.id}
                className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <GripVertical className="h-4 w-4 text-slate-400" />
                    {editingNameId === category.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onBlur={saveEditName}
                          onKeyDown={(e) => e.key === 'Enter' && saveEditName()}
                          className="h-8 w-48"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" onClick={saveEditName}>Save</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{category.name}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-slate-500 h-7"
                          onClick={() => startEditName(category)}
                        >
                          Edit name
                        </Button>
                      </div>
                    )}
                    {category.description && (
                      <p className="text-sm text-slate-500">{category.description}</p>
                    )}
                    <Badge variant="secondary" className="text-[11px]">{`Order ${index + 1}`}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={category.showOnMenu !== false ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={() => toggleShowOnMenu(category.id)}
                      disabled={updatingVisibilityIds.includes(category.id)}
                      title={category.showOnMenu !== false ? 'Visible on menu (click to hide)' : 'Hidden (click to show)'}
                    >
                      {updatingVisibilityIds.includes(category.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : category.showOnMenu !== false ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(category.id)}
                      disabled={deletingIds.includes(category.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="pl-6">
                  <p className="text-xs font-medium text-slate-500 mb-1.5">Dishes in this category</p>
                  {(!category.menuItems || category.menuItems.length === 0) ? (
                    <p className="text-sm text-slate-400">No items</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {category.menuItems.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-slate-700">{item.name}</span>
                          <Select
                            value=""
                            onValueChange={(val) => val && val !== category.id && moveItemToCategory(item.id, val)}
                            disabled={movingItemId === item.id}
                          >
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                              {movingItemId === item.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <SelectValue placeholder="Move to…" />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              {categories
                                .filter((c) => c.id !== category.id)
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              {categories.filter((c) => c.id !== category.id).length === 0 && (
                                <SelectItem value="__none__" disabled>No other categories</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
