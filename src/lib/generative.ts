import { GoogleGenerativeAI } from '@google/generative-ai'

export async function callGemini(prompt: string) {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) {
    throw new Error('Google AI API key not configured')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
  })

  return model.generateContent(prompt)
}

export function extractJsonBlock(raw: string) {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
  const braceMatch = cleaned.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    return braceMatch[0]
  }
  return cleaned
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
