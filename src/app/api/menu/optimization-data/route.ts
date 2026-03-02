import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Map management locale to MenuItemTranslation language code */
function getTranslationLang(managementLanguage: string): string | null {
  if (managementLanguage === 'ku') return 'ku'
  if (managementLanguage === 'ar-fusha' || managementLanguage === 'ar_fusha') return 'ar_fusha'
  return null
}

/**
 * GET /api/menu/optimization-data
 * Returns showcases and menu items for the optimization tab. Used to defer this
 * heavy load until the user opens the "Optimize your menu sales" tab.
 * Menu item names are translated to the system (management) language when available.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const restaurantId = session.user.restaurantId

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { settings: true },
  })
  const settings = (restaurant?.settings as Record<string, unknown>) || {}
  const managementLanguage = (settings.managementLanguage as string) || 'en'
  const translationLang = getTranslationLang(managementLanguage)

  const [showcases, menuItemsRaw] = await Promise.all([
    prisma.menuShowcase.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            menuItem: {
              select: { id: true, name: true, imageUrl: true, price: true, ...(translationLang ? { translations: { where: { language: translationLang }, select: { translatedName: true } } } : {}) },
            },
          },
        },
      },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId, available: true },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        price: true,
        ...(translationLang
          ? {
              translations: {
                where: { language: translationLang },
                select: { translatedName: true },
              },
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    }),
  ])

  const toDisplay = (item: { name: string; translations?: { translatedName: string }[] }) => {
    const tx = (item as { translations?: { translatedName: string }[] }).translations?.[0]
    const { translations, ...rest } = item as { name: string; translations?: unknown }
    return { ...rest, displayName: tx?.translatedName || item.name }
  }

  const menuItems = menuItemsRaw.map((m) => {
    const { translations, ...rest } = m as typeof m & { translations?: { translatedName: string }[] }
    return toDisplay({ ...rest, translations })
  })

  const showcasesWithDisplayNames = showcases.map((s) => ({
    ...s,
    items: s.items.map((si) => ({
      ...si,
      menuItem: toDisplay(si.menuItem as typeof si.menuItem & { translations?: { translatedName: string }[] }),
    })),
  }))

  return NextResponse.json({
    showcases: JSON.parse(JSON.stringify(showcasesWithDisplayNames)),
    menuItems,
  })
}
