import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getRestaurantWhatsAppSettings,
  getTwilioWhatsAppNumber,
  mergeRestaurantWhatsAppSettings,
  normalizeWhatsAppNumber,
} from '@/lib/restaurant-whatsapp'

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const number = normalizeWhatsAppNumber(body?.whatsappNumber)
    if (!number) {
      return NextResponse.json({ error: 'WhatsApp number is required' }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })

    const current = getRestaurantWhatsAppSettings(restaurant?.settings)
    if (current.number === number && current.verifiedAt) {
      return NextResponse.json({
        verified: true,
        whatsappNumber: current.number,
        verifiedAt: current.verifiedAt,
        lastInboundAt: current.lastInboundAt,
        twilioWhatsAppNumber: getTwilioWhatsAppNumber(),
      })
    }

    const verificationCode = generateOtp()
    const now = new Date().toISOString()
    const nextSettings = mergeRestaurantWhatsAppSettings(restaurant?.settings, {
      number,
      verificationCode,
      verificationRequestedAt: now,
      verifiedAt: null,
      lastInboundAt: current.number === number ? current.lastInboundAt : null,
    })

    await prisma.restaurant.update({
      where: { id: session.user.restaurantId },
      data: { settings: nextSettings },
    })

    return NextResponse.json({
      verified: false,
      whatsappNumber: number,
      verificationCode,
      verificationRequestedAt: now,
      lastInboundAt: current.number === number ? current.lastInboundAt : null,
      twilioWhatsAppNumber: getTwilioWhatsAppNumber(),
    })
  } catch (error) {
    console.error('[whatsapp-verification] Failed to start verification:', error)
    return NextResponse.json({ error: 'Failed to start WhatsApp verification' }, { status: 500 })
  }
}
