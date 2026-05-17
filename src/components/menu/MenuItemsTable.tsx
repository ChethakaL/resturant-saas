'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { Edit, Loader2, Trash, Check, X, DollarSign, Percent } from 'lucide-react'
import { useI18n, getTranslatedCategoryName } from '@/lib/i18n'
import { useDynamicTranslate } from '@/lib/i18n'
import { isZeroCostAllowed } from '@/lib/costing'
import { classifyItemType } from '@/lib/category-suggest'

export interface MenuItemWithMetrics {
  id: string
  name: string
  description?: string | null
  imageUrl?: string | null
  price: number
  cost: number
  profit: number
  margin: number
  available: boolean
  status?: string
  costingStatus?: string
  category: {
    name: string
  }
  chefPickOrder?: number | null
}

/** Markup targets */
const FOOD_MARKUP = 1.70 // Cost + 70%
const DRINK_MARKUP = 1.85 // Cost + 85%

function getMarginColor(margin: number) {
  if (margin >= 60) return 'text-green-600'
  if (margin >= 40) return 'text-amber-600'
  if (margin >= 20) return 'text-yellow-600'
  if (margin >= 0) return 'text-red-600'
  return 'text-red-700'
}

function getSuggestedPrice(cost: number, categoryName: string | null): number {
  if (cost <= 0) return 0
  const type = classifyItemType({
    id: '',
    name: '',
    categoryName,
    marginPercent: 0,
    unitsSold: 0,
  })

  const markup = type === 'Drinks' ? DRINK_MARKUP : FOOD_MARKUP
  return Math.ceil(cost * markup)
}

type BulkPriceScope = 'selected' | 'category' | 'all'

export default function MenuItemsTable({
  menuItems,
  activeCategoryId,
  activeCategoryName,
  categoryItemCount,
}: {
  menuItems: MenuItemWithMetrics[]
  activeCategoryId?: string
  activeCategoryName?: string
  categoryItemCount?: number
}) {
  const router = useRouter()
  const [items, setItems] = useState(menuItems)
  const [updatingIds, setUpdatingIds] = useState<string[]>([])
  const [deletingIds, setDeletingIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkPublishing, setBulkPublishing] = useState(false)
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false)
  const [bulkAdjusting, setBulkAdjusting] = useState(false)
  const [adjustPercent, setAdjustPercent] = useState('')
  const [adjustScope, setAdjustScope] = useState<BulkPriceScope>('selected')
  const [chefPickUpdatingIds, setChefPickUpdatingIds] = useState<string[]>([])
  const [menuItemToDelete, setMenuItemToDelete] =
    useState<MenuItemWithMetrics | null>(null)
  const itemsRef = useRef(items)
  const { toast } = useToast()
  const { t } = useI18n()
  const { t: td } = useDynamicTranslate()

  // Inline price editing state
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [editingPriceValue, setEditingPriceValue] = useState('')
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)
  const priceInputRef = useRef<HTMLInputElement>(null)

  // Complete costing modal state
  const [costingModalOpen, setCostingModalOpen] = useState(false)
  const [costingMenuItem, setCostingMenuItem] = useState<MenuItemWithMetrics | null>(null)
  const [costingIngredients, setCostingIngredients] = useState<Array<{
    id: string
    name: string
    unit: string
    costPerUnit: number
  }>>([])
  const [loadingIngredients, setLoadingIngredients] = useState(false)
  const [savingCosting, setSavingCosting] = useState(false)

  useEffect(() => {
    setItems(menuItems)
  }, [menuItems])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    const itemIds = new Set(items.map((item) => item.id))
    setSelectedIds((prev) => prev.filter((id) => itemIds.has(id)))
  }, [items])

  useEffect(() => {
    if (editingPriceId && priceInputRef.current) {
      priceInputRef.current.focus()
      priceInputRef.current.select()
    }
  }, [editingPriceId])

  const toggleAvailability = useCallback(
    async (id: string) => {
      if (updatingIds.includes(id)) return

      const target = itemsRef.current.find((item) => item.id === id)
      if (!target) return

      setUpdatingIds((prev) => [...prev, id])

      try {
        const response = await fetch(`/api/menu/${id}/availability`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ available: !target.available }),
        })

        if (!response.ok) {
          throw new Error('Availability update failed')
        }

        const updated = await response.json()

        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, available: updated.available } : item
          )
        )
      } catch (error) {
        console.error('Failed to update availability', error)
      } finally {
        setUpdatingIds((prev) => prev.filter((itemId) => itemId !== id))
      }
    },
    [updatingIds]
  )

  const toggleChefPick = useCallback(
    async (id: string) => {
      if (chefPickUpdatingIds.includes(id)) return

      const target = itemsRef.current.find((item) => item.id === id)
      if (!target) return

      setChefPickUpdatingIds((prev) => [...prev, id])

      const isChefPick = target.chefPickOrder != null

      try {
        if (isChefPick) {
          const response = await fetch(`/api/chef-picks/${id}`, {
            method: 'DELETE',
          })

          if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}))
            throw new Error(
              errorBody?.error || 'Failed to remove item from Chef picks.'
            )
          }

          setItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, chefPickOrder: null } : item
            )
          )
        } else {
          const response = await fetch('/api/chef-picks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ menuItemId: id }),
          })

          if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}))
            throw new Error(
              errorBody?.error || 'Failed to add item to Chef picks.'
            )
          }

          const data = await response.json()

          setItems((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                  ...item,
                  chefPickOrder:
                    typeof data.displayOrder === 'number'
                      ? data.displayOrder
                      : null,
                }
                : item
            )
          )
        }
      } catch (error) {
        console.error('Failed to update chef pick', error)
        toast({
          title: 'Chef pick update failed',
          description:
            error instanceof Error
              ? error.message
              : 'Something went wrong. Please try again.',
          variant: 'destructive',
        })
      } finally {
        setChefPickUpdatingIds((prev) => prev.filter((itemId) => itemId !== id))
      }
    },
    [chefPickUpdatingIds, toast]
  )

  const confirmDelete = useCallback(async () => {
    if (!menuItemToDelete) return

    const id = menuItemToDelete.id
    if (deletingIds.includes(id)) return

    setDeletingIds((prev) => [...prev, id])

    try {
      const response = await fetch(`/api/menu/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        throw new Error(
          errorBody?.error ?? 'Failed to delete the menu item. Please try again.'
        )
      }

      setItems((prev) => prev.filter((item) => item.id !== id))
      toast({
        title: 'Menu Item Deleted',
        description: `${menuItemToDelete.name} was removed from your menu.`,
      })
      setMenuItemToDelete(null)
    } catch (error) {
      console.error('Failed to delete menu item', error)
      toast({
        title: 'Delete Failed',
        description:
          error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeletingIds((prev) => prev.filter((itemId) => itemId !== id))
    }
  }, [deletingIds, menuItemToDelete, toast])

  const allSelected = items.length > 0 && selectedIds.length === items.length
  const selectedItems = items.filter((item) => selectedIds.includes(item.id))

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : items.map((item) => item.id))
  }

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    )
  }

  const confirmBulkDelete = async () => {
    if (selectedIds.length === 0 || bulkDeleting) return

    const idsToDelete = selectedIds
    setBulkDeleting(true)
    setDeletingIds((prev) => Array.from(new Set([...prev, ...idsToDelete])))

    try {
      const response = await fetch('/api/menu/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.error ?? 'Failed to delete selected menu items.')
      }

      const deletedIds = Array.isArray(result.deletedIds) ? result.deletedIds : idsToDelete
      setItems((prev) => prev.filter((item) => !deletedIds.includes(item.id)))
      setSelectedIds((prev) => prev.filter((id) => !deletedIds.includes(id)))
      setBulkDeleteOpen(false)
      toast({
        title: 'Menu items deleted',
        description: `${result.deletedCount ?? deletedIds.length} item${(result.deletedCount ?? deletedIds.length) === 1 ? '' : 's'} removed from your menu.`,
      })
      router.refresh()
    } catch (error) {
      console.error('Failed to delete selected menu items', error)
      toast({
        title: 'Bulk delete failed',
        description:
          error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBulkDeleting(false)
      setDeletingIds((prev) => prev.filter((itemId) => !idsToDelete.includes(itemId)))
    }
  }

  const confirmBulkPublish = async (ids?: string[]) => {
    const idsToPublish = ids || selectedIds
    if (idsToPublish.length === 0 || bulkPublishing) return

    setBulkPublishing(true)
    try {
      const response = await fetch('/api/menu/bulk-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToPublish }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Failed to publish items')

      toast({
        title: t.menu_published,
        description: t.menu_publish_success.replace('{0}', String(result.publishedCount)),
      })
      
      router.refresh()
    } catch (error) {
      console.error('Bulk publish error:', error)
      toast({
        title: t.common_error,
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setBulkPublishing(false)
    }
  }

  const getDefaultAdjustScope = (): BulkPriceScope => {
    if (selectedIds.length > 0) return 'selected'
    if (activeCategoryId) return 'category'
    return 'all'
  }

  const openBulkAdjustDialog = () => {
    setAdjustPercent('')
    setAdjustScope(getDefaultAdjustScope())
    setBulkAdjustOpen(true)
  }

  const confirmBulkAdjustPrices = async () => {
    const percentChange = parseFloat(adjustPercent)
    if (isNaN(percentChange) || percentChange === 0) {
      toast({
        title: t.common_error,
        description: t.menu_adjust_prices_invalid_percent,
        variant: 'destructive',
      })
      return
    }

    if (adjustScope === 'selected' && selectedIds.length === 0) {
      toast({
        title: t.common_error,
        description: t.menu_adjust_prices_no_selection,
        variant: 'destructive',
      })
      return
    }

    if (adjustScope === 'category' && !activeCategoryId) {
      toast({
        title: t.common_error,
        description: t.menu_adjust_prices_no_category,
        variant: 'destructive',
      })
      return
    }

    setBulkAdjusting(true)
    try {
      const body: Record<string, unknown> = { percentChange }
      if (adjustScope === 'selected') {
        body.ids = selectedIds
      } else if (adjustScope === 'category') {
        body.categoryId = activeCategoryId
      } else {
        body.applyToAll = true
      }

      const response = await fetch('/api/menu/bulk-adjust-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.error ?? t.menu_adjust_prices_failed)
      }

      if (adjustScope === 'selected') {
        const multiplier = 1 + percentChange / 100
        setItems((prev) =>
          prev.map((item) => {
            if (!selectedIds.includes(item.id)) return item
            const newPrice = Math.max(0, Math.round(item.price * multiplier))
            const profit = newPrice - item.cost
            const margin = newPrice > 0 ? (profit / newPrice) * 100 : 0
            return { ...item, price: newPrice, profit, margin }
          })
        )
      }

      setBulkAdjustOpen(false)
      setAdjustPercent('')
      toast({
        title: t.menu_adjust_prices_success_title,
        description: t.menu_adjust_prices_success
          .replace('{0}', String(result.updatedCount ?? 0))
          .replace('{1}', percentChange > 0 ? `+${percentChange}` : String(percentChange)),
      })
      router.refresh()
    } catch (error) {
      console.error('Bulk price adjust error:', error)
      toast({
        title: t.common_error,
        description:
          error instanceof Error ? error.message : t.menu_adjust_prices_failed,
        variant: 'destructive',
      })
    } finally {
      setBulkAdjusting(false)
    }
  }

  const handlePublishAll = async () => {
    if (bulkPublishing) return
    
    setBulkPublishing(true)
    try {
      const response = await fetch('/api/menu/bulk-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishAll: true }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Failed to publish items')

      toast({
        title: t.menu_published,
        description: t.menu_publish_all_success.replace('{0}', String(result.publishedCount)),
      })
      
      router.refresh()
    } catch (error) {
      console.error('Publish all error:', error)
      toast({
        title: t.common_error,
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setBulkPublishing(false)
    }
  }

  const startEditingPrice = (item: MenuItemWithMetrics) => {
    setEditingPriceId(item.id)
    setEditingPriceValue(String(item.price))
  }

  const cancelEditingPrice = () => {
    setEditingPriceId(null)
    setEditingPriceValue('')
  }

  const savePrice = async () => {
    if (!editingPriceId) return

    const newPrice = parseFloat(editingPriceValue)
    if (isNaN(newPrice) || newPrice < 0) {
      toast({
        title: 'Invalid price',
        description: 'Price must be a non-negative number.',
        variant: 'destructive',
      })
      return
    }

    setSavingPriceId(editingPriceId)

    try {
      const response = await fetch(`/api/menu/${editingPriceId}/price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: newPrice }),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        throw new Error(errorBody?.error || 'Failed to update price')
      }

      // Update local state — recompute dependent columns
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== editingPriceId) return item
          const profit = newPrice - item.cost
          const margin = newPrice > 0 ? (profit / newPrice) * 100 : 0
          return { ...item, price: newPrice, profit, margin }
        })
      )

      toast({ title: 'Price updated' })
      setEditingPriceId(null)
      setEditingPriceValue('')
    } catch (error) {
      console.error('Failed to update price', error)
      toast({
        title: 'Price update failed',
        description:
          error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setSavingPriceId(null)
    }
  }

  const handlePriceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      savePrice()
    } else if (e.key === 'Escape') {
      cancelEditingPrice()
    }
  }

  const openCostingModal = async (item: MenuItemWithMetrics) => {
    setCostingMenuItem(item)
    setCostingModalOpen(true)
    setLoadingIngredients(true)

    try {
      // Fetch ingredients for this menu item
      const response = await fetch(`/api/menu/${item.id}/ingredients`)
      if (!response.ok) throw new Error('Failed to fetch ingredients')

      const data = await response.json()
      setCostingIngredients(data.ingredients || [])
    } catch (error) {
      console.error('Failed to load ingredients:', error)
      toast({
        title: 'Error',
        description: 'Failed to load ingredients. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingIngredients(false)
    }
  }

  const updateIngredientCost = (ingredientId: string, newCost: string) => {
    setCostingIngredients(prev =>
      prev.map(ing =>
        ing.id === ingredientId
          ? { ...ing, costPerUnit: parseFloat(newCost) || 0 }
          : ing
      )
    )
  }

  const saveCosting = async () => {
    if (!costingMenuItem) return

    setSavingCosting(true)

    try {
      // Step 1: Update all ingredient prices
      await Promise.all(
        costingIngredients.map(ing =>
          fetch(`/api/inventory/${ing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ costPerUnit: ing.costPerUnit }),
          })
        )
      )

      // Step 2: Recalculate costing status for the menu item
      const recalcResponse = await fetch(`/api/menu/${costingMenuItem.id}/recalculate-costing`, {
        method: 'POST',
      })

      if (!recalcResponse.ok) {
        console.warn('Failed to recalculate costing status')
      }

      toast({
        title: 'Costing completed',
        description: `All ingredient prices for ${costingMenuItem.name} have been updated.`,
      })

      setCostingModalOpen(false)
      setCostingMenuItem(null)
      setCostingIngredients([])

      // Refresh the page to show updated costing status
      router.refresh()
    } catch (error) {
      console.error('Failed to save costing:', error)
      toast({
        title: 'Error',
        description: 'Failed to save ingredient prices. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingCosting(false)
    }
  }

  return (
    <div className="overflow-x-auto">
      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500">
            {t.menu_no_items}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{selectedIds.length}</span> selected
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openBulkAdjustDialog}
                disabled={bulkAdjusting || bulkDeleting || bulkPublishing}
              >
                <Percent className="h-4 w-4 mr-2" />
                {t.menu_adjust_prices}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePublishAll}
                disabled={bulkPublishing}
              >
                {bulkPublishing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                {t.menu_publish_all}
              </Button>
              {selectedIds.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds([])}
                    disabled={bulkDeleting || bulkPublishing}
                  >
                    Clear selection
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    onClick={() => confirmBulkPublish()}
                    disabled={bulkPublishing || bulkDeleting}
                  >
                    {bulkPublishing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    {t.menu_publish_selected}
                  </Button>
                </>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={selectedIds.length === 0 || bulkDeleting || bulkPublishing}
              >
                {bulkDeleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash className="h-4 w-4 mr-2" />
                )}
                Delete selected
              </Button>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="w-10 py-3 px-4">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all menu items on this page"
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {t.menu_col_item_name}
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {t.menu_col_category}
                </th>
                <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {t.menu_col_availability}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {t.menu_col_direct_cost}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {t.menu_col_gross_profit}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {t.menu_col_suggested_price}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {t.menu_col_price}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {t.menu_col_actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isUpdating = updatingIds.includes(item.id)
                const isDeleting = deletingIds.includes(item.id)
                const isSelected = selectedIds.includes(item.id)
                const isEditingPrice = editingPriceId === item.id
                const isSavingPrice = savingPriceId === item.id
                const costPercent =
                  item.price > 0 ? (item.cost / item.price) * 100 : 0
                const profitPercent = item.margin
                const suggestedPrice = getSuggestedPrice(item.cost, item.category.name)
                const priceDiff =
                  suggestedPrice > 0 ? item.price - suggestedPrice : 0

                return (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 ${isSelected ? 'bg-slate-50' : ''}`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectItem(item.id)}
                        aria-label={`Select ${item.name}`}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                    </td>
                    {/* Item Name */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {item.imageUrl && (
                          <div className="h-10 w-10 overflow-hidden rounded-md bg-slate-100 flex-shrink-0">
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate flex items-center gap-2">
                            {item.name}
                            {item.status === 'DRAFT' && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t.menu_draft}</Badge>
                            )}
                            {item.costingStatus === 'INCOMPLETE' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">{t.menu_costing_incomplete}</Badge>
                            )}
                          </div>
                          {item.chefPickOrder != null && (
                            <span className="text-[10px] uppercase tracking-wide text-amber-600">
                              {t.menu_chef_pick} #{item.chefPickOrder}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 text-slate-600">
                      {getTranslatedCategoryName(item.category.name, t)}
                    </td>

                    {/* Availability */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => toggleAvailability(item.id)}
                        className={`inline-flex items-center justify-center min-w-[100px] rounded-full px-3 py-1 text-xs font-semibold transition ${item.available
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                          } ${isUpdating ? 'opacity-70 cursor-wait' : ''}`}
                      >
                        {isUpdating
                          ? t.menu_saving
                          : item.available
                            ? t.menu_available
                            : t.menu_sold_out}
                      </button>
                    </td>

                    {/* Direct Cost (number + %) */}
                    <td className="py-3 px-4 text-right">
                      <div className="font-mono text-sm">
                        {formatCurrency(item.cost)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatPercentage(costPercent)}
                      </div>
                    </td>

                    {/* Gross Profit (number + %) */}
                    <td className="py-3 px-4 text-right">
                      <div
                        className={`font-mono text-sm font-medium ${getMarginColor(profitPercent)}`}
                      >
                        {formatCurrency(item.profit)}
                      </div>
                      <div
                        className={`text-xs font-bold ${getMarginColor(profitPercent)}`}
                      >
                        {formatPercentage(profitPercent)}
                      </div>
                    </td>

                    {/* Suggested Price */}
                    <td className="py-3 px-4 text-right">
                      {suggestedPrice > 0 ? (
                        <div>
                          <div className="font-mono text-sm text-slate-700">
                            {formatCurrency(suggestedPrice)}
                          </div>
                          {priceDiff !== 0 && (
                            <div
                              className={`text-xs ${priceDiff > 0
                                ? 'text-green-600'
                                : 'text-red-600'
                                }`}
                            >
                              {priceDiff > 0 ? '+' : ''}
                              {formatCurrency(priceDiff)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* Price (editable, last column) */}
                    <td className="py-3 px-4 text-right">
                      {isEditingPrice ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            ref={priceInputRef}
                            type="number"
                            min="0"
                            step="any"
                            value={editingPriceValue}
                            onChange={(e) =>
                              setEditingPriceValue(e.target.value)
                            }
                            onKeyDown={handlePriceKeyDown}
                            disabled={isSavingPrice}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm font-mono focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={savePrice}
                            disabled={isSavingPrice}
                            className="rounded p-1 text-green-600 hover:bg-green-50"
                            title="Save"
                          >
                            {isSavingPrice ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingPrice}
                            disabled={isSavingPrice}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditingPrice(item)}
                          className="font-mono font-bold text-sm text-slate-900 hover:text-emerald-700 hover:underline cursor-pointer transition"
                          title="Click to edit price"
                        >
                          {formatCurrency(item.price)}
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.costingStatus === 'INCOMPLETE' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-amber-600 border-amber-300 hover:bg-amber-50"
                            onClick={() => openCostingModal(item)}
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            {t.menu_complete_costing}
                          </Button>
                        )}
                        <Link href={`/menu/${item.id}`}>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isDeleting}
                          onClick={() => setMenuItemToDelete(item)}
                        >
                          <Trash className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Dialog
            open={Boolean(menuItemToDelete)}
            onOpenChange={(open) => {
              if (!open) {
                setMenuItemToDelete(null)
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.menu_delete_title}</DialogTitle>
                <DialogDescription>
                  {t.menu_delete_confirm.replace('{0}', menuItemToDelete?.name ?? '')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMenuItemToDelete(null)}
                >
                  {t.common_cancel}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={
                    !menuItemToDelete ||
                    deletingIds.includes(menuItemToDelete.id)
                  }
                  onClick={confirmDelete}
                >
                  {menuItemToDelete && deletingIds.includes(menuItemToDelete.id)
                    ? t.menu_deleting
                    : t.common_delete}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={bulkAdjustOpen} onOpenChange={setBulkAdjustOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.menu_adjust_prices_title}</DialogTitle>
                <DialogDescription>{t.menu_adjust_prices_description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="adjust-percent">{t.menu_adjust_prices_percent_label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="adjust-percent"
                      type="number"
                      step="any"
                      placeholder="10"
                      value={adjustPercent}
                      onChange={(e) => setAdjustPercent(e.target.value)}
                      disabled={bulkAdjusting}
                      className="max-w-[140px]"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                  <p className="text-xs text-slate-500">{t.menu_adjust_prices_percent_hint}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t.menu_adjust_prices_scope_label}</Label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                      <input
                        type="radio"
                        name="adjust-scope"
                        checked={adjustScope === 'selected'}
                        onChange={() => setAdjustScope('selected')}
                        disabled={bulkAdjusting || selectedIds.length === 0}
                        className="mt-1"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-slate-900">
                          {t.menu_adjust_prices_scope_selected}
                        </span>
                        <span className="block text-slate-500">
                          {selectedIds.length > 0
                            ? t.menu_adjust_prices_scope_selected_count.replace(
                                '{0}',
                                String(selectedIds.length)
                              )
                            : t.menu_adjust_prices_scope_selected_empty}
                        </span>
                      </span>
                    </label>
                    {activeCategoryId && activeCategoryName && (
                      <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                        <input
                          type="radio"
                          name="adjust-scope"
                          checked={adjustScope === 'category'}
                          onChange={() => setAdjustScope('category')}
                          disabled={bulkAdjusting}
                          className="mt-1"
                        />
                        <span className="text-sm">
                          <span className="font-medium text-slate-900">
                            {t.menu_adjust_prices_scope_category}
                          </span>
                          <span className="block text-slate-500">
                            {t.menu_adjust_prices_scope_category_name.replace(
                              '{0}',
                              getTranslatedCategoryName(activeCategoryName, t)
                            )}
                            {categoryItemCount != null
                              ? ` (${categoryItemCount} ${t.menu_items})`
                              : ''}
                          </span>
                        </span>
                      </label>
                    )}
                    <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                      <input
                        type="radio"
                        name="adjust-scope"
                        checked={adjustScope === 'all'}
                        onChange={() => setAdjustScope('all')}
                        disabled={bulkAdjusting}
                        className="mt-1"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-slate-900">
                          {t.menu_adjust_prices_scope_all}
                        </span>
                        <span className="block text-slate-500">
                          {t.menu_adjust_prices_scope_all_hint}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkAdjustOpen(false)}
                  disabled={bulkAdjusting}
                >
                  {t.common_cancel}
                </Button>
                <Button
                  size="sm"
                  onClick={confirmBulkAdjustPrices}
                  disabled={bulkAdjusting || !adjustPercent.trim()}
                >
                  {bulkAdjusting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t.menu_adjust_prices_applying}
                    </>
                  ) : (
                    t.menu_adjust_prices_apply
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete selected menu items?</DialogTitle>
                <DialogDescription>
                  This will permanently delete {selectedIds.length} selected menu item{selectedIds.length === 1 ? '' : 's'}.
                </DialogDescription>
              </DialogHeader>
              {selectedItems.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-3 text-sm text-slate-700">
                  {selectedItems.slice(0, 12).map((item) => (
                    <div key={item.id} className="truncate">
                      {item.name}
                    </div>
                  ))}
                  {selectedItems.length > 12 && (
                    <div className="mt-2 text-slate-500">
                      +{selectedItems.length - 12} more
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(false)}
                  disabled={bulkDeleting}
                >
                  {t.common_cancel}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={confirmBulkDelete}
                  disabled={bulkDeleting || selectedIds.length === 0}
                >
                  {bulkDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete selected'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Complete Costing Modal */}
          <Dialog open={costingModalOpen} onOpenChange={setCostingModalOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-amber-500" />
                  {t.menu_complete_costing}: {costingMenuItem?.name}
                </DialogTitle>
                <DialogDescription>
                  <strong>{td('Required:')}</strong> {td('Enter cost per unit for')} <strong>{td('ALL')}</strong> {td('ingredients below. Costing will be marked complete when every ingredient has a price (water may be 0).')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {loadingIngredients ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  </div>
                ) : costingIngredients.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-slate-500">{td('No ingredients found for this menu item.')}</p>
                    <p className="text-sm text-slate-400 mt-2">{td('Add ingredients to this item first.')}</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
                      <p className="text-sm text-amber-900">
                        💡 <strong>{td('Important:')}</strong> {td('Enter cost per unit for each ingredient. Water may be 0; all other ingredients need actual supplier prices for accurate profit calculations.')}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {costingIngredients.map((ingredient) => (
                        <div
                          key={ingredient.id}
                          className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 bg-white"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-slate-900">{td(ingredient.name)}</div>
                            <div className="text-sm text-slate-500">{td('Unit:')} {ingredient.unit}</div>
                          </div>
                          <div className="w-48">
                            <Label htmlFor={`cost-${ingredient.id}`} className="text-xs text-slate-600">
                              {td('Cost per')} {ingredient.unit}
                            </Label>
                            <div className="relative mt-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                                IQD
                              </span>
                              <Input
                                id={`cost-${ingredient.id}`}
                                type="number"
                                min="0"
                                step="any"
                                value={ingredient.costPerUnit || ''}
                                onChange={(e) => updateIngredientCost(ingredient.id, e.target.value)}
                                className="pl-12"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">{td('Ingredients with prices:')}</span>
                        <span className="text-sm font-bold text-slate-900">
                          {costingIngredients.filter(ing => ing.costPerUnit > 0 || isZeroCostAllowed(ing.name)).length} / {costingIngredients.length}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCostingModalOpen(false)
                    setCostingMenuItem(null)
                    setCostingIngredients([])
                  }}
                  disabled={savingCosting}
                >
                  {t.common_cancel}
                </Button>
                <Button
                  onClick={saveCosting}
                  disabled={savingCosting || loadingIngredients || costingIngredients.length === 0}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {savingCosting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {td('Saving...')}
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      {td('Save & Complete')}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
