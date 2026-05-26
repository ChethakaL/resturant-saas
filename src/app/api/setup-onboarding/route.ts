import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })
    const currentSettings = (restaurant?.settings as Record<string, unknown>) || {}

    await prisma.restaurant.update({
      where: { id: session.user.restaurantId },
      data: {
        settings: {
          ...currentSettings,
          setupOnboardingSeen: body.seen ?? currentSettings.setupOnboardingSeen ?? true,
          setupOnboardingCompleted: body.completed ?? currentSettings.setupOnboardingCompleted ?? false,
          setupOnboardingLastOpenedAt: new Date().toISOString(),
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving setup onboarding:', error)
    return NextResponse.json({ error: 'Failed to save onboarding state' }, { status: 500 })
  }
}
