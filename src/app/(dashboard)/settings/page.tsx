import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    redirect('/login')
  }
  const [restaurant, user] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        lat: true,
        lng: true,
        logo: true,
        settings: true,
      },
    }),

    prisma.user.findUnique({
      where: { id: session.user.id! },
      select: { defaultBackgroundPrompt: true, defaultBackgroundImageData: true },
    }),
  ])

  const settings = (restaurant?.settings as Record<string, unknown>) || {}
  const themeFromSettings = (settings.theme as Record<string, string>) || {}
  const whatsappSettings = (settings.whatsappOrderNotifications as Record<string, unknown>) || {}
  const currentTheme = {
    ...themeFromSettings,
    menuTimezone: (settings.menuTimezone as string) || 'Asia/Baghdad',
    themePreset: (settings.themePreset as string) ?? null,
    backgroundImageUrl: (settings.backgroundImageUrl as string) ?? '',
    managementLanguage: (settings.managementLanguage as string) || 'en',
    restaurantName: restaurant?.name ?? '',
    restaurantEmail: restaurant?.email ?? '',
    restaurantPhone: restaurant?.phone ?? '',
    restaurantCity: restaurant?.city ?? '',
    restaurantAddress: restaurant?.address ?? '',
    restaurantLat: typeof restaurant?.lat === 'number' ? String(restaurant.lat) : '',
    restaurantLng: typeof restaurant?.lng === 'number' ? String(restaurant.lng) : '',
    snowfallEnabled: (settings.snowfallEnabled as string) || 'false',
    snowfallStart: (settings.snowfallStart as string) || '12-15',
    snowfallEnd: (settings.snowfallEnd as string) || '01-07',
    tableOrderingEnabled: settings.tableOrderingEnabled !== false,
    showKurdishOnMenu: (settings.theme as Record<string, unknown>)?.showKurdishOnMenu !== false,
    showArabicOnMenu: (settings.theme as Record<string, unknown>)?.showArabicOnMenu !== false,
    restaurantWhatsappNumber: typeof whatsappSettings.number === 'string' ? whatsappSettings.number : '',
    restaurantWhatsappVerifiedAt: typeof whatsappSettings.verifiedAt === 'string' ? whatsappSettings.verifiedAt : null,
    restaurantWhatsappLastInboundAt: typeof whatsappSettings.lastInboundAt === 'string' ? whatsappSettings.lastInboundAt : null,
  }

  const defaultBackgroundPrompt = user?.defaultBackgroundPrompt ?? ''
  const hasDefaultBackgroundImage = Boolean(user?.defaultBackgroundImageData)
  const defaultBackgroundImageData = user?.defaultBackgroundImageData ?? null

  return (
    <SettingsClient
      currentTheme={currentTheme}
      twilioWhatsAppNumber={process.env.TWILIO_PHONE_NUMBER ?? ''}
      defaultBackgroundPrompt={defaultBackgroundPrompt}
      hasDefaultBackgroundImage={hasDefaultBackgroundImage}
      defaultBackgroundImageData={defaultBackgroundImageData}
    />
  )
}
