import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IQ', {
    style: 'currency',
    currency: 'IQD',
    minimumFractionDigits: 0,
  }).format(amount)
}

/** For customer menu: no currency symbol, no .00 — e.g. "12,000". Use in engine / SmartMenu only. */
export function formatMenuPrice(amount: number): string {
  const n = Math.round(amount)
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

/**
 * Client-side price formatting for A/B tests (price_format experiment).
 * variant 'whole' = integer; 'decimal_9' = charm 9 (e.g. 17,900); 'decimal_5' = charm 5 (e.g. 18,500).
 * Use in customer-facing components only (experiment is client-assigned).
 */
export function formatMenuPriceWithVariant(amount: number, variant: string): string {
  const n = Math.round(amount)
  const format = (value: number) =>
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value))

  if (variant === 'decimal_9') {
    const major = n / 1000
    const charm = Math.floor(major) + 0.9
    return format(charm * 1000)
  }
  if (variant === 'decimal_5') {
    const major = n / 1000
    const charm = Math.floor(major) + 0.5
    return format(charm * 1000)
  }
  return format(n)
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}
