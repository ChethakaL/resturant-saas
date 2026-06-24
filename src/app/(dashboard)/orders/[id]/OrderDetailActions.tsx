'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Printer, XCircle } from 'lucide-react'

const VOID_REASONS = [
  { value: 'MIS_RING_WRONG_ITEM', label: 'Mis-ring / wrong item' },
  { value: 'WRONG_TABLE', label: 'Wrong table' },
  { value: 'CUSTOMER_WALKOUT', label: 'Customer walkout' },
  { value: 'COMP_STAFF_MEAL', label: 'Comp / staff meal' },
  { value: 'KITCHEN_ERROR', label: 'Kitchen error' },
]

export default function OrderDetailActions({
  orderId,
  status,
  userRole,
  isVoided = false,
}: {
  orderId: string
  status: string
  userRole: string
  isVoided?: boolean
}) {
  const router = useRouter()
  const [showVoid, setShowVoid] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  const canCancel = status !== 'CANCELLED' && status !== 'COMPLETED'
  const canVoid = userRole === 'OWNER' && status === 'COMPLETED' && !isVoided

  const handleCancel = async () => {
    if (!canCancel) return
    const confirmed = window.confirm('Cancel this order and restore inventory?')
    if (!confirmed) return

    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to cancel order')
      }

      router.refresh()
    } catch (error: any) {
      console.error('Error cancelling order:', error)
      alert(error.message || 'Failed to cancel order. Please try again.')
    }
  }

  const handleVoid = async () => {
    if (!canVoid || !voidReason || voiding) return
    const confirmed = window.confirm('Void this paid order? The original order will remain and a correction entry will be recorded.')
    if (!confirmed) return

    setVoiding(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to void order')
      }

      setShowVoid(false)
      setVoidReason('')
      router.refresh()
    } catch (error: any) {
      console.error('Error voiding order:', error)
      alert(error.message || 'Failed to void order. Please try again.')
    } finally {
      setVoiding(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print Receipt
        </Button>
        {canCancel && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleCancel}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel Order
          </Button>
        )}
        {canVoid && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setShowVoid(true)}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Void Order
          </Button>
        )}
        {status === 'COMPLETED' && isVoided && (
          <Button type="button" variant="outline" disabled>
            Order Voided
          </Button>
        )}
      </div>

      {showVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Void paid order</h2>
            <p className="mt-1 text-sm text-slate-600">
              Select a reason. The original order will remain unchanged and a P&amp;L correction will be recorded.
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="void-reason">
              Reason
            </label>
            <select
              id="void-reason"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
            >
              <option value="">Select a reason</option>
              {VOID_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowVoid(false)}
                disabled={voiding}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleVoid}
                disabled={!voidReason || voiding}
              >
                {voiding ? 'Voiding...' : 'Void Order'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
