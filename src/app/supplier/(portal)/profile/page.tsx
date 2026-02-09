'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type SupplierProfile = {
  id: string
  name: string
  email: string
  phone: string | null
  address: string | null
  lat: number | null
  lng: number | null
  deliveryAreas: string[]
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED'
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  SUSPENDED: 'destructive',
}

export default function SupplierProfilePage() {
  const [profile, setProfile] = useState<SupplierProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [deliveryAreas, setDeliveryAreas] = useState('')

  useEffect(() => {
    fetch('/api/supplier/profile')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load profile')
        return res.json()
      })
      .then((data: SupplierProfile) => {
        setProfile(data)
        setName(data.name)
        setPhone(data.phone ?? '')
        setAddress(data.address ?? '')
        setDeliveryAreas(data.deliveryAreas.join(', '))
      })
      .catch(() => {
        setMessage({ type: 'error', text: 'Failed to load profile.' })
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const areas = deliveryAreas
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean)

      const res = await fetch('/api/supplier/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: phone || null,
          address: address || null,
          deliveryAreas: areas,
        }),
      })

      if (!res.ok) throw new Error('Failed to save')

      const updated: SupplierProfile = await res.json()
      setProfile(updated)
      setName(updated.name)
      setPhone(updated.phone ?? '')
      setAddress(updated.address ?? '')
      setDeliveryAreas(updated.deliveryAreas.join(', '))
      setMessage({ type: 'success', text: 'Profile updated successfully.' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to save changes. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-slate-500">Loading profile...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-red-500">Could not load profile.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
          <p className="text-slate-600 mt-1">Manage your supplier account details.</p>
        </div>
        <Badge variant={statusVariant[profile.status] ?? 'outline'}>
          {profile.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={profile.email}
                readOnly
                disabled
                className="bg-slate-50 text-slate-500"
              />
              <p className="text-xs text-slate-400">Email cannot be changed.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+964 770 000 0000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Baghdad, Iraq"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deliveryAreas">Delivery Areas</Label>
              <Input
                id="deliveryAreas"
                value={deliveryAreas}
                onChange={(e) => setDeliveryAreas(e.target.value)}
                placeholder="Baghdad, Erbil, Basra"
              />
              <p className="text-xs text-slate-400">Comma-separated list of areas you deliver to.</p>
            </div>

            {message && (
              <p
                className={
                  message.type === 'success'
                    ? 'text-sm text-green-600'
                    : 'text-sm text-red-600'
                }
              >
                {message.text}
              </p>
            )}

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
