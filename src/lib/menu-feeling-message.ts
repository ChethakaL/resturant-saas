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
  if (language === 'ar_fusha') {
    return buildArabicMessage(slot, 'clear', 'mild')
  }
  if (language === 'ku') {
    return buildKurdishMessage(slot, 'clear', 'mild')
  }
  return buildEnglishMessage(slot, 'clear', 'mild')
}

async function generateAiFeelingMessage({
  language,
  slot,
  weatherLabel,
  temperatureFeel,
  temperature,
  apparentTemperature,
}: {
  language: LanguageCode
  slot: TimeSlot
  weatherLabel: MenuWeatherLabel
  temperatureFeel: MenuTemperatureFeel
  temperature: number | null
  apparentTemperature: number | null
}): Promise<string | null> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) return null

  const languageLabel =
    language === 'ar_fusha' ? 'Arabic' : language === 'ku' ? 'Kurdish Sorani' : 'English'

  const prompt = `You write one line of hero text for a restaurant's digital menu (guest-facing).

Language: ${languageLabel} only.

Facts (use naturally; do not list them):
- Part of day (meal rhythm): ${slot}
- Sky / conditions label: ${weatherLabel}
- How it feels outside: ${temperatureFeel}
- Optional context (no numbers in output): air is ${temperatureFeel === 'hot' || temperatureFeel === 'warm' ? 'warm' : temperatureFeel === 'cold' || temperatureFeel === 'cool' ? 'cooler' : 'pleasant'}

Requirements:
- Exactly ONE sentence.
- It MUST reflect both the time-of-day vibe AND the outdoor conditions (e.g. clear air, light rain, breezy, muggy heat, crisp cold — choose what fits the facts).
- Nudge the guest toward ordering something to eat and something to drink; stay appetizing, not salesy.
- Max 22 words.
- No hashtags, emojis, markdown, or quotation marks.
- Do not output exact temperatures or numbers.
- Do not say you are an AI.

Return JSON only:
{"message":"..."}
`

  try {
    const result = await callGemini(prompt, { maxOutputTokens: 140, temperature: 0.35 })
    const raw = result.response?.text?.() ?? ''
    const parsed = parseGeminiJson(raw) as { message?: string }
    const message = parsed.message?.trim()
    if (!message) return null
    return message.replace(/\s+/g, ' ').trim()
  } catch {
    return null
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
    return {
      slot,
      weatherLabel: 'clear',
      temperatureFeel: 'mild',
      temperature: null,
      apparentTemperature: null,
      opening: language === 'en' ? buildEnglishOpening(slot, 'clear', 'mild') : '',
      aiTail: language === 'en' ? buildEnglishTail(slot, 'clear', 'mild') : '',
      message: buildFallbackMessage(slot, language),
    }
  }

  const weather = await fetchCurrentWeather(lat, lng, timezone)
  if (!weather) {
    return {
      slot,
      weatherLabel: 'clear',
      temperatureFeel: 'mild',
      temperature: null,
      apparentTemperature: null,
      opening: language === 'en' ? buildEnglishOpening(slot, 'clear', 'mild') : '',
      aiTail: language === 'en' ? buildEnglishTail(slot, 'clear', 'mild') : '',
      message: buildFallbackMessage(slot, language),
    }
  }

  const weatherLabel = getWeatherLabel(weather.weatherCode, weather.cloudCover)
  const temperatureFeel = getTemperatureFeel(weather.apparentTemperature)
  const opening =
    language === 'en'
      ? buildEnglishOpening(slot, weatherLabel, temperatureFeel)
      : ''
  const fallbackMessage =
    language === 'ar_fusha'
      ? buildArabicMessage(slot, weatherLabel, temperatureFeel)
      : language === 'ku'
        ? buildKurdishMessage(slot, weatherLabel, temperatureFeel)
        : buildEnglishMessage(slot, weatherLabel, temperatureFeel)
  const aiMessage =
    allowAi
      ? await generateAiFeelingMessage({
          language,
          slot,
          weatherLabel,
          temperatureFeel,
          temperature: weather.temperature,
          apparentTemperature: weather.apparentTemperature,
        })
      : null
  const trimmedAi = aiMessage?.trim()
  const message =
    trimmedAi
      ? trimmedAi.replace(/\s+/g, ' ').trim()
      : language === 'en'
        ? `${opening} ${buildEnglishTail(slot, weatherLabel, temperatureFeel)}`.replace(/\s+/g, ' ').trim()
        : fallbackMessage

  return {
    slot,
    weatherLabel,
    temperatureFeel,
    temperature: weather.temperature,
    apparentTemperature: weather.apparentTemperature,
    opening,
    aiTail:
      trimmedAi ||
      (language === 'en' ? buildEnglishTail(slot, weatherLabel, temperatureFeel) : fallbackMessage),
    message,
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
