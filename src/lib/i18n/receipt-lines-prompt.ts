/** Shared prompt for receipt line translation (OpenAI / Gemini). */

export type ReceiptTargetLocale = 'en' | 'ar-fusha' | 'ku'

export function targetLanguageLabel(locale: ReceiptTargetLocale): string {
  if (locale === 'en') return 'English'
  if (locale === 'ku') return 'Sorani Kurdish (کوردی سۆرانی)'
  return 'Modern Standard Arabic (العربية الفصحى)'
}

/**
 * Iraqi wholesale invoices often spell English brands phonetically in Arabic.
 * Models must infer the real product (Kinder Happy Hippo, Doritos Flamin' Hot, etc.), not literal transliteration.
 */
export function buildReceiptLinesPrompt(locale: ReceiptTargetLocale, inputJson: string): string {
  const label = targetLanguageLabel(locale)

  return `You translate wholesale food receipt line items into ${label}.

Context: snacks, confectionery, chocolate, chips, beverages, dairy — sold to restaurants in Iraq. Lines are often Arabic script spelling English brands phonetically (Arabizi). Your job is the **correct retail English product name**, not a letter-by-letter transliteration.

Phonetic Arabic → standard English (examples; apply the same idea to similar spellings):
- **كندر هاني حوب / هاني حوب** near Kinder → **Kinder Happy Hippo** (NOT "Honey Hoob", "Honey Hub", or "Hani Hoob").
- **كندر بوينو شيرة / بيونو شيرا** → **Kinder Bueno White** or **Kinder Bueno** (context: white/cream variant).
- **كندر كارشرى / كرانشي / كاربر** → **Kinder Cards** or **Kinder Crunchy** (bar/cards format); prefer **Kinder Cards** when packaging suggests cards.
- **كندر بينبيوى / بينيوى** → **Kinder Bueno** or **Kinder Happy Hippo** if context matches hippo-shaped product; **Kinder Bueno** for Bueno spellings.
- **جيس** (also misread as جبس) on snack rows → **chips** (packaged crisps). NEVER "Guess", "Gibbs", "Jess", or "cheese" unless the line is clearly cheese.
- **جدو بانوس / جدمو بانوس / كادمو بانوس** in snack context → **Cheetos Puffs** or **Cheetos** (phonetic); NOT "Gadmo Panos".
- **دوريتوس** + **الهين هرت / اللين هرت** → **Doritos Flamin' Hot** (NOT "Lehain Heart", "Lihain", "Hen Heart").
- **ذرا هوريتوس / هدورتوس** + **اصلى** → **Doritos** + **Original** / **corn chips** as appropriate.
- **نستلة داسك ريتر / دتسي دشمان** → often **Nestlé** + **Ritter Sport** or similar bar; use **Nestlé Ritter Sport** when it matches chocolate bars.
- **كبويرس ريتر** → **Ritter Sport** (mini/bars).
- **ميلكا تركوكو / كركوكو** → **Milka Tuc** or **Milka** + **Tuc** crackers where applicable.
- **أوريو تسكويت** → **Oreo** biscuits/cookies.
- **نستلة البيبي / سيارر** → **Nestlé** product lines (e.g. **KitKat**-family or regional names) — pick the most likely Nestlé snack name; **NOT** "Alibi" or random English words.

Rules:
- Output ONLY valid JSON: {"lines":["..."]} with the SAME number of strings in the SAME order as the input array.
- Keep pack sizes and number patterns (e.g. 43*30, (35*12), 110*23) in the label when helpful.
- Short inventory-style labels. No explanations.

Input JSON array:
${inputJson}`
}
