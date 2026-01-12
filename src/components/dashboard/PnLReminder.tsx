'use client'

import { useEffect } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { AlertTriangle } from 'lucide-react'

export default function PnLReminder() {
  const { toast } = useToast()

  useEffect(() => {
    const checkReminder = async () => {
      try {
        const response = await fetch('/api/reports/pnl/reminder')
        if (!response.ok) return

        const data = await response.json()

        if (data.needsReminder) {
          toast({
            title: 'P&L Records Reminder',
            description: `You haven't recorded any Profit & Loss entries in the last ${data.daysSinceActivity} days. Please update your P&L records to ensure accurate revenue calculations.`,
            variant: 'destructive',
            duration: 10000, // Show for 10 seconds
          })
        }
      } catch (error) {
        // Silently fail - don't interrupt user experience
        console.error('Error checking P&L reminder:', error)
      }
    }

    // Check after a short delay to not interrupt initial page load
    const timer = setTimeout(checkReminder, 2000)
    return () => clearTimeout(timer)
  }, [toast])

  return null
}
