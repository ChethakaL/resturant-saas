import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { menuDesignFromLegacyTheme } from '@/lib/menu-design'
import { prisma } from '@/lib/prisma'
import { getPublicMenuBundleBySlug } from '@/lib/public-menu-bundle'
import AppearanceEditor from './AppearanceEditor'

export const dynamic = 'force-dynamic'

export default async function MenuAppearancePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) redirect('/login')

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: {
      name: true,
      slug: true,
      logo: true,
      settings: true,
      menuDesign: true,
      menuItems: {
        where: { available: true },
        orderBy: { createdAt: 'asc' },
        take: 6,
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          calories: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!restaurant) redirect('/login')

  const previewData = await getPublicMenuBundleBySlug(restaurant.slug)

  const legacyConfig = menuDesignFromLegacyTheme(
    (restaurant.settings as Record<string, unknown>) || {},
  )

  return (
    <AppearanceEditor
      restaurantName={restaurant.name}
      slug={restaurant.slug}
      logo={restaurant.logo}
      initialConfig={(restaurant.menuDesign?.draftConfig as any) || legacyConfig}
      initialPublishedConfig={(restaurant.menuDesign?.publishedConfig as any) || legacyConfig}
      initialCustomHtml={restaurant.menuDesign?.customHtml || ''}
      initialVersion={restaurant.menuDesign?.version || 0}
      initialPublishedAt={restaurant.menuDesign?.publishedAt?.toISOString() || null}
      menuItems={restaurant.menuItems}
      previewData={previewData}
    />
  )
}
