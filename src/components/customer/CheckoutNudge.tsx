'use client'

import { Button } from '@/components/ui/button'

interface CheckoutNudgeProps {
  message: string
  itemName: string
  itemPrice: string
  onAdd: () => void
  addLabel: string
  dismissLabel: string
  onDismiss: () => void
}

export function CheckoutNudge({
  message,
  itemName,
  itemPrice,
  onAdd,
  addLabel,
  dismissLabel,
  onDismiss,
}: CheckoutNudgeProps) {
  return (
    <div className="rounded-xl bg-[var(--menu-accent,#f59e0b)]/20 border border-[var(--menu-accent,#f59e0b)]/40 p-3 flex flex-col gap-2">
      <p className="text-sm text-white/90">{message}</p>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-medium text-white">{itemName} — {itemPrice}</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onAdd}
            className="bg-[var(--menu-accent,#f59e0b)] hover:opacity-90 text-white"
          >
            {addLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} className="text-white/80 hover:text-white">
            {dismissLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
