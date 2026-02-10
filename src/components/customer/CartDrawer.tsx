'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Minus, Plus, ShoppingBag, X } from 'lucide-react'
import { formatMenuPrice } from '@/lib/utils'

export interface CartLine {
  menuItemId: string
  name: string
  price: number
  quantity: number
}

interface CartDrawerProps {
  lines: CartLine[]
  total: number
  viewOrderLabel: string
  placeOrderLabel: string
  cartTitle: string
  onUpdateQuantity: (menuItemId: string, delta: number) => void
  onRemove: (menuItemId: string) => void
  onPlaceOrder: () => void
  restaurantId: string
  isPlacing?: boolean
  children?: React.ReactNode
  /** When provided, drawer is controlled by parent (e.g. header cart icon). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CartDrawer({
  lines,
  total,
  viewOrderLabel,
  placeOrderLabel,
  cartTitle,
  onUpdateQuantity,
  onRemove,
  onPlaceOrder,
  restaurantId,
  isPlacing = false,
  children,
  open: controlledOpen,
  onOpenChange,
}: CartDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined && onOpenChange != null
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? onOpenChange : setInternalOpen
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0)

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 p-3 pointer-events-none">
        <div className="pointer-events-auto max-w-lg mx-auto">
          {itemCount > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="w-full flex items-center justify-between gap-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition-colors"
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                {viewOrderLabel} ({itemCount})
              </span>
              <span>{formatMenuPrice(total)}</span>
            </button>
          )}
        </div>
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-hidden flex flex-col bg-slate-900 text-white rounded-t-2xl shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold">{cartTitle}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {lines.length === 0 ? (
                <p className="text-white/60 text-sm py-4">{viewOrderLabel}</p>
              ) : (
                lines.map((line) => (
                  <div
                    key={line.menuItemId}
                    className="flex items-center justify-between gap-3 py-2 border-b border-white/10 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{line.name}</p>
                      <p className="text-sm text-white/70">{formatMenuPrice(line.price)} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(line.menuItemId, -1)}
                        className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                        aria-label="Decrease"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center font-medium">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(line.menuItemId, 1)}
                        className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                        aria-label="Increase"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(line.menuItemId)}
                        className="text-white/60 hover:text-red-400 text-sm ml-1"
                        aria-label="Remove"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
              {children}
            </div>
            <div className="p-4 border-t border-white/10 flex flex-col gap-2">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{formatMenuPrice(total)}</span>
              </div>
              <Button
                onClick={() => {
                  onPlaceOrder()
                  setOpen(false)
                }}
                disabled={lines.length === 0 || isPlacing}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold"
              >
                {isPlacing ? 'Placing…' : placeOrderLabel}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
