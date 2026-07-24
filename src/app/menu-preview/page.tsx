import { notFound } from 'next/navigation'
import { menuDesignConfigSchema } from '@/lib/menu-design'
import { designConfigToTheme } from '@/lib/menu-design'
import { getPublicMenuBundleBySlug } from '@/lib/public-menu-bundle'
import SmartMenu from '@/components/customer/SmartMenu'

export const dynamic = 'force-dynamic'

export default async function MenuPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; config?: string }> | { slug?: string; config?: string }
}) {
  const params = searchParams instanceof Promise ? await searchParams : searchParams
  const slug = params.slug?.trim().toLowerCase()
  if (!slug) notFound()

  const data = await getPublicMenuBundleBySlug(slug)
  if (!data) notFound()

  let config = menuDesignConfigSchema.parse({})
  if (params.config) {
    try {
      const parsed = menuDesignConfigSchema.safeParse(JSON.parse(params.config))
      if (parsed.success) config = parsed.data
    } catch {
      // Keep the default draft when the preview query is invalid.
    }
  }

  return (
    <SmartMenu
      restaurantId={data.restaurant.id}
      menuItems={data.menuItems}
      initialLanguage={data.initialLanguage}
      initialTranslationCache={data.initialTranslationCache}
      showcases={data.showcases}
      categories={data.categories}
      theme={{ ...data.theme, ...designConfigToTheme(config) } as any}
      restaurantName={data.restaurant.name}
      restaurantLogo={data.restaurant.logo}
      engineMode={data.engineMode}
      bundles={data.bundles}
      moods={data.moods}
      upsellMap={data.upsellMap}
      categoryOrder={data.categoryOrder}
      menuTimezone={data.menuTimezone}
      slotTimes={data.slotTimes}
      categoryAnchorBundle={data.categoryAnchorBundle}
      maxInitialItemsPerCategory={data.maxInitialItemsPerCategory}
      tables={data.tables}
      tableOrderingEnabled={data.tableOrderingEnabled}
      smartSearchFeelingContext={data.smartSearchFeelingContext}
      snowfallSettings={data.snowfallSettings}
      forceShowImages={config.showItemImages}
    />
  )
}
