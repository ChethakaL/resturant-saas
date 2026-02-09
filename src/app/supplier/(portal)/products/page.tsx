'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, Plus, Pencil, Trash2, DollarSign, History } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

type SupplierProduct = {
  id: string
  name: string
  category: string
  packSize: number
  packUnit: string
  brand: string | null
  sku: string | null
  isActive: boolean
  prices: { price: number; currency: string }[]
}

type PriceHistory = {
  id: string
  price: number
  currency: string
  effectiveFrom: string
  effectiveTo: string | null
  minOrderQty: number | null
  createdAt: string
}

export default function SupplierProductsPage() {
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    category: 'Produce',
    packSize: '',
    packUnit: 'kg',
    brand: '',
    sku: '',
    isActive: true,
  })
  const [saving, setSaving] = useState(false)
  const [priceModalOpen, setPriceModalOpen] = useState(false)
  const [priceProductId, setPriceProductId] = useState<string | null>(null)
  const [priceProductName, setPriceProductName] = useState<string>('')
  const [priceForm, setPriceForm] = useState({
    price: '',
    currency: 'IQD',
    effectiveFrom: '',
    effectiveTo: '',
    minOrderQty: '',
  })
  const [priceSaving, setPriceSaving] = useState(false)
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([])
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const categories = ['Produce', 'Dairy', 'Meat', 'Seafood', 'Dry Goods', 'Beverages', 'Alcohol', 'Other']

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/supplier/products')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setProducts(data)
    } catch (e) {
      toast({ title: 'Error', description: 'Could not load products', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  // Open add-product modal when arriving from dashboard quick action (?add=1)
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setEditingId(null)
      setForm({
        name: '',
        category: 'Produce',
        packSize: '',
        packUnit: 'kg',
        brand: '',
        sku: '',
        isActive: true,
      })
      setModalOpen(true)
      window.history.replaceState({}, '', '/supplier/products')
    }
  }, [searchParams])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      name: '',
      category: 'Produce',
      packSize: '',
      packUnit: 'kg',
      brand: '',
      sku: '',
      isActive: true,
    })
    setModalOpen(true)
  }

  const openEdit = (p: SupplierProduct) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      category: p.category,
      packSize: String(p.packSize),
      packUnit: p.packUnit,
      brand: p.brand ?? '',
      sku: p.sku ?? '',
      isActive: p.isActive,
    })
    setModalOpen(true)
  }

  const handleSaveProduct = async () => {
    if (!form.name || !form.packSize) {
      toast({ title: 'Validation', description: 'Name and pack size are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        category: form.category,
        packSize: Number(form.packSize),
        packUnit: form.packUnit,
        brand: form.brand || null,
        sku: form.sku || null,
        isActive: form.isActive,
      }
      if (editingId) {
        const res = await fetch(`/api/supplier/products/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Update failed')
        toast({ title: 'Updated', description: 'Product updated successfully' })
      } else {
        const res = await fetch('/api/supplier/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Create failed')
        toast({ title: 'Created', description: 'Product added successfully' })
      }
      setModalOpen(false)
      fetchProducts()
    } catch (e) {
      toast({ title: 'Error', description: 'Could not save product', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product? Historical costs in restaurants will remain.')) return
    try {
      const res = await fetch(`/api/supplier/products/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast({ title: 'Deleted', description: 'Product removed' })
      fetchProducts()
    } catch (e) {
      toast({ title: 'Error', description: 'Could not delete product', variant: 'destructive' })
    }
  }

  const handleToggleActive = async (product: SupplierProduct) => {
    setTogglingId(product.id)
    try {
      const res = await fetch(`/api/supplier/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !product.isActive }),
      })
      if (!res.ok) throw new Error('Toggle failed')
      toast({
        title: product.isActive ? 'Deactivated' : 'Activated',
        description: `${product.name} is now ${product.isActive ? 'inactive' : 'active'}`,
      })
      fetchProducts()
    } catch (e) {
      toast({ title: 'Error', description: 'Could not update availability', variant: 'destructive' })
    } finally {
      setTogglingId(null)
    }
  }

  const fetchPriceHistory = useCallback(async (productId: string) => {
    setPriceHistoryLoading(true)
    try {
      const res = await fetch(`/api/supplier/products/${productId}/prices`)
      if (!res.ok) throw new Error('Failed to load price history')
      const data = await res.json()
      setPriceHistory(data)
    } catch (e) {
      toast({ title: 'Error', description: 'Could not load price history', variant: 'destructive' })
      setPriceHistory([])
    } finally {
      setPriceHistoryLoading(false)
    }
  }, [toast])

  const openPrice = (product: SupplierProduct) => {
    setPriceProductId(product.id)
    setPriceProductName(product.name)
    setPriceForm({
      price: '',
      currency: 'IQD',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      minOrderQty: '',
    })
    setPriceHistory([])
    setPriceModalOpen(true)
    fetchPriceHistory(product.id)
  }

  const handleSavePrice = async () => {
    if (!priceProductId || !priceForm.price) return
    setPriceSaving(true)
    try {
      const res = await fetch(`/api/supplier/products/${priceProductId}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: Number(priceForm.price),
          currency: priceForm.currency,
          effectiveFrom: priceForm.effectiveFrom || new Date().toISOString(),
          effectiveTo: priceForm.effectiveTo || null,
          minOrderQty: priceForm.minOrderQty ? Number(priceForm.minOrderQty) : null,
        }),
      })
      if (!res.ok) throw new Error('Failed to add price')
      toast({ title: 'Price added', description: 'New price is now active' })
      // Refresh price history without closing the modal
      fetchPriceHistory(priceProductId)
      // Reset form fields but keep the modal open
      setPriceForm({
        price: '',
        currency: priceForm.currency,
        effectiveFrom: new Date().toISOString().slice(0, 10),
        effectiveTo: '',
        minOrderQty: '',
      })
      fetchProducts()
    } catch (e) {
      toast({ title: 'Error', description: 'Could not add price', variant: 'destructive' })
    } finally {
      setPriceSaving(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-slate-500">Loading products...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Products</h1>
          <p className="text-slate-600 mt-1">Manage your ingredient catalog and pricing</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Add product
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Product list
          </CardTitle>
          <CardDescription>Ingredient name, category, pack size, and current price</CardDescription>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">
              No products yet. Add your first product to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Pack size</TableHead>
                  <TableHead>Brand / SKU</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell>{p.packSize} {p.packUnit}</TableCell>
                    <TableCell className="text-slate-600">
                      {[p.brand, p.sku].filter(Boolean).join(' / ') || '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0"
                        disabled={togglingId === p.id}
                        onClick={() => handleToggleActive(p)}
                        title={p.isActive ? 'Click to deactivate' : 'Click to activate'}
                      >
                        <Badge variant={p.isActive ? 'default' : 'secondary'} className="cursor-pointer">
                          {togglingId === p.id ? '...' : p.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </Button>
                    </TableCell>
                    <TableCell>
                      {p.prices[0] ? (
                        <span>{p.prices[0].price} {p.prices[0].currency}</span>
                      ) : (
                        <span className="text-slate-400">No price</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openPrice(p)} title="Set price / Price history">
                        <DollarSign className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit product modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit product' : 'Add product'}</DialogTitle>
            <DialogDescription>Ingredient name, category, pack size, and availability</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Tomatoes"
              />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Pack size</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.packSize}
                  onChange={(e) => setForm((f) => ({ ...f, packSize: e.target.value }))}
                  placeholder="10"
                />
              </div>
              <div className="grid gap-2">
                <Label>Unit</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={form.packUnit}
                  onChange={(e) => setForm((f) => ({ ...f, packUnit: e.target.value }))}
                >
                  {['kg', 'g', 'L', 'ml', 'pcs', 'box', 'case'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Brand (optional)</Label>
              <Input
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                placeholder="Brand name"
              />
            </div>
            <div className="grid gap-2">
              <Label>SKU / code (optional)</Label>
              <Input
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="SKU"
              />
            </div>
            {editingId && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded border-input"
                />
                <Label htmlFor="isActive">Available / in stock</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveProduct} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price history + Add price modal */}
      <Dialog open={priceModalOpen} onOpenChange={(open) => {
        setPriceModalOpen(open)
        if (!open) {
          setPriceProductId(null)
          setPriceProductName('')
          setPriceHistory([])
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Pricing &mdash; {priceProductName}
            </DialogTitle>
            <DialogDescription>
              View price history and add new prices. Previous prices are kept for historical costing.
            </DialogDescription>
          </DialogHeader>

          {/* Price history section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Price history</h3>
            {priceHistoryLoading ? (
              <p className="text-slate-500 text-sm py-4 text-center">Loading price history...</p>
            ) : priceHistory.length === 0 ? (
              <p className="text-slate-400 text-sm py-4 text-center">
                No price records yet. Add the first price below.
              </p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Price</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Effective from</TableHead>
                      <TableHead>Effective to</TableHead>
                      <TableHead>Min order qty</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceHistory.map((ph) => (
                      <TableRow key={ph.id}>
                        <TableCell className="font-medium">{ph.price}</TableCell>
                        <TableCell>{ph.currency}</TableCell>
                        <TableCell>{formatDate(ph.effectiveFrom)}</TableCell>
                        <TableCell>{formatDate(ph.effectiveTo)}</TableCell>
                        <TableCell>{ph.minOrderQty ?? '—'}</TableCell>
                        <TableCell className="text-slate-500">{formatDate(ph.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t my-2" />

          {/* Add new price form */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Add new price</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Price per pack</Label>
                <Input
                  type="number"
                  step="any"
                  value={priceForm.price}
                  onChange={(e) => setPriceForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={priceForm.currency}
                  onChange={(e) => setPriceForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  <option value="IQD">IQD</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Effective from</Label>
                <Input
                  type="date"
                  value={priceForm.effectiveFrom}
                  onChange={(e) => setPriceForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Effective to (optional)</Label>
                <Input
                  type="date"
                  value={priceForm.effectiveTo}
                  onChange={(e) => setPriceForm((f) => ({ ...f, effectiveTo: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Min order qty (optional)</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={priceForm.minOrderQty}
                onChange={(e) => setPriceForm((f) => ({ ...f, minOrderQty: e.target.value }))}
                placeholder="e.g. 5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceModalOpen(false)}>Close</Button>
            <Button onClick={handleSavePrice} disabled={priceSaving || !priceForm.price}>
              {priceSaving ? 'Adding...' : 'Add price'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
