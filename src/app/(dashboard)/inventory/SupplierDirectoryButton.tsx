'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Building2 } from 'lucide-react'
import { SupplierDirectoryModal } from './SupplierDirectoryModal'
import { useDynamicTranslate } from '@/lib/i18n'

export function SupplierDirectoryButton() {
  const [open, setOpen] = useState(false)
  const { t: td } = useDynamicTranslate()

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Building2 className="mr-2 h-4 w-4" />
        {td('Suppliers')}
      </Button>
      <SupplierDirectoryModal open={open} onOpenChange={setOpen} />
    </>
  )
}
