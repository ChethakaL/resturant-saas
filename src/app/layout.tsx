import type { Metadata } from 'next'
import { Manrope, Playfair_Display, Cormorant_Garamond, DM_Sans } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const manrope = Manrope({ subsets: ['latin'] })
// Customer menu font options: elegant (Playfair), classic (Cormorant), modern (DM Sans)
const playfair = Playfair_Display({ variable: '--font-playfair', subsets: ['latin'], display: 'swap' })
const cormorant = Cormorant_Garamond({ variable: '--font-cormorant', weight: ['400', '500', '600', '700'], subsets: ['latin'], display: 'swap' })
const dmSans = DM_Sans({ variable: '--font-dm-sans', subsets: ['latin'], display: 'swap' })

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
      <body className={`${manrope.className} ${playfair.variable} ${cormorant.variable} ${dmSans.variable} h-full bg-slate-50`}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
