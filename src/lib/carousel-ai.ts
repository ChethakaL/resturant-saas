import { callGemini } from './generative'

export type TimeSlotLabel = 'Morning' | 'Lunch' | 'Evening' | 'Night'

export interface CarouselMenuItem {
  id: string
  name: string
  category?: string
  price: number
  marginPercent: number
}

const SLOT_LABELS: Record<string, TimeSlotLabel> = {
  day: 'Morning',
  evening: 'Lunch',
  night: 'Evening',
}

export function getTimeSlotLabel(slot: 'day' | 'evening' | 'night'): TimeSlotLabel {
  return SLOT_LABELS[slot] ?? 'Lunch'
}

/**
 * Ask AI to suggest carousel items for the given time of day.
 * Prefers high margin and variety; returns up to 16 item ids in order.
 * Falls back to margin-based sort if no API key or AI fails.
 */
export async function suggestCarouselItems(
  items: CarouselMenuItem[],
  timeSlot: TimeSlotLabel,
  options: { maxItems?: number } = {}
): Promise<string[]> {
  const maxItems = options.maxItems ?? 16
  if (items.length === 0) return []
  if (items.length <= maxItems) {
    return fallbackByMargin(items).map((i) => i.id)
  }

  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) {
    return fallbackByMargin(items)
      .slice(0, maxItems)
      .map((i) => i.id)
  }

  const list = items
    .map(
      (i) =>
        `- ${i.id}: "${i.name}" (${i.category ?? 'Uncategorized'}, ${formatPrice(i.price)}, margin ${i.marginPercent.toFixed(0)}%)`
    )
    .join('\n')

  const prompt = `You are a restaurant menu advisor. Given the current time of day, pick the best dishes to feature in a carousel.

Time of day: **${timeSlot}**
- Morning (6am–12pm): Lighter options, breakfast-friendly, drinks, quick bites.
- Lunch (12–6pm): Hearty mains, popular combos, good value.
- Evening/Night (6pm–6am): Dinner highlights, higher-margin items, chef specials.

Prioritize: (1) high profit margin, (2) suitability for the time slot, (3) variety (mix categories; do not suggest the same category repeatedly). Return exactly ${maxItems} item ids, one per line, in order of best to feature first. Only use ids from the list; do not repeat an id.

Menu items (id: name, category, price, margin):
${list}

Reply with only the list of ids, one per line, no other text.`

  try {
    const result = await callGemini(prompt)
    const text = result.response?.text?.()?.trim() ?? ''
    const ids = text
      .split(/\n/)
      .map((line) => line.trim().replace(/^[-•*]\s*/, '').split(/\s/)[0])
      .filter((id) => id && items.some((i) => i.id === id))
    const seen = new Set<string>()
    const unique: string[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      unique.push(id)
      if (unique.length >= maxItems) break
    }
    if (unique.length >= 8) return unique
    const fallbackIds = fallbackByMargin(items).map((i) => i.id)
    for (const id of fallbackIds) {
      if (unique.includes(id)) continue
      unique.push(id)
      if (unique.length >= maxItems) break
    }
    return unique
  } catch {
    return fallbackByMargin(items)
      .slice(0, maxItems)
      .map((i) => i.id)
  }
}

function fallbackByMargin(items: CarouselMenuItem[]): CarouselMenuItem[] {
  return [...items].sort((a, b) => b.marginPercent - a.marginPercent)
}

function formatPrice(price: number): string {
  if (price >= 1000) return `${(price / 1000).toFixed(1)}k`
  return String(Math.round(price))
}
