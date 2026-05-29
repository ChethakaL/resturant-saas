'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { useDynamicTranslate } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Trash2, AlertTriangle, TrendingDown, TrendingUp, Mail, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getInventoryCategoryLabel } from '@/lib/inventory-categories'

type IngredientRow = {
  id: string
  name: string
  category: string
  unit: string
  costPerUnit: number
  supplier: string | null
  preferredSupplier: {
    id: string
    name: string
    email: string | null
    phone: string | null
    whatsapp: string | null
    leadTimeDays: number | null
    deliveryDays: string[]
  } | null
  purchaseTrend?: {
    latestUnitCost: number | null
    previousUnitCost: number | null
    percentChange: number | null
  }
}

type SupplierProduct = {
  id: string
  name: string
  packSize: number
  packUnit: string
  prices: { price: number; currency: string }[]
}

export function InventoryTable({
  ingredients,
  totalCount,
  totalPages,
  currentPage,
}: {
  ingredients: IngredientRow[]
  totalCount: number
  totalPages: number
  currentPage: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const inventoryHrefForPage = (pageNum: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(pageNum))
    return `/inventory?${params.toString()}`
  }
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [ingredientToDelete, setIngredientToDelete] = useState<IngredientRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientRow | null>(null)
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [quantity, setQuantity] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const { t } = useI18n()
  const { t: td } = useDynamicTranslate()

  useEffect(() => {
    setSelectedIds(new Set())
  }, [currentPage])

  const idsOnPage = ingredients.map((i) => i.id)
  const allOnPageSelected =
    idsOnPage.length > 0 && idsOnPage.every((id) => selectedIds.has(id))
  const someOnPageSelected = idsOnPage.some((id) => selectedIds.has(id))

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        idsOnPage.forEach((id) => next.delete(id))
      } else {
        idsOnPage.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const toggleRowSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openRequestModal = async (ingredient: IngredientRow) => {
    setSelectedIngredient(ingredient)
    setQuantity('')
    setSelectedProductId('')
    setRequestModalOpen(true)
    if (!ingredient.preferredSupplier?.id) {
      setProducts([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/supplier-products?supplierId=${encodeURIComponent(ingredient.preferredSupplier.id)}`
      )
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : [])
      if (data.length > 0) setSelectedProductId(data[0].id)
    } catch {
      toast({ title: td('Error'), description: td('Could not load supplier products'), variant: 'destructive' })
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const submitRequest = async () => {
    if (!selectedIngredient?.preferredSupplier?.id || !quantity || !selectedProductId) {
      toast({ title: td('Validation'), description: td('Select supplier product and enter quantity'), variant: 'destructive' })
      return
    }
    const product = products.find((p) => p.id === selectedProductId)
    const qty = parseFloat(quantity)
    if (!product || isNaN(qty) || qty <= 0) {
      toast({ title: td('Validation'), description: td('Invalid quantity'), variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/stock-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedIngredient.preferredSupplier.id,
          notes: `${td('Request for')} ${td(selectedIngredient.name)}`,
          lines: [
            { supplierProductId: selectedProductId, quantity: qty, unit: product.packUnit },
          ],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || td('Failed to create request'))
      }
      toast({ title: td('Request sent'), description: td('Stock request has been sent to the supplier.') })
      setRequestModalOpen(false)
      setSelectedIngredient(null)
    } catch (e) {
      toast({
        title: td('Error'),
        description: e instanceof Error ? e.message : td('Failed to create stock request'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const openDeleteDialog = (ingredient: IngredientRow) => {
    setIngredientToDelete(ingredient)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!ingredientToDelete) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/inventory/${ingredientToDelete.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || td('Failed to delete ingredient'))
      }

      toast({
        title: td('Ingredient deleted'),
        description: `${td(ingredientToDelete.name)} ${td('has been removed from inventory.')}`,
      })

      setDeleteDialogOpen(false)
      setIngredientToDelete(null)

      // Refresh the page to show updated list
      router.refresh()
    } catch (error) {
      toast({
        title: td('Error'),
        description: error instanceof Error ? error.message : td('Failed to delete ingredient'),
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleBulkDelete = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setBulkDeleting(true)
    try {
      const response = await fetch('/api/inventory/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : td('Failed to delete ingredients'))
      }
      const deleted = typeof data.deleted === 'number' ? data.deleted : 0
      toast({
        title: td('Ingredients deleted'),
        description: td('Removed {{count}} ingredient(s) from inventory.').replace('{{count}}', String(deleted)),
      })
      setBulkDeleteDialogOpen(false)
      setSelectedIds(new Set())
      router.refresh()
    } catch (error) {
      toast({
        title: td('Error'),
        description: error instanceof Error ? error.message : td('Failed to delete ingredients'),
        variant: 'destructive',
      })
    } finally {
      setBulkDeleting(false)
    }
  }

  const supplierName = (ing: IngredientRow) =>
    ing.preferredSupplier?.name ?? ing.supplier ?? '—'

  const buildSupplierMessage = () => {
    if (!selectedIngredient?.preferredSupplier) return ''
    const requestedQuantity = quantity.trim() || '[quantity]'
    return `Hello ${selectedIngredient.preferredSupplier.name}, we need ${requestedQuantity} ${selectedIngredient.unit} of ${selectedIngredient.name}. Please confirm availability and delivery timing.`
  }

  const whatsappHref = selectedIngredient?.preferredSupplier?.whatsapp
    ? `https://wa.me/${selectedIngredient.preferredSupplier.whatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent(buildSupplierMessage())}`
    : null

  const emailHref = selectedIngredient?.preferredSupplier?.email
    ? `mailto:${selectedIngredient.preferredSupplier.email}?subject=${encodeURIComponent(`Stock request for ${selectedIngredient.name}`)}&body=${encodeURIComponent(buildSupplierMessage())}`
    : null

  const renderTrend = (ingredient: IngredientRow) => {
    const change = ingredient.purchaseTrend?.percentChange
    if (change == null) {
      return <span className="text-xs text-slate-400">{td('No trend yet')}</span>
    }

    const isUp = change > 0
    const isDown = change < 0
    const colorClass = isUp ? 'text-red-600' : isDown ? 'text-green-600' : 'text-slate-500'
    const Icon = isUp ? TrendingUp : isDown ? TrendingDown : null
    const formatted = `${isUp ? '+' : ''}${change.toFixed(1)}%`

    return (
      <div className={`mt-1 flex items-center justify-end gap-1 text-xs ${colorClass}`}>
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        <span>{formatted}</span>
      </div>
    )
  }

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 p-3 rounded-lg border border-slate-200 bg-slate-50">
          <span className="text-sm text-slate-700">
            {td('{{count}} selected').replace('{{count}}', String(selectedIds.size))}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setSelectedIds(new Set())}>
              {td('Clear selection')}
            </Button>
            <Button variant="destructive" size="sm" type="button" onClick={() => setBulkDeleteDialogOpen(true)}>
              {td('Delete selected')}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3 md:hidden">
        {ingredients.map((ingredient) => (
          <div key={ingredient.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                checked={selectedIds.has(ingredient.id)}
                onChange={() => toggleRowSelected(ingredient.id)}
                aria-label={td('Select row')}
              />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="min-w-0">
                  <div className="break-words font-medium text-slate-900">{td(ingredient.name)}</div>
                  <Badge variant="secondary" className="mt-1">{td(getInventoryCategoryLabel(ingredient.category))}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.inventory_col_unit}</p>
                    <p className="mt-1 break-words text-slate-700">{td(ingredient.unit)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.inventory_col_supplier}</p>
                    <p className="mt-1 break-words text-slate-700">
                      {supplierName(ingredient) === '—' ? '—' : td(supplierName(ingredient))}
                    </p>
                  </div>
                  <div className="min-w-0 col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.inventory_col_cost_unit}</p>
                    <div className="mt-1 font-mono text-slate-900">{formatCurrency(ingredient.costPerUnit)}</div>
                    <div className="[&>div]:justify-start">{renderTrend(ingredient)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      ingredient.preferredSupplier
                        ? openRequestModal(ingredient)
                        : toast({
                          title: td('Set supplier first'),
                          description: td('Edit this ingredient and set a preferred supplier to request stock.'),
                          variant: 'destructive',
                        })
                    }
                  >
                    {t.inventory_request_more}
                  </Button>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Link href={`/inventory/${ingredient.id}`} className="min-w-0">
                      <Button variant="outline" size="sm" className="w-full">
                        {t.inventory_edit_btn}
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeleteDialog(ingredient)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      aria-label={td('Delete ingredient')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <table className="hidden w-full md:table">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="w-10 py-3 px-2 text-left align-middle">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={allOnPageSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected
                }}
                onChange={toggleSelectAllOnPage}
                aria-label={td('Select all on this page')}
              />
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
              {t.inventory_col_ingredient}
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
              {t.inventory_col_unit}
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
              {t.inventory_col_supplier}
            </th>
            <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
              {t.inventory_col_request}
            </th>
            <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
              {t.inventory_col_cost_unit}
            </th>
            <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
              {t.inventory_col_actions}
            </th>
          </tr>
        </thead>
        <tbody>
          {ingredients.map((ingredient) => (
            <tr key={ingredient.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-3 px-2 align-middle">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={selectedIds.has(ingredient.id)}
                  onChange={() => toggleRowSelected(ingredient.id)}
                  aria-label={td('Select row')}
                />
              </td>
              <td className="py-3 px-4">
                <div className="space-y-1">
                  <div className="font-medium text-slate-900">{td(ingredient.name)}</div>
                  <Badge variant="secondary">{td(getInventoryCategoryLabel(ingredient.category))}</Badge>
                </div>
              </td>
              <td className="py-3 px-4 text-slate-600">{td(ingredient.unit)}</td>
              <td className="py-3 px-4 text-slate-600">
                {supplierName(ingredient) === '—' ? '—' : td(supplierName(ingredient))}
              </td>
              <td className="py-3 px-4 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    ingredient.preferredSupplier
                      ? openRequestModal(ingredient)
                      : toast({
                        title: td('Set supplier first'),
                        description: td('Edit this ingredient and set a preferred supplier to request stock.'),
                        variant: 'destructive',
                      })
                  }
                >
                  {t.inventory_request_more}
                </Button>
              </td>
              <td className="py-3 px-4 text-right font-mono">
                <div>{formatCurrency(ingredient.costPerUnit)}</div>
                {renderTrend(ingredient)}
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link href={`/inventory/${ingredient.id}`}>
                    <Button variant="ghost" size="sm">
                      {t.inventory_edit_btn}
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDeleteDialog(ingredient)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {ingredients.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500">{t.inventory_no_ingredients}</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 mt-4">
          <p className="text-sm text-slate-500">
            {t.inventory_page_of
              .replace('{{current}}', String(currentPage))
              .replace('{{total}}', String(totalPages))
              .replace('{{count}}', String(totalCount))}
          </p>
          <div className="flex items-center gap-2">
            <Link href={inventoryHrefForPage(Math.max(currentPage - 1, 1))}>
              <Button variant="outline" size="sm" disabled={currentPage <= 1}>
                {t.inventory_previous}
              </Button>
            </Link>
            <Link href={inventoryHrefForPage(Math.min(currentPage + 1, totalPages))}>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages}>
                {t.inventory_next}
              </Button>
            </Link>
          </div>
        </div>
      )}

      <Dialog open={requestModalOpen} onOpenChange={setRequestModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.inventory_request_stock}</DialogTitle>
            <DialogDescription>
              {selectedIngredient && selectedIngredient.preferredSupplier && (
                <>
                  {t.inventory_request_stock_for
                    .replace('{{name}}', td(selectedIngredient.name))
                    .replace('{{supplier}}', td(selectedIngredient.preferredSupplier.name))}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedIngredient && (
            <div className="grid gap-4 py-4">
              {!selectedIngredient.preferredSupplier ? (
                <p className="text-sm text-slate-500">{t.inventory_no_preferred_supplier}</p>
              ) : (
                <>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">{td(selectedIngredient.preferredSupplier.name)}</p>
                    <p className="mt-1">
                      {[selectedIngredient.preferredSupplier.phone, selectedIngredient.preferredSupplier.email]
                        .filter(Boolean)
                        .join(' • ') || td('No direct contact details yet')}
                    </p>
                    {selectedIngredient.preferredSupplier.deliveryDays.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Delivery days: {selectedIngredient.preferredSupplier.deliveryDays.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label>{t.inventory_product}</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      disabled={loading}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {td(p.name)} ({p.packSize} {td(p.packUnit)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t.inventory_quantity}</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder={td('e.g. 50')}
                      disabled={submitting}
                    />
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">Message preview</p>
                    <p className="mt-1">{buildSupplierMessage()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {whatsappHref && (
                      <a href={whatsappHref} target="_blank" rel="noreferrer">
                        <Button type="button" variant="outline" size="sm">
                          <MessageCircle className="mr-2 h-4 w-4" />
                          WhatsApp
                        </Button>
                      </a>
                    )}
                    {emailHref && (
                      <a href={emailHref}>
                        <Button type="button" variant="outline" size="sm">
                          <Mail className="mr-2 h-4 w-4" />
                          Email
                        </Button>
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestModalOpen(false)}>{t.common_cancel}</Button>
            {selectedIngredient?.preferredSupplier && (
              <Button onClick={submitRequest} disabled={submitting || loading || !quantity}>
                {submitting ? t.inventory_sending : t.inventory_send_request}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {td('Delete selected ingredients?')}
            </DialogTitle>
            <DialogDescription>
              <div className="space-y-2 pt-2">
                <p>
                  {td('This will permanently remove {{count}} ingredient(s).').replace(
                    '{{count}}',
                    String(selectedIds.size)
                  )}
                </p>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-sm text-amber-900">⚠️ {t.inventory_delete_warning}</p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteDialogOpen(false)}
              disabled={bulkDeleting}
            >
              {t.common_cancel}
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? t.inventory_deleting : td('Delete all selected')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t.inventory_delete_confirm_title}
            </DialogTitle>
            <DialogDescription>
              {ingredientToDelete && (
                <div className="space-y-2 pt-2">
                  <p>
                    {t.inventory_delete_confirm_desc.replace('{{name}}', td(ingredientToDelete.name))}
                  </p>
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="text-sm text-amber-900">
                      ⚠️ {t.inventory_delete_warning}
                    </p>
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              {t.common_cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? t.inventory_deleting : t.inventory_delete_btn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
