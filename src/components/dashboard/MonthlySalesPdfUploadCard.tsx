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
import { useDynamicTranslate } from '@/lib/i18n'

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
  totalOrders: number
  netSales: number
}

interface MonthlySalesPdfUploadCardProps {
  title?: string
  description?: string
  compact?: boolean
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

export default function MonthlySalesPdfUploadCard({
  title = 'Monthly sales PDF upload',
  description = 'Upload this month’s sales PDF to unlock the dashboard and Smart Profit mode.',
  compact = false,
}: MonthlySalesPdfUploadCardProps) {
  const { toast } = useToast()
  const router = useRouter()
  const { t: td } = useDynamicTranslate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [file, setFile] = useState<File | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<ImportedMonthlySalesData | null>(null)
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace')
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

  useEffect(() => {
    let cancelled = false
    setStatus((prev) => ({ ...prev, loading: true }))
    fetch('/api/sales-reports/monthly')
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

  const updateTopItem = (index: number, field: keyof ImportedMonthlySalesData['topSellingItems'][number], value: string) => {
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

  const addTopItem = () => {
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

  const removeTopItem = (index: number) => {
    setPreviewData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        topSellingItems: prev.topSellingItems.filter((_, itemIndex) => itemIndex !== index),
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
      setImportMode('replace')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setRefreshKey((value) => value + 1)
      router.refresh()
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
              <Input
                id="monthly-sales-pdf"
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
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
                    {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(2026, index, 1))}
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
                    setImportMode('replace')
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
                      {new Date(upload.uploadedAt).toLocaleDateString()}
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
                <button
                  key={`${item.year}-${item.month}-${item.importedAt}`}
                  type="button"
                  onClick={() => {
                    setYear(String(item.year))
                    setMonth(String(item.month))
                    setPreviewData(item.data)
                    setImportMode('replace')
                    setReviewOpen(true)
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">{item.periodLabel}</p>
                    <p className="text-slate-500">{item.sourceFileName}</p>
                  </div>
                  <div className="text-right text-slate-500">
                    <p>{item.summary.currency} {item.summary.netSales.toLocaleString('en-US')}</p>
                    <p>{new Date(item.importedAt).toLocaleDateString()}</p>
                  </div>
                </button>
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
                        {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(2026, index, 1))}
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
                  <Label>{td('Net Sales')}</Label>
                  <Input value={toInputNumber(previewData.summary.netSales)} onChange={(e) => updateSummaryField('netSales', e.target.value)} />
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{td('Top-selling items')}</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addTopItem} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {td('Add item')}
                  </Button>
                </div>
                <div className="space-y-3">
                  {previewData.topSellingItems.map((item, index) => (
                    <div key={`top-item-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[2fr_1.2fr_1fr_1fr_1fr_auto]">
                      <Input placeholder={td('Item name')} value={item.itemName} onChange={(e) => updateTopItem(index, 'itemName', e.target.value)} />
                      <Input placeholder={td('Category')} value={item.category || ''} onChange={(e) => updateTopItem(index, 'category', e.target.value)} />
                      <Input placeholder={td('Qty sold')} value={toInputNumber(item.quantitySold)} onChange={(e) => updateTopItem(index, 'quantitySold', e.target.value)} />
                      <Input placeholder={td('Unit price')} value={toInputNumber(item.unitPrice)} onChange={(e) => updateTopItem(index, 'unitPrice', e.target.value)} />
                      <Input placeholder={td('Gross revenue')} value={toInputNumber(item.grossRevenue)} onChange={(e) => updateTopItem(index, 'grossRevenue', e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeTopItem(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

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
