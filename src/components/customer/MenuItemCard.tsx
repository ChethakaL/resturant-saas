'use client'

import { Card } from '@/components/ui/card'
import { Sparkles, Loader2 } from 'lucide-react'
import type { ItemDisplayHints } from '@/types/menu-engine'

export interface MenuItemCardItem {
  id: string
  name: string
  description?: string | null
  price: number
  imageUrl?: string | null
  tags?: string[]
  popularityScore?: number
  category?: { name: string | null; id: string } | null
  addOns?: Array<{ id: string; name: string; price: number }>
}

interface MenuItemCardProps {
  item: MenuItemCardItem
  hints?: ItemDisplayHints | null
  displayName: string
  displayDescription: string
  macroSegments: string[]
  getLocalizedCategoryName: (name: string | null) => string
  getLocalizedTagLabel: (tag: string) => string
  getTagIcon: (tag: string) => React.ReactNode
  onDetail: () => void
  onPairings: () => void
  onAddToOrder: () => void
  loadingPairings?: boolean
  isSelectedForPairing?: boolean
}

const defaultPlaceholderImage =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80'

export function MenuItemCard({
  item,
  hints,
  displayName,
  displayDescription,
  macroSegments,
  getLocalizedCategoryName,
  getLocalizedTagLabel,
  getTagIcon,
  onDetail,
  onPairings,
  onAddToOrder,
  loadingPairings = false,
  isSelectedForPairing = false,
}: MenuItemCardProps) {
  const tier = hints?.displayTier ?? 'standard'
  const showImage = hints?.showImage ?? true
  const priceDisplay = hints?.priceDisplay ?? String(Math.round(item.price))
  const badgeText = hints?.badgeText
  const isHero = tier === 'hero'
  const isFeatured = tier === 'featured'
  const isMinimal = tier === 'minimal'

  return (
    <Card
      className={`overflow-hidden bg-white/95 backdrop-blur text-slate-900 hover:shadow-lg transition-all ${
        isHero ? 'ring-2 ring-amber-400/80' : ''
      } ${isFeatured ? 'border-l-4 border-amber-500' : ''}`}
      onClick={onDetail}
    >
      <div className={`flex min-h-[120px] sm:min-h-[140px] ${isHero ? 'flex-col sm:flex-row' : ''}`}>
        <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold leading-tight line-clamp-2 mb-0.5">{displayName}</h3>

            <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">
              {getLocalizedCategoryName(item.category?.name)}
            </p>

            <p className="text-[11px] text-slate-600 line-clamp-2 mb-1">
              {displayDescription ? (
                <>
                  {displayDescription}
                  <span className="font-semibold text-emerald-700 ml-1.5">{priceDisplay}</span>
                </>
              ) : (
                <span className="font-semibold text-emerald-700">{priceDisplay}</span>
              )}
            </p>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {macroSegments.length > 0 && (
                <span className="text-[9px] text-slate-500">{macroSegments.join(' · ')}</span>
              )}
              {item.tags && item.tags.length > 0 && (
                <>
                  {macroSegments.length > 0 && <span className="text-slate-300">|</span>}
                  {item.tags.slice(0, 2).map((tag) => {
                    const tagLabel = getLocalizedTagLabel(tag)
                    return (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                      >
                        {getTagIcon(tag)}
                        {tagLabel}
                      </span>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPairings()
              }}
              disabled={loadingPairings && isSelectedForPairing}
              className="flex items-center gap-1 text-[9px] font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              {loadingPairings && isSelectedForPairing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              <span>Pairings</span>
            </button>
            <span className="text-slate-300">&bull;</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDetail()
              }}
              className="text-[9px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              More info
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAddToOrder()
              }}
              className="ml-auto text-[9px] font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              Add to order
            </button>
          </div>
        </div>

        {showImage && !isMinimal && (
          <div
            className={`relative flex-shrink-0 flex items-center justify-center p-2 ${
              isHero ? 'w-full sm:w-[200px] aspect-video sm:aspect-square' : 'w-[146px] sm:w-[146px] aspect-square'
            }`}
          >
            <img
              src={item.imageUrl || defaultPlaceholderImage}
              alt={item.name}
              className="w-full h-full object-cover rounded"
            />
            {(badgeText || (item.popularityScore != null && item.popularityScore > 50)) && (
              <span className="absolute top-2 right-2 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                {badgeText ?? 'Popular'}
              </span>
            )}
            {isFeatured && !badgeText && (
              <span className="absolute top-2 right-2 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                Chef&apos;s Pick
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
