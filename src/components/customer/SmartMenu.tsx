'use client'

import { useMemo, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Flame, Leaf, X, SlidersHorizontal, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface MenuItem {
  id: string
  name: string
  description?: string | null
  price: number
  imageUrl?: string | null
  calories?: number | null
  tags?: string[]
  popularityScore?: number
  category?: { name: string | null; id: string } | null
}

interface SmartMenuProps {
  restaurantId: string
  restaurantName: string
  menuItems: MenuItem[]
}

export default function SmartMenu({
  restaurantId,
  restaurantName,
  menuItems,
}: SmartMenuProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<'popular' | 'price-low' | 'price-high' | 'calories-low' | 'calories-high'>('popular')
  const [showPairingSuggestions, setShowPairingSuggestions] = useState(false)
  const [selectedItemForPairing, setSelectedItemForPairing] = useState<MenuItem | null>(null)
  const [pairingSuggestions, setPairingSuggestions] = useState<MenuItem[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Extract unique categories
  const categories = useMemo(() => {
    const uniqueCategories = new Map<string, { id: string; name: string }>()
    menuItems.forEach((item) => {
      if (item.category && item.category.id && item.category.name) {
        uniqueCategories.set(item.category.id, {
          id: item.category.id,
          name: item.category.name,
        })
      }
    })
    return Array.from(uniqueCategories.values())
  }, [menuItems])

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    menuItems.forEach((item) => {
      item.tags?.forEach((tag) => tags.add(tag))
    })
    return Array.from(tags)
  }, [menuItems])

  // Filter and sort menu items
  const filteredItems = useMemo(() => {
    let items = menuItems

    // Search filter
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term)
      )
    }

    // Category filter
    if (selectedCategory !== 'all') {
      items = items.filter((item) => item.category?.id === selectedCategory)
    }

    // Tags filter
    if (selectedTags.length > 0) {
      items = items.filter((item) =>
        selectedTags.every((tag) => item.tags?.includes(tag))
      )
    }

    // Sort
    items = [...items].sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return (b.popularityScore || 0) - (a.popularityScore || 0)
        case 'price-low':
          return a.price - b.price
        case 'price-high':
          return b.price - a.price
        case 'calories-low':
          return (a.calories || 999999) - (b.calories || 999999)
        case 'calories-high':
          return (b.calories || 0) - (a.calories || 0)
        default:
          return 0
      }
    })

    return items
  }, [menuItems, search, selectedCategory, selectedTags, sortBy])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const fetchPairingSuggestions = async (item: MenuItem) => {
    setSelectedItemForPairing(item)
    setShowPairingSuggestions(true)
    setLoadingSuggestions(true)
    setPairingSuggestions([])

    try {
      const response = await fetch('/api/public/pairing-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: item.id,
          restaurantId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch suggestions')
      }

      setPairingSuggestions(data.suggestions || [])
    } catch (error) {
      console.error('Error fetching pairing suggestions:', error)
      alert('Failed to load suggestions. Please try again.')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const getTagIcon = (tag: string) => {
    const lowerTag = tag.toLowerCase()
    if (lowerTag.includes('spicy') || lowerTag.includes('hot')) {
      return <Flame className="h-3 w-3" />
    }
    if (
      lowerTag.includes('vegan') ||
      lowerTag.includes('vegetarian') ||
      lowerTag.includes('plant')
    ) {
      return <Leaf className="h-3 w-3" />
    }
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-32 left-10 h-72 w-72 rounded-full bg-emerald-400 blur-[140px]" />
          <div className="absolute top-20 right-10 h-80 w-80 rounded-full bg-amber-400 blur-[160px]" />
          <div className="absolute bottom-20 left-1/2 h-60 w-60 rounded-full bg-blue-400 blur-[140px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12 space-y-6">
          {/* Header */}
          <div className="text-center">
            <p className="text-xs sm:text-sm uppercase tracking-[0.3em] text-emerald-200">
              Smart QR Menu
            </p>
            <h1 className="text-3xl sm:text-5xl font-bold mt-2">{restaurantName}</h1>
            <p className="mt-2 text-sm sm:text-base text-white/70">
              AI-powered recommendations • Filter by preferences • Browse our menu
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <Input
              placeholder="Search dishes..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12 text-base"
            />
          </div>

          {/* Bubble Filters - Categories */}
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/50'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === category.id
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/50'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* Dietary Tags Filters */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                    selectedTags.includes(tag)
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/50'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {getTagIcon(tag)}
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Sort Options */}
          <div className="flex items-center justify-center gap-3">
            <SlidersHorizontal className="h-4 w-4 text-white/60" />
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-48 bg-white/10 border-white/20 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="popular">Most Popular</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="calories-low">Calories: Low to High</SelectItem>
                <SelectItem value="calories-high">Calories: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active Filters Display */}
          {(selectedCategory !== 'all' || selectedTags.length > 0) && (
            <div className="flex flex-wrap gap-2 justify-center items-center">
              <span className="text-xs text-white/60">Active filters:</span>
              {selectedCategory !== 'all' && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30"
                >
                  {categories.find((c) => c.id === selectedCategory)?.name}
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer"
                    onClick={() => setSelectedCategory('all')}
                  />
                </Badge>
              )}
              {selectedTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="bg-amber-500/20 text-amber-200 border-amber-500/30"
                >
                  {tag}
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer"
                    onClick={() => toggleTag(tag)}
                  />
                </Badge>
              ))}
            </div>
          )}

          {/* Menu Items Grid */}
          <div className="space-y-4">
              {filteredItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">No items match your filters</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredItems.map((item) => (
                    <Card
                      key={item.id}
                      className="overflow-hidden bg-white/95 backdrop-blur text-slate-900 hover:shadow-xl transition-all"
                    >
                      <div className="relative">
                        <img
                          src={
                            item.imageUrl ||
                            'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
                          }
                          alt={item.name}
                          className="h-48 w-full object-cover"
                        />
                        {item.popularityScore && item.popularityScore > 50 && (
                          <Badge className="absolute top-2 right-2 bg-amber-500 text-white">
                            Popular
                          </Badge>
                        )}
                      </div>
                      <CardContent className="space-y-3 pt-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold leading-tight">
                              {item.name}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {item.category?.name || 'General'}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-base font-bold text-emerald-700">
                              {formatCurrency(item.price)}
                            </span>
                            {item.calories && (
                              <p className="text-xs text-slate-500">{item.calories} cal</p>
                            )}
                          </div>
                        </div>

                        {item.description && (
                          <p className="text-sm text-slate-600 line-clamp-2">
                            {item.description}
                          </p>
                        )}

                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-xs py-0 px-2"
                              >
                                {getTagIcon(tag)}
                                <span className="ml-1">{tag}</span>
                              </Badge>
                            ))}
                          </div>
                        )}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fetchPairingSuggestions(item)}
                          disabled={loadingSuggestions && selectedItemForPairing?.id === item.id}
                          className="w-full"
                        >
                          {loadingSuggestions && selectedItemForPairing?.id === item.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              What Goes With This?
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Pairing Suggestions Dialog */}
      <Dialog open={showPairingSuggestions} onOpenChange={setShowPairingSuggestions}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              Perfect Pairings for {selectedItemForPairing?.name}
            </DialogTitle>
            <DialogDescription>
              AI-powered recommendations based on flavor profiles and popular combinations
            </DialogDescription>
          </DialogHeader>

          {loadingSuggestions ? (
            <div className="py-12 text-center">
              <Sparkles className="h-8 w-8 animate-spin mx-auto text-emerald-500" />
              <p className="mt-4 text-sm text-slate-500">
                Analyzing flavor profiles...
              </p>
            </div>
          ) : pairingSuggestions.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              No suggestions available at the moment.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {pairingSuggestions.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-32 w-full object-cover"
                    />
                  )}
                  <CardContent className="space-y-2 pt-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{item.name}</h4>
                        <p className="text-xs text-slate-500">
                          {item.category?.name || 'General'}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-emerald-700">
                        {formatCurrency(item.price)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-slate-600 line-clamp-3">
                        {item.description}
                      </p>
                    )}
                    {item.calories && (
                      <p className="text-xs text-slate-500 font-medium">
                        {item.calories} calories
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
