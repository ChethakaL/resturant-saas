'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type CategoryOption = {
  id: string
  name: string
}

export default function CategoryFilterSelect({
  categories,
  defaultValue = '',
  allCategoriesLabel,
  searchPlaceholder,
  noResultsLabel,
  className,
}: {
  categories: CategoryOption[]
  defaultValue?: string
  allCategoriesLabel: string
  searchPlaceholder: string
  noResultsLabel: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(defaultValue)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  const selectedCategory = categories.find((c) => c.id === value)

  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return categories
    return categories.filter((c) => c.name.toLowerCase().includes(query))
  }, [categories, searchQuery])

  const selectCategory = (categoryId: string) => {
    setValue(categoryId)
    setOpen(false)
    setSearchQuery('')
  }

  return (
    <>
      <input type="hidden" name="category" value={value} />
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setSearchQuery('')
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'h-9 min-w-0 justify-between border-input bg-transparent px-3 font-normal hover:bg-accent sm:min-w-[160px] sm:max-w-[220px]',
              className
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span
                className={cn(
                  'truncate text-sm',
                  selectedCategory ? 'text-slate-900' : 'text-slate-500'
                )}
              >
                {selectedCategory?.name ?? allCategoriesLabel}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 pl-8 border-slate-200 focus-visible:ring-emerald-500"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => selectCategory('')}
              className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center justify-between gap-3"
            >
              <span className="truncate text-sm text-slate-800">{allCategoriesLabel}</span>
              {!value && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
            </button>
            {filteredCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category.id)}
                className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center justify-between gap-3"
              >
                <span className="truncate text-sm text-slate-800">{category.name}</span>
                {value === category.id && (
                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                )}
              </button>
            ))}
            {searchQuery.trim() && filteredCategories.length === 0 && (
              <p className="px-3 py-3 text-xs text-slate-500">{noResultsLabel}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
