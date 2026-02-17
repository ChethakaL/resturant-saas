'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'

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

// ─── Status Badge ───
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
        PENDING: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400', label: 'Pending' },
        PREPARING: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400', label: 'Preparing' },
        READY: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Ready' },
        COMPLETED: { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-400', label: 'Delivered' },
        CANCELLED: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400', label: 'Cancelled' },
    }
    const c = config[status] || config.PENDING
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
            {c.label}
        </span>
    )
}

// ─── Table Card ───
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
            ? 'from-rose-500/20 to-rose-600/10 border-rose-500/30'
            : table.status === 'RESERVED'
                ? 'from-amber-500/20 to-amber-600/10 border-amber-500/30'
                : 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30'

    const statusIcon =
        table.status === 'OCCUPIED' ? '🍽️' : table.status === 'RESERVED' ? '📋' : '✅'

    return (
        <button
            onClick={onClick}
            className={`
        group relative rounded-2xl border p-4 transition-all duration-200
        bg-gradient-to-br ${statusColor}
        ${isSelected ? 'ring-2 ring-amber-400 scale-[1.02] shadow-lg shadow-amber-500/10' : 'hover:scale-[1.01] hover:shadow-md'}
        active:scale-[0.98]
      `}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-white">T{table.number}</span>
                <span className="text-lg">{statusIcon}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                </svg>
                {table.capacity} seats
            </div>
            {hasActiveOrders && (
                <div className="mt-2 flex items-center gap-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-white">
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
                            {order.status === 'PENDING' && (
                                <button
                                    onClick={() => updateStatus('PREPARING')}
                                    disabled={isUpdating}
                                    className="py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-sm font-semibold rounded-xl transition-all disabled:opacity-40 active:scale-[0.98]"
                                >
                                    🔥 Preparing
                                </button>
                            )}
                            {order.status === 'PREPARING' && (
                                <button
                                    onClick={() => updateStatus('READY')}
                                    disabled={isUpdating}
                                    className="py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-sm font-semibold rounded-xl transition-all disabled:opacity-40 active:scale-[0.98]"
                                >
                                    ✅ Ready
                                </button>
                            )}
                            {['PENDING', 'PREPARING', 'READY'].includes(order.status) && (
                                <button
                                    onClick={() => updateStatus('COMPLETED')}
                                    disabled={isUpdating}
                                    className="py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-40 active:scale-[0.98]"
                                >
                                    🍽️ Delivered
                                </button>
                            )}
                            {['PENDING', 'PREPARING'].includes(order.status) && (
                                <button
                                    onClick={() => {
                                        if (confirm('Cancel this order?')) updateStatus('CANCELLED')
                                    }}
                                    disabled={isUpdating}
                                    className="py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-semibold rounded-xl transition-all disabled:opacity-40 active:scale-[0.98]"
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

    const [tables, setTables] = useState<Table[]>([])
    const [myOrders, setMyOrders] = useState<Order[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [activeTab, setActiveTab] = useState<'tables' | 'orders'>('tables')
    const [selectedTable, setSelectedTable] = useState<Table | null>(null)
    const [showNewOrder, setShowNewOrder] = useState(false)
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
    const [orderFilter, setOrderFilter] = useState<'active' | 'all' | 'COMPLETED'>('active')
    const [isLoading, setIsLoading] = useState(true)

    const currency = 'IQD'

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

    useEffect(() => {
        if (authStatus === 'unauthenticated') {
            router.push('/waiter/login')
            return
        }
        if (authStatus === 'authenticated') {
            Promise.all([fetchTables(), fetchOrders(), fetchMenu()]).finally(() =>
                setIsLoading(false)
            )

            // Auto-refresh every 30 seconds
            const interval = setInterval(() => {
                fetchTables()
                fetchOrders()
            }, 30000)
            return () => clearInterval(interval)
        }
    }, [authStatus, router, fetchTables, fetchOrders, fetchMenu])

    useEffect(() => {
        if (authStatus === 'authenticated') {
            fetchOrders()
        }
    }, [orderFilter, authStatus, fetchOrders])

    const handleRefresh = () => {
        fetchTables()
        fetchOrders()
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
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    <p className="text-slate-400 text-sm">Loading waiter dashboard...</p>
                </div>
            </div>
        )
    }

    const activeOrders = myOrders.filter((o) => ['PENDING', 'PREPARING', 'READY'].includes(o.status))

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col">
            {/* Top nav */}
            <nav className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-white/5">
                <div className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-white">{session?.user?.name}</h1>
                            <p className="text-[10px] text-slate-500">{session?.user?.restaurantName}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Active orders badge */}
                        {activeOrders.length > 0 && (
                            <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold">
                                {activeOrders.length} active
                            </span>
                        )}
                        <button
                            onClick={handleRefresh}
                            className="p-2 hover:bg-white/5 rounded-xl transition-colors"
                            title="Refresh"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="23 4 23 10 17 10" />
                                <polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                        </button>
                        <button
                            onClick={() => signOut({ callbackUrl: '/waiter/login' })}
                            className="p-2 hover:bg-white/5 rounded-xl transition-colors"
                            title="Sign Out"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tab bar */}
                <div className="flex px-5 gap-1">
                    <button
                        onClick={() => setActiveTab('tables')}
                        className={`flex-1 py-2.5 text-sm font-medium rounded-t-xl transition-colors relative ${activeTab === 'tables'
                            ? 'text-amber-400'
                            : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                            </svg>
                            Tables
                        </span>
                        {activeTab === 'tables' && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`flex-1 py-2.5 text-sm font-medium rounded-t-xl transition-colors relative ${activeTab === 'orders'
                            ? 'text-amber-400'
                            : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                            My Orders
                            {activeOrders.length > 0 && (
                                <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                                    {activeOrders.length}
                                </span>
                            )}
                        </span>
                        {activeTab === 'orders' && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                        )}
                    </button>
                </div>
            </nav>

            {/* Content */}
            <main className="flex-1 p-5">
                {activeTab === 'tables' && (
                    <div>
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-lg font-bold text-white">Table Layout</h2>
                                <p className="text-sm text-slate-500">{tables.length} tables total</p>
                            </div>
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
                            <div className="mt-5 bg-white/[0.03] border border-white/10 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-white">Table {selectedTable.number}</h3>
                                        <p className="text-sm text-slate-500">
                                            {selectedTable.capacity} seats · {selectedTable.status.toLowerCase()}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowNewOrder(true)}
                                        className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
                                    >
                                        <span className="flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <line x1="12" y1="5" x2="12" y2="19" />
                                                <line x1="5" y1="12" x2="19" y2="12" />
                                            </svg>
                                            New Order
                                        </span>
                                    </button>
                                </div>

                                {/* Active orders for this table */}
                                {selectedTable.sales.length > 0 ? (
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-semibold text-slate-300">Active Orders</h4>
                                        {selectedTable.sales.map((order) => (
                                            <button
                                                key={order.id}
                                                onClick={() => setSelectedOrder(order)}
                                                className="w-full text-left flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 rounded-xl transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <StatusBadge status={order.status} />
                                                    <div>
                                                        <p className="text-sm font-medium text-white">{order.orderNumber}</p>
                                                        <p className="text-xs text-slate-500">
                                                            {order.items.length} items · {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="text-sm font-semibold text-amber-400">
                                                    {order.total.toLocaleString()} {currency}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500">No active orders. Tap &quot;New Order&quot; to start.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'orders' && (
                    <div>
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-lg font-bold text-white">My Orders</h2>
                            <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
                                {[
                                    { key: 'active', label: 'Active' },
                                    { key: 'COMPLETED', label: 'Delivered' },
                                    { key: 'all', label: 'All' },
                                ].map((f) => (
                                    <button
                                        key={f.key}
                                        onClick={() => setOrderFilter(f.key as any)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${orderFilter === f.key
                                            ? 'bg-amber-500 text-white shadow'
                                            : 'text-slate-400 hover:text-white'
                                            }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {myOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                <p className="text-lg font-medium">No orders found</p>
                                <p className="text-sm mt-1">Go to Tables to create an order</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {myOrders.map((order) => (
                                    <button
                                        key={order.id}
                                        onClick={() => setSelectedOrder(order)}
                                        className="w-full text-left bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-2xl p-4 transition-all active:scale-[0.99]"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className="text-base font-bold text-white">{order.orderNumber}</span>
                                                <StatusBadge status={order.status} />
                                            </div>
                                            <span className="text-base font-bold text-amber-400">
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
                                                <span key={item.id} className="text-[10px] px-2 py-0.5 bg-white/5 rounded-full text-slate-400">
                                                    {item.quantity}× {item.menuItem.name}
                                                </span>
                                            ))}
                                            {order.items.length > 4 && (
                                                <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded-full text-slate-500">
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
        </div>
    )
}
