'use client'

import { Button } from '@/components/ui/button'
import { HelpCircle } from 'lucide-react'
import CategoriesManager, { type CategoryWithItems } from '@/components/dashboard/CategoriesManager'
import { useI18n } from '@/lib/i18n'

interface CategoriesPageClientProps {
  initialCategories: CategoryWithItems[]
  uiTranslationMap: Record<string, string>
}

export default function CategoriesPageClient({ initialCategories, uiTranslationMap }: CategoriesPageClientProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t.categories_title}</h1>
          <p className="text-slate-500 mt-1">
            {t.categories_subtitle}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => window.dispatchEvent(new Event('open-page-tour'))}
          aria-label="Start interactive tour"
        >
          <HelpCircle className="h-4 w-4" />
          Tour this page
        </Button>
      </div>

      <CategoriesManager initialCategories={initialCategories} uiTranslationMap={uiTranslationMap} />
    </div>
  )
}
