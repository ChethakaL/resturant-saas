'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4">
      <p className="text-3xl font-semibold mb-2">Something went wrong.</p>
      <p className="text-sm text-white/70 mb-6 text-center max-w-md">
        We hit an unexpected issue while loading the public menu. Try refreshing to continue.
      </p>
      <button
        onClick={() => reset()}
        className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
      >
        Try again
      </button>
    </div>
  )
}
