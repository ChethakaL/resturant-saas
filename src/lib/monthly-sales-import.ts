import { getPlatformConfig } from './platform-config'

export interface ImportedMonthlySalesSummary {
  currency: string
  totalSales: number
  totalExpenses: number
  totalOrders: number
  avgOrderValue: number
  taxCollected: number
  discounts: number
  netSales: number
}

export interface ImportedMonthlySalesItem {
  itemName: string
  category: string | null
  quantitySold: number
  unitPrice: number
  grossRevenue: number
}

export interface ImportedMonthlySalesExpenseLine {
  category: string | null
  description: string
  amount: number
  notes: string | null
}

export interface ImportedMonthlySalesDay {
  date: string
  day: string | null
  orders: number
  grossSales: number
  discounts: number
  netSales: number
  status: string | null
}

export interface ImportedMonthlySalesWeek {
  weekLabel: string
  period: string | null
  orders: number
  grossSales: number
  discounts: number
  netSales: number
}

export interface ImportedMonthlySalesData {
  year: number
  month: number
  restaurantName: string | null
  branchName: string | null
  reportType: string | null
  sourceFileName: string
  importedAt: string
  summary: ImportedMonthlySalesSummary
  weeklySales: ImportedMonthlySalesWeek[]
  topSellingItems: ImportedMonthlySalesItem[]
  expenseLines?: ImportedMonthlySalesExpenseLine[]
  dailySales: ImportedMonthlySalesDay[]
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

export function detectPeriodFromFileName(fileName: string): { year: number; month: number } | null {
  const normalized = fileName.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const compact = fileName.toLowerCase()

  const yearMonthPattern = compact.match(/\b(20\d{2})[-_./ ](0?[1-9]|1[0-2])\b/)
  if (yearMonthPattern) {
    const year = Number(yearMonthPattern[1])
    const month = Number(yearMonthPattern[2])
    if (Number.isInteger(year) && Number.isInteger(month) && year >= 2020 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month }
    }
  }

  const monthYearPattern = compact.match(/\b(0?[1-9]|1[0-2])[-_./ ](20\d{2})\b/)
  if (monthYearPattern) {
    const month = Number(monthYearPattern[1])
    const year = Number(monthYearPattern[2])
    if (Number.isInteger(year) && Number.isInteger(month) && year >= 2020 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month }
    }
  }

  const yearMatch = normalized.match(/\b(20\d{2})\b/)
  if (!yearMatch) return null
  const year = Number(yearMatch[1])
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null

  for (const [monthName, monthNumber] of Object.entries(MONTH_NAME_TO_NUMBER)) {
    if (normalized.includes(monthName)) {
      return { year, month: monthNumber }
    }
  }

  return null
}

function toFiniteNumber(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

function roundCurrency(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

function isCloseEnough(left: number, right: number) {
  if (left <= 0 || right <= 0) return false
  const base = Math.max(Math.abs(left), Math.abs(right))
  return Math.abs(left - right) / base <= 0.03
}

function pickSummaryTotal({
  summaryValue,
  candidates,
}: {
  summaryValue: number
  candidates: number[]
}) {
  const positiveCandidates = candidates.filter((value) => value > 0)
  if (positiveCandidates.length === 0) {
    return summaryValue > 0 ? summaryValue : 0
  }
  if (summaryValue > 0 && positiveCandidates.some((candidate) => isCloseEnough(summaryValue, candidate))) {
    return summaryValue
  }
  return Math.max(...positiveCandidates)
}

function parseCurrencyNumber(raw: string | undefined) {
  if (!raw) return 0
  const normalized = raw.replace(/[^0-9.-]/g, '')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : 0
}

async function extractSummaryFromPdfText(fileBase64: string) {
  try {
    const buffer = Buffer.from(fileBase64, 'base64')
    const pdfParseModule = await import('pdf-parse')
    const pdfParse = (pdfParseModule.default || pdfParseModule) as (data: Buffer) => Promise<{ text?: string }>
    const parsed = await pdfParse(buffer)
    const text = parsed.text || ''
    if (!text.trim()) return null

    const compact = text.replace(/\s+/g, ' ')
    const revenueMatch = compact.match(/Total Revenue[\s\S]{0,40}?IQD\s*([0-9,]+)/i)
    const expensesMatch = compact.match(/Total Expenses[\s\S]{0,40}?IQD\s*([0-9,]+)/i)
    const netMatch = compact.match(/(?:Net Profit|Net Sales)[\s\S]{0,40}?IQD\s*([0-9,]+)/i)
    const totalBandMatch = compact.match(
      /IQD\s*([0-9,]+)[\s\S]{0,20}?IQD\s*([0-9,]+)[\s\S]{0,20}?IQD\s*([0-9,]+)/i
    )

    const totalSales = Math.max(parseCurrencyNumber(revenueMatch?.[1]), parseCurrencyNumber(totalBandMatch?.[1]))
    const totalExpenses = Math.max(parseCurrencyNumber(expensesMatch?.[1]), parseCurrencyNumber(totalBandMatch?.[2]))
    const netSales = Math.max(parseCurrencyNumber(netMatch?.[1]), parseCurrencyNumber(totalBandMatch?.[3]))
    const revenueSectionMatch = text.match(/REVENUE\s+Category[\s\S]*?EXPENSES/i)
    let totalOrders = 0
    if (revenueSectionMatch?.[0]) {
      const lines = revenueSectionMatch[0].split('\n')
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        const rowMatch = line.match(/(\d{1,3}(?:,\d{3})*|\d+)\s+(\d{1,3}(?:,\d{3})+)\s+(\d{1,3}(?:,\d{3})+)$/)
        if (!rowMatch) continue
        const quantity = parseCurrencyNumber(rowMatch[1])
        if (quantity > 0) totalOrders += quantity
      }
    }

    const expenseLines: ImportedMonthlySalesExpenseLine[] = []
    const expenseCategories = ['Cost of Goods', 'Staff', 'Utilities', 'Operations']
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
    let inExpensesSection = false
    for (const line of lines) {
      if (/^EXPENSES$/i.test(line)) {
        inExpensesSection = true
        continue
      }
      if (!inExpensesSection) continue
      if (/^Category\s+Description\s+Amount/i.test(line)) continue
      if (/^Total Expenses/i.test(line) || /^NET PROFIT/i.test(line) || /^Generated for/i.test(line)) break

      const match = line.match(/^(.*)\s+(\d{1,3}(?:,\d{3})+)\s*(.*)$/)
      if (!match) continue
      const amount = parseCurrencyNumber(match[2])
      if (amount <= 0) continue
      let beforeAmount = match[1].trim()
      const notes = match[3]?.trim() ? match[3].trim() : null
      let category: string | null = null
      for (const candidate of expenseCategories) {
        if (beforeAmount.startsWith(candidate)) {
          category = candidate
          beforeAmount = beforeAmount.slice(candidate.length).trim()
          break
        }
      }
      const description = beforeAmount || 'Expense'
      expenseLines.push({ category, description, amount, notes })
    }

    if (totalSales <= 0 && netSales <= 0 && expenseLines.length === 0) return null

    return {
      summary: {
        totalSales,
        totalExpenses,
        netSales,
        totalOrders,
      },
      expenseLines,
    }
  } catch {
    return null
  }
}

function normalizeImportedMonthlySalesData(
  payload: Record<string, unknown>,
  fileName: string,
  year: number,
  month: number
): ImportedMonthlySalesData {
  const summaryRaw = (payload.summary as Record<string, unknown>) || {}
  const weeklyRaw = Array.isArray(payload.weeklySales) ? payload.weeklySales : []
  const topItemsRaw = Array.isArray(payload.topSellingItems) ? payload.topSellingItems : []
  const expenseLinesRaw = Array.isArray(payload.expenseLines) ? payload.expenseLines : []
  const dailyRaw = Array.isArray(payload.dailySales) ? payload.dailySales : []

  const topSellingItems = topItemsRaw
    .map((item) => {
      const row = (item as Record<string, unknown>) || {}
      const quantitySold = Math.max(0, Math.round(toFiniteNumber(row.quantitySold)))
      const unitPrice = Math.max(0, toFiniteNumber(row.unitPrice))
      const grossRevenueRaw = Math.max(0, toFiniteNumber(row.grossRevenue))
      const grossRevenue = grossRevenueRaw > 0 ? grossRevenueRaw : quantitySold * unitPrice
      return {
        itemName: typeof row.itemName === 'string' ? row.itemName : 'Unknown Item',
        category: typeof row.category === 'string' ? row.category : null,
        quantitySold,
        unitPrice,
        grossRevenue: roundCurrency(grossRevenue),
      }
    })
    .filter((item) => item.itemName && item.grossRevenue > 0)
  const uniqueTopItems = new Map<string, ImportedMonthlySalesItem>()
  for (const item of topSellingItems) {
    const key = normalizeTextKey(item.itemName) + `|${item.quantitySold}|${item.unitPrice}|${item.grossRevenue}`
    if (!uniqueTopItems.has(key)) uniqueTopItems.set(key, item)
  }
  const normalizedTopItems = Array.from(uniqueTopItems.values())
  const expenseLines = expenseLinesRaw
    .map((line) => {
      const row = (line as Record<string, unknown>) || {}
      const description = typeof row.description === 'string' ? row.description.trim() : ''
      return {
        category: typeof row.category === 'string' ? row.category : null,
        description: description || 'Expense',
        amount: roundCurrency(Math.max(0, toFiniteNumber(row.amount))),
        notes: typeof row.notes === 'string' ? row.notes : null,
      }
    })
    .filter((line) => line.amount > 0)

  const dailySales = dailyRaw.map((item) => {
    const row = (item as Record<string, unknown>) || {}
    const grossSales = Math.max(0, toFiniteNumber(row.grossSales))
    const netSales = Math.max(0, toFiniteNumber(row.netSales))
    return {
      date: typeof row.date === 'string' ? row.date : '',
      day: typeof row.day === 'string' ? row.day : null,
      orders: Math.max(0, Math.round(toFiniteNumber(row.orders))),
      grossSales,
      discounts: Math.max(0, toFiniteNumber(row.discounts)),
      netSales: netSales > 0 ? netSales : grossSales,
      status: typeof row.status === 'string' ? row.status : null,
    }
  }).filter((item) => item.date)

  const weeklySales = weeklyRaw.map((item) => {
    const row = (item as Record<string, unknown>) || {}
    const grossSales = Math.max(0, toFiniteNumber(row.grossSales))
    const netSales = Math.max(0, toFiniteNumber(row.netSales))
    return {
      weekLabel: typeof row.weekLabel === 'string' ? row.weekLabel : 'Week',
      period: typeof row.period === 'string' ? row.period : null,
      orders: Math.max(0, Math.round(toFiniteNumber(row.orders))),
      grossSales,
      discounts: Math.max(0, toFiniteNumber(row.discounts)),
      netSales: netSales > 0 ? netSales : grossSales,
    }
  })

  const summaryTotalSales = Math.max(0, toFiniteNumber(summaryRaw.totalSales))
  const summaryTotalExpenses = Math.max(0, toFiniteNumber(summaryRaw.totalExpenses))
  const summaryNetSales = Math.max(0, toFiniteNumber(summaryRaw.netSales))
  const summaryTotalOrders = Math.max(0, Math.round(toFiniteNumber(summaryRaw.totalOrders)))
  const grossFromItems = normalizedTopItems.reduce((sum, item) => sum + item.grossRevenue, 0)
  const grossFromDaily = dailySales.reduce((sum, row) => sum + row.grossSales, 0)
  const netFromDaily = dailySales.reduce((sum, row) => sum + row.netSales, 0)
  const ordersFromDaily = dailySales.reduce((sum, row) => sum + row.orders, 0)
  const ordersFromItems = normalizedTopItems.reduce((sum, item) => sum + item.quantitySold, 0)

  const totalSales = roundCurrency(
    pickSummaryTotal({
      summaryValue: summaryTotalSales,
      candidates: [grossFromItems, grossFromDaily],
    })
  )
  const netSales = roundCurrency(
    pickSummaryTotal({
      summaryValue: summaryNetSales,
      candidates: [netFromDaily, Math.max(0, totalSales - summaryTotalExpenses)],
    })
  )
  const totalOrders = Math.round(
    pickSummaryTotal({
      summaryValue: summaryTotalOrders,
      candidates: [ordersFromDaily, ordersFromItems],
    })
  )
  const avgOrderValue = totalOrders > 0 ? roundCurrency(totalSales / totalOrders) : 0

  return {
    year,
    month,
    restaurantName: typeof payload.restaurantName === 'string' ? payload.restaurantName : null,
    branchName: typeof payload.branchName === 'string' ? payload.branchName : null,
    reportType: typeof payload.reportType === 'string' ? payload.reportType : null,
    sourceFileName: fileName,
    importedAt: new Date().toISOString(),
    summary: {
      currency: typeof summaryRaw.currency === 'string' && summaryRaw.currency.trim() ? summaryRaw.currency : 'IQD',
      totalSales,
      totalExpenses: roundCurrency(summaryTotalExpenses),
      totalOrders,
      avgOrderValue,
      taxCollected: roundCurrency(Math.max(0, toFiniteNumber(summaryRaw.taxCollected))),
      discounts: roundCurrency(Math.max(0, toFiniteNumber(summaryRaw.discounts))),
      netSales,
    },
    weeklySales,
    topSellingItems: normalizedTopItems,
    expenseLines,
    dailySales,
  }
}

export function sanitizeImportedMonthlySalesData(
  payload: ImportedMonthlySalesData,
  defaults: { fileName: string; year: number; month: number }
) {
  const normalized = normalizeImportedMonthlySalesData(
    payload as unknown as Record<string, unknown>,
    defaults.fileName,
    defaults.year,
    defaults.month
  )
  return {
    ...normalized,
    importedAt: typeof payload.importedAt === 'string' && payload.importedAt ? payload.importedAt : normalized.importedAt,
  }
}

export function getMonthlySalesImports(settings: Record<string, unknown> | null | undefined) {
  const raw = settings?.monthlySalesImports
  if (!Array.isArray(raw)) return [] as ImportedMonthlySalesData[]

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const year = Number(row.year)
      const month = Number(row.month)
      const sourceFileName = typeof row.sourceFileName === 'string' ? row.sourceFileName : ''
      const importedAt = typeof row.importedAt === 'string' ? row.importedAt : ''
      const summary = row.summary
      if (!Number.isInteger(year) || !Number.isInteger(month) || !sourceFileName || !importedAt || !summary || typeof summary !== 'object') {
        return null
      }
      return row as unknown as ImportedMonthlySalesData
    })
    .filter((item): item is ImportedMonthlySalesData => Boolean(item))
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      if (a.month !== b.month) return b.month - a.month
      return new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
    })
}

export function getCurrentMonthlySalesImport(settings: Record<string, unknown> | null | undefined, date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  return getMonthlySalesImports(settings).find((item) => item.year === year && item.month === month) || null
}

export function hasCurrentMonthlySalesImport(settings: Record<string, unknown> | null | undefined, date = new Date()) {
  return Boolean(getCurrentMonthlySalesImport(settings, date))
}

export function upsertMonthlySalesImport(
  settings: Record<string, unknown> | null | undefined,
  nextImport: ImportedMonthlySalesData
) {
  const currentSettings = settings || {}
  const imports = getMonthlySalesImports(currentSettings).filter(
    (item) => !(item.year === nextImport.year && item.month === nextImport.month)
  )

  return {
    ...currentSettings,
    monthlySalesImports: [nextImport, ...imports].slice(0, 24),
  }
}

function normalizeTextKey(...parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function mergeMonthlySalesImports(
  baseImport: ImportedMonthlySalesData,
  nextImport: ImportedMonthlySalesData
): ImportedMonthlySalesData {
  const topSellingMap = new Map<string, ImportedMonthlySalesItem>()
  for (const item of [...baseImport.topSellingItems, ...nextImport.topSellingItems]) {
    const key = normalizeTextKey(item.itemName, item.category)
    const existing = topSellingMap.get(key)
    if (!existing) {
      topSellingMap.set(key, { ...item })
      continue
    }
    const quantitySold = existing.quantitySold + item.quantitySold
    const grossRevenue = existing.grossRevenue + item.grossRevenue
    topSellingMap.set(key, {
      itemName: existing.itemName || item.itemName,
      category: existing.category || item.category,
      quantitySold,
      grossRevenue,
      unitPrice: quantitySold > 0 ? grossRevenue / quantitySold : 0,
    })
  }

  const dailyMap = new Map<string, ImportedMonthlySalesDay>()
  for (const row of [...baseImport.dailySales, ...nextImport.dailySales]) {
    const existing = dailyMap.get(row.date)
    if (!existing) {
      dailyMap.set(row.date, { ...row })
      continue
    }
    dailyMap.set(row.date, {
      date: row.date,
      day: existing.day || row.day,
      status: existing.status || row.status,
      orders: existing.orders + row.orders,
      grossSales: existing.grossSales + row.grossSales,
      discounts: existing.discounts + row.discounts,
      netSales: existing.netSales + row.netSales,
    })
  }

  const weeklyMap = new Map<string, ImportedMonthlySalesWeek>()
  for (const row of [...baseImport.weeklySales, ...nextImport.weeklySales]) {
    const key = normalizeTextKey(row.weekLabel, row.period)
    const existing = weeklyMap.get(key)
    if (!existing) {
      weeklyMap.set(key, { ...row })
      continue
    }
    weeklyMap.set(key, {
      weekLabel: existing.weekLabel || row.weekLabel,
      period: existing.period || row.period,
      orders: existing.orders + row.orders,
      grossSales: existing.grossSales + row.grossSales,
      discounts: existing.discounts + row.discounts,
      netSales: existing.netSales + row.netSales,
    })
  }
  const expenseLineMap = new Map<string, ImportedMonthlySalesExpenseLine>()
  for (const line of [...(baseImport.expenseLines || []), ...(nextImport.expenseLines || [])]) {
    const key = `${normalizeTextKey(line.category || '', line.description, line.notes || '')}|${line.amount}`
    if (!expenseLineMap.has(key)) {
      expenseLineMap.set(key, { ...line })
      continue
    }
    const existing = expenseLineMap.get(key)!
    existing.amount += line.amount
    expenseLineMap.set(key, existing)
  }

  const totalOrders = baseImport.summary.totalOrders + nextImport.summary.totalOrders
  const totalSales = baseImport.summary.totalSales + nextImport.summary.totalSales
  const totalExpenses = baseImport.summary.totalExpenses + nextImport.summary.totalExpenses
  const netSales = baseImport.summary.netSales + nextImport.summary.netSales

  return {
    ...nextImport,
    restaurantName: nextImport.restaurantName || baseImport.restaurantName,
    branchName: nextImport.branchName || baseImport.branchName,
    reportType: nextImport.reportType || baseImport.reportType,
    summary: {
      currency: nextImport.summary.currency || baseImport.summary.currency,
      totalSales,
      totalExpenses,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
      taxCollected: baseImport.summary.taxCollected + nextImport.summary.taxCollected,
      discounts: baseImport.summary.discounts + nextImport.summary.discounts,
      netSales,
    },
    topSellingItems: Array.from(topSellingMap.values()).sort((a, b) => b.quantitySold - a.quantitySold),
    expenseLines: Array.from(expenseLineMap.values()),
    dailySales: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    weeklySales: Array.from(weeklyMap.values()),
  }
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    restaurantName: { type: ['string', 'null'] },
    branchName: { type: ['string', 'null'] },
    reportType: { type: ['string', 'null'] },
    summary: {
      type: 'object',
      additionalProperties: false,
      properties: {
        currency: { type: 'string' },
        totalSales: { type: 'number' },
        totalExpenses: { type: 'number' },
        totalOrders: { type: 'number' },
        avgOrderValue: { type: 'number' },
        taxCollected: { type: 'number' },
        discounts: { type: 'number' },
        netSales: { type: 'number' },
      },
      required: ['currency', 'totalSales', 'totalExpenses', 'totalOrders', 'avgOrderValue', 'taxCollected', 'discounts', 'netSales'],
    },
    weeklySales: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          weekLabel: { type: 'string' },
          period: { type: ['string', 'null'] },
          orders: { type: 'number' },
          grossSales: { type: 'number' },
          discounts: { type: 'number' },
          netSales: { type: 'number' },
        },
        required: ['weekLabel', 'period', 'orders', 'grossSales', 'discounts', 'netSales'],
      },
    },
    topSellingItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          itemName: { type: 'string' },
          category: { type: ['string', 'null'] },
          quantitySold: { type: 'number' },
          unitPrice: { type: 'number' },
          grossRevenue: { type: 'number' },
        },
        required: ['itemName', 'category', 'quantitySold', 'unitPrice', 'grossRevenue'],
      },
    },
    expenseLines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: ['string', 'null'] },
          description: { type: 'string' },
          amount: { type: 'number' },
          notes: { type: ['string', 'null'] },
        },
        required: ['category', 'description', 'amount', 'notes'],
      },
    },
    dailySales: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string' },
          day: { type: ['string', 'null'] },
          orders: { type: 'number' },
          grossSales: { type: 'number' },
          discounts: { type: 'number' },
          netSales: { type: 'number' },
          status: { type: ['string', 'null'] },
        },
        required: ['date', 'day', 'orders', 'grossSales', 'discounts', 'netSales', 'status'],
      },
    },
  },
  required: ['restaurantName', 'branchName', 'reportType', 'summary', 'weeklySales', 'topSellingItems', 'expenseLines', 'dailySales'],
} as const

const SUMMARY_ONLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    restaurantName: { type: ['string', 'null'] },
    branchName: { type: ['string', 'null'] },
    reportType: { type: ['string', 'null'] },
    summary: EXTRACTION_SCHEMA.properties.summary,
  },
  required: ['restaurantName', 'branchName', 'reportType', 'summary'],
} as const

const ITEMS_ONLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topSellingItems: EXTRACTION_SCHEMA.properties.topSellingItems,
  },
  required: ['topSellingItems'],
} as const

const EXPENSES_ONLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    expenseLines: EXTRACTION_SCHEMA.properties.expenseLines,
  },
  required: ['expenseLines'],
} as const

export async function extractMonthlySalesFromPdf(params: {
  fileName: string
  fileBase64: string
  year: number
  month: number
}) {
  const config = await getPlatformConfig()
  const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  // Keep extraction costs predictable: one request, no automatic retries, strict output schema.
  const model = process.env.MONTHLY_SALES_CLAUDE_MODEL || 'claude-haiku-4-5-20251001'
  const summaryModel = process.env.MONTHLY_SALES_SUMMARY_MODEL || 'claude-sonnet-4-20250514'
  const requestTimeoutMs = Number(process.env.MONTHLY_SALES_CLAUDE_TIMEOUT_MS || 120000)
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(params.year, params.month - 1, 1)
  )

  const basePrompt = [
    `Extract structured restaurant sales data from this monthly sales PDF for ${monthLabel}.`,
    'Return only the values you can actually see in the PDF.',
    'Use numbers only, without currency symbols or commas.',
    'In summary, include totalExpenses whenever it appears in the PDF.',
    'For summary totals, copy the full multi-digit values exactly as printed; do not drop leading digits.',
    'Validate arithmetic: netSales should match totalSales - totalExpenses when those are shown.',
    'Keep item names exactly as shown in the report.',
    'IMPORTANT: Extract ALL visible line-item rows in the report table(s); do not sample, summarize, or stop early.',
    'If rows are numbered (e.g. 1,2,3...), include every visible row number exactly once in topSellingItems.',
    'Do not limit results to only "top" items; topSellingItems must contain the full item table from the PDF.',
    'If a field is missing, use 0 for numeric values and null for nullable strings.',
    'For dailySales, extract every visible daily row from the PDF, not just one example.',
    'Dates must be ISO format YYYY-MM-DD when possible. If the PDF shows "Mar 1, 2026", convert it to "2026-03-01".',
  ].join(' ')

  const callClaudePdfExtraction = async (
    inputPrompt: string,
    maxTokens: number,
    schema: typeof EXTRACTION_SCHEMA | typeof SUMMARY_ONLY_SCHEMA | typeof ITEMS_ONLY_SCHEMA | typeof EXPENSES_ONLY_SCHEMA,
    toolName: string,
    selectedModel = model
  ) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: maxTokens,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: params.fileBase64,
                  },
                },
                {
                  type: 'text',
                  text: inputPrompt,
                },
              ],
            },
          ],
          tools: [
            {
              name: toolName,
              description: 'Extracted monthly restaurant sales report',
              input_schema: schema,
            },
          ],
          tool_choice: {
            type: 'tool',
            name: toolName,
          },
        }),
        signal: controller.signal,
      })

      const data = (await res.json()) as {
        error?: { message?: string }
        content?: Array<{ type: string; input?: Record<string, unknown> }>
      }
      if (!res.ok) {
        throw new Error(data.error?.message || 'Claude PDF extraction failed')
      }

      const toolOutput = data.content?.find((item) => item.type === 'tool_use')
      if (!toolOutput?.input || typeof toolOutput.input !== 'object') {
        throw new Error('Claude returned invalid structured output')
      }

      return normalizeImportedMonthlySalesData(toolOutput.input, params.fileName, params.year, params.month)
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        throw new Error(
          `Claude extraction timed out after ${Math.round(requestTimeoutMs / 1000)}s. Try again or increase MONTHLY_SALES_CLAUDE_TIMEOUT_MS.`
        )
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  const summaryPrompt = [basePrompt, 'Return only restaurantName, branchName, reportType, and summary.'].join(' ')
  const itemsPrompt = [
    basePrompt,
    'Return only topSellingItems.',
    'Each visible table row must produce one item in topSellingItems.',
    'Do not return only a subset.',
  ].join(' ')
  const expensePrompt = [
    basePrompt,
    'Return only expenseLines.',
    'Extract every visible expense row from the EXPENSES table.',
    'Each expenseLines row must include category (nullable), description, amount, and notes (nullable).',
  ].join(' ')

  const summaryOnly = await callClaudePdfExtraction(
    summaryPrompt,
    2_000,
    SUMMARY_ONLY_SCHEMA,
    'monthly_sales_summary',
    summaryModel
  )
  const textSummary = await extractSummaryFromPdfText(params.fileBase64)
  let expenseOnly: ImportedMonthlySalesData | null = null
  try {
    expenseOnly = await callClaudePdfExtraction(expensePrompt, 6_000, EXPENSES_ONLY_SCHEMA, 'monthly_sales_expenses')
  } catch {
    expenseOnly = null
  }
  const summarySeed = {
    ...(summaryOnly.summary || {}),
    ...(textSummary?.summary || {}),
  }
  const expenseSeed = Array.isArray(expenseOnly?.expenseLines) ? expenseOnly!.expenseLines : []
  // Default to detailed extraction so users can review extracted sold items.
  // Set MONTHLY_SALES_EXTRACT_ITEMS=false only if you explicitly want summary-only mode.
  const shouldExtractItems = process.env.MONTHLY_SALES_EXTRACT_ITEMS !== 'false'
  if (!shouldExtractItems) {
    return normalizeImportedMonthlySalesData(
      {
        restaurantName: summaryOnly.restaurantName || null,
        branchName: summaryOnly.branchName || null,
        reportType: summaryOnly.reportType || null,
        summary: summarySeed,
        weeklySales: [],
        dailySales: [],
        topSellingItems: [],
        expenseLines: expenseSeed,
      },
      params.fileName,
      params.year,
      params.month
    )
  }

  let itemsOnly: ImportedMonthlySalesData
  try {
    itemsOnly = await callClaudePdfExtraction(itemsPrompt, 10_000, ITEMS_ONLY_SCHEMA, 'monthly_sales_items')
  } catch {
    // Keep imports usable even if detailed rows fail; summary totals still drive dashboard math.
    return normalizeImportedMonthlySalesData(
      {
        restaurantName: summaryOnly.restaurantName || null,
        branchName: summaryOnly.branchName || null,
        reportType: summaryOnly.reportType || null,
        summary: summarySeed,
        weeklySales: [],
        dailySales: [],
        topSellingItems: [],
        expenseLines: expenseSeed,
      },
      params.fileName,
      params.year,
      params.month
    )
  }
  let normalized = normalizeImportedMonthlySalesData(
    {
      restaurantName: summaryOnly.restaurantName || null,
      branchName: summaryOnly.branchName || null,
      reportType: summaryOnly.reportType || null,
      summary: summarySeed,
      weeklySales: [],
      dailySales: [],
      topSellingItems: Array.isArray(itemsOnly.topSellingItems) ? itemsOnly.topSellingItems : [],
      expenseLines: expenseSeed,
    },
    params.fileName,
    params.year,
    params.month
  )

  // Bounded recovery pass (max one extra call) when table extraction looks truncated.
  if (normalized.topSellingItems.length < 25) {
    const retryPrompt = [
      itemsPrompt,
      'RETRY MODE:',
      'The previous extraction returned too few item rows.',
      'Re-read all pages and return every visible item row from the table in topSellingItems.',
      'Do not omit rows because of repetition; include all visible numbered rows.',
    ].join(' ')
    itemsOnly = await callClaudePdfExtraction(retryPrompt, 10_000, ITEMS_ONLY_SCHEMA, 'monthly_sales_items_retry')
    const retryNormalizedItems = normalizeImportedMonthlySalesData(
      {
        restaurantName: summaryOnly.restaurantName || null,
        branchName: summaryOnly.branchName || null,
        reportType: summaryOnly.reportType || null,
        summary: summarySeed,
        weeklySales: [],
        dailySales: [],
        topSellingItems: Array.isArray(itemsOnly.topSellingItems) ? itemsOnly.topSellingItems : [],
        expenseLines: expenseSeed,
      },
      params.fileName,
      params.year,
      params.month
    ).topSellingItems
    if (retryNormalizedItems.length > normalized.topSellingItems.length) {
      normalized = { ...normalized, topSellingItems: retryNormalizedItems }
    }
  }

  if (normalized.topSellingItems.length < 10 && normalized.summary.totalSales <= 0) {
    throw new Error('Could not extract enough financial data from this PDF. Please upload a clearer POS export PDF.')
  }

  return normalized
}
