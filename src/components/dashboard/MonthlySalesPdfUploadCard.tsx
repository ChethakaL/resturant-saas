'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { FileText, Loader2, Lock, Plus, Trash2, Upload } from 'lucide-react'
import type { ImportedMonthlySalesData } from '@/lib/monthly-sales-import'
import { useDynamicTranslate, useI18n } from '@/lib/i18n'
import { getMonthlySalesPdfLocale } from '@/lib/monthly-sales-pdf'

interface UploadRecord {
  year: number
  month: number
  fileName: string
  uploadedAt: string
  periodLabel: string
}

interface ImportRecord {
  year: number
  month: number
  sourceFileName: string
  importedAt: string
  periodLabel: string
  summary: ImportSummaryPreview
  data: ImportedMonthlySalesData
}

interface ImportSummaryPreview {
  currency: string
  totalSales: number
  totalExpenses?: number
  totalOrders: number
  netSales: number
}

interface MonthlySalesPdfUploadCardProps {
  title?: string
  description?: string
  compact?: boolean
  onImportComplete?: () => void
}

const REQUIREMENTS = [
  'Upload one PDF per month.',
  'The PDF should clearly show the restaurant name, month, and year.',
  'Use exported POS or accounting reports when possible.',
  'Text-based PDFs work best. Blurry scans or screenshots may be rejected later.',
  'Include totals in the restaurant operating currency.',
]

function toInputNumber(value: number) {
  return Number.isFinite(value) ? String(value) : '0'
}

function hasDetailedRows(data: ImportedMonthlySalesData | null) {
  if (!data) return false
  return data.topSellingItems.length > 0 || (data.expenseLines || []).length > 0 || data.dailySales.length > 0
}

export default function MonthlySalesPdfUploadCard({
  title = 'Monthly sales PDF upload',
  description = 'Upload this month’s sales PDF to unlock the dashboard and Smart Profit mode.',
  compact = false,
  onImportComplete,
}: MonthlySalesPdfUploadCardProps) {
  const { toast } = useToast()
  const router = useRouter()
  const { t: td, fetchTranslation } = useDynamicTranslate()
  const { locale } = useI18n()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const now = useMemo(() => new Date(), [])
  const localeForDates = useMemo(() => getMonthlySalesPdfLocale(locale), [locale])
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [file, setFile] = useState<File | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showRevenueRows, setShowRevenueRows] = useState(true)
  const [showExpenseRows, setShowExpenseRows] = useState(true)
  const [showDailyRows, setShowDailyRows] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<ImportedMonthlySalesData | null>(null)
  const [extractedSnapshot, setExtractedSnapshot] = useState<ImportedMonthlySalesData | null>(null)
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace')
  const [translationsReady, setTranslationsReady] = useState(locale === 'en')
  const [status, setStatus] = useState<{
    loading: boolean
    active: boolean
    currentPeriodLabel: string
    uploads: UploadRecord[]
    imports: ImportRecord[]
    currentImportSummary: ImportSummaryPreview | null
  }>({
    loading: true,
    active: false,
    currentPeriodLabel: '',
    uploads: [],
    imports: [],
    currentImportSummary: null,
  })
  const summaryOnlyMode = previewData ? !hasDetailedRows(previewData) : false

  useEffect(() => {
    let cancelled = false
    if (locale === 'en') {
      setTranslationsReady(true)
      return
    }

    const warmTranslations = async () => {
      setTranslationsReady(false)
      await Promise.all([
        title,
        description,
        ...REQUIREMENTS,
        'Checking monthly import status...',
        'is unlocked.',
        'This month',
        'is locked until sales data is imported.',
        'Imported:',
        'net sales,',
        'orders.',
        'Sales report PDF',
        'Month',
        'Year',
        'Extracting...',
        'Extract Data',
        'Current imported month data',
        'Reopen and edit imported rows without uploading another PDF.',
        'Review imported data',
        'Reading the PDF and extracting sales data. This can take a few seconds.',
        'Saving the reviewed sales import and refreshing the dashboard.',
        'Recommended PDF format',
        'Recent uploads',
        'Imported months',
        'Choose a file',
        'No file selected',
        'Choose a PDF first.',
        'Extraction failed',
        'Monthly sales imported',
        'Dashboard and Smart Profit mode are now using the imported sales data.',
        'Saved for',
        'that month.',
        'Import failed',
      ].map((text) => fetchTranslation(text)))

      if (!cancelled) {
        setTranslationsReady(true)
      }
    }

    void warmTranslations()

    return () => {
      cancelled = true
    }
  }, [description, fetchTranslation, locale, title])

  useEffect(() => {
    let cancelled = false
    setStatus((prev) => ({ ...prev, loading: true }))
    fetch('/api/sales-reports/monthly?includeDetails=true')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch upload status')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setStatus({
          loading: false,
          active: Boolean(data.active),
          currentPeriodLabel: data.currentPeriod?.label || '',
          uploads: Array.isArray(data.uploads) ? data.uploads : [],
          imports: Array.isArray(data.imports) ? data.imports : [],
          currentImportSummary: data.currentImportSummary || null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setStatus((prev) => ({ ...prev, loading: false }))
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const updateSummaryField = (field: keyof ImportedMonthlySalesData['summary'], value: string) => {
    setPreviewData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        summary: {
          ...prev.summary,
          [field]: field === 'currency' ? value : Number(value || 0),
        },
      }
    })
  }

  const updateRevenueRow = (index: number, field: keyof ImportedMonthlySalesData['topSellingItems'][number], value: string) => {
    setPreviewData((prev) => {
      if (!prev) return prev
      const next = [...prev.topSellingItems]
      next[index] = {
        ...next[index],
        [field]:
          field === 'itemName' || field === 'category'
            ? value
            : Number(value || 0),
      }
      return { ...prev, topSellingItems: next }
    })
  }

  const addRevenueRow = () => {
    setPreviewData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        topSellingItems: [
          ...prev.topSellingItems,
          { itemName: '', category: '', quantitySold: 0, unitPrice: 0, grossRevenue: 0 },
        ],
      }
    })
  }

  const removeRevenueRow = (index: number) => {
    setPreviewData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        topSellingItems: prev.topSellingItems.filter((_, itemIndex) => itemIndex !== index),
      }
    })
  }

  const updateExpenseRow = (
    index: number,
    field: 'category' | 'description' | 'amount' | 'notes',
    value: string
  ) => {
    setPreviewData((prev) => {
      if (!prev) return prev
      const lines = [...(prev.expenseLines || [])]
      const current = lines[index] || { category: null, description: '', amount: 0, notes: null }
      lines[index] = {
        ...current,
        [field]:
          field === 'amount'
            ? Number(value || 0)
            : (value || null),
      }
      return { ...prev, expenseLines: lines }
    })
  }

  const addExpenseRow = () => {
    setPreviewData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        expenseLines: [
          ...(prev.expenseLines || []),
          { category: null, description: '', amount: 0, notes: null },
        ],
      }
    })
  }

  const removeExpenseRow = (index: number) => {
    setPreviewData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        expenseLines: (prev.expenseLines || []).filter((_, rowIndex) => rowIndex !== index),
      }
    })
  }

  const updateDailyRow = (index: number, field: keyof ImportedMonthlySalesData['dailySales'][number], value: string) => {
    setPreviewData((prev) => {
      if (!prev) return prev
      const next = [...prev.dailySales]
      next[index] = {
        ...next[index],
        [field]:
          field === 'date' || field === 'day' || field === 'status'
            ? value
            : Number(value || 0),
      }
      return { ...prev, dailySales: next }
    })
  }

  const addDailyRow = () => {
    setPreviewData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        dailySales: [
          ...prev.dailySales,
          { date: '', day: '', orders: 0, grossSales: 0, discounts: 0, netSales: 0, status: '' },
        ],
      }
    })
  }

  const removeDailyRow = (index: number) => {
    setPreviewData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        dailySales: prev.dailySales.filter((_, itemIndex) => itemIndex !== index),
      }
    })
  }

  const handleExtract = async () => {
    if (!file) {
      toast({ title: 'Choose a PDF first.', variant: 'destructive' })
      return
    }

    setIsExtracting(true)
    try {
      const formData = new FormData()
      formData.append('report', file)
      formData.append('year', year)
      formData.append('month', month)
      formData.append('previewOnly', 'true')

      const res = await fetch('/api/sales-reports/monthly', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Extraction failed')
      setImportMode('replace')
      setPreviewData(data.preview)
      setExtractedSnapshot(data.preview)
      setShowRevenueRows(true)
      setShowExpenseRows(true)
      setShowDailyRows(false)
      setReviewOpen(true)
    } catch (error) {
      toast({
        title: 'Extraction failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsExtracting(false)
    }
  }

  if (!translationsReady) {
    return (
      <Card className={compact ? 'border-amber-200 bg-amber-50' : ''}>
        <CardContent className="space-y-4 p-6">
          <div className="h-6 w-56 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-80 animate-pulse rounded bg-slate-200" />
          <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
        </CardContent>
      </Card>
    )
  }

  const handleConfirmImport = async () => {
    if (!file || !previewData) return

    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append('report', file)
      formData.append('year', year)
      formData.append('month', month)
      formData.append('editedData', JSON.stringify(previewData))
      formData.append('importMode', importMode)

      const res = await fetch('/api/sales-reports/monthly', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')

      toast({
        title: 'Monthly sales imported',
        description: data.activeForCurrentMonth
          ? 'Dashboard and Smart Profit mode are now using the imported sales data.'
          : `Saved for ${data.upload?.periodLabel || 'that month'}.`,
      })

      setReviewOpen(false)
      setPreviewData(null)
      setExtractedSnapshot(null)
      setImportMode('replace')
      setShowRevenueRows(true)
      setShowExpenseRows(true)
      setShowDailyRows(false)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setRefreshKey((value) => value + 1)
      router.refresh()
      onImportComplete?.()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('monthly-sales-import-saved'))
      }
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Card className={compact ? 'border-amber-200 bg-amber-50' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            {status.active ? <FileText className="h-5 w-5 text-emerald-600" /> : <Lock className="h-5 w-5 text-amber-600" />}
            {td(title)}
          </CardTitle>
          <p className="text-sm text-slate-600">{td(description)}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`rounded-lg border p-3 ${status.active ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-white'}`}>
            <p className="text-sm font-medium text-slate-900">
              {status.loading
                ? td('Checking monthly import status...')
                : status.active
                  ? `${status.currentPeriodLabel} ${td('is unlocked.')}`
                  : `${status.currentPeriodLabel || td('This month')} ${td('is locked until sales data is imported.')}`}
            </p>
            {status.currentImportSummary ? (
              <p className="mt-1 text-xs text-slate-600">
                {td('Imported:')} {status.currentImportSummary.currency} {status.currentImportSummary.netSales.toLocaleString('en-US')} {td('net sales,')} {status.currentImportSummary.totalOrders.toLocaleString('en-US')} {td('orders.')}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_140px_120px_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="monthly-sales-pdf">{td('Sales report PDF')}</Label>
              <input
                id="monthly-sales-pdf"
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <FileText className="mr-2 h-4 w-4" />
                  {td('Choose a file')}
                </Button>
                <div className="min-h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                  {file?.name || td('No file selected')}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly-sales-month">{td('Month')}</Label>
              <select
                id="monthly-sales-month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {new Intl.DateTimeFormat(localeForDates, { month: 'long' }).format(new Date(2026, index, 1))}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly-sales-year">{td('Year')}</Label>
              <Input
                id="monthly-sales-year"
                inputMode="numeric"
                value={year}
                onChange={(event) => setYear(event.target.value.replace(/[^\d]/g, '').slice(0, 4))}
              />
            </div>
            <Button onClick={handleExtract} disabled={isExtracting || isSaving || !file} className="gap-2">
              {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isExtracting ? td('Extracting...') : td('Extract Data')}
            </Button>
          </div>

          {status.imports.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{td('Current imported month data')}</p>
                  <p className="text-xs text-slate-500">{td('Reopen and edit imported rows without uploading another PDF.')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const target = status.imports.find((item) => item.year === Number(year) && item.month === Number(month)) || status.imports[0]
                    if (!target) return
                    setYear(String(target.year))
                    setMonth(String(target.month))
                    setPreviewData(target.data)
                    setExtractedSnapshot(target.data)
                    setImportMode('replace')
                    setShowRevenueRows(true)
                    setShowExpenseRows(true)
                    setShowDailyRows(false)
                    setReviewOpen(true)
                  }}
                >
                  {td('Review imported data')}
                </Button>
              </div>
            </div>
          ) : null}

          {(isExtracting || isSaving) && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {isExtracting
                    ? td('Reading the PDF and extracting sales data. This can take a few seconds.')
                    : td('Saving the reviewed sales import and refreshing the dashboard.')}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-900">{td('Recommended PDF format')}</p>
            <ul className="space-y-1 text-sm text-slate-600">
              {REQUIREMENTS.map((item) => (
                <li key={item}>{td(item)}</li>
              ))}
            </ul>
          </div>

          {!compact && status.uploads.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">{td('Recent uploads')}</p>
              <div className="space-y-2">
              {status.uploads.slice(0, 6).map((upload) => (
                  <div key={`${upload.year}-${upload.month}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{upload.periodLabel}</p>
                      <p className="text-slate-500">{upload.fileName}</p>
                    </div>
                    <span className="text-slate-500">
                      {new Date(upload.uploadedAt).toLocaleDateString(localeForDates)}
                    </span>
                  </div>
              ))}
            </div>
          </div>
        ) : null}

        {!compact && status.imports.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-900">{td('Imported months')}</p>
            <div className="space-y-2">
              {status.imports.slice(0, 6).map((item) => (
                  <div
                    key={`${item.year}-${item.month}-${item.importedAt}`}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{item.periodLabel}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{item.sourceFileName}</p>
                    </div>
                    <div className="text-right text-slate-500 mr-4">
                      <p className="text-xs font-medium">{item.summary.currency} {item.summary.netSales.toLocaleString('en-US')}</p>
                      <p className="text-[10px]">{new Date(item.importedAt).toLocaleDateString(localeForDates)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          router.push(`/dashboard?month=${item.month}&year=${item.year}`)
                          // If this card is inside a dialog, it might be nice to close it, 
                          // but the dialog is managed by the parent DashboardSalesDataManager.
                        }}
                      >
                        {td('View')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          setYear(String(item.year))
                          setMonth(String(item.month))
                          setPreviewData(item.data)
                          setExtractedSnapshot(item.data)
                          setImportMode('replace')
                          setShowRevenueRows(true)
                          setShowExpenseRows(true)
                          setShowDailyRows(false)
                          setReviewOpen(true)
                        }}
                      >
                        {td('Edit')}
                      </Button>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
      </Card>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{td('Review extracted sales data')}</DialogTitle>
            <DialogDescription>
              {td('Confirm and edit the extracted values before they update the dashboard and Smart Profit mode.')}
            </DialogDescription>
          </DialogHeader>

          {previewData ? (
            <div className="space-y-6">
              {extractedSnapshot ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-sm font-medium text-slate-900">{td('Extracted from PDF')}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {td('These are the raw values extracted from the uploaded PDF. Edit any value below if needed before saving.')}
                  </p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-700 md:grid-cols-4">
                    <div>{td('Revenue')}: <span className="font-semibold">{toInputNumber(extractedSnapshot.summary.totalSales)}</span></div>
                    <div>{td('Expenses')}: <span className="font-semibold">{toInputNumber(extractedSnapshot.summary.totalExpenses)}</span></div>
                    <div>{td('Net Profit')}: <span className="font-semibold">{toInputNumber(extractedSnapshot.summary.netSales)}</span></div>
                    <div>{td('Orders')}: <span className="font-semibold">{toInputNumber(extractedSnapshot.summary.totalOrders)}</span></div>
                    <div>{td('Tax')}: <span className="font-semibold">{toInputNumber(extractedSnapshot.summary.taxCollected)}</span></div>
                    <div>{td('Discounts')}: <span className="font-semibold">{toInputNumber(extractedSnapshot.summary.discounts)}</span></div>
                    <div>{td('Revenue rows extracted')}: <span className="font-semibold">{extractedSnapshot.topSellingItems.length}</span></div>
                    <div>{td('Expense rows extracted')}: <span className="font-semibold">{(extractedSnapshot.expenseLines || []).length}</span></div>
                    <div>{td('Daily rows extracted')}: <span className="font-semibold">{extractedSnapshot.dailySales.length}</span></div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>{td('Save for month')}</Label>
                  <select
                    value={month}
                    onChange={(e) => {
                      setMonth(e.target.value)
                      setPreviewData((prev) => prev ? { ...prev, month: Number(e.target.value) } : prev)
                    }}
                    className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 12 }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {new Intl.DateTimeFormat(localeForDates, { month: 'long' }).format(new Date(2026, index, 1))}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{td('Save for year')}</Label>
                  <Input
                    value={year}
                    onChange={(e) => {
                      const next = e.target.value.replace(/[^\d]/g, '').slice(0, 4)
                      setYear(next)
                      setPreviewData((prev) => prev ? { ...prev, year: Number(next || 0) } : prev)
                    }}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{td('Import action')}</Label>
                  <select
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value === 'append' ? 'append' : 'replace')}
                    className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="replace">{td('Replace existing data for this month')}</option>
                    <option value="append">{td('Append to existing data for this month')}</option>
                  </select>
                  <p className="text-xs text-slate-500">
                    {importMode === 'append'
                      ? td('Append will merge this import into any existing data for the selected month.')
                      : td('Replace will overwrite any existing data for the selected month.')}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>{td('Currency')}</Label>
                  <Input value={previewData.summary.currency} onChange={(e) => updateSummaryField('currency', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{td('Total Sales')}</Label>
                  <Input value={toInputNumber(previewData.summary.totalSales)} onChange={(e) => updateSummaryField('totalSales', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{td('Total Orders')}</Label>
                  <Input value={toInputNumber(previewData.summary.totalOrders)} onChange={(e) => updateSummaryField('totalOrders', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{td('Net Profit')}</Label>
                  <Input value={toInputNumber(previewData.summary.netSales)} onChange={(e) => updateSummaryField('netSales', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{td('Total Expenses')}</Label>
                  <Input value={toInputNumber(previewData.summary.totalExpenses)} onChange={(e) => updateSummaryField('totalExpenses', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{td('Average Order Value')}</Label>
                  <Input value={toInputNumber(previewData.summary.avgOrderValue)} onChange={(e) => updateSummaryField('avgOrderValue', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{td('Tax Collected')}</Label>
                  <Input value={toInputNumber(previewData.summary.taxCollected)} onChange={(e) => updateSummaryField('taxCollected', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{td('Discounts')}</Label>
                  <Input value={toInputNumber(previewData.summary.discounts)} onChange={(e) => updateSummaryField('discounts', e.target.value)} />
                </div>
              </div>

              {summaryOnlyMode ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {td('Summary-only extraction mode: this PDF provided financial totals, but no reliable detailed item/day rows. Dashboard totals and profit calculations will still work correctly.')}
                </div>
              ) : null}

              {!summaryOnlyMode ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-600">
                    {td('Financial totals above are the main extracted values. Revenue, expense, and daily rows are extracted when present and can be edited below.')}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowRevenueRows((prev) => !prev)}>
                      {showRevenueRows ? td('Hide revenue rows') : td('Show revenue rows')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowExpenseRows((prev) => !prev)}>
                      {showExpenseRows ? td('Hide expense rows') : td('Show expense rows')}
                    </Button>
                    {previewData.dailySales.length > 0 ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowDailyRows((prev) => !prev)}>
                        {showDailyRows ? td('Hide daily rows') : td('Show daily rows')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!summaryOnlyMode && showRevenueRows ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{td('Revenue rows')}</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addRevenueRow} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {td('Add revenue row')}
                  </Button>
                </div>
                <div className="space-y-3">
                  {previewData.topSellingItems.map((item, index) => (
                    <div key={`revenue-row-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[2fr_1.2fr_1fr_1fr_1fr_auto]">
                      <Input placeholder={td('Item name')} value={item.itemName} onChange={(e) => updateRevenueRow(index, 'itemName', e.target.value)} />
                      <Input placeholder={td('Category')} value={item.category || ''} onChange={(e) => updateRevenueRow(index, 'category', e.target.value)} />
                      <Input placeholder={td('Qty sold')} value={toInputNumber(item.quantitySold)} onChange={(e) => updateRevenueRow(index, 'quantitySold', e.target.value)} />
                      <Input placeholder={td('Unit price')} value={toInputNumber(item.unitPrice)} onChange={(e) => updateRevenueRow(index, 'unitPrice', e.target.value)} />
                      <Input placeholder={td('Gross revenue')} value={toInputNumber(item.grossRevenue)} onChange={(e) => updateRevenueRow(index, 'grossRevenue', e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeRevenueRow(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              ) : null}

              {!summaryOnlyMode && showExpenseRows ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{td('Expense rows')}</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addExpenseRow} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {td('Add expense row')}
                  </Button>
                </div>
                <div className="space-y-3">
                  {(previewData.expenseLines || []).map((row, index) => (
                    <div key={`expense-row-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1.2fr_2fr_1fr_1.4fr_auto]">
                      <Input placeholder={td('Category')} value={row.category || ''} onChange={(e) => updateExpenseRow(index, 'category', e.target.value)} />
                      <Input placeholder={td('Description')} value={row.description} onChange={(e) => updateExpenseRow(index, 'description', e.target.value)} />
                      <Input placeholder={td('Amount')} value={toInputNumber(row.amount)} onChange={(e) => updateExpenseRow(index, 'amount', e.target.value)} />
                      <Input placeholder={td('Notes')} value={row.notes || ''} onChange={(e) => updateExpenseRow(index, 'notes', e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeExpenseRow(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              ) : null}

              {!summaryOnlyMode && showDailyRows ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{td('Daily sales rows')}</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addDailyRow} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {td('Add day')}
                  </Button>
                </div>
                <div className="space-y-3">
                  {previewData.dailySales.map((row, index) => (
                    <div key={`daily-row-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]">
                      <Input placeholder="2026-03-01" value={row.date} onChange={(e) => updateDailyRow(index, 'date', e.target.value)} />
                      <Input placeholder={td('Day')} value={row.day || ''} onChange={(e) => updateDailyRow(index, 'day', e.target.value)} />
                      <Input placeholder={td('Orders')} value={toInputNumber(row.orders)} onChange={(e) => updateDailyRow(index, 'orders', e.target.value)} />
                      <Input placeholder={td('Gross')} value={toInputNumber(row.grossSales)} onChange={(e) => updateDailyRow(index, 'grossSales', e.target.value)} />
                      <Input placeholder={td('Discounts')} value={toInputNumber(row.discounts)} onChange={(e) => updateDailyRow(index, 'discounts', e.target.value)} />
                      <Input placeholder={td('Net')} value={toInputNumber(row.netSales)} onChange={(e) => updateDailyRow(index, 'netSales', e.target.value)} />
                      <Input placeholder={td('Status')} value={row.status || ''} onChange={(e) => updateDailyRow(index, 'status', e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDailyRow(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewOpen(false)} disabled={isSaving}>
              {td('Cancel')}
            </Button>
            <Button type="button" onClick={handleConfirmImport} disabled={isSaving || !previewData} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {td('Save imported data')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
