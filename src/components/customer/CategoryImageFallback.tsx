'use client'

import { useState } from 'react'
import {
  Beef,
  Beer,
  CakeSlice,
  ChefHat,
  Cigarette,
  Coffee,
  CupSoda,
  Fish,
  GlassWater,
  IceCreamCone,
  Martini,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Wine,
  type LucideIcon,
} from 'lucide-react'

interface CategoryImageFallbackProps {
  src?: string | null
  alt: string
  categoryName?: string | null
  description?: string | null
  className?: string
  loading?: 'eager' | 'lazy'
  decoding?: 'async' | 'auto' | 'sync'
  style?: React.CSSProperties
}

const categoryIconRules: Array<{ keywords: string[]; icon: LucideIcon }> = [
  {
    keywords: [
      'cigar',
      'cigarette',
      'shisha',
      'hookah',
      'tobacco',
      'nicotine',
      'robusto',
      'churchill',
      'cohiba',
      'macanudo',
      'don tomas',
      'alec bradley',
    ],
    icon: Cigarette,
  },
  {
    keywords: ['beer', 'lager', 'stout', 'pilsner', 'ale'],
    icon: Beer,
  },
  {
    keywords: [
      'alcohol',
      'liquor',
      'spirit',
      'cocktail',
      'whisky',
      'whiskey',
      'vodka',
      'gin',
      'rum',
      'tequila',
      'brandy',
      'cognac',
      'bourbon',
      'scotch',
      'johnnie walker',
      'black label',
      'double black',
      'chivas',
      'jack daniel',
      'jager',
      'jagermeister',
      'baileys',
      'beluga',
      'crystal head',
      'bombay sapphire',
      'hendricks',
      'hendrick',
      'botanist',
      'sipsmith',
      'bottle',
      'glass',
      'btl',
      'gls',
    ],
    icon: Martini,
  },
  { keywords: ['wine', 'champagne', 'prosecco', 'sparkling'], icon: Wine },
  { keywords: ['drink', 'beverage', 'juice', 'mocktail', 'water', 'soft', 'soda', 'cola', 'lemonade'], icon: CupSoda },
  { keywords: ['coffee', 'tea', 'espresso', 'latte'], icon: Coffee },
  { keywords: ['dessert', 'sweet', 'cake', 'pastry', 'muffin', 'tiramisu', 'brownie'], icon: CakeSlice },
  { keywords: ['ice cream', 'gelato'], icon: IceCreamCone },
  { keywords: ['salad', 'vegetarian', 'vegan', 'dressing'], icon: Salad },
  { keywords: ['soup', 'stew'], icon: Soup },
  { keywords: ['seafood', 'fish', 'shrimp', 'prawn'], icon: Fish },
  { keywords: ['grill', 'meat', 'steak', 'beef', 'kebab', 'burger'], icon: Beef },
  { keywords: ['pizza'], icon: Pizza },
  { keywords: ['sandwich', 'wrap'], icon: Sandwich },
]

function getCategoryIcon(parts: Array<string | null | undefined>): LucideIcon {
  const normalized = parts.filter(Boolean).join(' ').toLowerCase()
  return categoryIconRules.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)))?.icon ?? ChefHat
}

export function CategoryImageFallback({
  src,
  alt,
  categoryName,
  description,
  className,
  loading = 'lazy',
  decoding = 'async',
  style,
}: CategoryImageFallbackProps) {
  const [failed, setFailed] = useState(false)
  const cleanSrc = src?.trim()

  if (cleanSrc && !failed) {
    return (
      <img
        src={cleanSrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        className={className}
        style={style}
        onError={() => setFailed(true)}
      />
    )
  }

  const Icon = getCategoryIcon([categoryName, alt, description])

  return (
    <div
      className={`flex items-center justify-center bg-[color-mix(in_srgb,var(--menu-accent,#f59e0b)_12%,white)] text-[var(--menu-accent,#f59e0b)] ${className ?? ''}`}
      style={style}
      role="img"
      aria-label={alt}
    >
      <Icon className="h-2/5 w-2/5" aria-hidden="true" strokeWidth={1.8} />
    </div>
  )
}
