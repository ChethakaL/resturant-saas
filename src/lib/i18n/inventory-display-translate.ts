import type { ManagementLocale } from '@/lib/i18n/translations'
import {
  translateReceiptStringsToLocale,
  type ReceiptTargetLocale,
} from '@/lib/i18n/receipt-translate'

function managementToReceiptLocale(locale: ManagementLocale): ReceiptTargetLocale {
  if (locale === 'ku') return 'ku'
  if (locale === 'ar-fusha') return 'ar-fusha'
  return 'en'
}

/**
 * Inventory rows store names/suppliers as entered (often Arabic). The dashboard UI language
 * comes from restaurant settings. `td()` only translates English→other in the client, so when
 * the UI is English, Arabic strings must be translated on the server.
 */
export async function translateInventoryTableRows<
  T extends {
    name: string
    supplier: string | null
    preferredSupplier: { name: string } | null
  },
>(rows: T[], locale: ManagementLocale): Promise<T[]> {
  if (rows.length === 0) return rows

  const target = managementToReceiptLocale(locale)
  const flat: string[] = []
  for (const r of rows) {
    flat.push(r.name)
    flat.push(r.supplier ?? '')
    flat.push(r.preferredSupplier?.name ?? '')
  }

  let translated: string[]
  try {
    translated = await translateReceiptStringsToLocale(flat, target)
  } catch (e) {
    console.warn('[inventory-display-translate] failed', e)
    return rows
  }

  let i = 0
  return rows.map((r) => {
    const name = translated[i++]!
    const supplier = translated[i++]! || null
    const prefName = translated[i++]!
    return {
      ...r,
      name,
      supplier,
      preferredSupplier: r.preferredSupplier
        ? { ...r.preferredSupplier, name: prefName }
        : null,
    }
  })
}

const API_CHUNK = 40 /** ingredients per translate batch to stay within Gemini limits */

type ApiIng = {
  name: string
  variants?: Array<{ brand: string; supplier: string | null; [key: string]: unknown }>
}

/** Full ingredient list for dropdowns (e.g. receipt modal). Chunked for large restaurants. */
export async function translateInventoryApiIngredients<T extends ApiIng>(
  ingredients: T[],
  locale: ManagementLocale
): Promise<T[]> {
  if (ingredients.length === 0) return ingredients
  const target = managementToReceiptLocale(locale)
  const out: T[] = []

  for (let c = 0; c < ingredients.length; c += API_CHUNK) {
    const slice = ingredients.slice(c, c + API_CHUNK)
    const flat: string[] = []
    for (const ing of slice) {
      flat.push(ing.name)
      const v0 = ing.variants?.[0]
      flat.push(v0?.brand ?? '')
      flat.push(v0?.supplier ?? '')
    }
    let translated: string[]
    try {
      translated = await translateReceiptStringsToLocale(flat, target)
    } catch (e) {
      console.warn('[inventory-display-translate] API chunk failed', e)
      out.push(...slice)
      continue
    }
    let i = 0
    for (const ing of slice) {
      const name = translated[i++]!
      const brand = translated[i++]!
      const sup = translated[i++]!
      if (!ing.variants?.length) {
        out.push({ ...ing, name } as T)
        continue
      }
      const v0 = ing.variants[0]
      out.push({
        ...ing,
        name,
        variants: [
          { ...v0, brand: brand || v0.brand, supplier: sup || v0.supplier },
          ...ing.variants.slice(1),
        ],
      } as T)
    }
  }

  return out
}
