'use client'

import { useI18n } from '@/lib/i18n'
import MediaLibraryClient from './MediaLibraryClient'

export default function MediaLibraryPage() {
  const { t } = useI18n()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t.media_library_title}</h1>
        <p className="text-sm text-slate-500">
          {t.media_library_subtitle}
        </p>
      </div>
      <MediaLibraryClient />
    </div>
  )
}
