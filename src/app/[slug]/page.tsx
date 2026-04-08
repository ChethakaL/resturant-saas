import { notFound } from 'next/navigation'
import { MenuPersonalizationWrapper } from '@/components/customer/MenuPersonalizationWrapper'
import { getPublicMenuBundleBySlug } from '@/lib/public-menu-bundle'

/** ISR hint; full payload is not unstable_cached (can exceed Next.js ~2MB data cache limit). */
export const revalidate = 300

export default async function SlugMenuPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string }
}) {
  const resolved = params instanceof Promise ? await params : params
  const slug = resolved.slug?.toLowerCase().trim()
  if (!slug) notFound()

  const data = await getPublicMenuBundleBySlug(slug)
  if (!data) notFound()

  return (
    <MenuPersonalizationWrapper
      restaurantId={data.restaurant.id}
      menuItems={data.menuItems}
      initialLanguage={data.initialLanguage}
      initialTranslationCache={data.initialTranslationCache}
      showcases={data.showcases}
      categories={data.categories}
      theme={data.theme}
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
      forceShowImages
    />
  )
}
