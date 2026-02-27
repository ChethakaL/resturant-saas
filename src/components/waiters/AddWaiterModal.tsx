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
import { UserPlus } from 'lucide-react'

export interface AddWaiterFormData {
  name: string
  email: string
  password: string
}

interface AddWaiterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: AddWaiterFormData) => Promise<void>
  loading?: boolean
  error?: string | null
}

export default function AddWaiterModal({
  open,
  onOpenChange,
  onSubmit,
  loading = false,
  error = null,
}: AddWaiterModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setEmail('')
      setPassword('')
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password.trim()) return
    await onSubmit({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-500" />
            Add Waiter
          </DialogTitle>
          <DialogDescription>
            Create a waiter account so they can sign in to the Waiter Portal and manage tables and orders with your restaurant&apos;s menu.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="waiter-name">Full Name *</Label>
            <Input
              id="waiter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ahmed Hassan"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="waiter-email">Email *</Label>
            <Input
              id="waiter-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="waiter@restaurant.com"
              required
            />
            <p className="text-xs text-slate-500">They will use this email to sign in at /waiter/login</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="waiter-password">Password *</Label>
            <Input
              id="waiter-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
            <p className="text-xs text-slate-500">At least 6 characters. Share this securely with the waiter.</p>
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim() || !email.trim() || !password.trim()}>
              {loading ? 'Creating...' : 'Add Waiter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
