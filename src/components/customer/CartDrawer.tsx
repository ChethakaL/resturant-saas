'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  /** Tables for guest to select; when empty, no table selector is shown. */
  tables?: { id: string; number: string }[]
  /** Currently selected table number (string) or null for "No table". */
  selectedTableNumber?: string | null
  /** Called when guest changes table selection. */
  onTableChange?: (tableNumber: string | null) => void
  /** Optional formatter for prices (e.g. A/B test variant). */
  formatPrice?: (amount: number) => string
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
  tables,
  selectedTableNumber = null,
  onTableChange,
  formatPrice,
}: CartDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const isControlled = controlledOpen !== undefined && onOpenChange != null
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? onOpenChange : setInternalOpen
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0)
  const format = formatPrice ?? formatMenuPrice

  const displayTables = tables && tables.length > 0 ? tables : [
    { id: 'dummy-1', number: '1' },
    { id: 'dummy-2', number: '2' },
    { id: 'dummy-3', number: '3' },
    { id: 'dummy-4', number: '4' },
    { id: 'dummy-5', number: '5' },
    { id: 'dummy-6', number: '6' },
    { id: 'dummy-7', number: '7' },
    { id: 'dummy-8', number: '8' },
  ]
  const showTableSelector = !!onTableChange

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 p-3 pointer-events-none">
        <div className="pointer-events-auto max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-between gap-3 bg-[var(--menu-accent,#f59e0b)] hover:opacity-90 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition-colors"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              {viewOrderLabel} ({itemCount})
            </span>
            <span>{format(total)}</span>
          </button>
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
                      <p className="font-medium flex items-baseline gap-2 flex-wrap">
                        <span className="truncate">{line.name}</span>
                        <span className="text-white/90 flex-shrink-0">{format(line.price)}</span>
                      </p>
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
              {showTableSelector && onTableChange && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-white/80">Table</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTablePickerOpen(true)}
                    className="w-full justify-between border-white/20 bg-white/5 text-white hover:bg-white/10"
                  >
                    <span>
                      {selectedTableNumber ? `Table ${selectedTableNumber}` : 'Select table'}
                    </span>
                    <span className="text-white/60 text-sm">
                      {selectedTableNumber ? 'Change' : 'Optional'}
                    </span>
                  </Button>
                  <Dialog open={tablePickerOpen} onOpenChange={setTablePickerOpen}>
                    <DialogContent className="max-w-sm bg-slate-900 border-white/20 text-white">
                      <DialogHeader>
                        <DialogTitle>Select your table</DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-white/70">Tap your table on the layout, or choose not to select.</p>
                      <div className="rounded-xl border border-white/20 bg-white/5 p-4">
                        <div className="grid grid-cols-4 gap-3">
                          {displayTables.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                onTableChange(t.number)
                                setTablePickerOpen(false)
                              }}
                              className={`aspect-square rounded-xl flex items-center justify-center text-lg font-semibold transition-colors ${
                                selectedTableNumber === t.number
                                  ? 'bg-[var(--menu-accent,#f59e0b)] text-white ring-2 ring-[var(--menu-accent,#f59e0b)]/80 ring-offset-2 ring-offset-slate-900'
                                  : 'bg-white/10 text-white hover:bg-white/20'
                              }`}
                            >
                              {t.number}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          onTableChange(null)
                          setTablePickerOpen(false)
                        }}
                        className="w-full text-white/90 hover:bg-white/10 hover:text-white"
                      >
                        I&apos;m not at a table
                      </Button>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{format(total)}</span>
              </div>
              <Button
                onClick={() => {
                  onPlaceOrder()
                  setOpen(false)
                }}
                disabled={lines.length === 0 || isPlacing}
                className="w-full bg-[var(--menu-accent,#f59e0b)] hover:opacity-90 text-white font-semibold"
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
