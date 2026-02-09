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
  if (session.user.role === 'STAFF') {
    redirect('/orders')
  }

  const [restaurant, user, categories, showcases, menuItems] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { id: true, name: true, logo: true, settings: true },
    }),

    prisma.user.findUnique({
      where: { id: session.user.id! },
      select: { defaultBackgroundPrompt: true },
    }),

    prisma.category.findMany({
      where: { restaurantId: session.user.restaurantId },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, name: true, displayOrder: true },
    }),

    prisma.menuShowcase.findMany({
      where: { restaurantId: session.user.restaurantId },
      orderBy: { displayOrder: 'asc' },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            menuItem: {
              select: { id: true, name: true, imageUrl: true, price: true },
            },
          },
        },
      },
    }),

    prisma.menuItem.findMany({
      where: { restaurantId: session.user.restaurantId, available: true },
      select: { id: true, name: true, imageUrl: true, price: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const settings = (restaurant?.settings as Record<string, unknown>) || {}
  const themeFromSettings = (settings.theme as Record<string, string>) || {}
  const currentTheme = {
    ...themeFromSettings,
    menuTimezone: (settings.menuTimezone as string) || 'Asia/Baghdad',
    themePreset: (settings.themePreset as string) ?? null,
    backgroundImageUrl: (settings.backgroundImageUrl as string) ?? '',
  }

  const defaultBackgroundPrompt = user?.defaultBackgroundPrompt ?? ''
  const menuEngineSettings = (settings.menuEngine as Record<string, unknown>) || null

  return (
    <SettingsClient
      currentTheme={currentTheme}
      defaultBackgroundPrompt={defaultBackgroundPrompt}
      categories={categories}
      showcases={JSON.parse(JSON.stringify(showcases))}
      menuItems={menuItems}
      menuEngineSettings={menuEngineSettings}
    />
  )
}
