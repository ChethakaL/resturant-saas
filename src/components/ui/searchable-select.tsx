'use client'

import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SearchableSelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  maxHeight?: string
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  className,
  maxHeight = 'max-h-60',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const searchLower = search.trim().toLowerCase()
  const filtered =
    !searchLower
      ? options
      : options.filter(
          (o) =>
            o.value.toLowerCase().includes(searchLower) ||
            o.label.toLowerCase().includes(searchLower)
        )

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value

  useEffect(() => {
    if (open) {
      setSearch('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-10 w-full max-w-xs items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400',
            className
          )}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="border-b p-2">
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
          />
        </div>
        <div
          className={cn('overflow-y-auto overscroll-contain p-1', maxHeight)}
        >
          {filtered.length === 0 ? (
            <div className="py-4 text-center text-sm text-slate-500">
              No results
            </div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition',
                  value === opt.value
                    ? 'bg-slate-100 font-medium'
                    : 'hover:bg-slate-50'
                )}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
