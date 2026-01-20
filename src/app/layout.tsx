import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const manrope = Manrope({ subsets: ['latin'] })

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
      <body className={`${manrope.className} h-full bg-slate-50`}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
