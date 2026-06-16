export const PNL_PARENT_OPTIONS = [
  { value: 'FOOD', label: 'Food', alwaysOn: true, defaultType: 'PRODUCT' },
  { value: 'BEVERAGES', label: 'Beverages', alwaysOn: true, defaultType: 'PRODUCT' },
  { value: 'OTHER', label: 'Other', alwaysOn: true, defaultType: 'INCOME' },
  { value: 'SHISHA_TOBACCO', label: 'Shisha & Tobacco', alwaysOn: false, defaultType: 'PRODUCT' },
  { value: 'RETAIL', label: 'Retail', alwaysOn: false, defaultType: 'PRODUCT' },
  { value: 'CATERING', label: 'Catering', alwaysOn: false, defaultType: 'PRODUCT' },
] as const

export const PNL_CATEGORY_TYPE_OPTIONS = [
  { value: 'PRODUCT', label: 'Product - inventory + COGS + margin' },
  { value: 'INCOME', label: 'Income - revenue only, no COGS' },
] as const

export type PnlParentCategory = (typeof PNL_PARENT_OPTIONS)[number]['value']
export type PnlCategoryType = (typeof PNL_CATEGORY_TYPE_OPTIONS)[number]['value']

export const isPnlParentCategory = (value: unknown): value is PnlParentCategory =>
  typeof value === 'string' && PNL_PARENT_OPTIONS.some((option) => option.value === value)

export const isPnlCategoryType = (value: unknown): value is PnlCategoryType =>
  typeof value === 'string' && PNL_CATEGORY_TYPE_OPTIONS.some((option) => option.value === value)

export const getPnlParentLabel = (value?: string | null) =>
  PNL_PARENT_OPTIONS.find((option) => option.value === value)?.label ?? 'Food'

export const getPnlTypeLabel = (value?: string | null) =>
  PNL_CATEGORY_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? PNL_CATEGORY_TYPE_OPTIONS[0].label
