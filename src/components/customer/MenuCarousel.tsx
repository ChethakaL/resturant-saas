'use client'

import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { formatMenuPrice } from '@/lib/utils'

interface CarouselItem {
  id: string
  name: string
  description?: string | null
  price: number
  imageUrl?: string | null
  category?: { name: string | null; id: string } | null
}

interface MenuCarouselProps {
  title: string
  type?: 'CHEFS_HIGHLIGHTS' | 'RECOMMENDATIONS'
  items: CarouselItem[]
  onItemClick?: (item: CarouselItem) => void
  getDisplayName?: (itemId: string) => string | undefined
  getDescription?: (itemId: string) => string | undefined
  getCategoryName?: (name?: string | null) => string
  accentColor?: string
  primaryColor?: string
  /** Hero: large image with overlay (CHEF'S RECOMMENDATION, name, description) */
  variant?: 'default' | 'hero'
  /** Optional class for hero dish name (e.g. font-display for elegant serif) */
  displayFontClassName?: string
  /** For default variant: use dark text/background when false (light theme) */
  isDarkTheme?: boolean
}

const defaultImage =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=60'

export function MenuCarousel({
  title,
  type = 'RECOMMENDATIONS',
  items,
  onItemClick,
  getDisplayName,
  getDescription,
  getCategoryName,
  accentColor,
  primaryColor,
  variant = 'default',
  displayFontClassName,
  isDarkTheme = true,
}: MenuCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'start',
      skipSnaps: false,
      dragFree: false,
    },
    [Autoplay({ delay: 5000, stopOnInteraction: true })]
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([])

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    setScrollSnaps(emblaApi.scrollSnapList())
    emblaApi.on('select', onSelect)
    onSelect()
  }, [emblaApi, onSelect])

  if (items.length === 0) return null

  const dotActiveColor = accentColor || '#10b981'
  const isChefsHighlights = type === 'CHEFS_HIGHLIGHTS'
  const highlightColor = isChefsHighlights ? (primaryColor || '#10b981') : (accentColor || '#f59e0b')
  const isHero = variant === 'hero'

  if (isHero) {
    return (
      <div className="w-full overflow-hidden bg-black/30">
        {/* Full-width hero: shorter on mobile, moderate height on desktop */}
        <div
          ref={emblaRef}
          className="relative w-full overflow-hidden aspect-[2/1] sm:aspect-[21/9]"
        >
          <div className="flex h-full touch-pan-x" style={{ backfaceVisibility: 'hidden' }}>
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="flex-[0_0_100%] min-w-0 w-full h-full relative text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                onClick={() => onItemClick?.(item as CarouselItem)}
              >
                <img
                  src={item.imageUrl || defaultImage}
                  alt={item.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 text-white">
                  <span
                    className="inline-block px-2.5 py-1 rounded text-[10px] uppercase tracking-wider font-semibold mb-2"
                    style={{ backgroundColor: highlightColor }}
                  >
                    Chef&apos;s recommendation
                  </span>
                  <p className={`text-2xl sm:text-3xl md:text-4xl font-bold leading-tight tracking-tight ${displayFontClassName ?? ''}`}>{getDisplayName?.(item.id) || item.name}</p>
                  {(getDescription?.(item.id) || item.description) && (
                    <p className="text-sm sm:text-base text-white/90 mt-1.5 line-clamp-2 font-body">{getDescription?.(item.id) || item.description || ''}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
          {items.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-900 hover:bg-white/95 transition"
                onClick={() => emblaApi?.scrollPrev()}
                aria-label="Previous"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-900 hover:bg-white/95 transition"
                onClick={() => emblaApi?.scrollNext()}
                aria-label="Next"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {scrollSnaps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === selectedIndex ? '1.25rem' : '0.375rem',
                      backgroundColor: i === selectedIndex ? highlightColor : 'rgba(255,255,255,0.4)',
                    }}
                    onClick={() => emblaApi?.scrollTo(i)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  const titleClass = isChefsHighlights
    ? 'text-xs uppercase tracking-[0.35em] font-semibold'
    : 'text-xs uppercase tracking-[0.35em]'
  const titleColor = isDarkTheme
    ? isChefsHighlights
      ? undefined
      : 'text-white/70'
    : isChefsHighlights
      ? undefined
      : 'text-slate-500'
  const textPrimary = isDarkTheme ? 'text-white' : 'text-slate-900'
  const cardBg = isDarkTheme ? 'bg-white/5' : 'bg-slate-100'

  return (
    <section className="w-full space-y-4">
      <div className="px-4 sm:px-6">
        <p
          className={`font-body ${titleClass} ${titleColor}`}
          style={isChefsHighlights ? { color: highlightColor } : undefined}
        >
          {title}
        </p>
      </div>
      {/* Full-width track with horizontal padding for first/last card */}
      <div className="relative w-full">
        <div className="overflow-hidden px-4 sm:px-6" ref={emblaRef}>
          <div className="flex touch-pan-x gap-4 -mx-4 sm:-mx-6 px-4 sm:px-6">
          {items.map((item) => {
            const displayName = getDisplayName?.(item.id) || item.name
            return (
              <button
                type="button"
                key={item.id}
                className={`${items.length === 1 ? 'flex-[0_0_100%]' : 'flex-[0_0_82%] sm:flex-[0_0_42%] md:flex-[0_0_30%]'} min-w-0 shrink-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--menu-accent,#f59e0b)] rounded-2xl overflow-hidden transition-transform active:scale-[0.98]`}
                onClick={() => onItemClick?.(item as CarouselItem)}
              >
                <div className={`relative aspect-[3/2] w-full overflow-hidden rounded-t-2xl ${cardBg}`}>
                  <img
                    src={item.imageUrl || defaultImage}
                    alt={item.name}
                    className="h-full w-full object-cover transition duration-300 hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                </div>
                <div className="rounded-b-2xl px-3 py-3 sm:py-4 bg-transparent">
                  <p className={`font-body text-base sm:text-lg font-semibold ${textPrimary} line-clamp-2 leading-tight ${displayFontClassName ?? ''}`}>
                    {displayName}
                  </p>
                  <p
                    className="mt-1 text-sm sm:text-base font-bold"
                    style={{ color: highlightColor }}
                  >
                    {formatMenuPrice(item.price)}
                  </p>
                </div>
              </button>
            )
          })}
          </div>
        </div>
        {items.length > 1 && (
          <>
            <button
              type="button"
              className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-900 hover:bg-white/95 transition z-10"
              onClick={() => emblaApi?.scrollPrev()}
              aria-label="Previous"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-900 hover:bg-white/95 transition z-10"
              onClick={() => emblaApi?.scrollNext()}
              aria-label="Next"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </>
        )}
      </div>
      {scrollSnaps.length > 1 && (
        <div className="flex justify-center gap-1.5 pt-2">
          {scrollSnaps.map((_, index) => (
            <button
              key={index}
              type="button"
              className="h-1.5 rounded-full transition-all"
              style={{
                width: index === selectedIndex ? '1.25rem' : '0.375rem',
                backgroundColor:
                  index === selectedIndex ? highlightColor : isDarkTheme ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)',
              }}
              onClick={() => emblaApi?.scrollTo(index)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
