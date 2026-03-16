'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Building2 } from 'lucide-react'
import { SupplierDirectoryModal } from './SupplierDirectoryModal'

export function SupplierDirectoryButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Building2 className="mr-2 h-4 w-4" />
        Suppliers
      </Button>
      <SupplierDirectoryModal open={open} onOpenChange={setOpen} />
    </>
  )
}
