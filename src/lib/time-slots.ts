/**
 * Time slot utilities — shared between customer menu pages and dashboard.
 *
 * Slot names are fixed: breakfast / day / evening / night.
 * The *boundaries* are configurable per restaurant (stored in settings.slotTimes).
 *
 * Default: breakfast 6–10, day 10–14, evening 14–18, night 18–6.
 */

export type SlotName = 'breakfast' | 'day' | 'evening' | 'night'

export interface SlotBoundary {
  /** Start hour (0–23, inclusive). */
  start: number
  /** End hour (0–23, exclusive). E.g. end=10 means up to 09:59. */
  end: number
}

export interface SlotTimes {
  breakfast: SlotBoundary
  day: SlotBoundary
  evening: SlotBoundary
  /** Night is automatically everything not covered by the other three. */
}

export const DEFAULT_SLOT_TIMES: SlotTimes = {
  breakfast: { start: 6, end: 10 },
  day: { start: 10, end: 14 },
  evening: { start: 14, end: 18 },
}

/** Parse slot times from JSON stored in restaurant settings. Falls back to defaults. */
export function parseSlotTimes(raw: unknown): SlotTimes {
  if (!raw || typeof raw !== 'object') return DEFAULT_SLOT_TIMES
  const obj = raw as Record<string, unknown>
  const parse = (key: keyof SlotTimes): SlotBoundary => {
    const v = obj[key] as Record<string, unknown> | undefined
    const start = typeof v?.start === 'number' ? Math.max(0, Math.min(23, v.start)) : DEFAULT_SLOT_TIMES[key].start
    const end = typeof v?.end === 'number' ? Math.max(0, Math.min(24, v.end)) : DEFAULT_SLOT_TIMES[key].end
    return { start, end }
  }
  return { breakfast: parse('breakfast'), day: parse('day'), evening: parse('evening') }
}

/**
 * Determine the current time slot given a timezone and optional custom slot times.
 * Slots are checked in order: breakfast → day → evening → night (fallback).
 */
export function getCurrentTimeSlot(tz: string, slotTimes?: SlotTimes | null): SlotName {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()),
    10
  )
  const times = slotTimes ?? DEFAULT_SLOT_TIMES
  if (inSlot(hour, times.breakfast)) return 'breakfast'
  if (inSlot(hour, times.day)) return 'day'
  if (inSlot(hour, times.evening)) return 'evening'
  return 'night'
}

/** Same as getCurrentTimeSlot but for a specific Date (for sales bucketing). */
export function getTimeSlotForDate(date: Date, tz: string, slotTimes?: SlotTimes | null): SlotName {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(date),
    10
  )
  const times = slotTimes ?? DEFAULT_SLOT_TIMES
  if (inSlot(hour, times.breakfast)) return 'breakfast'
  if (inSlot(hour, times.day)) return 'day'
  if (inSlot(hour, times.evening)) return 'evening'
  return 'night'
}

function inSlot(hour: number, boundary: SlotBoundary): boolean {
  const { start, end } = boundary
  if (start < end) return hour >= start && hour < end
  // Wraps midnight (e.g. night 22–6)
  return hour >= start || hour < end
}

/** Format slot time boundary as a human-readable string, e.g. "6am–10am" or "22pm–6am". */
export function formatSlotRange(boundary: SlotBoundary): string {
  return `${formatHour(boundary.start)}–${formatHour(boundary.end)}`
}

function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12am'
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

/** Build a human-readable map of all four slot ranges from SlotTimes. */
export function buildSlotRangeLabels(slotTimes?: SlotTimes | null): Record<SlotName, string> {
  const times = slotTimes ?? DEFAULT_SLOT_TIMES
  const nightStart = times.evening.end
  const nightEnd = times.breakfast.start
  return {
    breakfast: formatSlotRange(times.breakfast),
    day: formatSlotRange(times.day),
    evening: formatSlotRange(times.evening),
    night: formatSlotRange({ start: nightStart, end: nightEnd }),
  }
}
