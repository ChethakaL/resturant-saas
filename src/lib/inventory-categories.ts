export const INVENTORY_CATEGORY_OPTIONS = [
  { value: 'PROTEINS', label: 'Proteins' },
  { value: 'DAIRY', label: 'Dairy' },
  { value: 'DRY_GOODS', label: 'Dry Goods' },
  { value: 'PRODUCE', label: 'Produce' },
  { value: 'BEVERAGES', label: 'Beverages' },
  { value: 'PACKAGING', label: 'Packaging' },
  { value: 'OTHER', label: 'Other' },
] as const

export type InventoryCategory = (typeof INVENTORY_CATEGORY_OPTIONS)[number]['value']

export const DEFAULT_INVENTORY_CATEGORY: InventoryCategory = 'OTHER'

export const isInventoryCategory = (value: unknown): value is InventoryCategory =>
  typeof value === 'string' &&
  INVENTORY_CATEGORY_OPTIONS.some((option) => option.value === value)

export const getInventoryCategoryLabel = (value?: string | null) =>
  INVENTORY_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? 'Other'
