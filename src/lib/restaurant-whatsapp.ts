export type RestaurantWhatsAppSettings = {
  number: string | null
  verificationCode: string | null
  verificationRequestedAt: string | null
  verifiedAt: string | null
  lastInboundAt: string | null
}

const SETTINGS_KEY = 'whatsappOrderNotifications'

export function normalizeWhatsAppNumber(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const withoutPrefix = trimmed.startsWith('whatsapp:') ? trimmed.slice('whatsapp:'.length) : trimmed
  const compact = withoutPrefix.replace(/[^\d+]/g, '')
  if (!compact) return null
  return compact.startsWith('+') ? compact : `+${compact}`
}

export function normalizeTwilioWhatsAppAddress(value?: string | null) {
  const normalized = normalizeWhatsAppNumber(value)
  return normalized ? `whatsapp:${normalized}` : null
}

export function getTwilioWhatsAppNumber() {
  return normalizeWhatsAppNumber(process.env.TWILIO_PHONE_NUMBER)
}

export function getTwilioWhatsAppChatUrl(text?: string | null) {
  const number = getTwilioWhatsAppNumber()
  if (!number) return null
  const digits = number.replace(/[^\d]/g, '')
  const base = `https://wa.me/${digits}`
  if (!text) return base
  return `${base}?text=${encodeURIComponent(text)}`
}

export function getRestaurantWhatsAppSettings(settings: unknown): RestaurantWhatsAppSettings {
  const root = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>
  const raw = (root[SETTINGS_KEY] && typeof root[SETTINGS_KEY] === 'object'
    ? root[SETTINGS_KEY]
    : {}) as Record<string, unknown>

  return {
    number: normalizeWhatsAppNumber(typeof raw.number === 'string' ? raw.number : null),
    verificationCode: typeof raw.verificationCode === 'string' ? raw.verificationCode : null,
    verificationRequestedAt: typeof raw.verificationRequestedAt === 'string' ? raw.verificationRequestedAt : null,
    verifiedAt: typeof raw.verifiedAt === 'string' ? raw.verifiedAt : null,
    lastInboundAt: typeof raw.lastInboundAt === 'string' ? raw.lastInboundAt : null,
  }
}

export function mergeRestaurantWhatsAppSettings(
  settings: unknown,
  next: Partial<RestaurantWhatsAppSettings>
) {
  const root = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>
  const current = getRestaurantWhatsAppSettings(settings)

  return {
    ...root,
    [SETTINGS_KEY]: {
      ...current,
      ...next,
      ...(next.number !== undefined ? { number: normalizeWhatsAppNumber(next.number) } : {}),
    },
  }
}

export function buildRestaurantOrderWhatsAppNumber(settings: unknown, fallbackPhone?: string | null) {
  const whatsapp = getRestaurantWhatsAppSettings(settings)
  if (whatsapp.number && whatsapp.verifiedAt) {
    return whatsapp.number
  }

  return normalizeWhatsAppNumber(fallbackPhone)
}

export function isWithinWhatsAppWindow(lastInboundAt?: string | null) {
  if (!lastInboundAt) return false
  const last = new Date(lastInboundAt).getTime()
  if (Number.isNaN(last)) return false
  return Date.now() - last <= 24 * 60 * 60 * 1000
}
