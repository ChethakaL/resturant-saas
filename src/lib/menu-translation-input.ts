import type { MenuItemTranslationLanguage } from '@prisma/client'

export interface TranslationInputPayload {
  language: MenuItemTranslationLanguage
  name: string
  description: string
  aiDescription: string
  protein: number | null
  carbs: number | null
}

const SUPPORTED_LANGUAGES: MenuItemTranslationLanguage[] = [
  'ar',
  'ku',
] as MenuItemTranslationLanguage[]

export function normalizeTranslationInputs(items: unknown): TranslationInputPayload[] {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map((raw) => {
      if (!raw || typeof raw !== 'object') {
        return null
      }

      const language = (raw as any).language as MenuItemTranslationLanguage | undefined
      if (!language || !SUPPORTED_LANGUAGES.includes(language)) {
        return null
      }

      const name = ((raw as any).name || '').trim()
      const description = ((raw as any).description || '').trim()
      if (!name && !description) {
        return null
      }

      return {
        language,
        name,
        description,
        aiDescription: ((raw as any).aiDescription || '').trim(),
        protein:
          typeof (raw as any).protein === 'number'
            ? (raw as any).protein
            : null,
        carbs:
          typeof (raw as any).carbs === 'number'
            ? (raw as any).carbs
            : null,
      }
    })
    .filter((item): item is TranslationInputPayload => Boolean(item))
}
