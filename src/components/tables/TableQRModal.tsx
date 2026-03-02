'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import QRCode from 'qrcode'

interface TableQRModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tableNumber: string
  menuUrl: string
}

export function TableQRModal({ open, onOpenChange, tableNumber, menuUrl }: TableQRModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !menuUrl) return
    QRCode.toDataURL(menuUrl, { width: 256, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [open, menuUrl])

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `table-${tableNumber}-qr.png`
    a.click()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Table {tableNumber} — QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR code for Table ${tableNumber}`}
              className="w-64 h-64 rounded-lg border border-slate-200"
            />
          ) : (
            <div className="w-64 h-64 rounded-lg border border-slate-200 bg-slate-50 animate-pulse flex items-center justify-center">
              <span className="text-slate-400 text-sm">Generating…</span>
            </div>
          )}
          {qrDataUrl && (
            <Button variant="outline" onClick={handleDownload} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download QR code
            </Button>
          )}
          <p className="text-sm text-slate-600 text-center">
            Scan to open the menu and order from Table {tableNumber}
          </p>
          <p className="text-xs text-slate-400 font-mono break-all text-center max-w-full">
            {menuUrl}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
