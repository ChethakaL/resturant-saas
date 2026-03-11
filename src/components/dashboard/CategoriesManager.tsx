'use client'

import { useEffect, useState } from 'react'
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
import { getStaticTranslationForSourceText, getTranslatedCategoryName, useI18n } from '@/lib/i18n'

export interface CategoryWithItems extends Category {
  menuItems: { id: string; name: string; translations?: { language: string; translatedName: string }[] }[]
}

interface CategoriesManagerProps {
  initialCategories: CategoryWithItems[]
  uiTranslationMap?: Record<string, string>
}

function normalizeSourceText(value: string) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

const CATEGORY_COPY = {
  en: {
    aiTitle: 'AI categorization',
    aiDescription: 'Automatically structures menu items into standardized categories to improve organization, reporting, and customer navigation.',
    aiAction: 'Run AI categorization',
    addTitle: 'Add Category',
    addDescription: 'Give your menu a new section',
    name: 'Name',
    description: 'Description',
    namePlaceholder: 'e.g., Main Courses',
    descriptionPlaceholder: 'Optional grouping hint for your front-of-house team.',
    create: 'Create category',
    currentTitle: 'Current Categories',
    currentDescription: 'Drag categories to reorder them. The order here controls how they appear on your client-facing menu.',
    editName: 'Edit name',
    save: 'Save',
    dishesInCategory: 'Dishes in this category',
    noItems: 'No items',
    moveTo: 'Move to...',
    noOtherCategories: 'No other categories',
    order: 'Order',
    saving: 'Saving...',
    noCategories: 'No categories yet.',
    sectionVisible: 'Section visible on menu',
    sectionHidden: 'Section hidden from menu',
    couldNotUpdateVisibility: 'Could not update visibility',
    nameRequired: 'Name is required',
    categoryAdded: 'Category added',
    couldNotAddCategory: 'Could not add category',
    unknownError: 'Unknown error',
    categoryRemoved: 'Category removed',
    movedToUncategorized: 'moved to Uncategorized',
    couldNotRemoveCategory: 'Could not remove category',
    categoryNameUpdated: 'Category name updated',
    couldNotUpdateName: 'Could not update name',
    itemMoved: 'Item moved',
    couldNotMoveItem: 'Could not move item',
    couldNotRunAi: 'Could not run AI categorization',
    categoryOrderUpdated: 'Category order updated',
    couldNotUpdateOrder: 'Could not update order',
  },
  ku: {
    aiTitle: 'پۆلێنکردنی AI',
    aiDescription: 'خواردنەکانی مینیو بە شێوەیەکی خۆکار لە پۆلە ستانداردەکاندا ڕێکدەخات بۆ ڕێکخستن، ڕاپۆرتسازی و ئاسانکردنی گەڕان.',
    aiAction: 'پۆلێنکردنی AI بەڕێوەببە',
    addTitle: 'زیادکردنی پۆل',
    addDescription: 'بەشێکی نوێ بۆ مینیوەکەت دروست بکە',
    name: 'ناو',
    description: 'وەسف',
    namePlaceholder: 'وەک: خواردنی سەرەکی',
    descriptionPlaceholder: 'ئامۆژگارییەکی هەڵبژاردەیی بۆ تیمی خزمەتگوزارییەکەت.',
    create: 'دروستکردنی پۆل',
    currentTitle: 'پۆلە ئێستاکان',
    currentDescription: 'پۆلەکان ڕابکێشە بۆ گۆڕینی ڕیزبەندی. ئەم ڕیزبەندییە دیاری دەکات چۆن لە مینیوی میواناندا پیشان بدرێن.',
    editName: 'دەستکاری ناو',
    save: 'پاشەکەوتکردن',
    dishesInCategory: 'خواردنەکانی ناو ئەم پۆلە',
    noItems: 'هیچ ئایتمێک نییە',
    moveTo: 'بگوازەرەوە بۆ...',
    noOtherCategories: 'پۆلێکی دیکە نییە',
    order: 'ڕیز',
    saving: 'پاشەکەوت دەکرێت...',
    noCategories: 'هێشتا هیچ پۆلێک نییە.',
    sectionVisible: 'بەشەکە لە مینیودا پیشان دەدرێت',
    sectionHidden: 'بەشەکە لە مینیودا شاردراوە',
    couldNotUpdateVisibility: 'نەتوانرا دۆخی پیشاندان نوێ بکرێتەوە',
    nameRequired: 'ناو پێویستە',
    categoryAdded: 'پۆلەکە زیاد کرا',
    couldNotAddCategory: 'نەتوانرا پۆلەکە زیاد بکرێت',
    unknownError: 'هەڵەیەکی نەناسراو',
    categoryRemoved: 'پۆلەکە سڕایەوە',
    movedToUncategorized: 'گوازرایەوە بۆ بێ پۆل',
    couldNotRemoveCategory: 'نەتوانرا پۆلەکە بسڕدرێتەوە',
    categoryNameUpdated: 'ناوی پۆلەکە نوێ کرایەوە',
    couldNotUpdateName: 'نەتوانرا ناوەکە نوێ بکرێتەوە',
    itemMoved: 'ئایتمەکە گوازرایەوە',
    couldNotMoveItem: 'نەتوانرا ئایتمەکە بگوازرێتەوە',
    couldNotRunAi: 'نەتوانرا پۆلێنکردنی AI بەڕێوەببرێت',
    categoryOrderUpdated: 'ڕیزبەندی پۆلەکان نوێ کرایەوە',
    couldNotUpdateOrder: 'نەتوانرا ڕیزبەندی نوێ بکرێتەوە',
  },
  'ar-fusha': {
    aiTitle: 'التصنيف بالذكاء الاصطناعي',
    aiDescription: 'ينظم أصناف القائمة تلقائياً ضمن فئات موحدة لتحسين التنظيم والتقارير وسهولة تصفح العملاء.',
    aiAction: 'تشغيل التصنيف بالذكاء الاصطناعي',
    addTitle: 'إضافة فئة',
    addDescription: 'أنشئ قسماً جديداً في قائمتك',
    name: 'الاسم',
    description: 'الوصف',
    namePlaceholder: 'مثال: الأطباق الرئيسية',
    descriptionPlaceholder: 'ملاحظة اختيارية تساعد فريق الخدمة على فهم هذا القسم.',
    create: 'إنشاء الفئة',
    currentTitle: 'الفئات الحالية',
    currentDescription: 'اسحب الفئات لإعادة ترتيبها. هذا الترتيب يحدد كيف تظهر في قائمة العملاء.',
    editName: 'تعديل الاسم',
    save: 'حفظ',
    dishesInCategory: 'الأطباق في هذه الفئة',
    noItems: 'لا توجد أصناف',
    moveTo: 'نقل إلى...',
    noOtherCategories: 'لا توجد فئات أخرى',
    order: 'الترتيب',
    saving: 'جارٍ الحفظ...',
    noCategories: 'لا توجد فئات بعد.',
    sectionVisible: 'أصبح القسم ظاهراً في القائمة',
    sectionHidden: 'تم إخفاء القسم من القائمة',
    couldNotUpdateVisibility: 'تعذر تحديث حالة الظهور',
    nameRequired: 'الاسم مطلوب',
    categoryAdded: 'تمت إضافة الفئة',
    couldNotAddCategory: 'تعذرت إضافة الفئة',
    unknownError: 'خطأ غير معروف',
    categoryRemoved: 'تم حذف الفئة',
    movedToUncategorized: 'تم نقلها إلى غير مصنف',
    couldNotRemoveCategory: 'تعذر حذف الفئة',
    categoryNameUpdated: 'تم تحديث اسم الفئة',
    couldNotUpdateName: 'تعذر تحديث الاسم',
    itemMoved: 'تم نقل الصنف',
    couldNotMoveItem: 'تعذر نقل الصنف',
    couldNotRunAi: 'تعذر تشغيل التصنيف بالذكاء الاصطناعي',
    categoryOrderUpdated: 'تم تحديث ترتيب الفئات',
    couldNotUpdateOrder: 'تعذر تحديث الترتيب',
  },
} as const

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
  copy: typeof CATEGORY_COPY.en
  locale: string
  translatedCategoryName: string
  translateSourceText: (sourceText: string) => string
  translateCategoryName: (categoryName: string) => string
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
  copy,
  locale,
  translatedCategoryName,
  translateSourceText,
  translateCategoryName,
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
              <Button size="sm" variant="ghost" onClick={onSaveEditName}>{copy.save}</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900">{translatedCategoryName}</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-500 h-7"
                onClick={() => onStartEditName(category)}
              >
                {copy.editName}
              </Button>
            </div>
          )}
          {category.description && (
            <p className="text-sm text-slate-500">{translateSourceText(category.description)}</p>
          )}
          <Badge variant="secondary" className="text-[11px]">{`${copy.order} ${index + 1}`}</Badge>
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
        <p className="text-xs font-medium text-slate-500 mb-1.5">{copy.dishesInCategory}</p>
        {(!category.menuItems || category.menuItems.length === 0) ? (
          <p className="text-sm text-slate-400">{copy.noItems}</p>
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
                <span className="text-slate-700">{
                  locale === 'ar-fusha'
                    ? item.translations?.find((t) => t.language === 'ar_fusha' || t.language === 'ar')?.translatedName || translateSourceText(item.name)
                    : locale === 'ku'
                      ? item.translations?.find((t) => t.language === 'ku')?.translatedName || translateSourceText(item.name)
                      : item.name
                }</span>
                <Select
                  value=""
                  onValueChange={(val) => val && val !== category.id && onMoveItemToCategory(item.id, val)}
                  disabled={movingItemId === item.id}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    {movingItemId === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <SelectValue placeholder={copy.moveTo} />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((c) => c.id !== category.id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {translateCategoryName(c.name)}
                        </SelectItem>
                      ))}
                    {categories.filter((c) => c.id !== category.id).length === 0 && (
                      <SelectItem value="__none__" disabled>{copy.noOtherCategories}</SelectItem>
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

export default function CategoriesManager({ initialCategories, uiTranslationMap = {} }: CategoriesManagerProps) {
  const router = useRouter()
  const { locale, t } = useI18n()
  const copy = CATEGORY_COPY[locale] ?? CATEGORY_COPY.en
  const translateSourceText = (sourceText: string) =>
    uiTranslationMap[normalizeSourceText(sourceText)] ||
    getStaticTranslationForSourceText(locale, sourceText) ||
    sourceText
  const translateCategoryName = (categoryName: string) =>
    uiTranslationMap[normalizeSourceText(categoryName)] ||
    getTranslatedCategoryName(categoryName, t)
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

  useEffect(() => {
    setCategories(initialCategories)
  }, [initialCategories])

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
      toast({ title: next ? copy.sectionVisible : copy.sectionHidden })
    } catch {
      toast({ title: copy.couldNotUpdateVisibility, variant: 'destructive' })
    } finally {
      setUpdatingVisibilityIds((prev) => prev.filter((id) => id !== categoryId))
    }
  }

  const handleAddCategory = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({ title: copy.nameRequired, variant: 'destructive' })
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
      toast({ title: copy.categoryAdded })
    } catch (error) {
      console.error('Add category failed', error)
      toast({
        title: copy.couldNotAddCategory,
        description: error instanceof Error ? error.message : copy.unknownError,
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
          title: copy.categoryRemoved,
          description: `${result.itemsMoved} ${copy.movedToUncategorized}`,
        })
      } else {
        toast({ title: copy.categoryRemoved })
      }

      // Refresh to show updated categories including Uncategorized if created
      router.refresh()
    } catch (error) {
      toast({
        title: copy.couldNotRemoveCategory,
        description: error instanceof Error ? error.message : copy.unknownError,
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
      toast({ title: copy.categoryNameUpdated })
    } catch {
      toast({ title: copy.couldNotUpdateName, variant: 'destructive' })
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
      toast({ title: copy.itemMoved })
    } catch {
      toast({ title: copy.couldNotMoveItem, variant: 'destructive' })
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

      router.refresh()
    } catch {
      toast({ title: copy.couldNotRunAi, variant: 'destructive' })
    } finally {
      setAiSuggestLoading(false)
    }
  }

  const closeAiResultsDialog = () => {
    setAiResultsOpen(false)
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

      toast({ title: copy.categoryOrderUpdated })
    } catch (error) {
      // Revert on error
      setCategories(categories)
      toast({ title: copy.couldNotUpdateOrder, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <Card data-tour="tour-ai-categorization">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{copy.aiTitle}</CardTitle>
              <CardDescription>
                {copy.aiDescription}
              </CardDescription>
            </div>
            <Button onClick={runAiSuggest} disabled={aiSuggestLoading} className="gap-2">
              {aiSuggestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {copy.aiAction}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card data-tour="tour-add-category">
        <CardHeader>
          <CardTitle>{copy.addTitle}</CardTitle>
          <CardDescription>{copy.addDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category-name">{copy.name}</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={copy.namePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">{copy.description}</Label>
              <Textarea
                id="category-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={copy.descriptionPlaceholder}
              />
            </div>
          </div>
          <Button onClick={handleAddCategory} disabled={loading} className="self-start">
            {loading ? copy.saving : copy.create}
          </Button>
        </CardContent>
      </Card>

      <Card data-tour="tour-current-categories">
        <CardHeader>
          <CardTitle>{copy.currentTitle}</CardTitle>
          <CardDescription>
            {copy.currentDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">{copy.noCategories}</p>
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
                    translatedCategoryName={translateCategoryName(category.name)}
                    index={index}
                    categories={categories}
                    copy={copy}
                    locale={locale}
                    translateSourceText={translateSourceText}
                    translateCategoryName={translateCategoryName}
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
