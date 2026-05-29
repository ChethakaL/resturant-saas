'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'

interface DashboardShellProps {
  children: React.ReactNode
  userName: string
  userRole: string
}

export function DashboardShell({ children, userName, userRole }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen h-[100dvh] min-w-0 overflow-hidden">
      <aside className="hidden h-full shrink-0 lg:block">
        <Sidebar userName={userName} userRole={userRole} />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55"
            aria-label="Close navigation menu"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative h-full w-[min(84vw,20rem)] max-w-full shadow-2xl">
            <Sidebar userName={userName} userRole={userRole} onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700"
            aria-label="Open navigation menu"
            onClick={() => setSidebarOpen(true)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <img src="/logo.png" alt="iServe+" className="h-8 w-auto rounded-full" />
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          <div className="min-w-0 max-w-full p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      <ChatbotWidget />
    </div>
  )
}
