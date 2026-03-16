'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { ChevronDown, Loader2, Trash2, Upload } from 'lucide-react'

type MediaAsset = {
  id: string
  url: string
  previewUrl?: string
  type: string
  itemNameTag: string | null
  categoryTag: string | null
  menuItems: { id: string; name: string }[]
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [showUploadPanel, setShowUploadPanel] = useState(false)

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
      toast({ title: 'Photos uploaded' })
      await loadAssets()
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' })
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
      toast({ title: 'Failed to save asset', variant: 'destructive' })
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
        ? `This photo is linked to ${linkedCount} menu item${linkedCount === 1 ? '' : 's'}. Delete it and unlink those items?`
        : 'Delete this photo from the library?'
    )
    if (!confirmed) return
    const res = await fetch(`/api/media-assets/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast({ title: 'Failed to delete photo', variant: 'destructive' })
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
                placeholder="Search by item or category tag"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <Button
                type="button"
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
                Upload Photos
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
                <p className="font-medium">Drag and drop multiple photos here</p>
                <p className="text-xs">or click to select multiple files from your device</p>
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    <Label>Type</Label>
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={asset.type}
                      onChange={(e) => void updateAsset(asset.id, { type: e.target.value })}
                    >
                      {TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Item Name Tag</Label>
                    <Input
                      className="mt-1"
                      defaultValue={asset.itemNameTag || ''}
                      onBlur={(e) => void updateAsset(asset.id, { itemNameTag: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Category Tag</Label>
                    <Input
                      className="mt-1"
                      defaultValue={asset.categoryTag || ''}
                      onBlur={(e) => void updateAsset(asset.id, { categoryTag: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Linked Menu Items</Label>
                    <p className="mt-1 text-sm text-slate-600">
                      {asset.menuItems.length > 0
                        ? asset.menuItems.map((item) => item.name).join(', ')
                        : 'Not linked yet'}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => void deleteAsset(asset.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
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
