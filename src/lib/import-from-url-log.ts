/** Server logs for menu URL import — grep docker logs for `[import-from-url]` */

export function maskSecret(value: string | undefined | null): string {
  if (!value || typeof value !== 'string') return '(not set)'
  const trimmed = value.trim()
  if (trimmed.length <= 8) return '***'
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)} (${trimmed.length} chars)`
}

export function logImportFromUrl(
  message: string,
  details?: Record<string, string | number | boolean | null | undefined>
) {
  if (details && Object.keys(details).length > 0) {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    console.log(`[import-from-url] ${message} | ${parts.join(' ')}`)
  } else {
    console.log(`[import-from-url] ${message}`)
  }
}

export function warnImportFromUrl(
  message: string,
  details?: Record<string, string | number | boolean | null | undefined>
) {
  if (details && Object.keys(details).length > 0) {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    console.warn(`[import-from-url] ${message} | ${parts.join(' ')}`)
  } else {
    console.warn(`[import-from-url] ${message}`)
  }
}

export function errorImportFromUrl(message: string, error: unknown) {
  const errMsg = error instanceof Error ? error.message : String(error)
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined
  console.error(
    `[import-from-url] ${message}`,
    status != null ? `(HTTP ${status})` : '',
    errMsg
  )
}

export type TavilyKeyDiagnostics = {
  configured: boolean
  source: 'database' | 'env' | 'none'
  preview: string
}

/** Where Tavily key resolved from (DB overrides env per platform-config). */
export function getTavilyKeyDiagnostics(
  dbTavilyKey: string | undefined,
  resolvedKey: string | undefined
): TavilyKeyDiagnostics {
  const envKey = process.env.TAVILY_API_KEY?.trim()
  if (dbTavilyKey?.trim()) {
    return {
      configured: true,
      source: 'database',
      preview: maskSecret(dbTavilyKey),
    }
  }
  if (envKey) {
    return {
      configured: true,
      source: 'env',
      preview: maskSecret(envKey),
    }
  }
  if (resolvedKey?.trim()) {
    return {
      configured: true,
      source: 'env',
      preview: maskSecret(resolvedKey),
    }
  }
  return { configured: false, source: 'none', preview: '(not set)' }
}

export function describeAiKeys(config: {
  tavily?: TavilyKeyDiagnostics
  gemini: boolean
  openai: boolean
  anthropic: boolean
}): void {
  logImportFromUrl('API keys for this request', {
    tavily: config.tavily?.configured
      ? `yes (${config.tavily.source}, ${config.tavily.preview})`
      : 'NO — set TAVILY_API_KEY in server .env and restart Docker',
    gemini: config.gemini ? 'yes' : 'no',
    openai: config.openai ? 'yes' : 'no',
    anthropic: config.anthropic ? 'yes' : 'no',
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
  })
}
