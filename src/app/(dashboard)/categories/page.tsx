import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import CategoriesPageClient from '@/app/(dashboard)/categories/CategoriesPageClient'
import { notFound } from 'next/navigation'
import { normalizeUiSourceText, resolveUiTranslationMap } from '@/lib/i18n/server-ui-translations'

async function getCategoriesWithItems(restaurantId: string) {
  const categories = await prisma.category.findMany({
    where: { restaurantId },
    orderBy: { displayOrder: 'asc' },
    include: {
      menuItems: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          translations: {
            where: { language: { in: ['ar', 'ar_fusha', 'ku'] } },
            select: { language: true, translatedName: true },
          },
        },
      },
    },
  })
  return categories
}

export default async function CategoriesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    notFound()
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: { settings: true },
  })

  const settings = (restaurant?.settings as Record<string, unknown> | null) || {}
  const managementLanguage = String(settings.managementLanguage || 'en')
  const categories = await getCategoriesWithItems(session.user.restaurantId)

  const sourceTexts = Array.from(
    new Set(
      categories.flatMap((category) => [
        normalizeUiSourceText(category.name),
        normalizeUiSourceText(category.description || ''),
        ...category.menuItems.map((item) => normalizeUiSourceText(item.name)),
      ]).filter(Boolean)
    )
  )

  const uiTranslationMap = await resolveUiTranslationMap(sourceTexts, managementLanguage)

  return <CategoriesPageClient initialCategories={categories} uiTranslationMap={uiTranslationMap} />
}
