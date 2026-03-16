'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import UploadReceiptModal from './UploadReceiptModal'
import { useI18n } from '@/lib/i18n'

export default function UploadReceiptButton() {
  const [modalOpen, setModalOpen] = useState(false)
  const { t } = useI18n()

  return (
    <>
      <Button variant="outline" onClick={() => setModalOpen(true)}>
        <Upload className="h-4 w-4 mr-2" />
        {'Upload Receipt'}
      </Button>

      <UploadReceiptModal
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  )
}