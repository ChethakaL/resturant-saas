import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { CheckCircle2, Sparkles, ChefHat } from 'lucide-react'

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80'

async function getPreviewMenu() {
  const restaurant = await prisma.restaurant.findFirst({
    orderBy: { createdAt: 'asc' },
  })

  if (!restaurant) {
    return []
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { available: true, restaurantId: restaurant.id },
    include: { category: true },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })

  return menuItems
}

export default async function Home() {
  const menuItems = await getPreviewMenu()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-32 left-10 h-72 w-72 rounded-full bg-emerald-400 blur-[120px]" />
          <div className="absolute top-20 right-10 h-80 w-80 rounded-full bg-sky-500 blur-[140px]" />
        </div>
        <div className="relative mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
                <Sparkles className="h-4 w-4 text-emerald-300" />
                Catering-ready restaurant platform
              </div>
              <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
                Run your restaurant with clarity, speed, and control.
              </h1>
              <p className="text-lg text-white/70">
                Track inventory, manage menu items, and process cash orders with a single
                dashboard built for Iraqi restaurants and catering teams.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/login">
                  <Button size="lg">Sign In</Button>
                </Link>
                <Link href="/dashboard">
                  <Button size="lg" variant="outline" color='black' style={{color: 'black'}}>
                    View Dashboard
                  </Button>
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  Cash-first POS flows
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  Recipe-level costing
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  Clear analytics
                </div>
              </div>
            </div>
            <div className="relative">
              <img
                src={FALLBACK_IMAGE}
                alt="Restaurant dishes"
                className="h-[420px] w-full rounded-3xl object-cover shadow-2xl"
              />
              <div className="absolute -bottom-6 left-6 rounded-2xl bg-slate-900/90 p-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <ChefHat className="h-5 w-5 text-emerald-300" />
                  <div>
                    <p className="text-sm font-semibold">Al-Rafidain Kitchen</p>
                    <p className="text-xs text-white/60">Baghdad, Iraq</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white text-slate-900">
        <div className="mx-auto max-w-6xl px-6 py-16 space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">Public Menu Preview</h2>
              <p className="text-slate-500 mt-2">
                A glimpse of what guests will see on the public menu page.
              </p>
            </div>
            <Link href="/login">
              <Button variant="outline">Manage Full Menu</Button>
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {menuItems.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <img
                  src={item.imageUrl || FALLBACK_IMAGE}
                  alt={item.name}
                  className="h-40 w-full object-cover"
                />
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{item.name}</h3>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatCurrency(item.price)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {item.category?.name || 'Signature'}
                  </p>
                  {item.description && (
                    <p className="text-sm text-slate-600 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {menuItems.length === 0 && (
            <div className="rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
              Add menu items to showcase them on the public preview.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
