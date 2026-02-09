'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { Edit, Loader2, Trash, Check, X } from 'lucide-react'

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

/** 30% food cost target → 70% gross profit margin */
const TARGET_FOOD_COST = 0.3

function getMarginColor(margin: number) {
  if (margin >= 60) return 'text-green-600'
  if (margin >= 40) return 'text-amber-600'
  if (margin >= 20) return 'text-yellow-600'
  if (margin >= 0) return 'text-red-600'
  return 'text-red-700'
}

function getSuggestedPrice(cost: number): number {
  if (cost <= 0) return 0
  return Math.ceil(cost / TARGET_FOOD_COST)
}

export default function MenuItemsTable({
  menuItems,
}: {
  menuItems: MenuItemWithMetrics[]
}) {
  const [items, setItems] = useState(menuItems)
  const [updatingIds, setUpdatingIds] = useState<string[]>([])
  const [deletingIds, setDeletingIds] = useState<string[]>([])
  const [chefPickUpdatingIds, setChefPickUpdatingIds] = useState<string[]>([])
  const [menuItemToDelete, setMenuItemToDelete] =
    useState<MenuItemWithMetrics | null>(null)
  const itemsRef = useRef(items)
  const { toast } = useToast()

  // Inline price editing state
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [editingPriceValue, setEditingPriceValue] = useState('')
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)
  const priceInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setItems(menuItems)
  }, [menuItems])

  useEffect(() => {
    itemsRef.current = items
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

  return (
    <div className="overflow-x-auto">
      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500">
            No menu items found. Add your first menu item to get started.
          </p>
        </div>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Item Name
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Category
                </th>
                <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Availability
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Direct Cost
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Gross Profit
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Suggested Price
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Price
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isUpdating = updatingIds.includes(item.id)
                const isDeleting = deletingIds.includes(item.id)
                const isEditingPrice = editingPriceId === item.id
                const isSavingPrice = savingPriceId === item.id
                const costPercent =
                  item.price > 0 ? (item.cost / item.price) * 100 : 0
                const profitPercent = item.margin
                const suggestedPrice = getSuggestedPrice(item.cost)
                const priceDiff =
                  suggestedPrice > 0 ? item.price - suggestedPrice : 0

                return (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
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
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Draft</Badge>
                            )}
                            {item.costingStatus === 'INCOMPLETE' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">Costing incomplete</Badge>
                            )}
                          </div>
                          {item.chefPickOrder != null && (
                            <span className="text-[10px] uppercase tracking-wide text-amber-600">
                              Chef pick #{item.chefPickOrder}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 text-slate-600">
                      {item.category.name}
                    </td>

                    {/* Availability */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => toggleAvailability(item.id)}
                        className={`inline-flex items-center justify-center min-w-[100px] rounded-full px-3 py-1 text-xs font-semibold transition ${
                          item.available
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                        } ${isUpdating ? 'opacity-70 cursor-wait' : ''}`}
                      >
                        {isUpdating
                          ? 'Saving...'
                          : item.available
                          ? 'Available'
                          : 'Sold Out'}
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
                              className={`text-xs ${
                                priceDiff > 0
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
                        <Link href={`/dashboard/menu/${item.id}`}>
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
                <DialogTitle>Delete menu item</DialogTitle>
                <DialogDescription>
                  Are you sure you want to remove{' '}
                  <span className="font-medium">
                    {menuItemToDelete?.name ?? 'this item'}
                  </span>{' '}
                  from your menu? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMenuItemToDelete(null)}
                >
                  Cancel
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
                    ? 'Deleting...'
                    : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
