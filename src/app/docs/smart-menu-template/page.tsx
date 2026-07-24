import Link from 'next/link'
import { ArrowLeft, Code2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

const markers = [
  ['restaurant-name', 'Restaurant name text'],
  ['category-nav', 'Generated category filter buttons'],
  ['featured-slider', 'Featured or chef-highlighted menu items'],
  ['menu-items', 'The filtered menu item collection'],
  ['cart', 'Live cart summary and checkout button'],
]

export default function SmartMenuTemplateGuide() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
      <article className="mx-auto max-w-4xl">
        <Button asChild variant="outline" className="mb-6">
          <Link href="/settings/appearance"><ArrowLeft className="mr-2 h-4 w-4" />Back to Appearance</Link>
        </Button>

        <header className="border-b border-slate-200 bg-white p-6 sm:p-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-slate-900 text-white">
            <Code2 className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-semibold">Smart Menu template guide</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            A custom template controls presentation only. iServe continues to provide live menu data, category filtering, the featured slider, cart, and ordering.
          </p>
        </header>

        <section className="bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Required markers</h2>
          <p className="mt-2 text-sm text-slate-600">Every template must contain each marker exactly once.</p>
          <div className="mt-5 overflow-hidden border border-slate-200">
            {markers.map(([marker, purpose]) => (
              <div key={marker} className="grid gap-1 border-b border-slate-200 p-4 last:border-b-0 sm:grid-cols-[240px_1fr]">
                <code className="text-sm font-semibold text-rose-700">data-iserve=&quot;{marker}&quot;</code>
                <span className="text-sm text-slate-600">{purpose}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Generated CSS classes</h2>
          <p className="mt-2 text-sm text-slate-600">Style these classes inside a normal style element in your uploaded HTML.</p>
          <pre className="mt-5 overflow-x-auto rounded-md bg-slate-950 p-5 text-sm leading-6 text-slate-100"><code>{`.iserve-category
.iserve-category.is-active
.iserve-section-title
.iserve-featured-rail
.iserve-item
.iserve-featured-item
.iserve-item-name
.iserve-description
.iserve-price
.iserve-add
.iserve-items
.iserve-cart-summary
.iserve-checkout`}</code></pre>
        </section>

        <section className="mt-6 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Optional JavaScript API</h2>
          <p className="mt-2 text-sm text-slate-600">
            Uploaded scripts are intentionally blocked. The runtime exposes this read-only API for future approved template packages:
          </p>
          <pre className="mt-5 overflow-x-auto rounded-md bg-slate-950 p-5 text-sm leading-6 text-slate-100"><code>{`IServeMenu.getRestaurant()
IServeMenu.getItems()
IServeMenu.addToCart(menuItemId)`}</code></pre>
        </section>

        <section className="mt-6 flex gap-4 border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 className="font-semibold">Security rules</h2>
            <p className="mt-1 text-sm">
              Templates may contain HTML and CSS. Script tags, inline event handlers, forms, iframes, embedded objects, JavaScript URLs, and CSS imports are rejected. Files must be smaller than 200 KB.
            </p>
          </div>
        </section>
      </article>
    </main>
  )
}
