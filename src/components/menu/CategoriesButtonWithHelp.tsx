'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { HelpCircle, Layers } from 'lucide-react'

const HELP_TEXT = 'Optimize your menu by highlighting highly profitable items.'

export default function CategoriesButtonWithHelp() {
  return (
    <div className="flex items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-slate-500 hover:text-slate-700"
            aria-label="Help"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-w-xs text-sm" align="start">
          {HELP_TEXT}
        </PopoverContent>
      </Popover>
      <Link href="/categories">
        <Button variant="outline">
          <Layers className="h-4 w-4 mr-2" />
          Add Categories to your menu
        </Button>
      </Link>
    </div>
  )
}
