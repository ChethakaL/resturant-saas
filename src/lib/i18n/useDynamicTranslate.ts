'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from './I18nProvider'
import { getStaticTranslationForSourceText } from './translations'

const pending = new Map<string, Promise<string>>()
const STORAGE_PREFIX = 'dynamic-i18n-cache:'

export function useDynamicTranslate() {
  const { locale, loaded } = useI18n()
  const [cache, setCache] = useState<Record<string, string>>({})

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${locale}`)
      setCache(raw ? JSON.parse(raw) as Record<string, string> : {})
    } catch {
      setCache({})
    }
  }, [locale])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(`${STORAGE_PREFIX}${locale}`, JSON.stringify(cache))
    } catch {
      // Ignore storage failures.
    }
  }, [locale, cache])

  const resolveStaticTranslation = useCallback(
    (sourceText: string): string | null => getStaticTranslationForSourceText(locale, sourceText),
    [locale]
  )

  const fetchTranslation = useCallback(async (sourceText: string): Promise<string> => {
    const key = sourceText.trim()
    if (!key) return sourceText
    if (locale === 'en') return key

    const staticTranslation = resolveStaticTranslation(key)
    if (staticTranslation) return staticTranslation
    if (cache[key]) return cache[key]

    const cacheKey = `${locale}:${key}`
    const existing = pending.get(cacheKey)
    if (existing) return existing

    const promise = fetch(
      `/api/i18n/translate?text=${encodeURIComponent(key)}&locale=${encodeURIComponent(locale)}`
    )
      .then((r) => r.json())
      .then((data) => {
        const translated = (data.translated ?? '').trim() || key
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
  }, [locale, cache, resolveStaticTranslation])

  const fallbackText = useMemo(() => {
    if (locale === 'en') return null
    if (!loaded) return null
    return null
  }, [locale, loaded])

  const t = useCallback(
    (sourceText: string): string => {
      const key = (sourceText ?? '').trim()
      if (!key) return sourceText ?? ''
      if (locale === 'en') return key
      if (!loaded) return key

      const staticTranslation = resolveStaticTranslation(key)
      if (staticTranslation) return staticTranslation
      if (cache[key]) return cache[key]

      fetchTranslation(key)
      return fallbackText ?? key
    },
    [locale, loaded, cache, fetchTranslation, resolveStaticTranslation, fallbackText]
  )

  useEffect(() => {
    return () => {
      pending.clear()
    }
  }, [locale])

  return { t, fetchTranslation }
}
