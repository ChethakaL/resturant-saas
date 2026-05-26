'use client'

import { Button } from '@/components/ui/button'
import { HelpCircle } from 'lucide-react'

export default function DashboardTourButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2 shrink-0"
      onClick={() => window.dispatchEvent(new Event('open-page-tour'))}
      aria-label="Start interactive tour"
    >
      <HelpCircle className="h-4 w-4" />
      Tour this page
    </Button>
  )
}
