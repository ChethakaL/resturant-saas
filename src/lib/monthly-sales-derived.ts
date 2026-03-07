import type { ImportedMonthlySalesData, ImportedMonthlySalesItem } from '@/lib/monthly-sales-import'

interface CostedMenuItem {
  id: string
  name: string
  price: number
  categoryId?: string
  categoryName?: string | null
  cost: number
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function buildCostedMenuItems(menuItems: any[]): CostedMenuItem[] {
  return menuItems.map((item: any) => ({
    id: item.id,
    name: item.name,
    price: item.price ?? 0,
    categoryId: item.categoryId,
    categoryName: item.category?.name ?? null,
    cost: (item.ingredients || []).reduce(
      (sum: number, ing: any) => sum + (ing.quantity || 0) * (ing.ingredient?.costPerUnit || 0),
      0
    ),
  }))
}

export function matchImportedItemToMenuItem(
  importedItem: ImportedMonthlySalesItem,
  menuItems: CostedMenuItem[]
) {
  const importedName = normalizeName(importedItem.itemName)
  if (!importedName) return null

  const exact = menuItems.find((item) => normalizeName(item.name) === importedName)
  if (exact) return exact

  const includes = menuItems.find((item) => {
    const candidate = normalizeName(item.name)
    return candidate.includes(importedName) || importedName.includes(candidate)
  })
  return includes || null
}

export function buildImportedSalesByItem(importData: ImportedMonthlySalesData, menuItems: CostedMenuItem[]) {
  const map = new Map<string, { quantity: number; costSum: number; revenue: number; name: string }>()

  for (const row of importData.topSellingItems) {
    const matched = matchImportedItemToMenuItem(row, menuItems)
    if (!matched) continue
    const current = map.get(matched.id) || { quantity: 0, costSum: 0, revenue: 0, name: matched.name }
    current.quantity += row.quantitySold
    current.revenue += row.grossRevenue
    current.costSum += matched.cost * row.quantitySold
    map.set(matched.id, current)
  }

  return map
}

export function getImportedCurrentDay(importData: ImportedMonthlySalesData, now = new Date()) {
  const key = now.toISOString().slice(0, 10)
  return importData.dailySales.find((row) => row.date === key) || null
}

export function getImportedCurrentWeekTotals(importData: ImportedMonthlySalesData, now = new Date()) {
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  const rows = importData.dailySales.filter((row) => {
    const date = new Date(`${row.date}T00:00:00`)
    return date >= monday && date <= sunday
  })

  return rows.reduce(
    (acc, row) => {
      acc.revenue += row.netSales || row.grossSales
      acc.orders += row.orders || 0
      return acc
    },
    { revenue: 0, orders: 0 }
  )
}
