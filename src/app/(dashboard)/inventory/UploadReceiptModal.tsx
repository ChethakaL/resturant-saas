'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { useDynamicTranslate } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, X, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type UploadReceiptModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ingredientId?: string
  onSuccess?: (receiptId: string) => void
}

export default function UploadReceiptModal({
  open,
  onOpenChange,
  ingredientId,
  onSuccess,
}: UploadReceiptModalProps) {
  const { t } = useI18n()
  const { t: td } = useDynamicTranslate()
  const router = useRouter()

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedFile.type)) {
      setError(td('Only JPEG, PNG, or WebP images are allowed.'))
      return
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError(td('File size must be less than 10MB.'))
      return
    }

    setFile(selectedFile)
    setError(null)

    const reader = new FileReader()
    reader.onload = () => setPreviewUrl(reader.result as string)
    reader.readAsDataURL(selectedFile)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      const syntheticEvent = { target: { files: [droppedFile] } } as any
      handleFileChange(syntheticEvent)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setSuccess(false)

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (ingredientId) {
        formData.append('ingredientId', ingredientId)
      }

      const res = await fetch('/api/receipts', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || td('Failed to upload receipt'))
      }

      const data = await res.json()

      setSuccess(true)
      setFile(null)
      setPreviewUrl(null)

      setTimeout(() => {
        onOpenChange(false)
        if (onSuccess) onSuccess(data.receiptId)
        else router.refresh()
      }, 1800)

    } catch (err: any) {
      setError(err.message || td('Something went wrong. Please try again.'))
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setPreviewUrl(null)
    setError(null)
    setSuccess(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!uploading) onOpenChange(o)
    }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{td('Upload Receipt')}</DialogTitle>
          <DialogDescription>
            {ingredientId
              ? td('Upload a receipt to update cost for this ingredient')
              : td('Upload a receipt to add or update ingredient costs')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {success ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-medium">{td('Receipt uploaded successfully')}</h3>
              <p className="text-sm text-slate-500 mt-2">
                {td('You will be redirected to review and confirm the extracted data shortly...')}
              </p>
            </div>
          ) : (
            <>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  file ? "border-primary bg-primary/5" : "border-slate-300 hover:border-primary/50",
                  uploading && "opacity-60 pointer-events-none"
                )}
              >
                {previewUrl ? (
                  <div className="relative mx-auto max-h-64 overflow-hidden rounded">
                    <img
                      src={previewUrl}
                      alt="Receipt preview"
                      className="max-h-64 object-contain mx-auto"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        reset()
                      }}
                      disabled={uploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 mx-auto text-slate-400 mb-4" />
                    <p className="font-medium">{td('Click or drag receipt here')}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {td('JPEG, PNG, WebP • max 10MB')}
                    </p>
                  </>
                )}

                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </div>

              {error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
            disabled={uploading}
          >
            {success ? "Close" : t.common_cancel}
          </Button>

          {!success && (
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="min-w-[140px]"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {td('Uploading...')}
                </>
              ) : (
                td('Upload & Parse')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}