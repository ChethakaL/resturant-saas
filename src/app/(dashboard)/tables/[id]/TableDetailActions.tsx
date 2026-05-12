'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

type OrderAction = 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'

export function TableStatusActions({
  tableId,
  status,
}: {
  tableId: string
  status: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const clearTable = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'AVAILABLE' }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Failed to clear table')
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to clear table')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'AVAILABLE') return null

  return (
    <Button
      type="button"
      variant="outline"
      onClick={clearTable}
      disabled={loading}
      className="bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800"
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
      Clear Table
    </Button>
  )
}

export function TableOrderActions({
  orderId,
  status,
}: {
  orderId: string
  status: string
}) {
  const router = useRouter()
  const [loadingAction, setLoadingAction] = useState<OrderAction | null>(null)
  const isClosed = status === 'COMPLETED' || status === 'CANCELLED'

  const updateStatus = async (nextStatus: OrderAction) => {
    if (isClosed) return
    if (nextStatus === 'CANCELLED' && !window.confirm('Cancel this order?')) return

    setLoadingAction(nextStatus)
    try {
      const response =
        nextStatus === 'COMPLETED'
          ? await fetch(`/api/orders/${orderId}/complete`, { method: 'POST' })
          : nextStatus === 'CANCELLED'
            ? await fetch(`/api/orders/${orderId}`, { method: 'DELETE' })
            : await fetch(`/api/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus }),
              })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Failed to update order')
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update order')
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status === 'PENDING' && (
        <Button type="button" size="sm" variant="outline" onClick={() => updateStatus('PREPARING')} disabled={loadingAction != null}>
          {loadingAction === 'PREPARING' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Preparing
        </Button>
      )}
      {(status === 'PENDING' || status === 'PREPARING') && (
        <Button type="button" size="sm" variant="outline" onClick={() => updateStatus('READY')} disabled={loadingAction != null}>
          {loadingAction === 'READY' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Ready
        </Button>
      )}
      {!isClosed && (
        <Button type="button" size="sm" onClick={() => updateStatus('COMPLETED')} disabled={loadingAction != null}>
          {loadingAction === 'COMPLETED' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Done
        </Button>
      )}
      {!isClosed && (
        <Button type="button" size="sm" variant="destructive" onClick={() => updateStatus('CANCELLED')} disabled={loadingAction != null}>
          {loadingAction === 'CANCELLED' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
          Cancel
        </Button>
      )}
    </div>
  )
}
