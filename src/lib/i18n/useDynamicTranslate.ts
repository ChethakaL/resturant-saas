'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from './I18nProvider'

const pending = new Map<string, Promise<string>>()

export function useDynamicTranslate() {
  const { locale } = useI18n()
  const [cache, setCache] = useState<Record<string, string>>({})

  const fetchTranslation = useCallback(async (sourceText: string): Promise<string> => {
    const key = sourceText.trim()
    if (!key) return sourceText
    if (locale === 'en') return key

    const cacheKey = `${locale}:${key}`
    const existing = pending.get(cacheKey)
    if (existing) return existing

    const promise = fetch(
      `/api/i18n/translate?text=${encodeURIComponent(key)}&locale=${encodeURIComponent(locale)}`
    )
      .then((r) => r.json())
      .then((data) => {
        const translated = data.translated ?? key
        setCache((prev) => {
          const next = { ...prev, [key]: translated }
          return next
        })
        pending.delete(cacheKey)
        return translated
      })
      .catch(() => {
        pending.delete(cacheKey)
        return key
      })

    pending.set(cacheKey, promise)
    return promise
  }, [locale])

  const t = useCallback(
    (sourceText: string): string => {
      const key = (sourceText ?? '').trim()
      if (!key) return sourceText ?? ''
      if (locale === 'en') return key
      if (cache[key]) return cache[key]

      fetchTranslation(key)
      return key
    },
    [locale, cache, fetchTranslation]
  )

  useEffect(() => {
    return () => {
      pending.clear()
    }
  }, [locale])

  return { t, fetchTranslation }
}
