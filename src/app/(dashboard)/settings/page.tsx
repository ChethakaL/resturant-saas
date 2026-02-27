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
        logo: true,
        settings: true,
        currency: true,
      },
    }),

    prisma.user.findUnique({
      where: { id: session.user.id! },
      select: { defaultBackgroundPrompt: true, defaultBackgroundImageData: true },
    }),
  ])

  const settings = (restaurant?.settings as Record<string, unknown>) || {}
  const themeFromSettings = (settings.theme as Record<string, string>) || {}
  const currentTheme = {
    ...themeFromSettings,
    menuTimezone: (settings.menuTimezone as string) || 'Asia/Baghdad',
    themePreset: (settings.themePreset as string) ?? null,
    backgroundImageUrl: (settings.backgroundImageUrl as string) ?? '',
    managementLanguage: (settings.managementLanguage as string) || 'en',
    restaurantName: restaurant?.name ?? '',
    snowfallEnabled: (settings.snowfallEnabled as string) || 'false',
    snowfallStart: (settings.snowfallStart as string) || '12-15',
    snowfallEnd: (settings.snowfallEnd as string) || '01-07',
    currency: restaurant?.currency ?? 'IQD',
    menuTranslationLanguage1: (settings.menuTranslationLanguage1 as string) ?? 'ar',
    menuTranslationLanguage2: (settings.menuTranslationLanguage2 as string) ?? 'ku',
  }

  const defaultBackgroundPrompt = user?.defaultBackgroundPrompt ?? ''
  const hasDefaultBackgroundImage = Boolean(user?.defaultBackgroundImageData)
  const defaultBackgroundImageData = user?.defaultBackgroundImageData ?? null

  return (
    <SettingsClient
      currentTheme={currentTheme}
      defaultBackgroundPrompt={defaultBackgroundPrompt}
      hasDefaultBackgroundImage={hasDefaultBackgroundImage}
      defaultBackgroundImageData={defaultBackgroundImageData}
    />
  )
}
