import type { Metadata } from 'next'
import { Manrope, Playfair_Display, Cormorant_Garamond, DM_Sans, Nunito, Space_Mono, Caveat, Barlow_Condensed, Roboto_Slab } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { Providers } from '@/components/Providers'

const manrope = Manrope({ subsets: ['latin'] })
// Customer menu font options: elegant (Playfair), classic (Cormorant), modern (DM Sans)
const playfair = Playfair_Display({ variable: '--font-playfair', subsets: ['latin'], display: 'swap' })
const cormorant = Cormorant_Garamond({ variable: '--font-cormorant', weight: ['400', '500', '600', '700'], subsets: ['latin'], display: 'swap' })
const dmSans = DM_Sans({ variable: '--font-dm-sans', subsets: ['latin'], display: 'swap' })
// Additional menu font options
const nunito = Nunito({ variable: '--font-nunito', subsets: ['latin'], display: 'swap' })
const spaceMono = Space_Mono({ variable: '--font-space-mono', weight: ['400', '700'], subsets: ['latin'], display: 'swap' })
const caveat = Caveat({ variable: '--font-caveat', subsets: ['latin'], display: 'swap' })
const barlowCondensed = Barlow_Condensed({ variable: '--font-barlow-condensed', weight: ['400', '500', '600', '700'], subsets: ['latin'], display: 'swap' })
const robotoSlab = Roboto_Slab({ variable: '--font-roboto-slab', subsets: ['latin'], display: 'swap' })

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
      <body className={`${manrope.className} ${playfair.variable} ${cormorant.variable} ${dmSans.variable} ${nunito.variable} ${spaceMono.variable} ${caveat.variable} ${barlowCondensed.variable} ${robotoSlab.variable} h-full bg-slate-50`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
