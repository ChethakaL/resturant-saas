'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Upload } from 'lucide-react'
import Link from 'next/link'
import { InventoryTable } from '@/app/(dashboard)/inventory/InventoryTable'
import { InventorySearch } from '@/app/(dashboard)/inventory/InventorySearch'
import FixUnitsButton from '@/app/(dashboard)/inventory/FixUnitsButton'
import ReceiptUploadModal from '@/components/inventory/ReceiptUploadModal'
import { useDynamicTranslate } from '@/lib/i18n'

interface InventoryPageClientProps {
  t: any
  badUnitCount: number
  ingredients: any[]
  totalCount: number
  totalPages: number
  currentPage: number
}

export function InventoryPageClient({
  t,
  badUnitCount,
  ingredients,
  totalCount,
  totalPages,
  currentPage,
}: InventoryPageClientProps) {
  const { t: td } = useDynamicTranslate()
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t.inventory_title}</h1>
          <p className="text-slate-500 mt-1">{t.inventory_subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <InventorySearch />
          <Button 
            variant="outline" 
            className="shrink-0 gap-2"
            onClick={() => setIsReceiptModalOpen(true)}
          >
            <Upload className="h-4 w-4" />
            {td('Upload Receipt')}
          </Button>
          <Link href="/inventory/new">
            <Button className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              {t.inventory_add_ingredient}
            </Button>
          </Link>
        </div>
      </div>

      {/* Bad-unit warning banner */}
      {badUnitCount > 0 && <FixUnitsButton badUnitCount={badUnitCount} />}

      {/* Ingredients Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t.inventory_all_ingredients}</CardTitle>
          <p className="text-sm text-slate-500 font-normal mt-1">
            {t.inventory_cost_note}
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <InventoryTable
              ingredients={ingredients}
              totalCount={totalCount}
              totalPages={totalPages}
              currentPage={currentPage}
            />
          </div>
        </CardContent>
      </Card>

      <ReceiptUploadModal 
        isOpen={isReceiptModalOpen} 
        onClose={() => setIsReceiptModalOpen(false)} 
      />
    </div>
  )
}
