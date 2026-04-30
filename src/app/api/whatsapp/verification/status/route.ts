import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRestaurantWhatsAppSettings, getTwilioWhatsAppNumber } from '@/lib/restaurant-whatsapp'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })

    const whatsapp = getRestaurantWhatsAppSettings(restaurant?.settings)

    return NextResponse.json({
      whatsappNumber: whatsapp.number,
      verified: Boolean(whatsapp.number && whatsapp.verifiedAt),
      verificationRequestedAt: whatsapp.verificationRequestedAt,
      verifiedAt: whatsapp.verifiedAt,
      lastInboundAt: whatsapp.lastInboundAt,
      twilioWhatsAppNumber: getTwilioWhatsAppNumber(),
    })
  } catch (error) {
    console.error('[whatsapp-verification] Failed to load verification status:', error)
    return NextResponse.json({ error: 'Failed to load WhatsApp verification status' }, { status: 500 })
  }
}
