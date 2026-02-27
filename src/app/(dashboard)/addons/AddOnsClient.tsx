'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Search, Loader2, PlusCircle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { AddOn } from '@prisma/client'
import { useI18n, useDynamicTranslate, useFormatCurrency } from '@/lib/i18n'

interface AddOnWithCount extends AddOn {
  _count: {
    menuItems: number
  }
}

interface AddOnsClientProps {
  addOns: AddOnWithCount[]
}

export default function AddOnsClient({ addOns: initialAddOns }: AddOnsClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const formatCurrencyWithRestaurant = useFormatCurrency()
  const [addOns, setAddOns] = useState(initialAddOns)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingAddOn, setEditingAddOn] = useState<AddOnWithCount | null>(null)
  const [deletingAddOn, setDeletingAddOn] = useState<AddOnWithCount | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
  })

  const filteredAddOns = addOns.filter(
    (addOn) =>
      addOn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      addOn.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const resetForm = () => {
    setFormData({ name: '', price: '', description: '' })
    setEditingAddOn(null)
  }

  const openCreateDialog = () => {
    resetForm()
    setShowDialog(true)
  }

  const openEditDialog = (addOn: AddOnWithCount) => {
    setEditingAddOn(addOn)
    setFormData({
      name: addOn.name,
      price: addOn.price.toString(),
      description: addOn.description || '',
    })
    setShowDialog(true)
  }

  const openDeleteDialog = (addOn: AddOnWithCount) => {
    setDeletingAddOn(addOn)
    setShowDeleteDialog(true)
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.price) {
      toast({
        title: 'Missing Information',
        description: 'Please enter a name and price',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      const url = editingAddOn ? `/api/addons/${editingAddOn.id}` : '/api/addons'
      const method = editingAddOn ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          price: parseFloat(formData.price),
          description: formData.description || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save add-on')
      }

      const savedAddOn = await response.json()

      if (editingAddOn) {
        setAddOns(
          addOns.map((a) =>
            a.id === savedAddOn.id ? { ...savedAddOn, _count: a._count } : a
          )
        )
        toast({ title: 'Add-on Updated', description: `${savedAddOn.name} has been updated` })
      } else {
        setAddOns([...addOns, { ...savedAddOn, _count: { menuItems: 0 } }])
        toast({ title: 'Add-on Created', description: `${savedAddOn.name} has been created` })
      }

      setShowDialog(false)
      resetForm()
      router.refresh()
    } catch (error) {
      console.error('Error saving add-on:', error)
      toast({
        title: 'Error',
        description: 'Failed to save add-on. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingAddOn) return

    setLoading(true)

    try {
      const response = await fetch(`/api/addons/${deletingAddOn.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete add-on')
      }

      setAddOns(addOns.filter((a) => a.id !== deletingAddOn.id))
      toast({ title: 'Add-on Deleted', description: `${deletingAddOn.name} has been deleted` })
      setShowDeleteDialog(false)
      setDeletingAddOn(null)
      router.refresh()
    } catch (error) {
      console.error('Error deleting add-on:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete add-on. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleAvailability = async (addOn: AddOnWithCount) => {
    try {
      const response = await fetch(`/api/addons/${addOn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: !addOn.available }),
      })

      if (!response.ok) {
        throw new Error('Failed to update availability')
      }

      setAddOns(
        addOns.map((a) =>
          a.id === addOn.id ? { ...a, available: !a.available } : a
        )
      )
      toast({
        title: addOn.available ? 'Add-on Disabled' : 'Add-on Enabled',
        description: `${addOn.name} is now ${addOn.available ? 'unavailable' : 'available'}`,
      })
    } catch (error) {
      console.error('Error updating availability:', error)
      toast({
        title: 'Error',
        description: 'Failed to update availability',
        variant: 'destructive',
      })
    }
  }

  const { t, currency } = useI18n()
  const { t: td } = useDynamicTranslate()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t.addons_title}</h1>
          <p className="text-slate-500 mt-1">
            {t.addons_subtitle}
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          {td('New Add-on')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">{td('Total Add-ons')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{addOns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">{td('Available')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {addOns.filter((a) => a.available).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">{td('Unavailable')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-400">
              {addOns.filter((a) => !a.available).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{td('All Add-ons')}</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={td('Search add-ons...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAddOns.length === 0 ? (
            <div className="text-center py-12">
              <PlusCircle className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500 mb-2">
                {searchQuery ? td('No add-ons match your search') : td('No add-ons yet')}
              </p>
              {!searchQuery && (
                <Button variant="outline" onClick={openCreateDialog}>
                  {td('Create your first add-on')}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAddOns.map((addOn) => (
                <div
                  key={addOn.id}
                  className={`border rounded-lg p-4 transition-colors ${addOn.available
                      ? 'bg-white border-slate-200'
                      : 'bg-slate-50 border-slate-200'
                    }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{addOn.name}</h3>
                      {addOn.description && (
                        <p className="text-sm text-slate-500 line-clamp-2 mt-1">
                          {addOn.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={addOn.available ? 'default' : 'secondary'}
                      className={`ml-2 cursor-pointer shrink-0 ${addOn.available
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      onClick={() => toggleAvailability(addOn)}
                    >
                      {addOn.available ? td('Available') : td('Unavailable')}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold font-mono text-slate-900">
                        {formatCurrencyWithRestaurant(addOn.price)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {td('Used in')} {addOn._count.menuItems} {addOn._count.menuItems !== 1 ? td('items') : td('item')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(addOn)}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => openDeleteDialog(addOn)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAddOn ? td('Edit Add-on') : td('Create New Add-on')}</DialogTitle>
            <DialogDescription>
              {editingAddOn
                ? td('Update the details for this add-on')
                : td('Add a new optional extra that customers can choose')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                {td('Name')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={td('e.g., Extra Cheese')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">
                {td('Price')} ({currency}) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{td('Description (optional)')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={td('Brief description of the add-on...')}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={loading}>
              {td('Cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {td('Saving...')}
                </>
              ) : editingAddOn ? (
                td('Save Changes')
              ) : (
                td('Create Add-on')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{td('Delete Add-on')}</DialogTitle>
            <DialogDescription>
              {td('Are you sure you want to delete this add-on? This action cannot be undone.')} &quot;{deletingAddOn?.name}&quot;
              {deletingAddOn && deletingAddOn._count.menuItems > 0 && (
                <span className="block mt-2 text-amber-600">
                  {td('Warning: This add-on is currently assigned to menu items.')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={loading}
            >
              {td('Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {td('Deleting...')}
                </>
              ) : (
                td('Delete Add-on')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
