export function buildPublicMenuUrl(slugOrUrl: string) {
  const rawValue = String(slugOrUrl || '').trim()
  if (!rawValue) return ''

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue
  }

  const baseUrl =
    (process.env.NEXT_PUBLIC_RESTAURANT_MENU_BASE_URL || '').trim().replace(/\/+$/, '') ||
    'https://restaurant.babalilm-ai.com'

  return `${baseUrl}/${rawValue.replace(/^\/+/, '')}`
}
