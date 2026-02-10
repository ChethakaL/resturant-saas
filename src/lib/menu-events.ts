/**
 * Log menu events for A/B and conversion tracking.
 */

export async function logMenuEvent(
  restaurantId: string,
  eventType: string,
  payload?: Record<string, unknown>,
  guestId?: string,
  variant?: string
): Promise<void> {
  try {
    await fetch('/api/public/menu/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId,
        eventType,
        payload: payload ?? {},
        guestId: guestId ?? undefined,
        variant: variant ?? undefined,
      }),
    })
  } catch {
    // best-effort
  }
}
