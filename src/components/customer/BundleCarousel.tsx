'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BundleCard } from './BundleCard'
import type { BundleHint } from '@/types/menu-engine'

interface BundleCarouselProps {
  bundles: BundleHint[]
  itemNames: Record<string, string>
  itemImageUrls: Record<string, string | null | undefined>
  onAddBundle: (bundle: BundleHint) => void
  title: string
  addBundleLabel: string
}

export function BundleCarousel({
  bundles,
  itemNames,
  itemImageUrls,
  onAddBundle,
  title,
  addBundleLabel,
}: BundleCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const step = 300
    scrollRef.current.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' })
  }

  if (bundles.length === 0) return null

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth scrollbar-hide pb-2 -mx-2 px-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {bundles.map((bundle) => (
          <BundleCard
            key={bundle.id}
            bundle={bundle}
            itemNames={itemNames}
            itemImageUrls={itemImageUrls}
            onAddBundle={() => onAddBundle(bundle)}
            addBundleLabel={addBundleLabel}
          />
        ))}
      </div>
    </div>
  )
}
