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
  /** Separator for joining item names in bundle title (e.g. " + " or " و "). */
  bundleNameSeparator?: string
  /** Localize savings text (e.g. "Save 500" → "وفر 500"). */
  getLocalizedSavingsText?: (savingsText: string) => string
  /** When false (light theme), use dark text so heading and controls are visible. */
  isDarkTheme?: boolean
}

export function BundleCarousel({
  bundles,
  itemNames,
  itemImageUrls,
  onAddBundle,
  title,
  addBundleLabel,
  bundleNameSeparator = ' + ',
  getLocalizedSavingsText,
  isDarkTheme = true,
}: BundleCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const step = 300
    scrollRef.current.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' })
  }

  if (bundles.length === 0) return null

  const titleClass = isDarkTheme ? 'text-white' : 'text-slate-900'
  const btnClass = isDarkTheme
    ? 'bg-white/10 text-white hover:bg-white/20'
    : 'bg-slate-200 text-slate-800 hover:bg-slate-300'

  return (
    <div className="py-4 sm:py-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className={`text-base sm:text-lg font-semibold ${titleClass} truncate min-w-0`}>{title}</h3>
        <div className="flex-shrink-0 flex gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            className={`p-2 rounded-full transition-colors ${btnClass}`}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className={`p-2 rounded-full transition-colors ${btnClass}`}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto scroll-smooth scrollbar-hide pb-2 scroll-px-3 -mx-3 px-3"
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
            bundleNameSeparator={bundleNameSeparator}
            getLocalizedSavingsText={getLocalizedSavingsText}
          />
        ))}
      </div>
    </div>
  )
}
