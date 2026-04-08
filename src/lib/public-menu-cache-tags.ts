/** Legacy tag for revalidateTag from dashboard menu routes (optional; public menu is client-fetched). */
export function publicMenuDataCacheTag(slug: string): string {
  return `public-menu-${slug.toLowerCase()}`
}
