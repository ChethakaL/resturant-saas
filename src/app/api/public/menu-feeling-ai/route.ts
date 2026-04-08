import { NextRequest, NextResponse } from 'next/server'
import { getCachedPublicMenuFeelingAi } from '@/lib/public-menu-feeling-ai'

export const runtime = 'nodejs'

function parseLang(raw: string | null): 'en' | 'ar_fusha' | 'ku' {
  if (raw === 'ar_fusha' || raw === 'ar' || raw === 'ar-fusha') return 'ar_fusha'
  if (raw === 'ku') return 'ku'
  return 'en'
}

/**
 * AI + weather hero line for the guest menu. Called from the client after first paint so the
 * initial page load is not blocked by Gemini.
 */
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get('restaurantId')?.trim()
  const lang = parseLang(request.nextUrl.searchParams.get('lang'))
  const menuTimezone = request.nextUrl.searchParams.get('tz')?.trim() || 'Asia/Baghdad'

  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId required' }, { status: 400 })
  }

  try {
    const ctx = await getCachedPublicMenuFeelingAi({
      restaurantId,
      language: lang,
      menuTimezone,
    })
    if (!ctx) {
      return NextResponse.json({ message: null }, { status: 404 })
    }
    return NextResponse.json({ message: ctx.message })
  } catch (e) {
    console.error('menu-feeling-ai:', e)
    return NextResponse.json({ message: null }, { status: 500 })
  }
}
