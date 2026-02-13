'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { UpsellSuggestion } from '@/types/menu-engine'

export interface BundledUpsellItem {
  itemId: string
  itemName: string
  itemPrice: string
  itemImageUrl?: string | null
  nudgeText: string
}

interface BundledUpsellProps {
  items: BundledUpsellItem[]
  addLabel: string
  skipLabel: string
  onAddItem: (itemId: string) => void
  onClose: () => void
}

const defaultImage =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80'

export function BundledUpsell({
  items,
  addLabel,
  skipLabel,
  onAddItem,
  onClose,
}: BundledUpsellProps) {
  if (items.length === 0) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} aria-hidden />
      <div className="fixed left-0 right-0 bottom-0 z-50 max-h-[85vh] overflow-hidden flex flex-col bg-slate-900 text-white rounded-t-2xl shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-white/10">
          <p className="text-sm text-white/80">Add to your order?</p>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.map((item) => (
            <div
              key={item.itemId}
              className="flex gap-3 items-center rounded-xl bg-white/5 border border-white/10 p-3"
            >
              <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-white/10">
                <img
                  src={item.itemImageUrl || defaultImage}
                  alt={item.itemName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 mb-0.5">{item.nudgeText}</p>
                <p className="font-semibold text-sm">{item.itemName}</p>
                <p className="text-amber-400 text-xs">{item.itemPrice}</p>
              </div>
              <Button
                size="sm"
                onClick={() => onAddItem(item.itemId)}
                className="flex-shrink-0 bg-amber-500 hover:bg-amber-600 text-white"
              >
                {addLabel}
              </Button>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-white/30 bg-white/10 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
          >
            {skipLabel}
          </button>
        </div>
      </div>
    </>
  )
}
