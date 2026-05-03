
export interface ImportedMonthlySalesSummary {
  currency: string
  totalSales: number
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
  dailySales: ImportedMonthlySalesDay[]
}

function toFiniteNumber(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
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
  const dailyRaw = Array.isArray(payload.dailySales) ? payload.dailySales : []

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
      totalSales: toFiniteNumber(summaryRaw.totalSales),
      totalOrders: Math.round(toFiniteNumber(summaryRaw.totalOrders)),
      avgOrderValue: toFiniteNumber(summaryRaw.avgOrderValue),
      taxCollected: toFiniteNumber(summaryRaw.taxCollected),
      discounts: toFiniteNumber(summaryRaw.discounts),
      netSales: toFiniteNumber(summaryRaw.netSales),
    },
    weeklySales: weeklyRaw.map((item) => {
      const row = (item as Record<string, unknown>) || {}
      return {
        weekLabel: typeof row.weekLabel === 'string' ? row.weekLabel : 'Week',
        period: typeof row.period === 'string' ? row.period : null,
        orders: Math.round(toFiniteNumber(row.orders)),
        grossSales: toFiniteNumber(row.grossSales),
        discounts: toFiniteNumber(row.discounts),
        netSales: toFiniteNumber(row.netSales),
      }
    }),
    topSellingItems: topItemsRaw.map((item) => {
      const row = (item as Record<string, unknown>) || {}
      return {
        itemName: typeof row.itemName === 'string' ? row.itemName : 'Unknown Item',
        category: typeof row.category === 'string' ? row.category : null,
        quantitySold: Math.round(toFiniteNumber(row.quantitySold)),
        unitPrice: toFiniteNumber(row.unitPrice),
        grossRevenue: toFiniteNumber(row.grossRevenue),
      }
    }),
    dailySales: dailyRaw.map((item) => {
      const row = (item as Record<string, unknown>) || {}
      return {
        date: typeof row.date === 'string' ? row.date : '',
        day: typeof row.day === 'string' ? row.day : null,
        orders: Math.round(toFiniteNumber(row.orders)),
        grossSales: toFiniteNumber(row.grossSales),
        discounts: toFiniteNumber(row.discounts),
        netSales: toFiniteNumber(row.netSales),
        status: typeof row.status === 'string' ? row.status : null,
      }
    }).filter((item) => item.date),
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

  const totalOrders = baseImport.summary.totalOrders + nextImport.summary.totalOrders
  const totalSales = baseImport.summary.totalSales + nextImport.summary.totalSales
  const netSales = baseImport.summary.netSales + nextImport.summary.netSales

  return {
    ...nextImport,
    restaurantName: nextImport.restaurantName || baseImport.restaurantName,
    branchName: nextImport.branchName || baseImport.branchName,
    reportType: nextImport.reportType || baseImport.reportType,
    summary: {
      currency: nextImport.summary.currency || baseImport.summary.currency,
      totalSales,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? netSales / totalOrders : 0,
      taxCollected: baseImport.summary.taxCollected + nextImport.summary.taxCollected,
      discounts: baseImport.summary.discounts + nextImport.summary.discounts,
      netSales,
    },
    topSellingItems: Array.from(topSellingMap.values()).sort((a, b) => b.quantitySold - a.quantitySold),
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
        totalOrders: { type: 'number' },
        avgOrderValue: { type: 'number' },
        taxCollected: { type: 'number' },
        discounts: { type: 'number' },
        netSales: { type: 'number' },
      },
      required: ['currency', 'totalSales', 'totalOrders', 'avgOrderValue', 'taxCollected', 'discounts', 'netSales'],
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
  required: ['restaurantName', 'branchName', 'reportType', 'summary', 'weeklySales', 'topSellingItems', 'dailySales'],
} as const

export async function extractMonthlySalesFromPdf(params: {
  fileName: string
  fileBase64: string
  year: number
  month: number
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  // Keep extraction costs predictable: one request, no automatic retries, strict output schema.
  const model = process.env.MONTHLY_SALES_CLAUDE_MODEL || 'claude-haiku-4-5-20251001'
  const requestTimeoutMs = Number(process.env.MONTHLY_SALES_CLAUDE_TIMEOUT_MS || 120000)
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(params.year, params.month - 1, 1)
  )

  const prompt = [
    `Extract structured restaurant sales data from this monthly sales PDF for ${monthLabel}.`,
    'Return only the values you can actually see in the PDF.',
    'Use numbers only, without currency symbols or commas.',
    'Keep item names exactly as shown in the report.',
    'IMPORTANT: Extract ALL visible line-item rows in the report table(s); do not sample, summarize, or stop early.',
    'If rows are numbered (e.g. 1,2,3...), include every visible row number exactly once in topSellingItems.',
    'Do not limit results to only "top" items; topSellingItems must contain the full item table from the PDF.',
    'If a field is missing, use 0 for numeric values and null for nullable strings.',
    'For dailySales, extract every visible daily row from the PDF, not just one example.',
    'Dates must be ISO format YYYY-MM-DD when possible. If the PDF shows "Mar 1, 2026", convert it to "2026-03-01".',
  ].join(' ')

  const callClaudePdfExtraction = async (inputPrompt: string, maxTokens: number) => {
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
          model,
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
              name: 'monthly_sales_report',
              description: 'Extracted monthly restaurant sales report',
              input_schema: EXTRACTION_SCHEMA,
            },
          ],
          tool_choice: {
            type: 'tool',
            name: 'monthly_sales_report',
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

  // First pass: full extraction with higher output budget for long item tables.
  const firstPass = await callClaudePdfExtraction(prompt, 8_000)

  // Bounded recovery pass (max one extra call) when table extraction looks truncated.
  // This prevents loops and keeps token spend capped while improving reliability.
  if (firstPass.topSellingItems.length < 25) {
    const retryPrompt = [
      prompt,
      'RETRY MODE:',
      'The previous extraction returned too few item rows.',
      'Re-read all pages and return every visible item row from the table in topSellingItems.',
      'Do not omit rows because of repetition; include all visible numbered rows.',
    ].join(' ')
    const secondPass = await callClaudePdfExtraction(retryPrompt, 8_000)
    if (secondPass.topSellingItems.length > firstPass.topSellingItems.length) {
      return secondPass
    }
  }

  return firstPass
}
