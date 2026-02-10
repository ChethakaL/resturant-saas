import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  restaurantId: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  guestId: z.string().optional(),
  variant: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { restaurantId, eventType, payload, guestId, variant } = parsed.data

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    })
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    await prisma.menuEvent.create({
      data: {
        restaurantId,
        eventType,
        payload: payload ?? undefined,
        guestId: guestId ?? null,
        variant: variant ?? null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Menu event error:', error)
    return NextResponse.json({ error: 'Failed to log event' }, { status: 500 })
  }
}
