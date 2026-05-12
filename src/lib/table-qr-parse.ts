/**
 * Extract menu slug from public menu path (e.g. "/my-restaurant" -> "my-restaurant").
 */
export function menuSlugFromPathname(pathname: string): string {
  return pathname.replace(/^\//, '').split('/').filter(Boolean)[0] ?? ''
}

function tableFromSearchParams(url: URL): string | null {
  const t = url.searchParams.get('table')?.trim() || url.searchParams.get('tableNumber')?.trim()
  return t || null
}

/** True if QR URL targets the same public menu slug as the current page (host may differ, e.g. ngrok vs prod). */
export function qrUrlMatchesCurrentMenu(qrUrl: URL, currentPathname: string): boolean {
  const currentSlug = menuSlugFromPathname(currentPathname)
  const qrSlug = menuSlugFromPathname(qrUrl.pathname)
  if (!currentSlug || !qrSlug) return false
  return currentSlug.toLowerCase() === qrSlug.toLowerCase()
}

/**
 * Parse decoded QR text into a table number for this menu.
 * Accepts full menu URLs with ?table= / ?tableNumber=, or a plain table label.
 */
export function extractTableNumberFromQrText(
  raw: string,
  ctx: { pathname: string; origin: string }
): string | null {
  const t = raw.trim()
  if (!t) return null

  try {
    const url = new URL(t)
    const fromQuery = tableFromSearchParams(url)
    if (!fromQuery) return null

    const sameOrigin = url.origin === ctx.origin
    const samePath = url.pathname === ctx.pathname
    const sameMenuSlug = qrUrlMatchesCurrentMenu(url, ctx.pathname)

    if (sameOrigin && (samePath || sameMenuSlug)) return fromQuery
    if (!sameOrigin && sameMenuSlug) return fromQuery
    if (sameOrigin && ctx.pathname.startsWith(url.pathname)) return fromQuery

    return null
  } catch {
    const cleaned = t.replace(/^table\s*#?\s*/i, '').trim()
    if (/^[\w\-]{1,40}$/i.test(cleaned)) return cleaned
  }

  return null
}
