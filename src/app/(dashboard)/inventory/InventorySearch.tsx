'use client'

import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, useEffect, useState } from 'react'

export function InventorySearch() {
    const router = useRouter()
    const { t } = useI18n()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const [value, setValue] = useState(searchParams.get('q') || '')

    useEffect(() => {
        const params = new URLSearchParams(searchParams)
        if (value) {
            params.set('q', value)
        } else {
            params.delete('q')
        }
        // Reset to page 1 on search
        params.set('page', '1')

        const timeout = setTimeout(() => {
            startTransition(() => {
                router.push(`/inventory?${params.toString()}`)
            })
        }, 300)

        return () => clearTimeout(timeout)
    }, [value, router, searchParams])

    return (
        <div className="relative w-full max-w-sm">
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
    )
}
