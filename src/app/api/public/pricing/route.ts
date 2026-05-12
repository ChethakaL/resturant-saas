import { NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/platform-config'

export async function GET() {
  try {
    const platformCfg = await getPlatformConfig()
    return NextResponse.json({
      priceMonthly: String(platformCfg.priceMonthly ?? process.env.STRIPE_PRICE_MONTHLY ?? '59'),
      priceAnnual: String(platformCfg.priceAnnual ?? process.env.STRIPE_PRICE_ANNUAL ?? '590'),
      currency: (process.env.STRIPE_BILLING_CURRENCY || 'usd').toUpperCase(),
      trialDays: 3,
    })
  } catch (error) {
    console.error('Failed to load public pricing:', error)
    return NextResponse.json({
      priceMonthly: '59',
      priceAnnual: '590',
      currency: 'USD',
      trialDays: 3,
    })
  }
}
