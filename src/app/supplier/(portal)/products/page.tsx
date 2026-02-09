'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, Plus, Pencil, Trash2, DollarSign } from 'lucide-react'
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
  const [priceForm, setPriceForm] = useState({ price: '', currency: 'IQD', effectiveFrom: '' })
  const [priceSaving, setPriceSaving] = useState(false)
  const { toast } = useToast()

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

  const openPrice = (productId: string) => {
    setPriceProductId(productId)
    setPriceForm({
      price: '',
      currency: 'IQD',
      effectiveFrom: new Date().toISOString().slice(0, 10),
    })
    setPriceModalOpen(true)
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
        }),
      })
      if (!res.ok) throw new Error('Failed to add price')
      toast({ title: 'Price added', description: 'New price is now active' })
      setPriceModalOpen(false)
      setPriceProductId(null)
      fetchProducts()
    } catch (e) {
      toast({ title: 'Error', description: 'Could not add price', variant: 'destructive' })
    } finally {
      setPriceSaving(false)
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
                      <Badge variant={p.isActive ? 'default' : 'secondary'}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.prices[0] ? (
                        <span>{p.prices[0].price} {p.prices[0].currency}</span>
                      ) : (
                        <span className="text-slate-400">No price</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openPrice(p.id)} title="Set price">
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

      <Dialog open={priceModalOpen} onOpenChange={setPriceModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set new price</DialogTitle>
            <DialogDescription>Add a new price. The previous price is kept for historical costing.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
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
            <div className="grid gap-2">
              <Label>Effective from</Label>
              <Input
                type="date"
                value={priceForm.effectiveFrom}
                onChange={(e) => setPriceForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePrice} disabled={priceSaving || !priceForm.price}>
              {priceSaving ? 'Adding...' : 'Add price'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
