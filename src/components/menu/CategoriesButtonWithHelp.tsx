'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Layers } from 'lucide-react'

export default function CategoriesButtonWithHelp() {
  return (
    <Link href="/categories">
      <Button variant="outline">
        <Layers className="h-4 w-4 mr-2" />
        Add Categories to your menu
      </Button>
    </Link>
  )
}
