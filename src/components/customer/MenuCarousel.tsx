'use client'

import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { formatMenuPrice } from '@/lib/utils'

interface CarouselItem {
  id: string
  name: string
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
  getCategoryName?: (name?: string | null) => string
  accentColor?: string
  primaryColor?: string
}

const defaultImage =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=60'

export function MenuCarousel({
  title,
  type = 'RECOMMENDATIONS',
  items,
  onItemClick,
  getDisplayName,
  getCategoryName,
  accentColor,
  primaryColor,
}: MenuCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'start',
      skipSnaps: false,
      dragFree: false,
    },
    [Autoplay({ delay: 4000, stopOnInteraction: true })]
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
  const titleClass = isChefsHighlights
    ? 'text-xs uppercase tracking-[0.4em] font-semibold'
    : 'text-xs uppercase tracking-[0.4em] text-white/60'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-4">
        <p className={titleClass} style={isChefsHighlights ? { color: highlightColor } : undefined}>
          {title}
        </p>
      </div>
      <div className="overflow-hidden px-2 sm:px-4" ref={emblaRef}>
        <div className="flex touch-pan-x">
          {items.map((item) => {
            const displayName = getDisplayName?.(item.id) || item.name
            return (
              <button
                type="button"
                key={item.id}
                className="flex-[0_0_100%] min-w-0 w-full px-2 sm:px-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-xl overflow-hidden"
                onClick={() => onItemClick?.(item as CarouselItem)}
              >
                <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-white/5">
                  <img
                    src={item.imageUrl || defaultImage}
                    alt={item.name}
                    className="h-full w-full object-cover transition duration-200 hover:scale-105"
                  />
                </div>
                <p className="mt-3 text-base font-semibold text-white line-clamp-2 leading-tight">
                  {displayName}
                </p>
                <p className="mt-1 text-base font-bold text-emerald-400">
                  {formatMenuPrice(item.price)}
                </p>
              </button>
            )
          })}
        </div>
      </div>
      {scrollSnaps.length > 1 && (
        <div className="flex justify-center gap-1.5 pt-1">
          {scrollSnaps.map((_, index) => (
            <button
              key={index}
              type="button"
              className="h-1.5 rounded-full transition-all"
              style={{
                width: index === selectedIndex ? '1rem' : '0.375rem',
                backgroundColor:
                  index === selectedIndex ? dotActiveColor : 'rgba(255,255,255,0.3)',
              }}
              onClick={() => emblaApi?.scrollTo(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
