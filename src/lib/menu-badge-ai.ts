/**
 * Server-only: use AI to pick which menu items deserve "Signature" and "Most Loved" badges
 * when there is no sales data. Analyzes names, descriptions, categories, and prices
 * to make intelligent choices. Most items should have no badge.
 */

import { unstable_cache } from 'next/cache'
import { GoogleGenerativeAI } from '@google/generative-ai'

export interface MenuItemForBadge {
  id: string
  name: string
  description?: string | null
  categoryName?: string | null
  price: number
  tags?: string[] | null
}

export interface BadgePicks {
  signatureIds: string[]
  mostLovedIds: string[]
}

const CACHE_SECONDS = 600 // 10 min — menu content changes infrequently

/**
 * Call Gemini to suggest signature and most loved items. Returns empty arrays if
 * AI is not configured or fails.
 */
export async function suggestMenuBadges(items: MenuItemForBadge[]): Promise<BadgePicks> {
  if (!process.env.GOOGLE_AI_KEY || items.length === 0) {
    return { signatureIds: [], mostLovedIds: [] }
  }

  const payload = items.map((i) => ({
    id: i.id,
    name: i.name,
    description: (i.description || '').slice(0, 120),
    category: i.categoryName || '',
    price: i.price,
    tags: (i.tags || []).slice(0, 5),
  }))

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are a restaurant menu strategist. Given a list of menu items, choose ONLY a few items that truly deserve special badges.

RULES (strictly follow):
1. Be highly selective. Most items should get NO badge.
2. "signature" = the restaurant's standout, signature dish — usually 1–2 per category max. Think: premium, iconic, chef's special, house specialty.
3. "most_loved" = items that would likely be crowd favorites based on name, description, and appeal — 1–2 per category max. Think: classic favorites, comfort food, popular choices.
4. Do NOT badge generic items (e.g. plain "Americano", "Orange Juice") unless they are truly special.
5. Prefer items with richer descriptions, premium prices, or distinctive names for "signature".
6. "most_loved" can include comforting or popular-sounding items that guests would gravitate toward.
7. Return at most 2 signature IDs and 3 most_loved IDs total across the entire menu (fewer is better).

Menu items (JSON):
${JSON.stringify(payload, null, 0)}

Return ONLY valid JSON in this exact format, no other text:
{"signatureIds":["id1","id2"],"mostLovedIds":["id3","id4"]}

Use empty arrays [] if nothing deserves a badge. Return ONLY the JSON object.`

  try {
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { signatureIds: [], mostLovedIds: [] }
    let parsed: { signatureIds?: string[]; mostLovedIds?: string[] }
    try {
      parsed = JSON.parse(jsonMatch[0]) as { signatureIds?: string[]; mostLovedIds?: string[] }
    } catch {
      return { signatureIds: [], mostLovedIds: [] }
    }
    const validIds = new Set(items.map((i) => i.id))
    const signatureIds = (parsed.signatureIds || []).filter((id) => validIds.has(id)).slice(0, 3)
    const mostLovedIds = (parsed.mostLovedIds || []).filter((id) => validIds.has(id)).slice(0, 5)
    return { signatureIds, mostLovedIds }
  } catch {
    return { signatureIds: [], mostLovedIds: [] }
  }
}

/** Cached version keyed by restaurant and item list fingerprint. */
export async function getCachedBadgePicks(
  restaurantId: string,
  items: MenuItemForBadge[]
): Promise<BadgePicks> {
  const fingerprint = items.length + '-' + items.slice(0, 20).map((i) => i.id).join(',')
  return unstable_cache(
    () => suggestMenuBadges(items),
    ['menu-badge-ai', restaurantId, fingerprint],
    { revalidate: CACHE_SECONDS }
  )()
}
