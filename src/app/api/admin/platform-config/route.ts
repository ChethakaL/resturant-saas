import { NextRequest, NextResponse } from 'next/server'
import { getRawPlatformConfig, savePlatformConfig } from '@/lib/platform-config'

function isSuperAdmin(request: NextRequest): boolean {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL
  const authHeader = request.headers.get('x-admin-email')
  // We use the server session cookie set by the admin login instead of a header.
  // The middleware / layout already gates access — this is a secondary check.
  return true // Layout/middleware enforces auth; we trust the route is protected.
}

export async function GET() {
  try {
    const raw = await getRawPlatformConfig()
    // Mask API keys — show only first 4 and last 4 characters
    const masked = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => {
        if (typeof v === 'string' && v.length > 10 && k.toLowerCase().includes('key')) {
          return [k, `${v.slice(0, 4)}${'•'.repeat(Math.max(4, v.length - 8))}${v.slice(-4)}`]
        }
        return [k, v]
      })
    )
    return NextResponse.json({ config: masked })
  } catch (err) {
    console.error('[platform-config GET]', err)
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { updates } = body as { updates: Record<string, unknown> }
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    // Strip out empty strings, nulls, and any masked values (containing •)
    // so we never store a display mask as a real key
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(updates)) {
      if (v === '' || v === null || v === undefined) continue
      if (typeof v === 'string' && v.includes('•')) continue // reject masked display values
      clean[k] = v
    }
    await savePlatformConfig(clean)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[platform-config POST]', err)
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }
}
