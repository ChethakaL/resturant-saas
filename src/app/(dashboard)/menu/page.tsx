import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getServerTranslations } from '@/lib/i18n/server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPercentage } from '@/lib/utils'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import BulkMenuImport from '@/components/menu/BulkMenuImport'
import ImportByDigitalMenu from '@/components/menu/ImportByDigitalMenu'
import CategoriesButtonWithHelp from '@/components/menu/CategoriesButtonWithHelp'
import MenuItemsTable from '@/components/menu/MenuItemsTable'
import MenuPageTabs from '@/components/menu/MenuPageTabs'
import { parseSlotTimes } from '@/lib/time-slots'

const PAGE_SIZE = 20

/** Map management locale to the translation language code */
function getTranslationLanguage(locale: string): string | null {
  if (locale === 'ku') return 'ku'
  if (locale === 'ar-fusha' || locale === 'ar_fusha') return 'ar_fusha'
  // English is the source language – no translation overlay needed
  return null
}

async function getMenuData(
  restaurantId: string,
  page: number,
  translationLang: string | null,
  search?: string,
  statusFilter?: string
) {
  const skip = (page - 1) * PAGE_SIZE

  const normalizedSearch = search?.trim() ?? ''
  const where: Prisma.MenuItemWhereInput = {
    restaurantId,
    ...(normalizedSearch
      ? translationLang
        ? {
          OR: [
            { name: { contains: normalizedSearch, mode: 'insensitive' as const } },
            {
              translations: {
                some: {
                  language: translationLang,
                  translatedName: { contains: normalizedSearch, mode: 'insensitive' as const },
                },
              },
            },
          ],
        }
        : {
          name: { contains: normalizedSearch, mode: 'insensitive' as const },
        }
      : {}),
    ...(statusFilter === 'DRAFT' ? { status: 'DRAFT' } : {}),
    ...(statusFilter === 'ACTIVE' ? { status: 'ACTIVE' } : {}),
    ...(statusFilter === 'COSTING_INCOMPLETE' ? { costingStatus: 'INCOMPLETE' } : {}),
  }

  // Run count and paginated fetch in parallel
  const [totalCount, menuItems, categories, ingredients, avgMarginResult, chefPicks] =
    await Promise.all([
      prisma.menuItem.count({ where }),
      prisma.menuItem.findMany({
        where,
        include: {
          category: true,
          ingredients: {
            include: {
              ingredient: true,
            },
          },
          translations: translationLang
            ? { where: { language: translationLang } }
            : false,
        },
        orderBy: { name: 'asc' },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.category.findMany({
        where: { restaurantId },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.ingredient.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
      }),
      // Average margin: sample up to 500 items to avoid loading thousands (perf)
      prisma.menuItem.findMany({
        where,
        select: {
          price: true,
          ingredients: {
            select: {
              quantity: true,
              ingredient: {
                select: { costPerUnit: true },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: 500,
      }),
      prisma.chefPick.findMany({
        where: { restaurantId },
        orderBy: { displayOrder: 'asc' },
      }),
    ])

  // Calculate cost and margin for paginated items
  const chefPickOrderById = new Map(chefPicks.map((pick) => [pick.menuItemId, pick.displayOrder]))

  const itemsWithMetrics = menuItems.map((item) => {
    const cost = item.ingredients.reduce(
      (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    const margin = item.price > 0 ? ((item.price - cost) / item.price) * 100 : 0

    // Overlay translated name/description when management language isn't English
    const tx = translationLang && (item as any).translations?.[0]
    const displayName = tx?.translatedName || item.name
    const displayDescription = tx?.translatedDescription || item.description

    return {
      ...item,
      name: displayName,
      description: displayDescription,
      cost,
      margin,
      profit: item.price - cost,
      chefPickOrder: chefPickOrderById.get(item.id) ?? null,
      status: (item as any).status ?? 'DRAFT',
      costingStatus: (item as any).costingStatus ?? 'INCOMPLETE',
    }
  })

  // Calculate average margin from all items
  const allMargins = avgMarginResult.map((item) => {
    const cost = item.ingredients.reduce(
      (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    return item.price > 0 ? ((item.price - cost) / item.price) * 100 : 0
  })
  const avgMargin = allMargins.length > 0
    ? allMargins.reduce((sum, m) => sum + m, 0) / allMargins.length
    : 0

  return {
    menuItems: itemsWithMetrics,
    categories,
    ingredients,
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    avgMargin,
  }
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams?: { page?: string; search?: string | string[]; status?: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId
  const page = Math.max(Number(searchParams?.page || 1), 1)
  const rawSearch = searchParams?.search
  const normalizedSearch =
    typeof rawSearch === 'string'
      ? rawSearch.trim()
      : Array.isArray(rawSearch)
        ? rawSearch[0]?.trim() ?? ''
        : ''
  const statusFilter = searchParams?.status ?? ''

  // Defer showcases + all menu items to optimization tab (loaded client-side when user opens that tab)
  const { locale, t } = await getServerTranslations()
  const translationLang = getTranslationLanguage(locale)

  const [data, user, restaurant] = await Promise.all([
    getMenuData(restaurantId, page, translationLang, normalizedSearch, statusFilter),
    prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { defaultBackgroundPrompt: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { settings: true, slug: true },
    }),
  ])
  const defaultBackgroundPrompt = user?.defaultBackgroundPrompt ?? ''
  const searchQuery = (normalizedSearch ? `&search=${encodeURIComponent(normalizedSearch)}` : '')
    + (statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : '')
  const settings = (restaurant?.settings as Record<string, unknown>) || {}
  const menuEngineSettings = (settings.menuEngine as Record<string, unknown>) || null
  const slotTimesRaw = parseSlotTimes(settings.slotTimes)
  const normalizedBaseUrl = (process.env.NEXTAUTH_URL || '').trim().replace(/\/+$/, '')
  const publicMenuPath = restaurant?.slug ? `/${restaurant.slug}` : '/'
  const clientFacingMenuUrl = normalizedBaseUrl ? `${normalizedBaseUrl}${publicMenuPath}` : publicMenuPath
  const categoryOptions = data.categories.map((c) => ({ id: c.id, name: c.name, displayOrder: c.displayOrder }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t.menu_title}</h1>
        <p className="text-slate-500 mt-1">{t.menu_subtitle}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="font-medium text-slate-700">{t.menu_client_url}</span>
          <a
            href={clientFacingMenuUrl}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-700 hover:underline break-all"
          >
            {clientFacingMenuUrl}
          </a>
        </div>
      </div>
      <MenuPageTabs
        categories={categoryOptions}
        menuEngineSettings={menuEngineSettings}
        slotTimes={slotTimesRaw}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div />
            <div className="flex flex-wrap gap-2">
              <CategoriesButtonWithHelp />
              <BulkMenuImport categories={data.categories} ingredients={data.ingredients} defaultBackgroundPrompt={defaultBackgroundPrompt} />
              <ImportByDigitalMenu categories={data.categories} ingredients={data.ingredients} defaultBackgroundPrompt={defaultBackgroundPrompt} />
              <Link href="/menu/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t.menu_add_item}
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t.menu_total_items}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalCount}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t.menu_average_margin}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatPercentage(data.avgMargin)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t.menu_categories}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.categories.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t.menu_all_items}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                method="get"
                className="mb-4 flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="page" value="1" />
                <div className="flex flex-1 gap-2 min-w-0">
                  <Input
                    name="search"
                    placeholder={t.menu_search_placeholder}
                    defaultValue={normalizedSearch}
                    className="min-w-0"
                  />
                  <select
                    name="status"
                    defaultValue={statusFilter}
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">{t.menu_all_statuses}</option>
                    <option value="DRAFT">{t.menu_draft}</option>
                    <option value="ACTIVE">{t.menu_published}</option>
                    <option value="COSTING_INCOMPLETE">{t.menu_costing_incomplete}</option>
                  </select>
                  <Button size="sm" type="submit">
                    {t.menu_search}
                  </Button>
                </div>
                {(normalizedSearch || statusFilter) && (
                  <Link href="/dashboard/menu?page=1">
                    <Button variant="outline" size="sm">
                      {t.menu_clear}
                    </Button>
                  </Link>
                )}
              </form>

              <MenuItemsTable menuItems={data.menuItems} />

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 mt-4">
                  <p className="text-sm text-slate-500">
                    {t.menu_page_of.replace('{0}', String(page)).replace('{1}', String(data.totalPages)).replace('{2}', String(data.totalCount))}
                  </p>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/menu?page=${Math.max(page - 1, 1)}${searchQuery}`}
                    >
                      <Button variant="outline" size="sm" disabled={page <= 1}>
                        {t.menu_previous}
                      </Button>
                    </Link>
                    <Link
                      href={`/dashboard/menu?page=${Math.min(
                        page + 1,
                        data.totalPages
                      )}${searchQuery}`}
                    >
                      <Button variant="outline" size="sm" disabled={page >= data.totalPages}>
                        {t.menu_next}
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </MenuPageTabs>
    </div>
  )
}
