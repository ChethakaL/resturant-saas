import { GoogleGenerativeAI } from '@google/generative-ai'
import { getPlatformConfig } from './platform-config'

/** Default for cheap text calls */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

/** Vision: override with GEMINI_RECEIPT_MODEL (e.g. gemini-2.5-pro for harder Arabic tables). */
export function getReceiptVisionModel(): string {
  return process.env.GEMINI_RECEIPT_MODEL?.trim() || DEFAULT_GEMINI_MODEL
}

async function getGenAI() {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) {
    throw new Error('Google AI API key not configured')
  }
  return new GoogleGenerativeAI(apiKey)
}

export async function callGemini(
  prompt: string,
  generationConfig?: { maxOutputTokens?: number; temperature?: number }
) {
  const genAI = await getGenAI()
  const model = genAI.getGenerativeModel({
    model: DEFAULT_GEMINI_MODEL,
    ...(generationConfig
      ? {
          generationConfig: {
            maxOutputTokens: generationConfig.maxOutputTokens ?? 512,
            temperature: generationConfig.temperature ?? 0.4,
          },
        }
      : {}),
  })

  return model.generateContent(prompt)
}

/**
 * Multimodal: one image (base64) + text prompt. Uses Flash for cost efficiency.
 * Keep images small (e.g. ≤5MB JPEG) to limit input tokens.
 */
export async function callGeminiWithImage(options: {
  base64: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  prompt: string
  /** Cap output cost; receipt JSON rarely needs more than ~8k */
  maxOutputTokens?: number
  /** Defaults to GEMINI_RECEIPT_MODEL or Flash (cheap). Use Pro for better OCR on dense tables. */
  model?: string
}) {
  const genAI = await getGenAI()
  const modelName = options.model ?? getReceiptVisionModel()
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 8192,
      temperature: 0,
    },
  })

  return model.generateContent([
    {
      inlineData: {
        mimeType: options.mimeType,
        data: options.base64,
      },
    },
    { text: options.prompt },
  ])
}

export function extractJsonBlock(raw: string) {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
  const braceMatch = cleaned.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    return braceMatch[0]
  }
  return cleaned
}

function balanceJsonDelimiters(candidate: string) {
  let balanced = candidate
  const openCurly = (balanced.match(/\{/g) || []).length
  const closeCurly = (balanced.match(/\}/g) || []).length
  const openSquare = (balanced.match(/\[/g) || []).length
  const closeSquare = (balanced.match(/\]/g) || []).length

  if (closeSquare < openSquare) {
    balanced += ']'.repeat(openSquare - closeSquare)
  }
  if (closeCurly < openCurly) {
    balanced += '}'.repeat(openCurly - closeCurly)
  }

  return balanced
}

function repairJsonCandidate(candidate: string) {
  return balanceJsonDelimiters(
    candidate
      .trim()
      .replace(/^\uFEFF/, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ': "$1"')
      .replace(/\u00A0/g, ' ')
  )
}

function tryParseCandidates(candidate: string) {
  const normalized = candidate.trim()
  if (!normalized) {
    throw new Error('Empty candidate')
  }
  return JSON.parse(normalized)
}

export function parseGeminiJson(rawText: string) {
  const baseCandidate = extractJsonBlock(rawText)
  const normalizedCandidates = [
    baseCandidate,
    baseCandidate.replace(/(\r?\n)+/g, ' '),
    baseCandidate.replace(/,\s+/g, ', '),
    repairJsonCandidate(baseCandidate),
    repairJsonCandidate(baseCandidate.replace(/(\r?\n)+/g, ' ')),
  ]

  for (const candidate of normalizedCandidates) {
    try {
      return tryParseCandidates(candidate)
    } catch (error) {
      // Try the next candidate
    }
  }

  throw new Error('Unable to parse JSON from generative response')
}
