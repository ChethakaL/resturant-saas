import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getRestaurantWhatsAppSettings,
  mergeRestaurantWhatsAppSettings,
  normalizeWhatsAppNumber,
} from '@/lib/restaurant-whatsapp'

function xmlResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
    },
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: '/api/whatsapp/incoming' })
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const from = String(formData.get('From') ?? '')
    const to = String(formData.get('To') ?? '')
    const body = String(formData.get('Body') ?? '')
    const profileName = String(formData.get('ProfileName') ?? '')
    const messageSid = String(formData.get('MessageSid') ?? '')
    const waId = String(formData.get('WaId') ?? '')
    const normalizedFrom = normalizeWhatsAppNumber(from)
    const trimmedBody = body.trim()

    console.log('[whatsapp-incoming] Received inbound WhatsApp message', {
      from,
      to,
      body: trimmedBody,
      profileName,
      messageSid,
      waId,
    })

    if (normalizedFrom) {
      const restaurants = await prisma.restaurant.findMany({
        select: { id: true, name: true, settings: true },
      })

      const match = restaurants.find((restaurant) => {
        const whatsapp = getRestaurantWhatsAppSettings(restaurant.settings)
        return whatsapp.number === normalizedFrom
      })

      if (match) {
        const whatsapp = getRestaurantWhatsAppSettings(match.settings)
        const now = new Date().toISOString()
        const isVerificationMatch =
          Boolean(whatsapp.verificationCode) && trimmedBody === whatsapp.verificationCode

        await prisma.restaurant.update({
          where: { id: match.id },
          data: {
            settings: mergeRestaurantWhatsAppSettings(match.settings, {
              lastInboundAt: now,
              ...(isVerificationMatch
                ? {
                    verifiedAt: now,
                    verificationCode: null,
                  }
                : {}),
            }),
          },
        })

        if (isVerificationMatch) {
          console.log('[whatsapp-incoming] WhatsApp number verified', {
            restaurantId: match.id,
            restaurantName: match.name,
            normalizedFrom,
          })
        }
      }
    }

    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`)
  } catch (error) {
    console.error('[whatsapp-incoming] Failed to handle inbound WhatsApp webhook:', error)
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, 500)
  }
}
