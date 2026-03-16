'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDynamicTranslate } from '@/lib/i18n'

type MenuQrCodeButtonProps = {
  menuUrl: string
  restaurantSlug: string
}

export default function MenuQrCodeButton({
  menuUrl,
  restaurantSlug,
}: MenuQrCodeButtonProps) {
  const { t: td } = useDynamicTranslate()
  const [open, setOpen] = useState(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !menuUrl) return

    let cancelled = false

    const generateQrCode = async () => {
      setLoading(true)
      try {
        const dataUrl = await QRCode.toDataURL(menuUrl, {
          width: 960,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        })
        if (!cancelled) {
          setQrCodeDataUrl(dataUrl)
        }
      } catch (error) {
        console.error('Failed to generate QR code:', error)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void generateQrCode()

    return () => {
      cancelled = true
    }
  }, [open, menuUrl])

  const downloadName = `${restaurantSlug || 'restaurant-menu'}-menu-qr.png`

  return (
    <>
      <Button type="button" variant="outline" size="icon" onClick={() => setOpen(true)} title={td('Download QR code')}>
        <QrCode className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{td('Menu QR Code')}</DialogTitle>
            <DialogDescription>
              {td('Guests can scan this QR code to open your digital menu instantly.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 break-all text-xs text-slate-500">{menuUrl}</p>
              <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-white p-4 shadow-sm">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                ) : qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt={td('Menu QR code')}
                    className="h-64 w-64 rounded-lg object-contain"
                  />
                ) : (
                  <p className="text-sm text-slate-500">{td('Unable to generate QR code.')}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button asChild disabled={!qrCodeDataUrl || loading}>
                <a href={qrCodeDataUrl} download={downloadName}>
                  <Download className="mr-2 h-4 w-4" />
                  {td('Download QR Code')}
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
