'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { X } from 'lucide-react'

interface IdleUpsellPopupProps {
  starItemName: string
  starItemId: string
  message: string
  idleDelayMs: number
  dismissAfterMs: number
  onAddItem: (itemId: string) => void
  onDismiss: () => void
  show: boolean
}

export function IdleUpsellPopup({
  starItemName,
  starItemId,
  message,
  idleDelayMs,
  dismissAfterMs,
  onAddItem,
  onDismiss,
  show,
}: IdleUpsellPopupProps) {
  const [visible, setVisible] = useState(false)
  const [shownOnce, setShownOnce] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    setVisible(false)
    if (!show || shownOnce) return
    idleTimer.current = setTimeout(() => {
      setVisible(true)
      setShownOnce(true)
      dismissTimer.current = setTimeout(() => {
        setVisible(false)
        onDismiss()
      }, dismissAfterMs)
    }, idleDelayMs)
  }, [show, shownOnce, idleDelayMs, dismissAfterMs, onDismiss])

  useEffect(() => {
    if (!show) return
    resetIdleTimer()
    const onActivity = () => resetIdleTimer()
    window.addEventListener('scroll', onActivity, { passive: true })
    window.addEventListener('touchstart', onActivity)
    window.addEventListener('click', onActivity)
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      window.removeEventListener('scroll', onActivity)
      window.removeEventListener('touchstart', onActivity)
      window.removeEventListener('click', onActivity)
    }
  }, [show, resetIdleTimer])

  if (!visible) return null

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-slate-800 border border-white/20 rounded-xl shadow-xl p-4 flex gap-3 items-start">
        <p className="text-sm text-white/90 flex-1">
          {message} <strong className="text-amber-400">{starItemName}</strong>
        </p>
        <button
          type="button"
          onClick={() => {
            setVisible(false)
            onDismiss()
          }}
          className="p-1 rounded-full hover:bg-white/10 text-white/70"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            onAddItem(starItemId)
            setVisible(false)
            onDismiss()
          }}
          className="flex-shrink-0 text-xs font-semibold text-amber-400 hover:text-amber-300"
        >
          Try it
        </button>
      </div>
    </div>
  )
}
