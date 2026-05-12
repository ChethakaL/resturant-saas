'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import type { IScannerControls } from '@zxing/browser'

type TableQrScannerProps = {
  /** When true, opens rear camera and scans until stopped or decoded */
  active: boolean
  className?: string
  videoClassName?: string
  onDecoded: (text: string) => void
  onScanError?: (message: string) => void
}

/**
 * Live QR scan using the device camera (prefers rear / "environment").
 * Browsers cannot open the native Camera app; this is the supported in-page flow.
 */
export function TableQrScanner({ active, className, videoClassName, onDecoded, onScanError }: TableQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      setCameraError(null)
      return
    }

    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let controls: IScannerControls | null = null

    setCameraError(null)

    ;(async () => {
      try {
        const reader = new BrowserQRCodeReader()

        const devices = await BrowserQRCodeReader.listVideoInputDevices()
        const back = devices.find((d) => /back|rear|environment|wide|ultra|ard/i.test(d.label))
        const deviceId = back?.deviceId

        const constraints: MediaStreamConstraints = deviceId
          ? { video: { deviceId: { exact: deviceId } } }
          : { video: { facingMode: { ideal: 'environment' } } }

        controls = await reader.decodeFromConstraints(constraints, video, (result, err) => {
          if (cancelled) return
          if (err && !(err instanceof NotFoundException)) {
            console.warn('[TableQrScanner] decode error', err)
          }
          const text = result?.getText?.()?.trim()
          if (text && controls) {
            try {
              controls.stop()
            } catch {
              /* ignore */
            }
            controls = null
            onDecoded(text)
          }
        })

        if (cancelled) {
          controls?.stop()
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Camera failed'
        console.error('[TableQrScanner]', e)
        setCameraError(msg)
        onScanError?.(msg)
      }
    })()

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [active, onDecoded, onScanError])

  if (!active) return null

  return (
    <div className={className}>
      <video
        ref={videoRef}
        className={videoClassName}
        muted
        playsInline
        autoPlay
        style={{ width: '100%', maxHeight: 'min(52vh, 420px)', objectFit: 'cover', borderRadius: 16 }}
      />
      {cameraError && (
        <p className="mt-2 text-center text-sm text-amber-700 dark:text-amber-300">{cameraError}</p>
      )}
    </div>
  )
}
