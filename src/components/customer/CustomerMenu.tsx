'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'

interface MenuItem {
  id: string
  name: string
  description?: string | null
  price: number
  imageUrl?: string | null
  category?: { name: string | null } | null
}

interface CustomerMenuProps {
  restaurantId: string
  restaurantName: string
  menuItems: MenuItem[]
}

export default function CustomerMenu({
  restaurantId,
  restaurantName,
  menuItems,
}: CustomerMenuProps) {
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return menuItems
    return menuItems.filter((item) => item.name.toLowerCase().includes(term))
  }, [menuItems, search])

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, quantity]) => {
        const item = menuItems.find((menuItem) => menuItem.id === id)
        if (!item) return null
        return { ...item, quantity }
      })
      .filter(Boolean) as (MenuItem & { quantity: number })[]
  }, [cart, menuItems])

  const total = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  const updateCart = (id: string, delta: number) => {
    setCart((prev) => {
      const next = { ...prev }
      const current = next[id] || 0
      const updated = current + delta
      if (updated <= 0) {
        delete next[id]
      } else {
        next[id] = updated
      }
      return next
    })
  }

  const submitOrder = async () => {
    if (cartItems.length === 0) return
    setLoading(true)
    try {
      const response = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          items: cartItems.map((item) => ({
            menuItemId: item.id,
            quantity: item.quantity,
          })),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to place order')
      }

      const data = await response.json()
      setOrderNumber(data.orderNumber)
      setCart({})
    } catch (error: any) {
      console.error('Error placing order:', error)
      alert(error.message || 'Failed to place order')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute -top-32 left-10 h-72 w-72 rounded-full bg-emerald-400 blur-[140px]" />
          <div className="absolute top-20 right-10 h-80 w-80 rounded-full bg-amber-400 blur-[160px]" />
        </div>
        <div className="relative mx-auto max-w-6xl px-6 py-16 space-y-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-200">
              Digital Menu
            </p>
            <h1 className="text-4xl font-bold sm:text-5xl">{restaurantName}</h1>
            <p className="mt-2 text-white/70">
              Browse the menu, build your order, and send it to the kitchen.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-[1.5fr_0.8fr]">
            <div className="space-y-6">
              <Input
                placeholder="Search dishes..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="bg-white/10 border-white/20 text-white"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredItems.map((item) => (
                  <Card key={item.id} className="overflow-hidden bg-white text-slate-900">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-40 w-full object-cover"
                      />
                    )}
                    <CardContent className="space-y-2 pt-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">{item.name}</h3>
                        <span className="text-sm font-bold text-emerald-700">
                          {formatCurrency(item.price)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {item.category?.name || 'Signature'}
                      </p>
                      {item.description && (
                        <p className="text-sm text-slate-600 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateCart(item.id, -1)}
                        >
                          -
                        </Button>
                        <span className="text-sm font-medium">
                          {cart[item.id] || 0}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateCart(item.id, 1)}
                        >
                          +
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white/10 p-6">
                <h2 className="text-lg font-semibold">Your Order</h2>
                {cartItems.length === 0 ? (
                  <p className="mt-3 text-sm text-white/60">
                    Add items to place an order.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {cartItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-white/60">{item.quantity}x</p>
                        </div>
                        <p className="text-sm font-semibold">
                          {formatCurrency(item.price * item.quantity)}
                        </p>
                      </div>
                    ))}
                    <div className="border-t border-white/20 pt-3 flex items-center justify-between">
                      <span className="text-sm text-white/70">Total</span>
                      <span className="text-lg font-bold">{formatCurrency(total)}</span>
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  size="lg"
                  className="mt-6 w-full"
                  disabled={cartItems.length === 0 || loading}
                  onClick={submitOrder}
                >
                  {loading ? 'Sending Order...' : 'Send to Kitchen'}
                </Button>
              </div>

              {orderNumber && (
                <div className="rounded-2xl border border-emerald-400/50 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                  Order received. Your order number is {orderNumber}.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
