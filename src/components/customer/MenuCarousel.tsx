'use client'

import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { formatCurrency } from '@/lib/utils'

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
  const cardBorder = isChefsHighlights
    ? 'border-2'
    : 'border border-white/10'
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
      <div className="overflow-hidden px-4" ref={emblaRef}>
        <div className="flex gap-3">
          {items.map((item) => {
            const displayName = getDisplayName?.(item.id) || item.name
            const categoryName = getCategoryName
              ? getCategoryName(item.category?.name)
              : item.category?.name || ''

            return (
              <div
                key={item.id}
                className="flex-shrink-0 flex-grow-0 w-[85%] min-w-[85%] sm:w-[45%] sm:min-w-[45%] md:w-[30%] md:min-w-[30%] cursor-pointer"
                onClick={() => onItemClick?.(item as CarouselItem)}
              >
                <div
                  className={`flex flex-col divide-y divide-white/10 rounded-2xl ${cardBorder} bg-white/5 shadow-lg shadow-black/40 backdrop-blur overflow-hidden min-h-[260px] max-h-[320px] h-[280px]`}
                  style={isChefsHighlights ? { borderColor: highlightColor } : undefined}
                >
                  <div className="relative flex-shrink-0 w-full h-36 overflow-hidden">
                    <img
                      src={
                        item.imageUrl ||
                        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=60'
                      }
                      alt={item.name}
                      className="h-full w-full object-cover transition duration-200 hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-col flex-1 min-h-0 space-y-1 px-3 py-3 text-sm">
                    <p className="font-semibold text-white line-clamp-2">
                      {displayName}
                    </p>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                      {categoryName}
                    </p>
                    <div className="flex items-center justify-between text-xs text-white/70 mt-auto">
                      <span>{formatCurrency(item.price)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {scrollSnaps.length > 1 && (
        <div className="flex justify-center gap-1.5 pt-1">
          {scrollSnaps.map((_, index) => (
            <button
              key={index}
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
