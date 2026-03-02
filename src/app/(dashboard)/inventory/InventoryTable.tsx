'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFormatCurrency } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Trash2, AlertTriangle } from 'lucide-react'

type IngredientRow = {
  id: string
  name: string
  unit: string
  costPerUnit: number
  supplier: string | null
  preferredSupplier: { id: string; name: string } | null
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
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [ingredientToDelete, setIngredientToDelete] = useState<IngredientRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientRow | null>(null)
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [quantity, setQuantity] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const formatCurrencyWithRestaurant = useFormatCurrency()
  const { t } = useI18n()

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
      toast({ title: 'Error', description: 'Could not load supplier products', variant: 'destructive' })
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const submitRequest = async () => {
    if (!selectedIngredient?.preferredSupplier?.id || !quantity || !selectedProductId) {
      toast({ title: 'Validation', description: 'Select supplier product and enter quantity', variant: 'destructive' })
      return
    }
    const product = products.find((p) => p.id === selectedProductId)
    const qty = parseFloat(quantity)
    if (!product || isNaN(qty) || qty <= 0) {
      toast({ title: 'Validation', description: 'Invalid quantity', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/stock-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedIngredient.preferredSupplier.id,
          notes: `Request for ${selectedIngredient.name}`,
          lines: [
            { supplierProductId: selectedProductId, quantity: qty, unit: product.packUnit },
          ],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create request')
      }
      toast({ title: 'Request sent', description: 'Stock request has been sent to the supplier.' })
      setRequestModalOpen(false)
      setSelectedIngredient(null)
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to create stock request',
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
        throw new Error(error.error || 'Failed to delete ingredient')
      }

      toast({
        title: 'Ingredient deleted',
        description: `${ingredientToDelete.name} has been removed from inventory.`,
      })

      setDeleteDialogOpen(false)
      setIngredientToDelete(null)

      // Refresh the page to show updated list
      router.refresh()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete ingredient',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  const supplierName = (ing: IngredientRow) =>
    ing.preferredSupplier?.name ?? ing.supplier ?? '—'

  return (
    <>
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200">
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
              <td className="py-3 px-4">
                <div className="font-medium text-slate-900">{ingredient.name}</div>
              </td>
              <td className="py-3 px-4 text-slate-600">{ingredient.unit}</td>
              <td className="py-3 px-4 text-slate-600">{supplierName(ingredient)}</td>
              <td className="py-3 px-4 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    ingredient.preferredSupplier
                      ? openRequestModal(ingredient)
                      : toast({
                        title: 'Set supplier first',
                        description: 'Edit this ingredient and set a preferred supplier to request stock.',
                        variant: 'destructive',
                      })
                  }
                >
                  {t.inventory_request_more}
                </Button>
              </td>
              <td className="py-3 px-4 text-right font-mono">
                {formatCurrencyWithRestaurant(ingredient.costPerUnit)}
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
            <Link href={`/inventory?page=${Math.max(currentPage - 1, 1)}`}>
              <Button variant="outline" size="sm" disabled={currentPage <= 1}>
                {t.inventory_previous}
              </Button>
            </Link>
            <Link href={`/inventory?page=${Math.min(currentPage + 1, totalPages)}`}>
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
                    .replace('{{name}}', selectedIngredient.name)
                    .replace('{{supplier}}', selectedIngredient.preferredSupplier.name)}
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
                          {p.name} ({p.packSize} {p.packUnit})
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
                      placeholder="e.g. 50"
                      disabled={submitting}
                    />
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
                    {t.inventory_delete_confirm_desc.replace('{{name}}', ingredientToDelete.name)}
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
