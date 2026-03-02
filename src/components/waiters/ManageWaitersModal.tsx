'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserPlus, Pencil, Trash2, Loader2 } from 'lucide-react'
import AddWaiterModal, { AddWaiterFormData } from './AddWaiterModal'
import { useI18n } from '@/lib/i18n'

interface Waiter {
  id: string
  name: string
  email: string | null
  isActive: boolean
}

interface ManageWaitersModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  waiters: Waiter[]
  onRefresh: () => void
}

export default function ManageWaitersModal({
  open,
  onOpenChange,
  waiters,
  onRefresh,
}: ManageWaitersModalProps) {
  const { t } = useI18n()
  const [showAddWaiter, setShowAddWaiter] = useState(false)
  const [editingWaiter, setEditingWaiter] = useState<Waiter | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [addingWaiter, setAddingWaiter] = useState(false)
  const [waiterError, setWaiterError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      onRefresh()
    }
  }, [open, onRefresh])

  const handleAddWaiter = async (formData: AddWaiterFormData) => {
    setWaiterError('')
    setAddingWaiter(true)
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          position: 'WAITER',
          salary: 0,
          salaryType: 'MONTHLY',
          hireDate: new Date().toISOString().split('T')[0],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWaiterError(data.error || 'Failed to add waiter')
        throw new Error(data.error)
      }
      setShowAddWaiter(false)
      onRefresh()
    } catch (err) {
      if (err instanceof Error && err.message) return
      setWaiterError('Failed to add waiter')
    } finally {
      setAddingWaiter(false)
    }
  }

  const handleEditWaiter = async (e: React.FormEvent) => {
    if (!editingWaiter) return
    e.preventDefault()
    setWaiterError('')
    try {
      const body: { name: string; email: string; password?: string } = {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
      }
      if (editPassword.trim()) {
        body.password = editPassword.trim()
      }
      const res = await fetch(`/api/employees/${editingWaiter.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setWaiterError(data.error || 'Failed to update waiter')
        return
      }
      setEditingWaiter(null)
      setEditName('')
      setEditEmail('')
      setEditPassword('')
      onRefresh()
    } catch {
      setWaiterError('Failed to update waiter')
    }
  }

  const handleDeleteWaiter = async (waiter: Waiter) => {
    if (!confirm(`Remove waiter "${waiter.name}"? They will no longer be able to sign in.`)) return
    setDeletingId(waiter.id)
    try {
      const res = await fetch(`/api/employees/${waiter.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json()
        setWaiterError(data.error || 'Failed to remove waiter')
        return
      }
      onRefresh()
      if (editingWaiter?.id === waiter.id) setEditingWaiter(null)
    } catch {
      setWaiterError('Failed to remove waiter')
    } finally {
      setDeletingId(null)
    }
  }

  const startEditing = (w: Waiter) => {
    setEditingWaiter(w)
    setEditName(w.name)
    setEditEmail(w.email || '')
    setEditPassword('')
    setWaiterError('')
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.tables_manage_waiters ?? 'Manage Waiters'}</DialogTitle>
            <DialogDescription>
              {t.tables_waiters_description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowAddWaiter(true)}>
                <UserPlus className="h-4 w-4 mr-1" />
                {t.tables_add_waiter}
              </Button>
            </div>

            {editingWaiter ? (
              <form onSubmit={handleEditWaiter} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <h4 className="font-medium text-slate-900">{t.tables_edit_waiter ?? 'Edit Waiter'}</h4>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>New password (optional)</Label>
                  <Input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                  />
                </div>
                {waiterError && <p className="text-sm text-red-600">{waiterError}</p>}
                <div className="flex gap-2">
                  <Button type="submit" size="sm">Save</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setEditingWaiter(null); setWaiterError('') }}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : waiterError ? (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{waiterError}</p>
            ) : null}

            <div className="max-h-64 overflow-y-auto space-y-2">
              {waiters.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  {t.tables_no_waiters}
                </div>
              ) : (
                waiters.map((w) => (
                  <div
                    key={w.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${w.isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 text-slate-500'}`}
                  >
                    <div>
                      <p className="font-medium text-slate-900">{w.name}</p>
                      <p className="text-xs text-slate-500">{w.email || (t.tables_no_email ?? 'No email')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${w.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {w.isActive ? (t.tables_active ?? 'Active') : (t.tables_inactive ?? 'Inactive')}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-slate-700"
                        onClick={() => startEditing(w)}
                        title={t.tables_edit_waiter ?? 'Edit'}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteWaiter(w)}
                        disabled={deletingId === w.id}
                        title={t.tables_delete_waiter ?? 'Remove'}
                      >
                        {deletingId === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddWaiterModal
        open={showAddWaiter}
        onOpenChange={(o) => { setShowAddWaiter(o); setWaiterError('') }}
        onSubmit={handleAddWaiter}
        loading={addingWaiter}
        error={waiterError || null}
      />
    </>
  )
}
