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

  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`)
  }

  return stripHtmlToText(await res.text())
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

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Tavily extract failed: ${res.status} ${err}`)
  }

  const data = (await res.json()) as {
    results?: Array<{ raw_content?: string; content?: string }>
    failed_results?: unknown[]
  }

  if (data.failed_results?.length) {
    throw new Error('Tavily could not extract this URL')
  }

  const raw = data.results?.[0]?.raw_content ?? data.results?.[0]?.content
  if (!raw || typeof raw !== 'string') {
    throw new Error('No content extracted from URL')
  }

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

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Tavily search failed: ${res.status} ${err}`)
  }

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string }>
  }

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
    throw new Error('Tavily search returned no menu content')
  }

  return combined.length > MAX_TEXT_LENGTH ? combined.slice(0, MAX_TEXT_LENGTH) : combined
}

export async function fetchMenuPageText(
  url: string,
  tavilyApiKey?: string
): Promise<MenuPageFetchResult> {
  let pageText: string | null = null
  let fetchError: unknown = null
  let fetchMethod: MenuPageFetchMethod = null

  try {
    const directText = await fetchWithNode(url)
    if (directText.length >= MIN_MENU_PAGE_TEXT_LENGTH) {
      return { pageText: directText, fetchError: null, fetchMethod: 'direct' }
    }
    if (directText.length > 0) {
      pageText = directText
    }
  } catch (error) {
    fetchError = error
    console.warn('[import-from-url] Direct fetch failed:', error instanceof Error ? error.message : error)
  }

  if (tavilyApiKey) {
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

    for (const attempt of tavilyAttempts) {
      try {
        const tavilyText = await attempt.run()
        if (tavilyText.length >= MIN_MENU_PAGE_TEXT_LENGTH) {
          return { pageText: tavilyText, fetchError: null, fetchMethod: attempt.name }
        }
        if (tavilyText.length > (pageText?.length ?? 0)) {
          pageText = tavilyText
          fetchMethod = attempt.name
        }
      } catch (error) {
        fetchError = error
        console.warn(
          `[import-from-url] Tavily ${attempt.name} failed:`,
          error instanceof Error ? error.message : error
        )
      }
    }
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
