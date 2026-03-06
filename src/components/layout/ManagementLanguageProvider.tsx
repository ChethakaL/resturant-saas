'use client'

import { I18nProvider } from '@/lib/i18n'
import type { ManagementLocale } from '@/lib/i18n'

/**
 * Wraps the dashboard in the I18nProvider which fetches the management
 * language from the theme settings API and makes translated strings
 * available to the entire admin tree.
 */
export function ManagementLanguageProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode
  initialLocale?: ManagementLocale
}) {
  return <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
}
