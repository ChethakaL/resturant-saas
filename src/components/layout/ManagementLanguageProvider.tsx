'use client'

import { useEffect } from 'react'

/**
 * Fetches dashboard theme and applies interface language (lang only).
 * Dashboard layout is always LTR so the sidebar stays on the left; lang is set for labels/screen readers.
 */
export function ManagementLanguageProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/theme')
      .then((res) => (res.ok ? res.json() : null))
      .then((theme: { managementLanguage?: string } | null) => {
        if (cancelled || !theme) return
        const lang = theme.managementLanguage ?? 'en'
        const root = document.documentElement
        root.setAttribute('dir', 'ltr')
        if (lang === 'ar-fusha' || lang === 'ar') {
          root.setAttribute('lang', 'ar')
        } else if (lang === 'ku') {
          root.setAttribute('lang', 'ku')
        } else {
          root.setAttribute('lang', 'en')
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return <>{children}</>
}
