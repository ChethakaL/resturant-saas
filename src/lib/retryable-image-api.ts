import { getImageModelGenerateContentUrl } from '@/lib/image-api-model'

const IMAGE_API_TIMEOUT_MS = 45_000
const MAX_RETRIES = 2
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const directCode = (error as Error & { code?: string }).code
  if (directCode) return directCode
  const causeCode = (error as Error & { cause?: { code?: string } }).cause?.code
  return causeCode
}

function isRetryableTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const code = getErrorCode(error)
  if (code && RETRYABLE_CODES.has(code)) return true

  const message = error.message.toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('socket') ||
    message.includes('tls')
  )
}

export async function postToImageModel(apiKey: string, body: unknown): Promise<Response> {
  const url = getImageModelGenerateContentUrl(apiKey)
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), IMAGE_API_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      return response
    } catch (error) {
      clearTimeout(timeout)
      lastError = error

      if (attempt === MAX_RETRIES || !isRetryableTransportError(error)) {
        throw error
      }

      const code = getErrorCode(error) ?? 'UNKNOWN'
      console.warn(
        '[image-api] transient failure on attempt %d/%d: code=%s message=%s',
        attempt + 1,
        MAX_RETRIES + 1,
        code,
        error instanceof Error ? error.message : String(error)
      )
      await delay(600 * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Image API request failed')
}
