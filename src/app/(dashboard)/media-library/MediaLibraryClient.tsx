'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { ChevronDown, Loader2, Trash2, Upload } from 'lucide-react'
import { useI18n, getStaticTranslationForSourceText, useDynamicTranslate } from '@/lib/i18n'

type MediaAsset = {
  id: string
  url: string
  previewUrl?: string
  type: string
  itemNameTag: string | null
  categoryTag: string | null
  menuItems: { id: string; name: string }[]
}

type MediaAssetFieldDraft = {
  itemNameTag?: string
  categoryTag?: string
}

type MediaAssetFieldTranslation = {
  itemNameTag?: string
  categoryTag?: string
}

const TYPE_OPTIONS = ['FOOD', 'DRINK', 'AMBIANCE', 'OTHER']

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function MediaLibraryClient() {
  const { toast } = useToast()
  const { locale, t } = useI18n()
  const { t: td, fetchTranslation } = useDynamicTranslate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, MediaAssetFieldDraft>>({})
  const [translatedFields, setTranslatedFields] = useState<Record<string, MediaAssetFieldTranslation>>({})

  const loadAssets = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (typeFilter) params.set('type', typeFilter)
      const res = await fetch(`/api/media-assets?${params.toString()}`)
      const data = await res.json()
      setAssets(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAssets()
  }, [query, typeFilter])

  useEffect(() => {
    let cancelled = false

    if (locale === 'en') {
      setTranslatedFields({})
      return
    }

    const translateFields = async () => {
      const entries = await Promise.all(
        assets.map(async (asset) => {
          const [itemNameTag, categoryTag] = await Promise.all([
            asset.itemNameTag ? fetchTranslation(asset.itemNameTag) : '',
            asset.categoryTag ? fetchTranslation(asset.categoryTag) : '',
          ])

          return [
            asset.id,
            {
              itemNameTag: itemNameTag || asset.itemNameTag || '',
              categoryTag: categoryTag || asset.categoryTag || '',
            },
          ] as const
        })
      )

      if (!cancelled) {
        setTranslatedFields(Object.fromEntries(entries))
      }
    }

    void translateFields()

    return () => {
      cancelled = true
    }
  }, [assets, locale, fetchTranslation])

  const onFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const uploads = await Promise.all(
        Array.from(files).map(async (file) => ({
          imageData: await fileToDataUrl(file),
          fileName: file.name,
          itemNameTag: '',
          categoryTag: '',
        }))
      )
      const res = await fetch('/api/media-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: uploads }),
      })
      if (!res.ok) throw new Error('Upload failed')
      toast({ title: t.media_library_upload_success })
      await loadAssets()
    } catch {
      toast({ title: t.media_library_upload_failed, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const updateAsset = async (id: string, updates: Partial<MediaAsset>) => {
    const res = await fetch(`/api/media-assets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      toast({ title: t.media_library_save_failed, variant: 'destructive' })
      return
    }
    const updated = await res.json()
    setAssets((prev) => prev.map((asset) => (asset.id === id ? updated : asset)))
  }

  const deleteAsset = async (id: string) => {
    const asset = assets.find((entry) => entry.id === id)
    const linkedCount = asset?.menuItems.length ?? 0
    const confirmed = window.confirm(
      linkedCount > 0
        ? t.media_library_delete_confirm_linked.replace('{0}', String(linkedCount))
        : t.media_library_delete_confirm
    )
    if (!confirmed) return
    const res = await fetch(`/api/media-assets/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast({ title: t.media_library_delete_failed, variant: 'destructive' })
      return
    }
    setAssets((prev) => prev.filter((asset) => asset.id !== id))
  }

  const visibleAssets = useMemo(() => assets, [assets])
  const hasAssets = visibleAssets.length > 0

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    await onFilesSelected(event.dataTransfer.files)
  }

  const getDisplayValue = (
    asset: MediaAsset,
    field: keyof MediaAssetFieldTranslation
  ) => {
    const draftValue = drafts[asset.id]?.[field]
    if (draftValue != null) return draftValue
    return translatedFields[asset.id]?.[field] ?? asset[field] ?? ''
  }

  const setDraftValue = (
    assetId: string,
    field: keyof MediaAssetFieldDraft,
    value: string
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [assetId]: {
        ...prev[assetId],
        [field]: value,
      },
    }))
  }

  const commitDraftValue = async (
    asset: MediaAsset,
    field: keyof MediaAssetFieldDraft
  ) => {
    const nextValue = drafts[asset.id]?.[field]
    if (nextValue == null) return

    const trimmedNextValue = nextValue.trim()
    const currentValue = String(asset[field] || '').trim()

    setDrafts((prev) => {
      const nextDrafts = { ...prev }
      const assetDraft = { ...(nextDrafts[asset.id] || {}) }
      delete assetDraft[field]
      if (Object.keys(assetDraft).length > 0) {
        nextDrafts[asset.id] = assetDraft
      } else {
        delete nextDrafts[asset.id]
      }
      return nextDrafts
    })

    if (trimmedNextValue === currentValue) {
      return
    }

    await updateAsset(asset.id, { [field]: trimmedNextValue } as Partial<MediaAsset>)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => void onFilesSelected(e.target.files)}
          />

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.media_library_search_placeholder}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">{t.media_library_all_types}</option>
                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {getStaticTranslationForSourceText(locale, type) || type}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                data-tour="media-upload"
                variant={showUploadPanel || !hasAssets ? 'default' : 'outline'}
                disabled={uploading}
                onClick={() => {
                  if (!hasAssets) {
                    fileInputRef.current?.click()
                    return
                  }
                  setShowUploadPanel((prev) => !prev)
                }}
              >
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {t.media_library_upload_photos}
                {hasAssets && !uploading ? (
                  <ChevronDown className={`ml-2 h-4 w-4 transition ${showUploadPanel ? 'rotate-180' : ''}`} />
                ) : null}
              </Button>
            </div>
          </div>

          {(showUploadPanel || !hasAssets) ? (
            <div
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => void handleDrop(event)}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-xl border border-dashed p-8 text-sm transition cursor-pointer ${
                isDragging
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : 'border-slate-300 bg-slate-50 text-slate-500'
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-2 text-center">
                <Upload className="h-5 w-5" />
                <p className="font-medium">{t.media_library_drop_zone}</p>
                <p className="text-xs">{t.media_library_click_to_select}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-tour="media-grid">
          {visibleAssets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden">
              <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                <img
                  src={asset.previewUrl || asset.url}
                  alt={asset.itemNameTag || 'Media asset'}
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    const target = event.currentTarget
                    target.style.display = 'none'
                    const fallback = target.nextElementSibling as HTMLDivElement | null
                    if (fallback) fallback.classList.remove('hidden')
                  }}
                />
                <div className="hidden h-full w-full items-center justify-center bg-slate-100 px-4 text-center text-sm text-slate-500">
                  Preview unavailable
                </div>
              </div>
              <CardContent className="space-y-3 p-4">
                <div className="grid gap-3">
                  <div>
                    <Label>{t.media_library_type}</Label>
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={asset.type}
                      onChange={(e) => void updateAsset(asset.id, { type: e.target.value })}
                    >
                      {TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>
                          {getStaticTranslationForSourceText(locale, type) || type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t.media_library_item_tag}</Label>
                    <Input
                      className="mt-1"
                      value={getDisplayValue(asset, 'itemNameTag')}
                      placeholder={t.media_library_placeholder_item_tag}
                      onChange={(e) => setDraftValue(asset.id, 'itemNameTag', e.target.value)}
                      onBlur={() => void commitDraftValue(asset, 'itemNameTag')}
                    />
                  </div>
                  <div>
                    <Label>{t.media_library_category_tag}</Label>
                    <Input
                      className="mt-1"
                      value={getDisplayValue(asset, 'categoryTag')}
                      placeholder={t.media_library_placeholder_category_tag}
                      onChange={(e) => setDraftValue(asset.id, 'categoryTag', e.target.value)}
                      onBlur={() => void commitDraftValue(asset, 'categoryTag')}
                    />
                  </div>
                  <div>
                    <Label>{t.media_library_linked_items}</Label>
                    <p className="mt-1 text-sm text-slate-600">
                      {asset.menuItems.length > 0
                        ? asset.menuItems.map((item) => td(item.name)).join(', ')
                        : t.media_library_not_linked}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => void deleteAsset(asset.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t.media_library_delete}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
