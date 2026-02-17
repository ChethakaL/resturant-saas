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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Trash, Eye, EyeOff, Loader2, Sparkles, GripVertical, AlertTriangle } from 'lucide-react'
import { Category } from '@prisma/client'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface CategoryWithItems extends Category {
  menuItems: { id: string; name: string }[]
}

interface CategoriesManagerProps {
  initialCategories: CategoryWithItems[]
}

// Sortable category item wrapper
interface SortableCategoryItemProps {
  category: CategoryWithItems
  index: number
  categories: CategoryWithItems[]
  editingNameId: string | null
  editingNameValue: string
  updatingVisibilityIds: string[]
  deletingIds: string[]
  movingItemId: string | null
  highlightedItems: Set<string>
  onStartEditName: (cat: CategoryWithItems) => void
  onSaveEditName: () => void
  onEditNameChange: (value: string) => void
  onToggleShowOnMenu: (categoryId: string) => void
  onOpenDeleteDialog: (category: CategoryWithItems) => void
  onMoveItemToCategory: (menuItemId: string, categoryId: string) => void
}

function SortableCategoryItem({
  category,
  index,
  categories,
  editingNameId,
  editingNameValue,
  updatingVisibilityIds,
  deletingIds,
  movingItemId,
  highlightedItems,
  onStartEditName,
  onSaveEditName,
  onEditNameChange,
  onToggleShowOnMenu,
  onOpenDeleteDialog,
  onMoveItemToCategory,
}: SortableCategoryItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4 text-slate-400 hover:text-slate-600" />
          </button>
          {editingNameId === category.id ? (
            <div className="flex items-center gap-2">
              <Input
                value={editingNameValue}
                onChange={(e) => onEditNameChange(e.target.value)}
                onBlur={onSaveEditName}
                onKeyDown={(e) => e.key === 'Enter' && onSaveEditName()}
                className="h-8 w-48"
                autoFocus
              />
              <Button size="sm" variant="ghost" onClick={onSaveEditName}>Save</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900">{category.name}</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-500 h-7"
                onClick={() => onStartEditName(category)}
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
            onClick={() => onToggleShowOnMenu(category.id)}
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
            onClick={() => onOpenDeleteDialog(category)}
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
              <li
                key={item.id}
                className={`flex items-center justify-between gap-2 text-sm transition-all duration-500 ${highlightedItems.has(item.id)
                  ? 'bg-emerald-50 border-l-4 border-emerald-500 pl-2 -ml-2 rounded animate-pulse'
                  : ''
                  }`}
              >
                <span className="text-slate-700">{item.name}</span>
                <Select
                  value=""
                  onValueChange={(val) => val && val !== category.id && onMoveItemToCategory(item.id, val)}
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
  )
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryWithItems | null>(null)
  const [aiResultsOpen, setAiResultsOpen] = useState(false)
  const [aiResults, setAiResults] = useState<{
    updated: number
    categories: number
    createdCategories: string[]
    changes: Array<{
      itemId: string
      itemName: string
      fromCategory: string | null
      toCategory: string
      reason: string
    }>
  } | null>(null)
  const [highlightedItems, setHighlightedItems] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

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

  const openDeleteDialog = (category: CategoryWithItems) => {
    setCategoryToDelete(category)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!categoryToDelete) return

    const categoryId = categoryToDelete.id
    const itemCount = categoryToDelete.menuItems.length

    setDeletingIds((prev) => [...prev, categoryId])
    setDeleteDialogOpen(false)

    try {
      const response = await fetch(`/api/categories/${categoryId}`, { method: 'DELETE' })
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        throw new Error(errorBody?.error ?? 'Failed to delete category')
      }

      const result = await response.json()
      setCategories((prev) => prev.filter((c) => c.id !== categoryId))

      if (result.itemsMoved > 0) {
        toast({
          title: 'Category removed',
          description: `${result.itemsMoved} item${result.itemsMoved > 1 ? 's' : ''} moved to Uncategorized`,
        })
      } else {
        toast({ title: 'Category removed' })
      }

      // Refresh to show updated categories including Uncategorized if created
      router.refresh()
    } catch (error) {
      toast({
        title: 'Could not remove category',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== categoryId))
      setCategoryToDelete(null)
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
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to run AI categorization')
      }

      // Show detailed results
      setAiResults(data)
      setAiResultsOpen(true)

      // Highlight changed items
      const changedItemIds = new Set<string>(data.changes.map((c: any) => c.itemId as string))
      setHighlightedItems(changedItemIds)

      // Clear highlights after 10 seconds
      setTimeout(() => setHighlightedItems(new Set()), 10000)

      // DON'T refresh here - let user see the dialog first
    } catch {
      toast({ title: 'Could not run AI categorization', variant: 'destructive' })
    } finally {
      setAiSuggestLoading(false)
    }
  }

  const closeAiResultsDialog = () => {
    setAiResultsOpen(false)
    // Refresh after closing dialog to show updated categories
    router.refresh()
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = categories.findIndex((cat) => cat.id === active.id)
    const newIndex = categories.findIndex((cat) => cat.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    // Optimistically update UI
    const newCategories = arrayMove(categories, oldIndex, newIndex)
    setCategories(newCategories)

    // Update displayOrder for all affected categories
    try {
      const updates = newCategories.map((cat, index) => ({
        id: cat.id,
        displayOrder: index,
      }))

      const response = await fetch('/api/categories/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      if (!response.ok) {
        throw new Error('Failed to update order')
      }

      toast({ title: 'Category order updated' })
    } catch (error) {
      // Revert on error
      setCategories(categories)
      toast({ title: 'Could not update order', variant: 'destructive' })
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
                Automatically structures menu items into standardized categories to improve organization, reporting, and customer navigation.
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
            Drag categories to reorder them. The order here controls how they appear on your client-facing menu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">No categories yet.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categories.map((cat) => cat.id)}
                strategy={verticalListSortingStrategy}
              >
                {categories.map((category, index) => (
                  <SortableCategoryItem
                    key={category.id}
                    category={category}
                    index={index}
                    categories={categories}
                    editingNameId={editingNameId}
                    editingNameValue={editingNameValue}
                    updatingVisibilityIds={updatingVisibilityIds}
                    deletingIds={deletingIds}
                    movingItemId={movingItemId}
                    highlightedItems={highlightedItems}
                    onStartEditName={startEditName}
                    onSaveEditName={saveEditName}
                    onEditNameChange={setEditingNameValue}
                    onToggleShowOnMenu={toggleShowOnMenu}
                    onOpenDeleteDialog={openDeleteDialog}
                    onMoveItemToCategory={moveItemToCategory}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Delete Category?
            </DialogTitle>
            <DialogDescription>
              {categoryToDelete && (
                <div className="space-y-2 pt-2">
                  <p>
                    You are about to delete <strong>{categoryToDelete.name}</strong>.
                  </p>
                  {categoryToDelete.menuItems.length > 0 ? (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <p className="text-sm text-amber-900 font-medium">
                        This category contains {categoryToDelete.menuItems.length} menu item{categoryToDelete.menuItems.length > 1 ? 's' : ''}:
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-amber-800">
                        {categoryToDelete.menuItems.slice(0, 5).map((item) => (
                          <li key={item.id} className="ml-4 list-disc">{item.name}</li>
                        ))}
                        {categoryToDelete.menuItems.length > 5 && (
                          <li className="ml-4 text-amber-700 italic">
                            ...and {categoryToDelete.menuItems.length - 5} more
                          </li>
                        )}
                      </ul>
                      <p className="mt-2 text-sm text-amber-900">
                        These items will be moved to an <strong>"Uncategorized"</strong> category.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">
                      This category is empty and can be safely deleted.
                    </p>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletingIds.includes(categoryToDelete?.id ?? '')}
            >
              {deletingIds.includes(categoryToDelete?.id ?? '') ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</>
              ) : (
                'Delete Category'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Categorization Results Dialog */}
      <Dialog open={aiResultsOpen} onOpenChange={(open) => !open && closeAiResultsDialog()}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              AI Categorization Complete
            </DialogTitle>
            <DialogDescription>
              {aiResults && (
                <div className="space-y-4 pt-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                      <p className="text-sm font-medium text-emerald-900">
                        {aiResults.updated} items categorized
                      </p>
                    </div>
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                      <p className="text-sm font-medium text-blue-900">
                        {aiResults.categories} total categories
                      </p>
                    </div>
                  </div>

                  {aiResults.createdCategories.length > 0 && (
                    <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
                      <p className="text-sm font-medium text-purple-900 mb-2">
                        ✨ Created {aiResults.createdCategories.length} new {aiResults.createdCategories.length === 1 ? 'category' : 'categories'}:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {aiResults.createdCategories.map((cat) => (
                          <Badge key={cat} variant="secondary" className="bg-purple-100 text-purple-800">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiResults.changes.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-slate-900 mb-3">
                        📋 Item Movements ({aiResults.changes.length}):
                      </p>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {aiResults.changes.map((change, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="font-medium text-slate-900">{change.itemName}</p>
                                <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                                  <span className="px-2 py-0.5 rounded bg-slate-100">
                                    {change.fromCategory || 'Uncategorized'}
                                  </span>
                                  <span>→</span>
                                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                                    {change.toCategory}
                                  </span>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs shrink-0">
                                {change.reason}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiResults.changes.length === 0 && (
                    <p className="text-sm text-slate-600 text-center py-4">
                      No items were moved. All items are already in the correct categories.
                    </p>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={closeAiResultsDialog}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
