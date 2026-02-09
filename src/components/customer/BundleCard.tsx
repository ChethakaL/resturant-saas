'use client'

import { Button } from '@/components/ui/button'
import { formatMenuPrice } from '@/lib/utils'
import type { BundleHint } from '@/types/menu-engine'

interface BundleCardProps {
  bundle: BundleHint
  itemNames: Record<string, string>
  itemImageUrls: Record<string, string | null | undefined>
  onAddBundle: () => void
  addBundleLabel: string
}

const defaultImage =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80'

export function BundleCard({
  bundle,
  itemNames,
  itemImageUrls,
  onAddBundle,
  addBundleLabel,
}: BundleCardProps) {
  return (
    <div className="flex-shrink-0 w-[280px] rounded-xl overflow-hidden bg-white/95 backdrop-blur text-slate-900 shadow-md hover:shadow-lg transition-shadow">
      <div className="flex gap-2 p-3">
        {bundle.itemIds.slice(0, 3).map((id) => (
          <div
            key={id}
            className="flex-1 min-w-0 aspect-square rounded-lg overflow-hidden bg-slate-100"
          >
            <img
              src={itemImageUrls[id] || defaultImage}
              alt={itemNames[id] ?? ''}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-slate-100">
        <p className="font-semibold text-sm line-clamp-2 mb-1">{bundle.name}</p>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-slate-400 line-through text-xs">{formatMenuPrice(bundle.originalPrice)}</span>
          <span className="text-emerald-700 font-bold">{formatMenuPrice(bundle.bundlePrice)}</span>
          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
            {bundle.savingsText}
          </span>
        </div>
        <Button
          onClick={onAddBundle}
          size="sm"
          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium"
        >
          {addBundleLabel}
        </Button>
      </div>
    </div>
  )
}
