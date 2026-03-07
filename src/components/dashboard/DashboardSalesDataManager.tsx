'use client'

import { useState } from 'react'
import { Database, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import MonthlySalesPdfUploadCard from '@/components/dashboard/MonthlySalesPdfUploadCard'

interface DashboardSalesDataManagerProps {
  currentPeriodLabel: string
}

export default function DashboardSalesDataManager({
  currentPeriodLabel,
}: DashboardSalesDataManagerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Manage Sales Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Database className="h-5 w-5 text-emerald-600" />
              Manage imported sales data
            </DialogTitle>
            <DialogDescription>
              Upload a new PDF, append or replace {currentPeriodLabel || 'monthly'} sales data, or reopen an imported month to edit it.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="p-6">
          <MonthlySalesPdfUploadCard
            title="Sales data manager"
            description="Review, edit, append, or replace imported monthly sales data used by the dashboard and Smart Profit mode."
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
