'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * Optional customer account header for the public menu.
 * Sign-in is not required to browse or order; this only shows when the user can sign in or view their visits.
 */
export function CustomerMenuHeader() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const callbackUrl = pathname || '/'

  if (status === 'loading') {
    return (
      <div className="h-10 flex items-center justify-end px-3" aria-hidden />
    )
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-end gap-2 px-3 py-2 bg-slate-900/80 backdrop-blur border-b border-white/10">
      {session?.user?.type === 'customer' ? (
        <>
          <Link href="/customer/me">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
              My visits
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => signOut({ callbackUrl })}
          >
            Sign out
          </Button>
        </>
      ) : (
        <Link href={`/customer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
            Sign in
          </Button>
        </Link>
      )}
    </div>
  )
}
