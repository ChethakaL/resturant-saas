import crypto from 'crypto'

import type { TranslationSeedPayload } from '@/lib/menu-translation-seed'
import { DEFAULT_CATEGORY_NAME } from '@/lib/menu-translation-seed'

export function buildSourceFingerprint(payload: TranslationSeedPayload) {
  const normalizedPayload = {
    name: (payload.name || '').trim(),
    description: (payload.description || '').trim(),
    category: (payload.category || '').trim() || DEFAULT_CATEGORY_NAME,
    price: payload.price ?? 0,
    calories: payload.calories ?? 0,
    protein: payload.protein ?? null,
    carbs: payload.carbs ?? null,
  }

  return crypto.createHash('sha256').update(JSON.stringify(normalizedPayload)).digest('hex')
}
