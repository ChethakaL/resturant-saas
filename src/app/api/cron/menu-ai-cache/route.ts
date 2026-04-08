import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshRestaurantMenuAiCaches } from '@/lib/menu-ai-cache'

const BATCH = 4

/**
 * Warms carousel + badge AI caches (Gemini) so guest menu reads stay fast.
 * Configure Vercel Cron or an external scheduler to GET this route every 5 minutes.
 * Authorization: Bearer CRON_SECRET or ?secret=
 */
export async function GET(request: NextRequest) {
  const header = request.headers.get('authorization')
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null
  const q = request.nextUrl.searchParams.get('secret')
  const secret = process.env.CRON_SECRET
  if (!secret || (bearer !== secret && q !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const restaurants = await prisma.restaurant.findMany({ select: { id: true } })
  let failed = 0
  for (let i = 0; i < restaurants.length; i += BATCH) {
    const chunk = restaurants.slice(i, i + BATCH)
    await Promise.all(
      chunk.map(async (r) => {
        try {
          await refreshRestaurantMenuAiCaches(r.id)
        } catch {
          failed += 1
        }
      })
    )
  }

  return NextResponse.json({
    ok: true,
    warmed: restaurants.length,
    failed,
  })
}
