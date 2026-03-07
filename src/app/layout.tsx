import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: 'Restaurant SaaS - Management System',
  description: 'AI-powered restaurant management system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full bg-slate-50">
      <body className="h-full bg-slate-50">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
