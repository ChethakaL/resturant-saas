'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export default function AdminSignOut() {
  return (
    <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/admin/login' })}>
      Sign out
    </Button>
  )
}
