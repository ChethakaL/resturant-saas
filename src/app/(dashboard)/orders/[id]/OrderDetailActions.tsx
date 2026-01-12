'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Printer, XCircle } from 'lucide-react'

export default function OrderDetailActions({
  orderId,
  status,
}: {
  orderId: string
  status: string
}) {
  const router = useRouter()
  const canCancel = status !== 'CANCELLED'

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

  return (
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4 mr-2" />
        Print Receipt
      </Button>
      <Button
        type="button"
        variant="destructive"
        onClick={handleCancel}
        disabled={!canCancel}
      >
        <XCircle className="h-4 w-4 mr-2" />
        {canCancel ? 'Cancel Order' : 'Order Cancelled'}
      </Button>
    </div>
  )
}
