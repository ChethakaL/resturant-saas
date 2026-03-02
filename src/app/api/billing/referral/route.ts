import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { referralCode: true, slug: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    let code = restaurant.referralCode
    if (!code) {
      for (let attempt = 0; attempt < 10; attempt++) {
        code = generateReferralCode()
        const existing = await prisma.restaurant.findUnique({
          where: { referralCode: code },
        })
        if (!existing) {
          await prisma.restaurant.update({
            where: { id: session.user.restaurantId },
            data: { referralCode: code },
          })
          break
        }
      }
      if (!code) {
        return NextResponse.json({ error: 'Could not generate referral code' }, { status: 500 })
      }
    }

    const baseUrl = (process.env.NEXTAUTH_URL || '').trim().replace(/\/+$/, '') || 'http://localhost:3000'
    const link = `${baseUrl}/register?ref=${code}`

    return NextResponse.json({ code, link })
  } catch (error) {
    console.error('Referral API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get referral' },
      { status: 500 }
    )
  }
}
