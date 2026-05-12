/** Stripe + DB subscription states we treat as paid access. */
export function isSubscriptionAccessActive(status: string | null | undefined): boolean {
  const s = status?.trim().toLowerCase()
  return s === 'active' || s === 'trialing'
}

/** Human-readable renewal / period end for toasts and API payloads (browser or server). */
export function formatSubscriptionPeriodEnd(
  iso: string | null | undefined,
  locale?: string
): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
}

