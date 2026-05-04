import { GoogleGenerativeAI } from '@google/generative-ai'
import { getPlatformConfig } from './platform-config'

const ALLOWED_TAGS = [
  'vegetarian',
  'vegan',
  'halal',
  'kosher',
  'gluten-free',
  'dairy-free',
  'nut-free',
  'soy-free',
  'egg-free',
  'keto',
  'low-carb',
  'high-protein',
  'protein-rich',
  'seafood',
  'pescatarian',
  'spicy',
] as const

const ALLOWED_TAG_SET = new Set<string>(ALLOWED_TAGS)
const AUTO_INFERRED_TAGS = new Set<string>([
  'vegetarian',
  'vegan',
  'high-protein',
  'seafood',
  'pescatarian',
])
const AI_SUPPLEMENT_TAGS = new Set<string>([
  'vegetarian',
  'vegan',
  'seafood',
  'pescatarian',
])

export interface InferMenuTagsInput {
  itemName: string
  description?: string | null
  categoryName?: string | null
  ingredientNames?: string[] | null
  existingTags?: string[] | null
  protein?: number | null
  carbs?: number | null
}

function buildHaystack(input: InferMenuTagsInput): string {
  return [
    input.itemName,
    input.description,
    input.categoryName,
    ...(input.ingredientNames ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function normalizeTag(tag: string): string | null {
  const lower = tag.toLowerCase().trim().replace(/\s+/g, '-')
  if (!lower) return null
  if (lower === 'high-protein' || lower === 'protein-rich' || lower === 'high-protein-rich') {
    return 'high-protein'
  }
  if (lower === 'high-protein' || lower === 'protein-rich') return 'high-protein'
  if (lower === 'glutenfree') return 'gluten-free'
  if (lower === 'dairyfree') return 'dairy-free'
  if (lower === 'nutfree') return 'nut-free'
  if (lower === 'soyfree') return 'soy-free'
  if (lower === 'eggfree') return 'egg-free'
  if (lower === 'lowcarb') return 'low-carb'
  return lower
}

export function normalizeMenuTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return []
  const out = new Set<string>()

  for (const rawTag of tags) {
    if (typeof rawTag !== 'string') continue
    const normalized = normalizeTag(rawTag)
    if (!normalized) continue
    if (!ALLOWED_TAG_SET.has(normalized)) {
      if (normalized === 'protein-rich') {
        out.add('high-protein')
      } else {
        continue
      }
    } else {
      out.add(normalized === 'protein-rich' ? 'high-protein' : normalized)
    }
  }

  return Array.from(out).sort()
}

function inferTagsHeuristically(input: InferMenuTagsInput): string[] {
  const haystack = buildHaystack(input)

  const out = new Set<string>()

  if (/\b(spicy|chili|chilli|harissa|jalapeno|jalapeño)\b/.test(haystack)) out.add('spicy')
  if (/\b(gluten-free|gluten free)\b/.test(haystack)) out.add('gluten-free')
  if (/\bhalal\b/.test(haystack)) out.add('halal')
  if (/\b(fish|salmon|shrimp|prawn|tuna|seafood|masgouf)\b/.test(haystack)) {
    out.add('seafood')
    out.add('pescatarian')
  }
  if (/\b(americano|espresso|coffee|tea|juice|lemonade)\b/.test(haystack)) {
    out.add('vegetarian')
    out.add('vegan')
  }
  if (/\b(falafel|hummus|tabouleh|tabbouleh|fattoush|baba ghanoush)\b/.test(haystack)) {
    out.add('vegan')
    out.add('vegetarian')
  }
  if (/\b(yogurt|yoghurt|cheese|labneh|milk|cream|butter)\b/.test(haystack)) {
    out.delete('vegan')
    out.add('vegetarian')
  }
  if (/\b(latte|cappuccino|macchiato|mocha)\b/.test(haystack)) {
    out.delete('vegan')
    out.add('vegetarian')
  }
  if (/\b(chicken|beef|lamb|meat|kebab|tikka|biryani)\b/.test(haystack)) {
    out.delete('vegan')
    out.delete('vegetarian')
  }
  if (
    (input.protein ?? 0) >= 20 ||
    /\b(chicken|beef|lamb|kebab|tikka|grill|grilled|fish|salmon|shrimp|prawn|tuna|seafood)\b/.test(haystack)
  ) {
    out.add('high-protein')
  }
  if ((input.carbs ?? 999) <= 15) out.add('low-carb')
  if ((input.carbs ?? 999) <= 10) out.add('keto')

  const normalized = normalizeMenuTags(Array.from(out))
  return normalized.filter(
    (tag) =>
      AUTO_INFERRED_TAGS.has(tag) ||
      tag === 'spicy' ||
      tag === 'gluten-free' ||
      tag === 'halal' ||
      tag === 'low-carb' ||
      tag === 'keto'
  )
}

function validateAutoTags(tags: string[], input: InferMenuTagsInput): string[] {
  const haystack = buildHaystack(input)
  const hasFish = /\b(fish|salmon|shrimp|prawn|tuna|seafood|masgouf)\b/.test(haystack)
  const hasMeat = /\b(chicken|beef|lamb|meat|kebab|tikka|biryani|kabsa|sambousek|grill|grilled)\b/.test(haystack)
  const hasDairy = /\b(yogurt|yoghurt|cheese|labneh|milk|cream|butter|latte|cappuccino|macchiato|mocha)\b/.test(haystack)
  const explicitOnly = new Set(inferTagsHeuristically(input))

  return normalizeMenuTags(tags).filter((tag) => {
    if (tag === 'vegan') return !hasFish && !hasMeat && !hasDairy
    if (tag === 'vegetarian') return !hasFish && !hasMeat
    if (tag === 'seafood' || tag === 'pescatarian') return hasFish
    if (tag === 'high-protein') {
      return (input.protein ?? 0) >= 20 || /\b(chicken|beef|lamb|kebab|tikka|grill|grilled|fish|salmon|shrimp|prawn|tuna|seafood)\b/.test(haystack)
    }
    if (tag === 'low-carb') return (input.carbs ?? 999) <= 15 || /\blow-carb\b/.test(haystack)
    if (tag === 'keto') return (input.carbs ?? 999) <= 10 || /\bketo\b/.test(haystack)
    if (tag === 'spicy' || tag === 'gluten-free' || tag === 'halal') return explicitOnly.has(tag)
    return true
  })
}

async function inferTagsWithGemini(input: InferMenuTagsInput): Promise<string[]> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) return []

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You classify restaurant menu items with conservative dietary/style tags.

Allowed tags only:
${ALLOWED_TAGS.join(', ')}

Rules:
- Return only tags that are reasonably confident from the dish name, description, category, ingredients, and macros.
- Only auto-infer from this conservative subset: vegetarian, vegan, seafood, pescatarian.
- High-protein, low-carb, and keto should be inferred from explicit macros or very clear dish structure only.
- You may include spicy, gluten-free, or halal only when those are explicit in the item data.
- Do not infer allergen-free tags like dairy-free, nut-free, soy-free, egg-free from dish names alone.
- Do not infer kosher unless explicitly stated.
- Do not infer halal unless explicitly stated or unmistakably established by the item data.
- "protein-rich" and "high-protein" should be returned as "high-protein".
- A vegetarian item can also be vegan if clearly dairy/egg/meat free.
- "spicy" is allowed when the dish clearly sounds spicy.
- Return an empty list if uncertain.

Input:
{
  "itemName": ${JSON.stringify(input.itemName)},
  "description": ${JSON.stringify(input.description ?? '')},
  "categoryName": ${JSON.stringify(input.categoryName ?? '')},
  "ingredientNames": ${JSON.stringify(input.ingredientNames ?? [])},
  "existingTags": ${JSON.stringify(normalizeMenuTags(input.existingTags))},
  "protein": ${JSON.stringify(input.protein ?? null)},
  "carbs": ${JSON.stringify(input.carbs ?? null)}
}

Return valid JSON only:
{
  "tags": ["tag1", "tag2"]
}`

  const result = await model.generateContent(prompt)
  const raw = result.response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '')
  const match = raw.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(match ? match[0] : raw) as { tags?: unknown }
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((tag): tag is string => typeof tag === 'string')
    : []

  return normalizeMenuTags(tags).filter(
    (tag) =>
      AI_SUPPLEMENT_TAGS.has(tag) ||
      ((tag === 'spicy' || tag === 'gluten-free' || tag === 'halal') &&
        inferTagsHeuristically(input).includes(tag))
  )
}

export async function inferMenuTags(input: InferMenuTagsInput): Promise<string[]> {
  const existing = normalizeMenuTags(input.existingTags)
  const heuristic = validateAutoTags(inferTagsHeuristically(input), input)

  try {
    const aiTags = await inferTagsWithGemini(input)
    return validateAutoTags([...existing, ...heuristic, ...aiTags], input)
  } catch {
    return validateAutoTags([...existing, ...heuristic], input)
  }
}
