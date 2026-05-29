'use client'

import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { useDynamicTranslate, useI18n } from '@/lib/i18n'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, useEffect, useState, useRef } from 'react'
import { INVENTORY_CATEGORY_OPTIONS } from '@/lib/inventory-categories'

export function InventorySearch() {
  const router = useRouter()
  const { t } = useI18n()
  const { t: td } = useDynamicTranslate()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState(searchParams.get('q') || '')
  const [category, setCategory] = useState(searchParams.get('category') || '')
  const [sort, setSort] = useState(searchParams.get('sort') || 'category_name')

  useEffect(() => {
    setValue(searchParams.get('q') || '')
    setCategory(searchParams.get('category') || '')
    setSort(searchParams.get('sort') || 'category_name')
  }, [searchParams])

  /** Only reset URL when filters change — not when only `page` changes (e.g. Next/Previous). */
  const skipFilterSyncRef = useRef(true)

  useEffect(() => {
    if (skipFilterSyncRef.current) {
      skipFilterSyncRef.current = false
      return
    }

    const params = new URLSearchParams()
    if (value) {
      params.set('q', value)
    }
    if (category) {
      params.set('category', category)
    }
    if (sort && sort !== 'category_name') {
      params.set('sort', sort)
    }
    params.set('page', '1')

    const timeout = setTimeout(() => {
      startTransition(() => {
        router.push(`/inventory?${params.toString()}`)
      })
    }, 300)

    return () => clearTimeout(timeout)
  }, [category, router, sort, value])

  return (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-3 md:w-auto md:flex-row">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={t.inventory_search_placeholder}
          className="pl-9"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {isPending && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        )}
      </div>

      <select
        className="flex h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">{td('All Categories')}</option>
        {INVENTORY_CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {td(option.label)}
          </option>
        ))}
      </select>

      <select
        className="flex h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        value={sort}
        onChange={(e) => setSort(e.target.value)}
      >
        <option value="category_name">{td('Sort: Category + Name')}</option>
        <option value="name_desc">{td('Sort: Name Z-A')}</option>
        <option value="cost_desc">{td('Sort: Cost High-Low')}</option>
        <option value="cost_asc">{td('Sort: Cost Low-High')}</option>
      </select>
    </div>
  )
}
