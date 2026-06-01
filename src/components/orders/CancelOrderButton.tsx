'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { XCircle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export default function CancelOrderButton({
  orderId,
  label = 'Cancel',
}: {
  orderId: string
  label?: string
}) {
  const [cancelling, setCancelling] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleCancel = async () => {
    if (cancelling) return
    const confirmed = window.confirm('Cancel this order?')
    if (!confirmed) return

    setCancelling(true)
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Failed to cancel order')
      }
      toast({
        title: 'Order cancelled',
        description: 'The pending order has been cancelled.',
      })
      router.refresh()
    } catch (error) {
      toast({
        title: 'Cancel failed',
        description: error instanceof Error ? error.message : 'Failed to cancel order.',
        variant: 'destructive',
      })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="destructive"
      onClick={handleCancel}
      disabled={cancelling}
    >
      <XCircle className="h-4 w-4 mr-2" />
      {cancelling ? 'Cancelling...' : label}
    </Button>
  )
}
