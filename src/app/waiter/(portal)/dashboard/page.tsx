'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Types
interface MenuItem {
    id: string
    name: string
    price: number
    description?: string | null
    imageUrl?: string | null
    category?: { id: string; name: string } | null
}

interface Category {
    id: string
    name: string
    menuItems: MenuItem[]
}

interface SaleItem {
    id: string
    menuItemId: string
    quantity: number
    price: number
    menuItem: MenuItem
}

interface Table {
    id: string
    number: string
    capacity: number
    status: string
    sales: Order[]
}

interface Waiter {
    id: string
    name: string
}

interface Order {
    id: string
    orderNumber: string
    total: number
    status: string
    customerName?: string | null
    notes?: string | null
    timestamp: string
    tableId?: string | null
    table?: { id: string; number: string } | null
    waiter?: Waiter | null
    items: SaleItem[]
}

interface CartItem {
    menuItem: MenuItem
    quantity: number
}

// ─── Status Badge (simplified: Pending or Delivered) ───
function StatusBadge({ status }: { status: string }) {
    const isPending = ['PENDING', 'PREPARING', 'READY'].includes(status)
    const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
        PENDING: { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500', label: 'Pending' },
        PREPARING: { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500', label: 'Pending' },
        READY: { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500', label: 'Pending' },
        COMPLETED: { bg: 'bg-slate-100', text: 'text-slate-800', dot: 'bg-slate-500', label: 'Delivered' },
        CANCELLED: { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500', label: 'Cancelled' },
    }
    const c = config[status] || (isPending ? config.PENDING : config.COMPLETED)
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
            {c.label}
        </span>
    )
}

// ─── Table Card (admin-style light theme) ───
function TableCard({
    table,
    isSelected,
    onClick,
}: {
    table: Table
    isSelected: boolean
    onClick: () => void
}) {
    const hasActiveOrders = table.sales.length > 0
    const statusColor =
        table.status === 'OCCUPIED'
            ? 'bg-rose-50 border-rose-200'
            : table.status === 'RESERVED'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200'

    const statusIcon =
        table.status === 'OCCUPIED' ? '🍽️' : table.status === 'RESERVED' ? '📋' : '✅'

    return (
        <button
            onClick={onClick}
            className={`
        group relative rounded-xl border p-4 transition-all duration-200 ${statusColor}
        ${isSelected ? 'ring-2 ring-emerald-500 scale-[1.02] shadow-lg' : 'hover:shadow-md'}
        active:scale-[0.98]
      `}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-slate-900">T{table.number}</span>
                <span className="text-lg">{statusIcon}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                </svg>
                {table.capacity} seats
            </div>
            {hasActiveOrders && (
                <div className="mt-2 flex items-center gap-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-800">
                        {table.sales.length} order{table.sales.length > 1 ? 's' : ''}
                    </span>
                </div>
            )}
        </button>
    )
}

// ─── New Order Panel ───
function NewOrderPanel({
    tableId,
    tableNumber,
    categories,
    currency,
    onOrderCreated,
    onClose,
}: {
    tableId: string
    tableNumber: string
    categories: Category[]
    currency: string
    onOrderCreated: () => void
    onClose: () => void
}) {
    const [cart, setCart] = useState<CartItem[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [notes, setNotes] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const addToCart = (item: MenuItem) => {
        setCart((prev) => {
            const existing = prev.find((c) => c.menuItem.id === item.id)
            if (existing) {
                return prev.map((c) =>
                    c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
                )
            }
            return [...prev, { menuItem: item, quantity: 1 }]
        })
    }

    const updateQuantity = (itemId: string, delta: number) => {
        setCart((prev) =>
            prev
                .map((c) =>
                    c.menuItem.id === itemId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c
                )
                .filter((c) => c.quantity > 0)
        )
    }

    const cartTotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0)

    const filteredItems = categories.flatMap((cat) =>
        cat.menuItems
            .filter((item) => {
                if (selectedCategory !== 'all' && cat.id !== selectedCategory) return false
                if (searchTerm && !item.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
                return true
            })
            .map((item) => ({ ...item, categoryName: cat.name }))
    )

    const submitOrder = async () => {
        if (cart.length === 0) return
        setIsSubmitting(true)
        try {
            const res = await fetch('/api/waiter/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tableId,
                    customerName: customerName || undefined,
                    notes: notes || undefined,
                    items: cart.map((c) => ({
                        menuItemId: c.menuItem.id,
                        quantity: c.quantity,
                    })),
                }),
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to create order')
            }
            onOrderCreated()
        } catch (err: any) {
            alert(err.message || 'Failed to create order')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative ml-auto w-full max-w-4xl bg-slate-900 border-l border-white/10 flex flex-col overflow-hidden animate-slide-in-right">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10 bg-slate-900/80 backdrop-blur">
                    <div>
                        <h2 className="text-xl font-bold text-white">New Order — Table {tableNumber}</h2>
                        <p className="text-sm text-slate-400 mt-0.5">Select items to add to this order</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Menu items section */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Search + filter */}
                        <div className="p-4 space-y-3 border-b border-white/5">
                            <div className="relative">
                                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search menu items..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                />
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                <button
                                    onClick={() => setSelectedCategory('all')}
                                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedCategory === 'all'
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                        }`}
                                >
                                    All
                                </button>
                                {categories.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedCategory === cat.id
                                            ? 'bg-amber-500 text-white'
                                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                            }`}
                                    >
                                        {cat.name} ({cat.menuItems.length})
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Items grid */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {filteredItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                    <p>No menu items found</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {filteredItems.map((item) => {
                                        const inCart = cart.find((c) => c.menuItem.id === item.id)
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => addToCart(item)}
                                                className={`
                                                  group relative text-left rounded-xl border transition-all duration-150 overflow-hidden flex flex-col h-full
                                                  ${inCart
                                                        ? 'bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/20 shadow-lg shadow-amber-500/5'
                                                        : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                                                    }
                                                  active:scale-[0.97]
                                                `}
                                            >
                                                <div className="relative w-full h-32 sm:h-36 md:h-40 bg-slate-800 shrink-0 overflow-hidden">
                                                    {item.imageUrl ? (
                                                        <img
                                                            src={item.imageUrl}
                                                            alt={item.name}
                                                            className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
                                                            onError={(e) => {
                                                                (e.target as any).style.display = 'none';
                                                                (e.target as any).nextSibling.style.display = 'flex';
                                                            }}
                                                        />
                                                    ) : null}
                                                    <div className={`w-full h-full ${item.imageUrl ? 'hidden' : 'flex'} items-center justify-center text-slate-700 bg-slate-800/50`}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                                            <polyline points="21 15 16 10 5 21" />
                                                        </svg>
                                                    </div>
                                                    {inCart && (
                                                        <div className="absolute top-2 right-2 z-10">
                                                            <span className="w-7 h-7 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center shadow-lg border border-slate-900">
                                                                {inCart.quantity}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-3">
                                                    <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                                                    <p className="text-[10px] text-slate-500">{(item as any).categoryName}</p>
                                                    <p className="text-sm font-bold text-amber-400 mt-2">
                                                        {item.price.toLocaleString()} {currency}
                                                    </p>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Cart sidebar */}
                    <div className="w-80 border-l border-white/10 flex flex-col bg-slate-950/50">
                        <div className="p-4 border-b border-white/5">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="9" cy="21" r="1" />
                                    <circle cx="20" cy="21" r="1" />
                                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                </svg>
                                Order ({cart.length} items)
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {cart.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-8">Tap items to add</p>
                            ) : (
                                cart.map((c) => (
                                    <div key={c.menuItem.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl p-2 pr-3">
                                        <div className="h-10 w-10 bg-slate-800 rounded-lg overflow-hidden shrink-0">
                                            {c.menuItem.imageUrl ? (
                                                <img src={c.menuItem.imageUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-700 text-[10px] font-bold">
                                                    {c.menuItem.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{c.menuItem.name}</p>
                                            <p className="text-xs text-amber-400">{(c.menuItem.price * c.quantity).toLocaleString()} {currency}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => updateQuantity(c.menuItem.id, -1)}
                                                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
                                            >
                                                −
                                            </button>
                                            <span className="w-8 text-center text-sm font-medium text-white">{c.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(c.menuItem.id, 1)}
                                                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Customer name + notes */}
                        <div className="p-4 border-t border-white/5 space-y-2">
                            <input
                                type="text"
                                placeholder="Customer name (optional)"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                            />
                            <textarea
                                placeholder="Order notes..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30 resize-none"
                            />
                        </div>

                        {/* Submit */}
                        <div className="p-4 border-t border-white/10 bg-slate-900">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm text-slate-400">Total</span>
                                <span className="text-xl font-bold text-white">{cartTotal.toLocaleString()} {currency}</span>
                            </div>
                            <button
                                onClick={submitOrder}
                                disabled={cart.length === 0 || isSubmitting}
                                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-semibold rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                            >
                                {isSubmitting ? 'Placing Order...' : 'Place Order'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
        </div>
    )
}

// ─── Order Detail Panel ───
function OrderDetailPanel({
    order,
    currency,
    categories,
    onUpdate,
    onClose,
}: {
    order: Order
    currency: string
    categories: Category[]
    onUpdate: () => void
    onClose: () => void
}) {
    const [isUpdating, setIsUpdating] = useState(false)
    const [showAddItems, setShowAddItems] = useState(false)
    const [addItemCart, setAddItemCart] = useState<CartItem[]>([])
    const [addItemSearch, setAddItemSearch] = useState('')

    const updateStatus = async (newStatus: string) => {
        setIsUpdating(true)
        try {
            const res = await fetch(`/api/waiter/orders/${order.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })
            if (!res.ok) throw new Error('Failed to update')
            onUpdate()
        } catch {
            alert('Failed to update order status')
        } finally {
            setIsUpdating(false)
        }
    }

    const removeItem = async (saleItemId: string) => {
        if (!confirm('Remove this item from the order?')) return
        setIsUpdating(true)
        try {
            const res = await fetch(`/api/waiter/orders/${order.id}?saleItemId=${saleItemId}`, {
                method: 'DELETE',
            })
            if (!res.ok) throw new Error('Failed to remove item')
            onUpdate()
        } catch {
            alert('Failed to remove item')
        } finally {
            setIsUpdating(false)
        }
    }

    const addItemsToCart = (item: MenuItem) => {
        setAddItemCart((prev) => {
            const existing = prev.find((c) => c.menuItem.id === item.id)
            if (existing) {
                return prev.map((c) =>
                    c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
                )
            }
            return [...prev, { menuItem: item, quantity: 1 }]
        })
    }

    const submitAdditionalItems = async () => {
        if (addItemCart.length === 0) return
        setIsUpdating(true)
        try {
            const res = await fetch(`/api/waiter/orders/${order.id}/add-items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: addItemCart.map((c) => ({
                        menuItemId: c.menuItem.id,
                        quantity: c.quantity,
                    })),
                }),
            })
            if (!res.ok) throw new Error('Failed to add items')
            setAddItemCart([])
            setShowAddItems(false)
            onUpdate()
        } catch {
            alert('Failed to add items to order')
        } finally {
            setIsUpdating(false)
        }
    }

    const isModifiable = !['COMPLETED', 'CANCELLED'].includes(order.status)

    const allMenuItems = categories.flatMap((c) =>
        c.menuItems.map((item) => ({ ...item, categoryName: c.name }))
    )

    const filteredAddItems = allMenuItems.filter(
        (item) => !addItemSearch || item.name.toLowerCase().includes(addItemSearch.toLowerCase())
    )

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative ml-auto w-full max-w-lg bg-slate-900 border-l border-white/10 flex flex-col overflow-hidden animate-slide-in-right">
                {/* Header */}
                <div className="p-5 border-b border-white/10 bg-slate-900/80 backdrop-blur">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold text-white">{order.orderNumber}</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <StatusBadge status={order.status} />
                        {order.table && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                </svg>
                                Table {order.table.number}
                            </span>
                        )}
                        {order.customerName && (
                            <span className="text-xs text-slate-400">{order.customerName}</span>
                        )}
                    </div>
                    {order.notes && (
                        <p className="text-xs text-slate-500 mt-2 bg-white/5 rounded-lg p-2">📝 {order.notes}</p>
                    )}
                </div>

                {/* Items list */}
                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">Order Items</h3>
                    <div className="space-y-2">
                        {order.items.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl p-3 group"
                            >
                                <div className="h-10 w-10 bg-slate-800 rounded-lg overflow-hidden shrink-0">
                                    {item.menuItem.imageUrl ? (
                                        <img src={item.menuItem.imageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-700 text-[10px] font-bold">
                                            {item.menuItem.name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white">{item.menuItem.name}</p>
                                    <p className="text-xs text-slate-500">
                                        {item.quantity} × {item.price.toLocaleString()} {currency}
                                    </p>
                                </div>
                                <p className="text-sm font-semibold text-amber-400 shrink-0">
                                    {(item.price * item.quantity).toLocaleString()} {currency}
                                </p>
                                {isModifiable && (
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        disabled={isUpdating}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Add items section */}
                    {showAddItems && isModifiable && (
                        <div className="mt-4 border border-white/10 rounded-xl p-4 bg-white/[0.02]">
                            <h4 className="text-sm font-semibold text-white mb-3">Add More Items</h4>
                            <input
                                type="text"
                                placeholder="Search..."
                                value={addItemSearch}
                                onChange={(e) => setAddItemSearch(e.target.value)}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30 mb-3"
                            />
                            <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                                {filteredAddItems.map((item) => {
                                    const inCart = addItemCart.find((c) => c.menuItem.id === item.id)
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => addItemsToCart(item)}
                                            className={`w-full text-left flex items-center gap-3 p-2 rounded-lg transition-colors ${inCart ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-white/5 border border-transparent'
                                                }`}
                                        >
                                            <div className="h-10 w-10 bg-slate-800 rounded-lg overflow-hidden shrink-0">
                                                {item.imageUrl ? (
                                                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-700 text-[10px] font-bold">
                                                        {item.name.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{item.name}</p>
                                                <p className="text-[10px] text-slate-500">{item.categoryName}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-amber-400">{item.price.toLocaleString()} {currency}</span>
                                                {inCart && (
                                                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                                                        {inCart.quantity}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                            {addItemCart.length > 0 && (
                                <button
                                    onClick={submitAdditionalItems}
                                    disabled={isUpdating}
                                    className="mt-3 w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-40 active:scale-[0.98]"
                                >
                                    Add {addItemCart.reduce((s, c) => s + c.quantity, 0)} Items
                                </button>
                            )}
                        </div>
                    )}

                    {/* Total */}
                    <div className="mt-4 flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/5">
                        <span className="text-sm text-slate-400">Total</span>
                        <span className="text-2xl font-bold text-white">{order.total.toLocaleString()} {currency}</span>
                    </div>
                </div>

                {/* Action buttons */}
                {isModifiable && (
                    <div className="p-5 border-t border-white/10 bg-slate-900 space-y-3">
                        {!showAddItems && (
                            <button
                                onClick={() => setShowAddItems(true)}
                                className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium rounded-xl transition-all active:scale-[0.98]"
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                    Add More Items
                                </span>
                            </button>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            {['PENDING', 'PREPARING', 'READY'].includes(order.status) && (
                                <button
                                    onClick={() => updateStatus('COMPLETED')}
                                    disabled={isUpdating}
                                    className="py-3 col-span-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-40 active:scale-[0.98]"
                                >
                                    ✓ Mark delivered
                                </button>
                            )}
                            {['PENDING', 'PREPARING', 'READY'].includes(order.status) && (
                                <button
                                    onClick={() => {
                                        if (confirm('Cancel this order?')) updateStatus('CANCELLED')
                                    }}
                                    disabled={isUpdating}
                                    className="py-3 col-span-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-semibold rounded-xl transition-all disabled:opacity-40 active:scale-[0.98]"
                                >
                                    ✕ Cancel
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
        </div>
    )
}

// ─── Main Dashboard ───
export default function WaiterDashboard() {
    const { data: session, status: authStatus } = useSession()
    const router = useRouter()
    const searchParams = useSearchParams()
    const tabParam = searchParams.get('tab')

    const [tables, setTables] = useState<Table[]>([])
    const [myOrders, setMyOrders] = useState<Order[]>([])
    const [kitchenOrders, setKitchenOrders] = useState<Order[]>([])
    const [unconfirmedOrders, setUnconfirmedOrders] = useState<Order[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [activeTab, setActiveTab] = useState<'tables' | 'orders' | 'kitchen'>(tabParam === 'orders' ? 'orders' : tabParam === 'kitchen' ? 'kitchen' : 'tables')
    const [selectedTable, setSelectedTable] = useState<Table | null>(null)
    const [showNewOrder, setShowNewOrder] = useState(false)
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
    const [orderFilter, setOrderFilter] = useState<'active' | 'all' | 'COMPLETED'>('active')
    const [orderSearchTable, setOrderSearchTable] = useState('')
    const [orderSort, setOrderSort] = useState<'newest' | 'oldest' | 'expensive' | 'cheap'>('newest')
    const [kitchenSort, setKitchenSort] = useState<'oldest' | 'newest' | 'expensive' | 'cheap'>('oldest')
    const [isLoading, setIsLoading] = useState(true)

    const { currency } = useI18n()

    const fetchTables = useCallback(async () => {
        try {
            const res = await fetch('/api/waiter/tables')
            if (res.ok) {
                const data = await res.json()
                setTables(data)
            }
        } catch (err) {
            console.error('Failed to fetch tables:', err)
        }
    }, [])

    const fetchOrders = useCallback(async () => {
        try {
            const res = await fetch(`/api/waiter/orders?myOnly=true&status=${orderFilter}`)
            if (res.ok) {
                const data = await res.json()
                setMyOrders(data)
            }
        } catch (err) {
            console.error('Failed to fetch orders:', err)
        }
    }, [orderFilter])

    const fetchKitchenOrders = useCallback(async () => {
        try {
            const res = await fetch(`/api/waiter/orders?myOnly=false&status=active`)
            if (res.ok) {
                const data = await res.json()
                setKitchenOrders(data)
            }
        } catch (err) {
            console.error('Failed to fetch kitchen orders:', err)
        }
    }, [])

    const fetchMenu = useCallback(async () => {
        try {
            const res = await fetch('/api/waiter/menu')
            if (res.ok) {
                const data = await res.json()
                setCategories(data)
            }
        } catch (err) {
            console.error('Failed to fetch menu:', err)
        }
    }, [])

    const fetchUnconfirmedOrders = useCallback(async () => {
        try {
            const res = await fetch('/api/waiter/orders?unassigned=true')
            if (res.ok) {
                const data = await res.json()
                setUnconfirmedOrders(data)
            }
        } catch (err) {
            console.error('Failed to fetch unconfirmed orders:', err)
        }
    }, [])

    useEffect(() => {
        if (authStatus === 'unauthenticated') {
            router.push('/waiter/login')
            return
        }
        if (authStatus === 'authenticated') {
            Promise.all([
                fetchTables(),
                fetchOrders(),
                fetchKitchenOrders(),
                fetchMenu(),
                fetchUnconfirmedOrders(),
            ]).finally(() => setIsLoading(false))

            // Auto-refresh every 15 seconds (for new QR orders)
            const interval = setInterval(() => {
                fetchTables()
                fetchOrders()
                fetchKitchenOrders()
                fetchUnconfirmedOrders()
            }, 15000)
            return () => clearInterval(interval)
        }
    }, [authStatus, router, fetchTables, fetchOrders, fetchKitchenOrders, fetchMenu, fetchUnconfirmedOrders])

    useEffect(() => {
        if (authStatus === 'authenticated') {
            fetchOrders()
        }
    }, [orderFilter, authStatus, fetchOrders])

    useEffect(() => {
        if (authStatus === 'authenticated') {
            fetchKitchenOrders()
        }
    }, [authStatus, fetchKitchenOrders])

    useEffect(() => {
        setActiveTab(tabParam === 'orders' ? 'orders' : tabParam === 'kitchen' ? 'kitchen' : 'tables')
    }, [tabParam])

    const handleRefresh = () => {
        fetchTables()
        fetchOrders()
        fetchKitchenOrders()
        fetchUnconfirmedOrders()
    }

    const handleOrderCreated = () => {
        setShowNewOrder(false)
        setSelectedTable(null)
        handleRefresh()
    }

    const handleOrderUpdated = () => {
        handleRefresh()
        // Refresh the selected order
        if (selectedOrder) {
            fetch(`/api/waiter/orders?myOnly=true&status=${orderFilter}`)
                .then((r) => r.json())
                .then((orders) => {
                    const updated = orders.find((o: Order) => o.id === selectedOrder.id)
                    if (updated) {
                        setSelectedOrder(updated)
                    } else {
                        setSelectedOrder(null)
                    }
                })
                .catch(() => { })
        }
    }

    if (authStatus === 'loading' || isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
                    <p className="text-slate-600 text-sm">Loading waiter dashboard...</p>
                </div>
            </div>
        )
    }

    const activeOrders = myOrders.filter((o) => ['PENDING', 'PREPARING', 'READY'].includes(o.status))

    return (
        <>
            {/* Content - admin-style light theme, sidebar provides nav */}
            <main className="space-y-6">
                {unconfirmedOrders.length > 0 && (
                    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                        <p className="text-sm font-semibold text-amber-900 mb-3">
                            🔔 New order{unconfirmedOrders.length > 1 ? 's' : ''} from customer (QR menu) — confirm to take
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {unconfirmedOrders.map((order) => (
                                <div
                                    key={order.id}
                                    className="flex items-center gap-3 bg-white rounded-lg px-4 py-2 border border-amber-200"
                                >
                                    <span className="font-medium text-slate-900">
                                        Table {order.table?.number} — {order.orderNumber}
                                    </span>
                                    <span className="text-sm text-slate-500">
                                        {order.total.toLocaleString()} {currency} · {order.items.length} items
                                    </span>
                                    <button
                                        onClick={async () => {
                                            const res = await fetch(`/api/waiter/orders/${order.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ confirm: true }),
                                            })
                                            if (res.ok) {
                                                handleRefresh()
                                                setSelectedOrder(await res.json())
                                            }
                                        }}
                                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg"
                                    >
                                        Confirm
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {activeTab === 'tables' && (
                    <div>
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Table Layout</h2>
                                <p className="text-sm text-slate-500">{tables.length} tables total</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <Button variant="outline" size="sm" onClick={handleRefresh}>Refresh</Button>
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                        Available
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                                        Occupied
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                        Reserved
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {tables.map((table) => (
                                <TableCard
                                    key={table.id}
                                    table={table}
                                    isSelected={selectedTable?.id === table.id}
                                    onClick={() => {
                                        setSelectedTable(table)
                                        if (table.sales.length > 0) {
                                            // Show the most recent active order
                                            setSelectedOrder(table.sales[0])
                                        }
                                    }}
                                />
                            ))}
                        </div>

                        {/* Selected table info */}
                        {selectedTable && (
                            <Card className="mt-5">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div>
                                        <CardTitle>Table {selectedTable.number}</CardTitle>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {selectedTable.capacity} seats
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                                            {[
                                                { status: 'AVAILABLE', label: 'Available' },
                                                { status: 'OCCUPIED', label: 'Occupied' },
                                                { status: 'RESERVED', label: 'Reserved' },
                                            ].map((s) => (
                                                <button
                                                    key={s.status}
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch(`/api/tables/${selectedTable.id}`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ status: s.status }),
                                                            })
                                                            if (res.ok) {
                                                                setSelectedTable((prev) => (prev ? { ...prev, status: s.status } : null))
                                                                fetchTables()
                                                            }
                                                        } catch { }
                                                    }}
                                                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                                        selectedTable.status === s.status
                                                            ? 'bg-white text-slate-900 shadow'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                        <Button onClick={() => setShowNewOrder(true)}>
                                            New Order
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {/* Active orders for this table */}
                                    {selectedTable.sales.length > 0 ? (
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-semibold text-slate-700">Active Orders</h4>
                                            {selectedTable.sales.map((order) => (
                                                <button
                                                    key={order.id}
                                                    onClick={() => setSelectedOrder(order)}
                                                    className="w-full text-left flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <StatusBadge status={order.status} />
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{order.orderNumber}</p>
                                                            <p className="text-xs text-slate-500">
                                                                {order.items.length} items · {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm font-semibold text-emerald-600">
                                                        {order.total.toLocaleString()} {currency}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500">No active orders. Tap &quot;New Order&quot; to start.</p>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}

                {activeTab === 'orders' && (
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                            <h2 className="text-lg font-bold text-slate-900">My Orders</h2>
                            <div className="flex flex-wrap items-center gap-3">
                                <input
                                    type="text"
                                    placeholder="Search by table..."
                                    value={orderSearchTable}
                                    onChange={(e) => setOrderSearchTable(e.target.value)}
                                    className="h-9 px-3 rounded-lg border border-slate-200 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400"
                                />
                                <select
                                    value={orderSort}
                                    onChange={(e) => setOrderSort(e.target.value as typeof orderSort)}
                                    className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                                >
                                    <option value="newest">Newest first</option>
                                    <option value="oldest">Oldest first</option>
                                    <option value="expensive">Most expensive</option>
                                    <option value="cheap">Least expensive</option>
                                </select>
                                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                                    {[
                                        { key: 'active', label: 'Active' },
                                        { key: 'COMPLETED', label: 'Delivered' },
                                        { key: 'all', label: 'All' },
                                    ].map((f) => (
                                        <button
                                            key={f.key}
                                            onClick={() => setOrderFilter(f.key as any)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${orderFilter === f.key
                                                ? 'bg-white text-slate-900 shadow'
                                                : 'text-slate-600 hover:text-slate-900'
                                                }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {myOrders.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-20 text-slate-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    <p className="text-lg font-medium">No orders found</p>
                                    <p className="text-sm mt-1">Go to Tables to create an order</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {[...myOrders]
                                    .filter((o) => !orderSearchTable || (o.table?.number ?? '').toString().includes(orderSearchTable.trim()))
                                    .sort((a, b) => {
                                        if (orderSort === 'oldest') return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                                        if (orderSort === 'newest') return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                                        if (orderSort === 'expensive') return b.total - a.total
                                        if (orderSort === 'cheap') return a.total - b.total
                                        return 0
                                    })
                                    .map((order) => (
                                    <button
                                        key={order.id}
                                        onClick={() => setSelectedOrder(order)}
                                        className="w-full text-left bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl p-4 transition-all active:scale-[0.99]"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className="text-base font-bold text-slate-900">{order.orderNumber}</span>
                                                <StatusBadge status={order.status} />
                                            </div>
                                            <span className="text-base font-bold text-emerald-600">
                                                {order.total.toLocaleString()} {currency}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-slate-500">
                                            {order.table && (
                                                <span className="flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                    </svg>
                                                    Table {order.table.number}
                                                </span>
                                            )}
                                            <span>{order.items.length} items</span>
                                            <span>{new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            {order.customerName && <span>👤 {order.customerName}</span>}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {order.items.slice(0, 4).map((item) => (
                                                <span key={item.id} className="text-[10px] px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">
                                                    {item.quantity}× {item.menuItem.name}
                                                </span>
                                            ))}
                                            {order.items.length > 4 && (
                                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded-full text-slate-500">
                                                    +{order.items.length - 4} more
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'kitchen' && (
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Chef — Pending Orders</h2>
                                <p className="text-sm text-slate-500">Mark orders as done when ready</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <select
                                    value={kitchenSort}
                                    onChange={(e) => setKitchenSort(e.target.value as typeof kitchenSort)}
                                    className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                                >
                                    <option value="oldest">Oldest first</option>
                                    <option value="newest">Newest first</option>
                                    <option value="expensive">Most expensive</option>
                                    <option value="cheap">Least expensive</option>
                                </select>
                                <Button variant="outline" size="sm" onClick={handleRefresh}>Refresh</Button>
                            </div>
                        </div>

                        {kitchenOrders.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-20 text-slate-500">
                                    <span className="text-5xl mb-4">👨‍🍳</span>
                                    <p className="text-lg font-medium">No orders for the kitchen yet</p>
                                    <p className="text-sm mt-1">New orders will appear here automatically</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {[...kitchenOrders]
                                    .sort((a, b) => {
                                        if (kitchenSort === 'oldest') return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                                        if (kitchenSort === 'newest') return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                                        if (kitchenSort === 'expensive') return b.total - a.total
                                        if (kitchenSort === 'cheap') return a.total - b.total
                                        return 0
                                    })
                                    .map((order, index) => {
                                        const minutesAgo = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000)
                                        const isUrgent = minutesAgo > 15
                                        return (
                                            <Card
                                                key={order.id}
                                                className={`border-2 transition-all ${isUrgent ? 'border-red-300 bg-red-50 shadow-md' : 'border-slate-200'}`}
                                            >
                                                <CardContent className="p-4">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`text-2xl font-bold rounded-lg px-3 py-1 ${isUrgent ? 'bg-red-200 text-red-800' : 'bg-slate-200 text-slate-700'}`}>
                                                                #{index + 1}
                                                            </span>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-base font-bold text-slate-900">{order.orderNumber}</span>
                                                                    {order.table && <span className="text-sm text-slate-500">Table {order.table.number}</span>}
                                                                </div>
                                                                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                                                    <span className="font-mono">
                                                                        {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                    <span className={isUrgent ? 'font-semibold text-red-600' : 'text-slate-500'}>
                                                                        {minutesAgo < 1 ? 'Just now' : `${minutesAgo}m ago`}
                                                                    </span>
                                                                    {order.waiter && <span>👤 {order.waiter.name}</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {['PENDING', 'PREPARING', 'READY'].includes(order.status) && (
                                                            <button
                                                                onClick={async () => {
                                                                    await fetch(`/api/waiter/orders/${order.id}`, {
                                                                        method: 'PATCH',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ status: 'COMPLETED' }),
                                                                    })
                                                                    fetchKitchenOrders()
                                                                }}
                                                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors"
                                                            >
                                                                ✓ Mark done
                                                            </button>
                                                        )}
                                                    </div>
                                                {order.notes && (
                                                    <div className="mb-3 p-2 rounded-lg bg-amber-100 border border-amber-200 text-sm text-amber-800">
                                                        📝 {order.notes}
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                                    {order.items.map((item) => (
                                                        <div key={item.id} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-slate-200">
                                                            {item.menuItem.imageUrl && (
                                                                <img src={item.menuItem.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                                                            )}
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm font-semibold text-slate-800 truncate">{item.menuItem.name}</p>
                                                                <p className="text-xs text-slate-500">× {item.quantity}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {order.customerName && (
                                                    <p className="text-xs text-slate-500 mt-2">Customer: {order.customerName}</p>
                                                )}
                                            </CardContent>
                                        </Card>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* New Order Panel */}
            {showNewOrder && selectedTable && (
                <NewOrderPanel
                    tableId={selectedTable.id}
                    tableNumber={selectedTable.number}
                    categories={categories}
                    currency={currency}
                    onOrderCreated={handleOrderCreated}
                    onClose={() => setShowNewOrder(false)}
                />
            )}

            {/* Order Detail Panel */}
            {selectedOrder && (
                <OrderDetailPanel
                    order={selectedOrder}
                    currency={currency}
                    categories={categories}
                    onUpdate={handleOrderUpdated}
                    onClose={() => setSelectedOrder(null)}
                />
            )}
        </>
    )
}
