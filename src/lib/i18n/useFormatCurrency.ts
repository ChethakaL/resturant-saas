'use client'

import { useCallback } from 'react'
import { formatCurrency } from '@/lib/utils'
import { useI18n } from './I18nProvider'

/** Returns a function that formats amount using the restaurant's currency. */
export function useFormatCurrency(): (amount: number) => string {
  const { currency } = useI18n()
  return useCallback((amount: number) => formatCurrency(amount, currency), [currency])
}
