'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function CompleteOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleComplete = async () => {
    if (!confirm('Complete this order? This will deduct inventory and mark the order as completed.')) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/complete`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to complete order')
      }

      router.refresh()
    } catch (error: any) {
      alert(error.message || 'Failed to complete order')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleComplete}
      disabled={loading}
      size="sm"
      className="bg-green-600 hover:bg-green-700"
    >
      {loading ? 'Completing...' : 'Complete'}
    </Button>
  )
}
