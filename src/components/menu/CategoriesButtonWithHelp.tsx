'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Layers } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export default function CategoriesButtonWithHelp() {
  const { t } = useI18n()
  return (
    <Link href="/categories" className="w-full sm:w-auto">
      <Button variant="outline" className="w-full sm:w-auto">
        <Layers className="h-4 w-4 mr-2" />
        {t.menu_add_categories}
      </Button>
    </Link>
  )
}
