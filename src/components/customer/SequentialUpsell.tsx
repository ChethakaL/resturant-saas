'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { UpsellSuggestion } from '@/types/menu-engine'

interface SequentialUpsellProps {
  suggestions: UpsellSuggestion[]
  currentIndex: number
  itemName: string
  itemPrice: string
  itemImageUrl?: string | null
  onAccept: () => void
  onSkip: () => void
  onClose: () => void
  addLabel: string
  skipLabel: string
}

const defaultImage =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80'

export function SequentialUpsell({
  suggestions,
  currentIndex,
  itemName,
  itemPrice,
  itemImageUrl,
  onAccept,
  onSkip,
  onClose,
  addLabel,
  skipLabel,
}: SequentialUpsellProps) {
  if (suggestions.length === 0) return null
  const current = suggestions[currentIndex]
  if (!current) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} aria-hidden />
      <div className="fixed left-0 right-0 bottom-0 z-50 bg-slate-900 text-white rounded-t-2xl shadow-2xl p-4 pb-safe">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-white/10">
            <img
              src={itemImageUrl || defaultImage}
              alt={itemName}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/80 mb-1">{current.nudgeText}</p>
            <p className="font-semibold">{itemName}</p>
            <p className="text-amber-400 text-sm">{itemPrice}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button
            onClick={onAccept}
            className="flex-1 bg-[var(--menu-accent,#f59e0b)] hover:opacity-90 text-white font-semibold"
          >
            {addLabel}
          </Button>
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 rounded-md border border-white/30 bg-white/10 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
          >
            {skipLabel}
          </button>
        </div>
      </div>
    </>
  )
}
