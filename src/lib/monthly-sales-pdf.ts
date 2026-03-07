export interface MonthlySalesPdfRecord {
  year: number
  month: number
  fileName: string
  storageKey: string
  uploadedAt: string
}

export function getCurrentSalesPdfPeriod(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  }
}

export function formatSalesPdfPeriod(year: number, month: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))
}

export function getMonthlySalesPdfRecords(settings: Record<string, unknown> | null | undefined) {
  const raw = settings?.monthlySalesPdfUploads
  if (!Array.isArray(raw)) return [] as MonthlySalesPdfRecord[]

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const year = Number(record.year)
      const month = Number(record.month)
      const fileName = typeof record.fileName === 'string' ? record.fileName : ''
      const storageKey = typeof record.storageKey === 'string' ? record.storageKey : ''
      const uploadedAt = typeof record.uploadedAt === 'string' ? record.uploadedAt : ''
      if (!Number.isInteger(year) || !Number.isInteger(month) || !fileName || !storageKey || !uploadedAt) {
        return null
      }
      return { year, month, fileName, storageKey, uploadedAt }
    })
    .filter((item): item is MonthlySalesPdfRecord => Boolean(item))
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      if (a.month !== b.month) return b.month - a.month
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    })
}

export function hasCurrentMonthlySalesPdf(settings: Record<string, unknown> | null | undefined, date = new Date()) {
  const { year, month } = getCurrentSalesPdfPeriod(date)
  return getMonthlySalesPdfRecords(settings).some((item) => item.year === year && item.month === month)
}

export function upsertMonthlySalesPdfRecord(
  settings: Record<string, unknown> | null | undefined,
  nextRecord: MonthlySalesPdfRecord
) {
  const currentSettings = settings || {}
  const records = getMonthlySalesPdfRecords(currentSettings).filter(
    (item) => !(item.year === nextRecord.year && item.month === nextRecord.month)
  )

  return {
    ...currentSettings,
    monthlySalesPdfUploads: [nextRecord, ...records].slice(0, 24),
  }
}
