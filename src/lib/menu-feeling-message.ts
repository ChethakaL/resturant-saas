import { callGemini, parseGeminiJson } from './generative'
import { getPlatformConfig } from './platform-config'

type LanguageCode = 'en' | 'ar_fusha' | 'ku'
type TimeSlot = 'breakfast' | 'day' | 'evening' | 'night'
export type MenuWeatherLabel = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'
export type MenuTemperatureFeel = 'cold' | 'cool' | 'mild' | 'warm' | 'hot'

export interface MenuFeelingContext {
  slot: TimeSlot
  weatherLabel: MenuWeatherLabel
  temperatureFeel: MenuTemperatureFeel
  temperature: number | null
  apparentTemperature: number | null
  opening: string
  aiTail: string
  message: string
  /** Distinct phrasings for the same time + weather context; client picks one at random. */
  messageVariants: string[]
}

const HERO_VARIANT_TARGET = 4

export function normalizeHeroMessages(messages: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of messages) {
    const msg = raw?.replace(/\s+/g, ' ').trim()
    if (!msg || msg.length < 12) continue
    const key = msg.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(msg)
  }
  return out
}

export function pickRandomHeroMessage(variants: string[]): string {
  if (variants.length === 0) return ''
  if (variants.length === 1) return variants[0]
  return variants[Math.floor(Math.random() * variants.length)]
}

type WeatherSnapshot = {
  temperature: number | null
  apparentTemperature: number | null
  precipitation: number | null
  cloudCover: number | null
  weatherCode: number | null
  isDay: boolean | null
}

const WEATHER_CODE_LABELS: Record<number, MenuWeatherLabel> = {
  0: 'clear',
  1: 'partly-cloudy',
  2: 'partly-cloudy',
  3: 'cloudy',
  45: 'fog',
  48: 'fog',
  51: 'rain',
  53: 'rain',
  55: 'rain',
  56: 'rain',
  57: 'rain',
  61: 'rain',
  63: 'rain',
  65: 'rain',
  66: 'rain',
  67: 'rain',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snow',
  80: 'rain',
  81: 'rain',
  82: 'rain',
  85: 'snow',
  86: 'snow',
  95: 'storm',
  96: 'storm',
  99: 'storm',
}

export function getWeatherLabel(weatherCode: number | null, cloudCover: number | null): MenuWeatherLabel {
  if (weatherCode != null && WEATHER_CODE_LABELS[weatherCode]) return WEATHER_CODE_LABELS[weatherCode]
  if (cloudCover != null) {
    if (cloudCover < 25) return 'clear'
    if (cloudCover < 60) return 'partly-cloudy'
  }
  return 'cloudy'
}

export function getTemperatureFeel(apparentTemperature: number | null): MenuTemperatureFeel {
  if (apparentTemperature == null) return 'mild'
  if (apparentTemperature >= 33) return 'hot'
  if (apparentTemperature >= 26) return 'warm'
  if (apparentTemperature >= 18) return 'mild'
  if (apparentTemperature >= 10) return 'cool'
  return 'cold'
}

function getSlotLabel(slot: TimeSlot, language: LanguageCode): string {
  const labels = {
    en: { breakfast: 'morning', day: 'afternoon', evening: 'evening', night: 'night' },
    ar_fusha: { breakfast: 'الصباح', day: 'بعد الظهر', evening: 'المساء', night: 'الليل' },
    ku: { breakfast: 'بەیانی', day: 'نیوەڕۆ', evening: 'ئێوارە', night: 'شەو' },
  }
  return labels[language][slot]
}

function buildEnglishOpening(slot: TimeSlot, weather: MenuWeatherLabel, tempFeel: MenuTemperatureFeel): string {
  const slotLabel = getSlotLabel(slot, 'en')

  if (weather === 'storm' || weather === 'rain') {
    return `It is a ${weather === 'storm' ? 'stormy' : 'rainy'} ${slotLabel}.`
  }
  if (weather === 'snow' || tempFeel === 'cold') {
    return `It is a cool ${slotLabel}.`
  }
  if (weather === 'clear' && tempFeel === 'hot') {
    return `It is a sunny ${slotLabel}.`
  }
  if (weather === 'clear' && tempFeel === 'warm') {
    return `It is a bright ${slotLabel}.`
  }
  /** Most common case (Open-Meteo): clear sky + ~18–25°C — must mention conditions, not only "pleasant". */
  if (weather === 'clear' && tempFeel === 'mild') {
    return `Skies are clear and the air feels mild this ${slotLabel}.`
  }
  if (weather === 'partly-cloudy' || weather === 'cloudy') {
    return `It is a calm ${slotLabel}.`
  }
  if (slot === 'evening' || slot === 'night') {
    return `It is a relaxed ${slotLabel}.`
  }
  return `It is a pleasant ${slotLabel}.`
}

function buildEnglishTail(slot: TimeSlot, weather: MenuWeatherLabel, tempFeel: MenuTemperatureFeel): string {
  if (weather === 'storm' || weather === 'rain') {
    return 'A comforting meal and a satisfying drink would feel especially welcome right now.'
  }
  if (weather === 'snow' || tempFeel === 'cold') {
    return 'A warm meal and a cozy drink would feel especially comforting.'
  }
  if (weather === 'clear' && tempFeel === 'hot') {
    return 'It is a great time for a refreshing cold drink and something light and lively.'
  }
  if (weather === 'clear' && tempFeel === 'warm') {
    return 'Fresh flavors and a chilled drink would feel especially good.'
  }
  if (weather === 'clear' && tempFeel === 'mild') {
    return 'A flavorful plate and a well-chosen drink would suit this easy weather perfectly.'
  }
  if (weather === 'partly-cloudy' || weather === 'cloudy') {
    return 'This is a good moment for a balanced meal and something smooth to sip alongside it.'
  }
  if (slot === 'evening' || slot === 'night') {
    return 'A rich meal and a satisfying drink would suit the mood well.'
  }
  return 'A fresh meal and a well-matched drink would feel just right.'
}

function buildEnglishMessage(slot: TimeSlot, weather: MenuWeatherLabel, tempFeel: MenuTemperatureFeel): string {
  return `${buildEnglishOpening(slot, weather, tempFeel)} ${buildEnglishTail(slot, weather, tempFeel)}`
}

function buildEnglishOpeningVariants(
  slot: TimeSlot,
  weather: MenuWeatherLabel,
  tempFeel: MenuTemperatureFeel
): string[] {
  const slotLabel = getSlotLabel(slot, 'en')
  const primary = buildEnglishOpening(slot, weather, tempFeel)
  const alts: string[] = [primary]

  if (weather === 'storm' || weather === 'rain') {
    alts.push(
      `Rain is settling in this ${slotLabel}.`,
      `A ${weather === 'storm' ? 'stormy' : 'rainy'} stretch shapes this ${slotLabel}.`
    )
  } else if (weather === 'snow' || tempFeel === 'cold') {
    alts.push(`Crisp air marks this ${slotLabel}.`, `A chilly ${slotLabel} outside.`)
  } else if (weather === 'clear' && tempFeel === 'hot') {
    alts.push(`Sun is strong this ${slotLabel}.`, `Bright heat fills this ${slotLabel}.`)
  } else if (weather === 'clear' && tempFeel === 'warm') {
    alts.push(`Warm sunshine this ${slotLabel}.`, `A glowing ${slotLabel} outdoors.`)
  } else if (weather === 'clear' && tempFeel === 'mild') {
    alts.push(
      `Clear skies and gentle air make this ${slotLabel} feel easy.`,
      `A bright, mild ${slotLabel} with clear weather outside.`
    )
  } else if (weather === 'partly-cloudy' || weather === 'cloudy') {
    alts.push(`Soft clouds set the tone this ${slotLabel}.`, `An unhurried ${slotLabel} under cloudy skies.`)
  } else if (slot === 'evening' || slot === 'night') {
    alts.push(`The day winds down this ${slotLabel}.`)
  } else {
    alts.push(`A lovely ${slotLabel} to linger over food.`)
  }

  return normalizeHeroMessages(alts)
}

function buildEnglishTailVariants(
  slot: TimeSlot,
  weather: MenuWeatherLabel,
  tempFeel: MenuTemperatureFeel
): string[] {
  const primary = buildEnglishTail(slot, weather, tempFeel)
  const alts: string[] = [primary]

  if (weather === 'storm' || weather === 'rain') {
    alts.push(
      'Cozy food and a hot drink would hit the spot.',
      'Nothing beats comfort food and a warm sip right now.'
    )
  } else if (weather === 'snow' || tempFeel === 'cold') {
    alts.push(
      'Hearty food and something warm to sip feel especially right.',
      'Reach for warmth — a filling plate and a steaming drink.'
    )
  } else if (weather === 'clear' && tempFeel === 'hot') {
    alts.push('Cool drinks and lighter bites are calling.', 'Stay refreshed with something cold and a breezy bite.')
  } else if (weather === 'clear' && tempFeel === 'warm') {
    alts.push('Crisp drinks and fresh flavors sound perfect.', 'A chilled sip and something vibrant would be ideal.')
  } else if (weather === 'clear' && tempFeel === 'mild') {
    alts.push(
      'Something delicious on the plate and a drink to match would fit beautifully.',
      'Treat yourself to a tasty bite and a well-paired drink.'
    )
  } else if (weather === 'partly-cloudy' || weather === 'cloudy') {
    alts.push(
      'A steady meal and an easy drink fit this relaxed mood.',
      'Balanced flavors and something smooth to sip feel right.'
    )
  } else if (slot === 'evening' || slot === 'night') {
    alts.push(
      'Indulge in something hearty with a drink that suits the hour.',
      'A satisfying plate and a fine drink complete the evening.'
    )
  } else {
    alts.push(
      'A good meal and the right drink make this moment better.',
      'Pick something you love to eat and sip alongside it.'
    )
  }

  return normalizeHeroMessages(alts)
}

function buildEnglishMessageVariants(
  slot: TimeSlot,
  weather: MenuWeatherLabel,
  tempFeel: MenuTemperatureFeel
): string[] {
  const openings = buildEnglishOpeningVariants(slot, weather, tempFeel)
  const tails = buildEnglishTailVariants(slot, weather, tempFeel)
  const pairs: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 2],
  ]
  const combined = pairs
    .map(([oi, ti]) => {
      const opening = openings[oi]
      const tail = tails[ti]
      if (!opening || !tail) return null
      return `${opening} ${tail}`.replace(/\s+/g, ' ').trim()
    })
    .filter((value): value is string => Boolean(value))

  return normalizeHeroMessages(combined).slice(0, HERO_VARIANT_TARGET)
}

function buildArabicMessageVariants(
  slot: TimeSlot,
  weather: MenuWeatherLabel,
  tempFeel: MenuTemperatureFeel
): string[] {
  const slotLabel = getSlotLabel(slot, 'ar_fusha')
  const primary = buildArabicMessage(slot, weather, tempFeel)
  const alts: string[] = [primary]

  if (weather === 'storm' || weather === 'rain') {
    alts.push(
      `أجواء ${weather === 'storm' ? 'عاصفة' : 'ممطرة'} في ${slotLabel} — وقت مثالي لوجبة دافئة ومشروب مريح.`,
      `مع ${weather === 'storm' ? 'هذا العاصف' : 'هذا المطر'} في ${slotLabel}، وجبة مريحة ومشروب ساخن يبدوان في محلهما.`
    )
  } else if (weather === 'snow' || tempFeel === 'cold') {
    alts.push(
      `برودة لطيفة في ${slotLabel} تدعو إلى طبق دافئ ومشروب يمنح الراحة.`,
      `هذا ${slotLabel} البارد يستحق وجبة ساخنة ومشروباً دافئاً يعيد الحيوية.`
    )
  } else if (weather === 'clear' && (tempFeel === 'hot' || tempFeel === 'warm')) {
    alts.push(
      `شمس ${slotLabel} تدعو إلى نكهات منعشة ومشروب بارد يوازن الحرارة.`,
      `جو ${slotLabel} المشرق يناسب وجبة خفيفة ومشروباً بارداً منعشاً.`
    )
  } else if (weather === 'clear' && tempFeel === 'mild') {
    alts.push(
      `سماء صافية في ${slotLabel} — وقت رائع لطبق شهي ومشروب يلائم الأجواء.`,
      `هواء معتدل وسماء صافية في ${slotLabel}؛ وجبة لذيذة ومشروب مناسب يكملان اللحظة.`
    )
  } else {
    alts.push(
      `أجواء هادئة في ${slotLabel} تدعو إلى وجبة متوازنة ومشروب يناسب المزاج.`,
      `هذا ${slotLabel} مناسب لوجبة شهية ومشروب يجعل التجربة أكثر متعة.`
    )
  }

  return normalizeHeroMessages(alts).slice(0, HERO_VARIANT_TARGET)
}

function buildKurdishMessageVariants(
  slot: TimeSlot,
  weather: MenuWeatherLabel,
  tempFeel: MenuTemperatureFeel
): string[] {
  const slotLabel = getSlotLabel(slot, 'ku')
  const primary = buildKurdishMessage(slot, weather, tempFeel)
  const alts: string[] = [primary]

  if (weather === 'storm' || weather === 'rain') {
    alts.push(
      `ئەم ${slotLabel}ە ${weather === 'storm' ? 'توند' : 'باراناوی'}یە — کاتێکی گونجاوە بۆ خواردنێکی گەرم و خواردنەوەیەکی خۆش.`,
      `لە ${slotLabel}دا ${weather === 'storm' ? 'با توندە' : 'باران دەبارێت'}؛ خواردنێکی گەرم و خواردنەوەیەکی گەرم زۆر دەگونجێت.`
    )
  } else if (weather === 'snow' || tempFeel === 'cold') {
    alts.push(
      `ساردایی ئەم ${slotLabel}ە بانگەشەی خواردنێکی گەرم و خواردنەوەیەکی گەرم دەکات.`,
      `ئەم ${slotLabel}ە ساردە — خواردنێکی پڕ و خواردنەوەیەکی گەرم هەستێکی باش دەدات.`
    )
  } else if (weather === 'clear' && (tempFeel === 'hot' || tempFeel === 'warm')) {
    alts.push(
      `خۆرهەڵاتی ${slotLabel} بانگەشەی تامێکی فریش و خواردنەوەیەکی سارد دەکات.`,
      `ئەم ${slotLabel}ە ڕووناکە — خواردنێکی سووک و خواردنەوەیەکی سارد زۆر گونجاوە.`
    )
  } else if (weather === 'clear' && tempFeel === 'mild') {
    alts.push(
      `ئاسمان ڕوونە لە ${slotLabel} — کاتێکی باشە بۆ خواردنێکی تێرکەر و خواردنەوەیەکی گونجاو.`,
      `هەوا نەرم و ئاسمان ڕوونە لە ${slotLabel}؛ خواردنێکی خۆش و خواردنەوەیەکی گونجاو دەگونجێت.`
    )
  } else {
    alts.push(
      `ئەم ${slotLabel}ە ئارامە — خواردنێکی هاوسەنگ و خواردنەوەیەکی نەرم زۆر لە شوێنی خۆیدایە.`,
      `ئەم ${slotLabel}ە خۆشە — خواردنێکی باش و خواردنەوەیەکی گونجاو هەستێکی جوان دروست دەکات.`
    )
  }

  return normalizeHeroMessages(alts).slice(0, HERO_VARIANT_TARGET)
}

function buildMessageVariants(
  slot: TimeSlot,
  weather: MenuWeatherLabel,
  tempFeel: MenuTemperatureFeel,
  language: LanguageCode
): string[] {
  if (language === 'ar_fusha') {
    return buildArabicMessageVariants(slot, weather, tempFeel)
  }
  if (language === 'ku') {
    return buildKurdishMessageVariants(slot, weather, tempFeel)
  }
  return buildEnglishMessageVariants(slot, weather, tempFeel)
}

function buildArabicMessage(slot: TimeSlot, weather: MenuWeatherLabel, tempFeel: MenuTemperatureFeel): string {
  const slotLabel = getSlotLabel(slot, 'ar_fusha')

  if (weather === 'storm' || weather === 'rain') {
    return `إنه ${weather === 'storm' ? 'جو عاصف' : 'جو ممطر'} في ${slotLabel}. هذا وقت مناسب لوجبة مريحة ومشروب يمنح شعوراً دافئاً وممتعاً.`
  }
  if (weather === 'snow' || tempFeel === 'cold') {
    return `إنه ${slotLabel} بارد نسبياً. وجبة دافئة ومشروب مريح سيمنحان إحساساً لطيفاً الآن.`
  }
  if (weather === 'clear' && tempFeel === 'hot') {
    return `إنه ${slotLabel} مشمس. هذا وقت جميل لوجبة خفيفة مع مشروب بارد ومنعش.`
  }
  if (weather === 'clear' && tempFeel === 'warm') {
    return `إنه ${slotLabel} مشرق. النكهات الطازجة مع مشروب بارد ستكون اختياراً رائعاً.`
  }
  if (weather === 'clear' && tempFeel === 'mild') {
    return `سماء صافية وهواء معتدل في ${slotLabel}. وجبة لذيذة ومشروباً يلائم الجو يكملان التجربة.`
  }
  if (weather === 'partly-cloudy' || weather === 'cloudy') {
    return `إنه ${slotLabel} هادئ. وجبة متوازنة مع مشروب ناعم ستكون مناسبة جداً للأجواء.`
  }
  return `إنه ${slotLabel} لطيف. وجبة شهية مع مشروب مناسب ستمنح تجربة مريحة وممتعة.`
}

function buildKurdishMessage(slot: TimeSlot, weather: MenuWeatherLabel, tempFeel: MenuTemperatureFeel): string {
  const slotLabel = getSlotLabel(slot, 'ku')

  if (weather === 'storm' || weather === 'rain') {
    return `ئەم ${slotLabel}ە ${weather === 'storm' ? 'توند و هەورە' : 'باراناوی'}یە. خواردنێکی گەرم و خواردنەوەیەکی خۆش دەتوانێت هەستی باشتر بدات.`
  }
  if (weather === 'snow' || tempFeel === 'cold') {
    return `ئەم ${slotLabel}ە ساردە. خواردنێکی گەرم و خواردنەوەیەکی ئارامبەخش زۆر لە شوێنی خۆیدایە.`
  }
  if (weather === 'clear' && tempFeel === 'hot') {
    return `ئەم ${slotLabel}ە هەوا خۆش و خۆرهەڵاتە. کاتێکی گونجاوە بۆ خواردنێکی سووک و خواردنەوەیەکی سارد و فریش.`
  }
  if (weather === 'clear' && tempFeel === 'warm') {
    return `ئەم ${slotLabel}ە ڕووناکە. تامی تازە لەگەڵ خواردنەوەیەکی سارد هەستێکی خۆش دروست دەکات.`
  }
  if (weather === 'clear' && tempFeel === 'mild') {
    return `ئاسمان ڕوونە و هەوا نەرمە لە ${slotLabel}. خواردنێکی تێرکەر و خواردنەوەیەکی گونجاو زۆر دەگونجێت.`
  }
  if (weather === 'partly-cloudy' || weather === 'cloudy') {
    return `ئەم ${slotLabel}ە ئارامە. خواردنێکی هاوسەنگ لەگەڵ خواردنەوەیەکی نەرم زۆر گونجاو دەبێت.`
  }
  return `ئەم ${slotLabel}ە خۆشە. خواردنێکی باش لەگەڵ خواردنەوەیەکی گونجاو هەستێکی جوان دروست دەکات.`
}

async function fetchCurrentWeather(lat: number, lng: number, timezone: string): Promise<WeatherSnapshot | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,apparent_temperature,precipitation,cloud_cover,weather_code,is_day` +
      `&timezone=${encodeURIComponent(timezone)}`

    const response = await fetch(url, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(2500),
    })
    if (!response.ok) return null

    const data = await response.json()
    const current = data?.current
    if (!current) return null

    return {
      temperature: typeof current.temperature_2m === 'number' ? current.temperature_2m : null,
      apparentTemperature: typeof current.apparent_temperature === 'number' ? current.apparent_temperature : null,
      precipitation: typeof current.precipitation === 'number' ? current.precipitation : null,
      cloudCover: typeof current.cloud_cover === 'number' ? current.cloud_cover : null,
      weatherCode: typeof current.weather_code === 'number' ? current.weather_code : null,
      isDay: typeof current.is_day === 'number' ? current.is_day === 1 : null,
    }
  } catch {
    return null
  }
}

function buildFallbackMessage(slot: TimeSlot, language: LanguageCode): string {
  return buildMessageVariants(slot, 'clear', 'mild', language)[0] ?? ''
}

function buildHeroMessagePool({
  slot,
  weatherLabel,
  temperatureFeel,
  language,
  opening,
  aiVariants,
}: {
  slot: TimeSlot
  weatherLabel: MenuWeatherLabel
  temperatureFeel: MenuTemperatureFeel
  language: LanguageCode
  opening: string
  aiVariants: string[] | null
}): { message: string; messageVariants: string[]; aiTail: string } {
  const fallbackVariants = buildMessageVariants(slot, weatherLabel, temperatureFeel, language)
  const fallbackMessage =
    language === 'en'
      ? `${opening} ${buildEnglishTail(slot, weatherLabel, temperatureFeel)}`.replace(/\s+/g, ' ').trim()
      : fallbackVariants[0] ?? ''

  const messageVariants = normalizeHeroMessages([
    ...(aiVariants ?? []),
    ...fallbackVariants,
    fallbackMessage,
  ]).slice(0, HERO_VARIANT_TARGET)

  const pool = messageVariants.length > 0 ? messageVariants : [fallbackMessage].filter(Boolean)
  const message = pool[0] ?? fallbackMessage
  const aiTail =
    aiVariants?.[0]?.trim() ||
    (language === 'en' ? buildEnglishTail(slot, weatherLabel, temperatureFeel) : message)

  return { message, messageVariants: pool, aiTail }
}

async function generateAiFeelingVariants({
  language,
  slot,
  weatherLabel,
  temperatureFeel,
}: {
  language: LanguageCode
  slot: TimeSlot
  weatherLabel: MenuWeatherLabel
  temperatureFeel: MenuTemperatureFeel
  temperature: number | null
  apparentTemperature: number | null
}): Promise<string[]> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) return []

  const languageLabel =
    language === 'ar_fusha' ? 'Arabic' : language === 'ku' ? 'Kurdish Sorani' : 'English'

  const prompt = `You write hero text variants for a restaurant's digital menu (guest-facing).

Language: ${languageLabel} only.

Facts (use naturally; do not list them):
- Part of day (meal rhythm): ${slot}
- Sky / conditions label: ${weatherLabel}
- How it feels outside: ${temperatureFeel}
- Optional context (no numbers in output): air is ${temperatureFeel === 'hot' || temperatureFeel === 'warm' ? 'warm' : temperatureFeel === 'cold' || temperatureFeel === 'cool' ? 'cooler' : 'pleasant'}

Requirements:
- Write exactly ${HERO_VARIANT_TARGET} distinct one-sentence variants.
- Each variant must express the SAME intent (time-of-day vibe + outdoor conditions + gentle nudge toward food and drink) but use clearly different wording and sentence structure.
- Avoid repeating the same opening phrase across variants.
- Max 22 words per variant.
- No hashtags, emojis, markdown, or quotation marks.
- Do not output exact temperatures or numbers.
- Do not say you are an AI.

Return JSON only:
{"messages":["...","...","...","..."]}
`

  try {
    const result = await callGemini(prompt, { maxOutputTokens: 520, temperature: 0.78 })
    const raw = result.response?.text?.() ?? ''
    const parsed = parseGeminiJson(raw) as { messages?: string[]; message?: string }
    const fromArray = Array.isArray(parsed.messages) ? parsed.messages : []
    const legacy = typeof parsed.message === 'string' ? [parsed.message] : []
    return normalizeHeroMessages([...fromArray, ...legacy]).slice(0, HERO_VARIANT_TARGET)
  } catch {
    return []
  }
}

export async function getMenuFeelingContext({
  lat,
  lng,
  timezone,
  slot,
  language,
  allowAi = true,
}: {
  lat: number | null | undefined
  lng: number | null | undefined
  timezone: string
  slot: TimeSlot
  language: LanguageCode
  allowAi?: boolean
}): Promise<MenuFeelingContext> {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    const opening = language === 'en' ? buildEnglishOpening(slot, 'clear', 'mild') : ''
    const hero = buildHeroMessagePool({
      slot,
      weatherLabel: 'clear',
      temperatureFeel: 'mild',
      language,
      opening,
      aiVariants: null,
    })
    return {
      slot,
      weatherLabel: 'clear',
      temperatureFeel: 'mild',
      temperature: null,
      apparentTemperature: null,
      opening,
      aiTail: language === 'en' ? buildEnglishTail(slot, 'clear', 'mild') : hero.aiTail,
      message: hero.message || buildFallbackMessage(slot, language),
      messageVariants: hero.messageVariants,
    }
  }

  const weather = await fetchCurrentWeather(lat, lng, timezone)
  if (!weather) {
    const opening = language === 'en' ? buildEnglishOpening(slot, 'clear', 'mild') : ''
    const hero = buildHeroMessagePool({
      slot,
      weatherLabel: 'clear',
      temperatureFeel: 'mild',
      language,
      opening,
      aiVariants: null,
    })
    return {
      slot,
      weatherLabel: 'clear',
      temperatureFeel: 'mild',
      temperature: null,
      apparentTemperature: null,
      opening,
      aiTail: language === 'en' ? buildEnglishTail(slot, 'clear', 'mild') : hero.aiTail,
      message: hero.message || buildFallbackMessage(slot, language),
      messageVariants: hero.messageVariants,
    }
  }

  const weatherLabel = getWeatherLabel(weather.weatherCode, weather.cloudCover)
  const temperatureFeel = getTemperatureFeel(weather.apparentTemperature)
  const opening =
    language === 'en'
      ? buildEnglishOpening(slot, weatherLabel, temperatureFeel)
      : ''
  const aiVariants =
    allowAi
      ? await generateAiFeelingVariants({
          language,
          slot,
          weatherLabel,
          temperatureFeel,
          temperature: weather.temperature,
          apparentTemperature: weather.apparentTemperature,
        })
      : null
  const hero = buildHeroMessagePool({
    slot,
    weatherLabel,
    temperatureFeel,
    language,
    opening,
    aiVariants: aiVariants && aiVariants.length > 0 ? aiVariants : null,
  })

  return {
    slot,
    weatherLabel,
    temperatureFeel,
    temperature: weather.temperature,
    apparentTemperature: weather.apparentTemperature,
    opening,
    aiTail: hero.aiTail,
    message: hero.message,
    messageVariants: hero.messageVariants,
  }
}

export async function generateMenuFeelingMessage({
  lat,
  lng,
  timezone,
  slot,
  language,
  allowAi = true,
}: {
  lat: number | null | undefined
  lng: number | null | undefined
  timezone: string
  slot: TimeSlot
  language: LanguageCode
  allowAi?: boolean
}): Promise<string> {
  const context = await getMenuFeelingContext({ lat, lng, timezone, slot, language, allowAi })
  return context.message
}
