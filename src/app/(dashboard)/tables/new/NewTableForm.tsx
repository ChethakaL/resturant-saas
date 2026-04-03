'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'

type BranchOption = {
  id: string
  name: string
  address: string | null
}

interface NewTableFormProps {
  branches: BranchOption[]
}

export default function NewTableForm({ branches }: NewTableFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [number, setNumber] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [branchId, setBranchId] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedNumber = number.trim()
    const parsedCapacity = Number.parseInt(capacity, 10)

    if (!trimmedNumber) {
      toast({ title: 'Table number is required', variant: 'destructive' })
      return
    }

    if (!Number.isFinite(parsedCapacity) || parsedCapacity < 1) {
      toast({ title: 'Seats must be at least 1', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: trimmedNumber,
          capacity: parsedCapacity,
          branchId: branchId || undefined,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast({
          title: 'Failed to create table',
          description: data?.error || 'Please try again',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Table created',
        description: `Table ${trimmedNumber} has been added.`,
      })
      router.push('/tables')
      router.refresh()
    } catch {
      toast({
        title: 'Failed to create table',
        description: 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="outline" size="sm" asChild>
        <Link href="/tables">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tables
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Add Table</CardTitle>
          <p className="text-sm text-slate-500">Create a new table for your restaurant floor.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="table-number">Table number</Label>
              <Input
                id="table-number"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="e.g. T21"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="table-capacity">Seats</Label>
              <Input
                id="table-capacity"
                type="number"
                min={1}
                step={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="table-branch">Branch</Label>
              <select
                id="table-branch"
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}{branch.address ? ` (${branch.address})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="outline" asChild>
                <Link href="/tables">Cancel</Link>
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Table
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
