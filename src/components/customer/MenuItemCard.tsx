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

export interface BadgeLabels {
  signature: string
  mostLoved: string
  chefSelection: string
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
  /** Localized "Add to order" button text. */
  addToOrderLabel?: string
  /** Localized badge text for signature / most loved / chef selection. */
  badgeLabels?: BadgeLabels
  loadingPairings?: boolean
  isSelectedForPairing?: boolean
  /** When true, use dark card and light text (theme-aware). */
  isDarkTheme?: boolean
  /** Override price string (e.g. from price_format A/B test). */
  displayPriceOverride?: string
  /** When true, hide image (e.g. from photo_visibility experiment). */
  forceHideImage?: boolean
}

const defaultPlaceholderImage =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80'

function getBadgeLabel(
  tier: ItemDisplayHints['displayTier'],
  badgeText?: string,
  isAnchor?: boolean,
  badgeLabels?: BadgeLabels
): string | null {
  if (badgeText) return badgeText
  if (badgeLabels) {
    if (tier === 'hero' || isAnchor) return badgeLabels.signature
    if (tier === 'featured') return badgeLabels.mostLoved
    if (tier === 'standard') return badgeLabels.chefSelection
    return null
  }
  if (tier === 'hero' || isAnchor) return '★ SIGNATURE'
  if (tier === 'featured') return '★ MOST LOVED'
  if (tier === 'standard') return 'CHEF\'S SELECTION'
  return null
}

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
  addToOrderLabel = 'Add to order',
  badgeLabels,
  loadingPairings = false,
  isSelectedForPairing = false,
  isDarkTheme = false,
  displayPriceOverride,
  forceHideImage = false,
}: MenuItemCardProps) {
  const tier = hints?.displayTier ?? 'standard'
  const showImage = !forceHideImage && (hints?.showImage ?? true)
  const priceDisplay = displayPriceOverride ?? hints?.priceDisplay ?? String(Math.round(item.price))
  const badgeText = hints?.badgeText
  const isLimitedToday = hints?.isLimitedToday
  const isHero = tier === 'hero'
  const isFeatured = tier === 'featured'
  const isMinimal = tier === 'minimal'
  const badgeLabel = getBadgeLabel(tier, badgeText, hints?.isAnchor, badgeLabels)

  const cardBg = isDarkTheme ? 'bg-white/10 border-white/20' : 'bg-white border-slate-200'
  const textMain = isDarkTheme ? 'text-white' : 'text-slate-900'
  const textMuted = isDarkTheme ? 'text-white/70' : 'text-slate-500'
  const textPrice = isDarkTheme ? 'text-[var(--menu-accent,#f59e0b)]' : 'text-emerald-700'
  const btnLink = isDarkTheme ? 'text-[var(--menu-accent,#f59e0b)] hover:text-white/90' : 'text-emerald-700 hover:text-emerald-800'

  return (
    <Card
      className={`overflow-hidden backdrop-blur hover:shadow-lg transition-all border ${cardBg} ${textMain}`}
      onClick={onDetail}
    >
      <div className="flex min-h-[120px] sm:min-h-[140px]">
        {showImage && !isMinimal && (
          <div
            className="relative flex-shrink-0 flex items-center justify-center p-2 order-first sm:order-none w-24 sm:w-28 aspect-square rounded-xl overflow-hidden"
          >
            <img
              src={item.imageUrl || defaultPlaceholderImage}
              alt={item.name}
              className="w-full h-full object-cover rounded-xl"
            />
            {badgeLabel && (
              <span
                className="absolute top-2 left-2 text-white text-[9px] font-bold px-2 py-0.5 rounded-md shadow-sm"
                style={{ backgroundColor: 'var(--menu-chef-pick, #dc2626)' }}
              >
                {badgeLabel}
              </span>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
              <h3 className="text-sm font-semibold leading-tight line-clamp-2 min-w-0">{displayName}</h3>
              <span className={`text-sm font-semibold flex-shrink-0 ${textPrice}`}>{priceDisplay}</span>
            </div>
            <p className={`text-[9px] uppercase tracking-wider ${textMuted} mb-1`}>
              {getLocalizedCategoryName(item.category?.name)}
            </p>
            {displayDescription && (
              <p className={`text-[11px] ${textMuted} line-clamp-2 mb-1`}>
                {displayDescription}
              </p>
            )}
            {isLimitedToday && (
              <p className={`text-[10px] flex items-center gap-1 mb-1 ${isDarkTheme ? 'text-white/60' : 'text-slate-500'}`}>
                <span>ⓘ</span> Limited Today
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {macroSegments.length > 0 && (
                <span className={`text-[9px] ${textMuted}`}>{macroSegments.join(' · ')}</span>
              )}
              {item.tags && item.tags.length > 0 && (
                <>
                  {macroSegments.length > 0 && <span className={textMuted}>|</span>}
                  {item.tags.slice(0, 2).map((tag) => {
                    const tagLabel = getLocalizedTagLabel(tag)
                    return (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-0.5 text-[9px] ${isDarkTheme ? 'bg-white/10 text-white/80' : 'bg-slate-100 text-slate-600'} px-1.5 py-0.5 rounded`}
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
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPairings() }}
              disabled={loadingPairings && isSelectedForPairing}
              className={`flex items-center gap-1 text-[9px] font-medium ${btnLink} transition-colors`}
            >
              {loadingPairings && isSelectedForPairing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              <span>Pairings</span>
            </button>
            <span className={textMuted}>&bull;</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); onDetail() }} className={`text-[9px] font-medium ${textMuted} hover:underline`}>
              More info
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddToOrder() }}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--menu-accent, #f59e0b)' }}
            >
              {addToOrderLabel}
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}
