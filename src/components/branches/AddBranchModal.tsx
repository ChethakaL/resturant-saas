'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2 } from 'lucide-react'

export interface AddBranchFormData {
  name: string
  address?: string | null
  phone?: string | null
}

interface AddBranchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: AddBranchFormData) => Promise<void>
  loading?: boolean
  /** Optional error message to show inside the modal (e.g. from parent state) */
  error?: string | null
}

export default function AddBranchModal({
  open,
  onOpenChange,
  onSubmit,
  loading = false,
  error = null,
}: AddBranchModalProps) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setAddress('')
      setPhone('')
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onSubmit({
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-500" />
            Add a New Branch
          </DialogTitle>
          <DialogDescription>
            Name and address are enough to get started. You can add or edit details later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="branch-name">Branch Name *</Label>
            <Input
              id="branch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Downtown Branch"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-address">Address (optional)</Label>
            <Input
              id="branch-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Main St"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-phone">Phone (optional)</Label>
            <Input
              id="branch-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +964 7XX XXX XXXX"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Adding...' : 'Add Branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
