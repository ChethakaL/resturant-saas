import { logImportFromUrl, warnImportFromUrl } from '@/lib/import-from-url-log'

const MAX_TEXT_LENGTH = 80_000
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export const MIN_MENU_PAGE_TEXT_LENGTH = 50

export type MenuPageFetchMethod = 'direct' | 'tavily-extract' | 'tavily-search' | null

const TAVILY_HEADERS = { 'Content-Type': 'application/json' }

export type MenuPageFetchResult = {
  pageText: string | null
  fetchError: unknown
  fetchMethod: MenuPageFetchMethod
}

export type MenuFetchProgressFn = (phase: string, message: string) => void

function stripHtmlToText(html: string): string {
  const withoutScriptStyle = html.replace(
    /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,
    ''
  )
  const text = withoutScriptStyle
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text
}

async function fetchWithNode(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(20_000),
  })

  const html = await res.text()

  if (!res.ok) {
    const hint =
      res.status === 403
        ? ' (menu site blocked server IP — normal for some hosts; Tavily may still work)'
        : ''
    throw new Error(`Direct fetch HTTP ${res.status} ${res.statusText}${hint}`)
  }

  const text = stripHtmlToText(html)
  logImportFromUrl('Direct fetch completed', {
    httpStatus: res.status,
    htmlChars: html.length,
    textChars: text.length,
  })
  return text
}

async function fetchWithTavilyExtract(url: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: TAVILY_HEADERS,
    body: JSON.stringify({
      api_key: apiKey,
      urls: [url],
      extract_depth: 'advanced',
      format: 'text',
    }),
    signal: AbortSignal.timeout(45_000),
  })

  const bodyText = await res.text()

  if (!res.ok) {
    const authHint = res.status === 401 || res.status === 403 ? ' — check TAVILY_API_KEY' : ''
    throw new Error(`Tavily extract HTTP ${res.status}${authHint}: ${bodyText.slice(0, 200)}`)
  }

  const data = JSON.parse(bodyText) as {
    results?: Array<{ raw_content?: string; content?: string }>
    failed_results?: unknown[]
  }

  if (data.failed_results?.length) {
    throw new Error(
      `Tavily extract rejected URL (failed_results): ${JSON.stringify(data.failed_results).slice(0, 200)}`
    )
  }

  const raw = data.results?.[0]?.raw_content ?? data.results?.[0]?.content
  if (!raw || typeof raw !== 'string') {
    throw new Error('Tavily extract HTTP 200 but no text in results')
  }

  logImportFromUrl('Tavily extract succeeded', { textChars: raw.length })
  return raw.length > MAX_TEXT_LENGTH ? raw.slice(0, MAX_TEXT_LENGTH) : raw
}

async function fetchWithTavilySearch(url: string, apiKey: string): Promise<string> {
  let domain = ''
  try {
    domain = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // ignore invalid URL here — caller validates earlier
  }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: TAVILY_HEADERS,
    body: JSON.stringify({
      api_key: apiKey,
      query: `restaurant menu items and prices ${url}`,
      search_depth: 'advanced',
      max_results: 8,
      include_raw_content: true,
      ...(domain ? { include_domains: [domain] } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  })

  const bodyText = await res.text()

  if (!res.ok) {
    const authHint = res.status === 401 || res.status === 403 ? ' — check TAVILY_API_KEY' : ''
    throw new Error(`Tavily search HTTP ${res.status}${authHint}: ${bodyText.slice(0, 200)}`)
  }

  const data = JSON.parse(bodyText) as {
    results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string }>
  }

  const resultCount = data.results?.length ?? 0
  const chunks: string[] = []
  for (const result of data.results ?? []) {
    const content = (result.raw_content || result.content || '').trim()
    if (!content) continue
    const title = result.title?.trim()
    const resultUrl = result.url?.trim()
    chunks.push([title, resultUrl, content].filter(Boolean).join('\n'))
  }

  const combined = chunks.join('\n\n').trim()
  if (!combined) {
    throw new Error(
      `Tavily search HTTP 200 but ${resultCount} result(s) had no text (extract will be tried next)`
    )
  }

  logImportFromUrl('Tavily search succeeded', {
    resultsWithText: chunks.length,
    textChars: combined.length,
  })
  return combined.length > MAX_TEXT_LENGTH ? combined.slice(0, MAX_TEXT_LENGTH) : combined
}

export async function fetchMenuPageText(
  url: string,
  tavilyApiKey?: string,
  onProgress?: MenuFetchProgressFn
): Promise<MenuPageFetchResult> {
  const progress = onProgress ?? (() => {})
  let pageText: string | null = null
  let fetchError: unknown = null
  let fetchMethod: MenuPageFetchMethod = null

  let host = url
  try {
    host = new URL(url).hostname
  } catch {
    // validated by caller
  }

  logImportFromUrl('Fetching page content', {
    host,
    jsMenu: isJsRenderedMenuSite(url),
    tavilyConfigured: !!tavilyApiKey,
  })

  progress('fetch', 'Opening menu link…')

  try {
    const directText = await fetchWithNode(url)
    if (directText.length >= MIN_MENU_PAGE_TEXT_LENGTH) {
      logImportFromUrl('Using direct fetch (enough text)', { textChars: directText.length })
      progress('fetch', 'Menu page loaded')
      return { pageText: directText, fetchError: null, fetchMethod: 'direct' }
    }
    if (directText.length > 0) {
      pageText = directText
    } else {
      logImportFromUrl(
        'Direct fetch returned empty text (common for JavaScript menus like mynu.app)',
        { next: tavilyApiKey ? 'trying Tavily' : 'need TAVILY_API_KEY' }
      )
    }
  } catch (error) {
    fetchError = error
    const msg = error instanceof Error ? error.message : String(error)
    if (/403|Forbidden/i.test(msg)) {
      warnImportFromUrl('Direct fetch blocked by menu website (not a missing API key)', {
        detail: msg,
        next: tavilyApiKey ? 'trying Tavily' : 'set TAVILY_API_KEY in Docker .env',
      })
    } else {
      warnImportFromUrl('Direct fetch failed', { detail: msg })
    }
  }

  if (tavilyApiKey) {
    progress('tavily', 'Reading menu with advanced link extraction…')
    const jsMenu = isJsRenderedMenuSite(url)
    const tavilyAttempts: Array<{ name: MenuPageFetchMethod; run: () => Promise<string> }> = jsMenu
      ? [
          { name: 'tavily-search', run: () => fetchWithTavilySearch(url, tavilyApiKey) },
          { name: 'tavily-extract', run: () => fetchWithTavilyExtract(url, tavilyApiKey) },
        ]
      : [
          { name: 'tavily-extract', run: () => fetchWithTavilyExtract(url, tavilyApiKey) },
          { name: 'tavily-search', run: () => fetchWithTavilySearch(url, tavilyApiKey) },
        ]

    for (let i = 0; i < tavilyAttempts.length; i++) {
      const attempt = tavilyAttempts[i]
      progress('tavily', `Loading menu content (${i + 1}/${tavilyAttempts.length})…`)
      logImportFromUrl(`Trying Tavily ${attempt.name}`, {
        step: `${i + 1}/${tavilyAttempts.length}`,
      })
      try {
        const tavilyText = await attempt.run()
        if (tavilyText.length >= MIN_MENU_PAGE_TEXT_LENGTH) {
          logImportFromUrl(`Using Tavily ${attempt.name}`, { textChars: tavilyText.length })
          progress('tavily', `Menu loaded (${Math.round(tavilyText.length / 1000)}k characters)`)
          return { pageText: tavilyText, fetchError: null, fetchMethod: attempt.name }
        }
        if (tavilyText.length > (pageText?.length ?? 0)) {
          pageText = tavilyText
          fetchMethod = attempt.name
        }
        warnImportFromUrl(`Tavily ${attempt.name} returned too little text`, {
          textChars: tavilyText.length,
          need: MIN_MENU_PAGE_TEXT_LENGTH,
        })
      } catch (error) {
        fetchError = error
        const msg = error instanceof Error ? error.message : String(error)
        const isSoftFail = /will be tried next|too little/i.test(msg)
        if (isSoftFail) {
          logImportFromUrl(`Tavily ${attempt.name} skipped`, { reason: msg })
        } else {
          warnImportFromUrl(`Tavily ${attempt.name} failed`, { reason: msg })
        }
      }
    }
  } else {
    warnImportFromUrl(
      'TAVILY_API_KEY not loaded — Docker must use env_file: .env or set TAVILY_API_KEY in container environment',
      {
        hint: 'process.env.TAVILY_API_KEY is empty and no database tavilyApiKey',
      }
    )
  }

  if (pageText && pageText.length > 0 && fetchMethod) {
    logImportFromUrl(`Using partial Tavily ${fetchMethod}`, { textChars: pageText.length })
  } else if (!tavilyApiKey) {
    warnImportFromUrl('No page text from direct fetch or Tavily', {
      directFetchError: fetchError instanceof Error ? fetchError.message : undefined,
    })
  }

  return {
    pageText: pageText && pageText.length > 0 ? pageText : null,
    fetchError,
    fetchMethod,
  }
}

export function isJsRenderedMenuSite(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return /mynu\.app|gloriafood|musthavemenus|menufy|dotpe|upmenu|menu\.|orderme/i.test(host)
  } catch {
    return false
  }
}
