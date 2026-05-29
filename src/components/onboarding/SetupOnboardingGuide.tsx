'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, HelpCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SetupProgress {
  restaurantName: string
  hasRestaurantDna: boolean
  menuItemsCount: number
  categoriesCount: number
  mediaAssetsCount: number
  ingredientsCount: number
  tablesCount: number
}

interface SetupOnboardingGuideProps {
  autoOpen: boolean
  progress: SetupProgress
  hasActiveSubscription: boolean
}

interface TourStep {
  selector: string
  title: string
  body: string
  bullets?: string[]
  hiddenHint?: string
  enterAction?: string
  leaveAction?: string
}

function dispatchTourAction(action: string) {
  window.dispatchEvent(new CustomEvent('page-tour-step', { detail: { action } }))
}

const pageTours: Array<{ match: (pathname: string | null, tab: string | null) => boolean; steps: TourStep[] }> = [
  {
    match: (pathname, tab) => (pathname === '/menu' || pathname === '/dashboard/menu') && tab !== 'optimization',
    steps: [
      { selector: '[data-tour="menu-import-image"]', title: 'Import from a menu image', body: 'Use this when the restaurant has a photo or screenshot of the menu. AI extracts items, prices, categories, recipes, and ingredients.' },
      { selector: '[data-tour="menu-import-url"]', title: 'Import from a digital menu link', body: 'Use this when they have an online menu URL. It opens the same review flow as image import.' },
      { selector: '[data-tour="menu-add-manual"]', title: 'Add one item manually', body: 'Use this for one-off items or when the owner wants full manual control.' },
      { selector: '[data-tour="menu-items-table"]', title: 'Review created items', body: 'After import, check prices, status, categories, costing, and publish state here.' },
    ],
  },
  {
    match: (pathname, tab) => (pathname === '/menu' || pathname === '/dashboard/menu') && tab === 'optimization',
    steps: [
      {
        selector: '[data-tour="menu-optimization-settings"]',
        title: 'Optimization modes and guest layout',
        body: 'Choose Classic (menu as you organized it), Profit (highlights high-margin items), or Smart Profit (uses uploaded sales data). Pick list or grid layout for the guest menu, then save.',
      },
      {
        selector: '[data-tour="menu-optimization-quadrant"]',
        title: 'Menu Engineering Quadrant',
        body: 'Staff-only — guests never see this. Click Load performance view to plot each dish on a grid: profit margin (high at top, low at bottom) vs popularity / units sold (low on the left, high on the right). See “What each group means” on this card for Stars, Puzzles, Workhorses, and Dogs.',
      },
      {
        selector: '[data-tour="menu-optimization-featured"]',
        title: 'Featured sections on your menu',
        body: 'Swipeable rows guests see on the menu (chef picks, recommendations, breakfast/lunch slots, etc.). In Profit or Smart Profit mode, use Auto-fill sections. You can also add sections manually and pick dishes.',
      },
      {
        selector: '[data-tour="menu-optimization-edit-layout"]',
        title: 'Edit layout and timing',
        body: 'On each featured section, click this button to open layout and timing settings: highlight style, where the section appears, card vs hero display, badge label, time slots, and seasonal dates. The next step opens that dialog.',
      },
      {
        selector: '[data-tour="menu-optimization-layout-dialog"]',
        title: 'Layout and timing dialog',
        body: 'Highlight style sets the guest badge (chef picks vs recommended). Where it appears places the row at the top or after a category. The preview shows card slider vs full-width hero. Seasonal dates limit when the section is visible. Save when finished.',
        enterAction: 'open-showcase-settings-tour',
        leaveAction: 'close-showcase-settings-tour',
      },
    ],
  },
  {
    match: (pathname) => pathname === '/media-library' || pathname === '/dashboard/media-library',
    steps: [
      { selector: '[data-tour="media-upload"]', title: 'Upload media assets', body: 'Upload dish photos here. Later you can attach these images to menu items.' },
      { selector: '[data-tour="media-grid"]', title: 'Manage uploaded media', body: 'Tag images by item or category so they are easier to reuse in menu item forms.' },
    ],
  },
  {
    match: (pathname) => pathname === '/settings' || pathname === '/dashboard/settings',
    steps: [
      {
        selector: '[data-tour="settings-smart-designer"]',
        title: 'Smart Designer',
        body: 'Chat with AI to get brand guidance — colors, fonts, and style direction based on your restaurant type. It can suggest theme changes you can apply from the conversation.',
      },
      {
        selector: '[data-tour="settings-languages"]',
        title: 'Dashboard and guest menu languages',
        body: 'Management language controls the dashboard UI (English, Kurdish, Arabic). Below that, toggle whether guests see Arabic or Kurdish options on the public menu.',
      },
      {
        selector: '[data-tour="settings-style-presets"]',
        title: 'Style presets',
        body: 'Pick a starting theme (Classy, Fast Food, Cozy, etc.) to instantly set colors, background, and fonts. Use Custom to build from scratch, or Preview/update dish photo backgrounds to match the preset.',
      },
      {
        selector: '[data-tour="settings-brand-colors"]',
        title: 'Brand colors',
        body: 'Fine-tune main brand color, Add to Order button, signature dish badge, and featured-item highlight. Click each circle to pick colors guests will see on the menu.',
      },
      {
        selector: '[data-tour="settings-menu-background"]',
        title: 'Menu background',
        body: 'Choose dark, gradient, or light background for the guest-facing menu. This sets the overall mood alongside your brand colors.',
      },
      {
        selector: '[data-tour="settings-typography"]',
        title: 'Typography',
        body: 'Set fonts for the menu title, category headers, item names, descriptions, and prices. The live preview on this card shows how combinations look before you save.',
      },
      {
        selector: '[data-tour="settings-restaurant-name"]',
        title: 'Restaurant name',
        body: 'The name shown at the top of your guest menu. Keep it short and recognizable — it appears in the live preview and on QR menu links.',
      },
      {
        selector: '[data-tour="settings-social-links"]',
        title: 'Guest menu social links',
        body: 'Instagram, Facebook, and WhatsApp URLs appear as icons in the guest menu footer. Add the full links so guests can follow or message you.',
      },
      {
        selector: '[data-tour="settings-contact-location"]',
        title: 'Contact, location & WhatsApp orders',
        body: 'Set email, phone, and address (city + Google Maps street). Verify WhatsApp to receive order notifications — generate an OTP and send it from your restaurant WhatsApp number.',
      },
      {
        selector: '[data-tour="settings-table-ordering"]',
        title: 'Table ordering',
        body: 'When enabled, guests pick their table from the digital menu (used with QR codes on tables). Turn off if you only take orders without table selection.',
      },
      {
        selector: '[data-tour="settings-restaurant-photo"]',
        title: 'Restaurant photo',
        body: 'Optional photo of your space for brand context. Upload here, then save at the bottom. Smart Designer and AI features can use this vibe when suggesting styles.',
      },
      {
        selector: '[data-tour="settings-ai-content"]',
        title: 'AI description tone & terminology',
        body: 'Set how AI writes dish descriptions (casual vs fine dining). Scroll to Food Terminology Overrides below for recipe wording rules, and Timezone for breakfast/lunch/dinner featured sections.',
      },
      {
        selector: '[data-tour="settings-dish-photo-background"]',
        title: 'Dish photo background',
        body: 'Default background style for AI-generated menu item photos. Write a prompt or upload a reference image, then Save & generate preview. New imports and image generation use this style.',
      },
      {
        selector: '[data-tour="settings-logo"]',
        title: 'Restaurant logo',
        body: 'Upload or paste a logo URL. It appears at the top of the digital menu next to your restaurant name.',
      },
      {
        selector: '[data-tour="settings-live-preview"]',
        title: 'Live preview',
        body: 'See how colors, fonts, and background look together on sample menu cards before saving. Use this to sanity-check changes from presets or Smart Designer.',
      },
      {
        selector: '[data-tour="settings-save"]',
        title: 'Save Restaurant DNA',
        body: 'Save all changes here — colors, fonts, logo, contact info, AI settings, and uploads. Nothing goes live on the guest menu until you click this button.',
      },
    ],
  },
  {
    match: (pathname) => pathname === '/inventory' || pathname === '/dashboard/inventory',
    steps: [
      { selector: '[data-tour="inventory-add"]', title: 'Add ingredients manually', body: 'Use this for ingredients, units, supplier data, and cost per unit.' },
      { selector: '[data-tour="inventory-receipt"]', title: 'Import from receipts', body: 'Upload receipts to speed up inventory cost and stock setup.' },
      { selector: '[data-tour="inventory-table"]', title: 'Review ingredient costs', body: 'Recipes use this data to calculate menu item costing and profit.' },
    ],
  },
  {
    match: (pathname) => pathname === '/tables' || pathname === '/dashboard/tables',
    steps: [
      {
        selector: '[data-tour="tables-waiters"]',
        title: 'Manage waiters',
        body: 'Add waiters here so they can sign in at /waiterlogin and take orders from assigned tables. Open Manage Waiters to create accounts and, if you use branches, assign each waiter to a location.',
      },
      {
        selector: '[data-tour="tables-header-actions"]',
        title: 'Branches and add tables',
        body: 'If you have added branches (from Subscription / Billing), a branch dropdown appears here to filter the table list. Add Table creates a new table — on that form you can assign it to a branch when branches exist. If you have no branches, the dropdown is hidden and tables apply to your whole restaurant.',
      },
      {
        selector: '[data-tour="tables-grid"]',
        title: 'Manage table status and QR',
        body: 'Each table card shows seats, status (available, occupied, reserved), and active orders. Open the QR code so guests can scan and order from that table.',
      },
    ],
  },
  {
    match: (pathname) => pathname === '/categories' || pathname === '/dashboard/categories',
    steps: [
      { selector: '[data-tour="tour-ai-categorization"]', title: 'AI categorization', body: 'Automatically organizes menu items into standard restaurant categories. Use this when setting up a new menu or reorganizing an existing one.' },
      { selector: '[data-tour="tour-add-category"]', title: 'Add category', body: 'Create a new menu section by name and optional description. New categories appear in the list below and on your guest menu.' },
      { selector: '[data-tour="tour-current-categories"]', title: 'Current categories', body: 'Review dishes in each section, reorder categories by dragging, show or hide sections, move items between categories, or edit names.' },
    ],
  },
  {
    match: (pathname) => pathname === '/dashboard',
    steps: [
      {
        selector: '[data-tour="dashboard-overview"], [data-tour="dashboard-sales-upload"]',
        title: 'Dashboard overview',
        body: 'Your home base for revenue, orders, tables in use, and year-to-date profit. If this is your first visit, upload a monthly sales PDF first — until then only the upload card shows here. After import, stats appear and Manage Sales Data lets you add later months.',
      },
      {
        selector: '[data-tour="dashboard-analytics"]',
        title: 'Menu performance',
        body: 'See top and worst sellers, highest and lowest margin items, and popular combos. This section appears once monthly sales data is uploaded — use it to decide what to promote, fix, or remove.',
        hiddenHint: 'Menu performance charts appear after you upload your first monthly sales PDF. Continue with the sidebar steps — menu setup does not require sales data.',
      },
      {
        selector: '[data-tour="nav-menu"]',
        title: 'Add menu items',
        body: 'Start here for most setups: import from a menu image or URL, add items manually, and review prices, categories, and costing.',
      },
      {
        selector: '[data-tour="nav-media"]',
        title: 'Media library',
        body: 'Upload dish photos once and reuse them when editing menu items or generating AI images.',
      },
      {
        selector: '[data-tour="nav-optimization"]',
        title: 'Optimize menu sales',
        body: 'Choose Classic, Profit, or Smart Profit mode, manage featured sections, and use the menu engineering quadrant to improve margins.',
      },
      {
        selector: '[data-tour="nav-restaurant-dna"]',
        title: 'Restaurant DNA',
        body: 'Set brand colors, fonts, logo, contact info, AI tone, and guest menu layout. This defines how your digital menu looks and sounds.',
      },
      {
        selector: '[data-tour="nav-inventory"]',
        title: 'Inventory',
        body: 'Add ingredients and costs so recipes calculate food cost, margin, and profit on each menu item.',
      },
      {
        selector: '[data-tour="nav-tables"]',
        title: 'Tables',
        body: 'Create tables, manage waiters, and generate QR codes so guests can order from their table.',
      },
      {
        selector: '[data-tour="nav-sales-reports"]',
        title: 'Sales reports',
        body: 'Open Profit & Loss for full financial reports: sales, COGS, labor, expenses, and monthly P&L. Upload sales data here to unlock Smart Profit and dashboard trends.',
      },
      {
        selector: '[data-tour="nav-billing"]',
        title: 'Subscription & billing',
        body: 'Manage your iServe+ plan, payment method, and branches. Extra branches are billed here — the same place you add branch slots for multi-location restaurants.',
      },
    ],
  },
]

function getRect(selector: string) {
  const selectors = selector.split(',').map((s) => s.trim())
  for (const sel of selectors) {
    const element = document.querySelector(sel)
    if (!element) continue
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return rect
  }
  return null
}

function getMissingTargetHint(pathname: string | null, step: TourStep | null): string | null {
  if (!step) return null
  if (step.hiddenHint) return step.hiddenHint

  if (pathname === '/dashboard') {
    if (step.selector.includes('dashboard-analytics')) {
      return 'Menu performance charts (top sellers, margins, combos) appear here after you upload your first monthly sales PDF. Continue with the sidebar steps — menu setup does not require sales data.'
    }
    if (step.selector.includes('dashboard-overview') || step.selector.includes('dashboard-sales-upload')) {
      return 'Dashboard stats are hidden until you upload a monthly sales PDF. Use the upload card on this page, then refresh to see revenue, orders, and YTD profit.'
    }
  }

  return 'This item is not visible on the page yet. Use the sidebar or page controls to reach it.'
}

export default function SetupOnboardingGuide({
  autoOpen,
  hasActiveSubscription,
}: SetupOnboardingGuideProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [hasAutoOpened, setHasAutoOpened] = useState(false)
  const [mounted, setMounted] = useState(false)
  const prevStepIndexRef = useRef<number | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isBillingPage = pathname === '/billing' || pathname === '/dashboard/billing'
  const tab = searchParams.get('tab')
  const steps = useMemo(
    () => pageTours.find((tour) => tour.match(pathname, tab))?.steps ?? [],
    [pathname, tab]
  )
  const current = steps.length > 0 ? steps[Math.min(stepIndex, steps.length - 1)] : null

  useEffect(() => {
    setStepIndex(0)
  }, [pathname, tab])

  useEffect(() => {
    const openTour = () => {
      if (steps.length === 0) return
      setStepIndex(0)
      setOpen(true)
    }
    window.addEventListener('open-page-tour', openTour)
    return () => window.removeEventListener('open-page-tour', openTour)
  }, [steps.length])

  useEffect(() => {
    if (!hasActiveSubscription || isBillingPage || !autoOpen || hasAutoOpened || steps.length === 0) return
    setOpen(true)
    setHasAutoOpened(true)
    void fetch('/api/setup-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen: true }),
    })
  }, [autoOpen, hasActiveSubscription, hasAutoOpened, isBillingPage, steps.length])

  useEffect(() => {
    if (!open) {
      prevStepIndexRef.current = null
      dispatchTourAction('close-showcase-settings-tour')
      return
    }

    const prevIndex = prevStepIndexRef.current
    if (prevIndex !== null && prevIndex !== stepIndex) {
      const previousStep = steps[prevIndex]
      if (previousStep?.leaveAction) dispatchTourAction(previousStep.leaveAction)
    }

    if (current?.enterAction) dispatchTourAction(current.enterAction)
    prevStepIndexRef.current = stepIndex
  }, [open, stepIndex, steps, current?.enterAction])

  useEffect(() => {
    if (!open || !current) return
    const update = () => {
      const nextRect = getRect(current.selector)
      setRect(nextRect)
      if (nextRect) {
        document.querySelector(current.selector)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
      }
    }
    update()
    const timer = window.setTimeout(update, 250)
    const actionTimer = current.enterAction ? window.setTimeout(update, 500) : null
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.clearTimeout(timer)
      if (actionTimer) window.clearTimeout(actionTimer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, current])

  if (!hasActiveSubscription || isBillingPage) return null

  const closeTour = async (completed = false) => {
    dispatchTourAction('close-showcase-settings-tour')
    setOpen(false)
    await fetch('/api/setup-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen: true, completed }),
    }).catch(() => undefined)
  }

  const highlightStyle = rect
    ? {
        left: Math.max(8, rect.left - 8),
        top: Math.max(8, rect.top - 8),
        width: rect.width + 16,
        height: rect.height + 16,
      }
    : null

  const bubbleStyle = rect
    ? {
        left: Math.min(window.innerWidth - 360, Math.max(16, rect.left)),
        top: rect.bottom + 18 > window.innerHeight - 220 ? Math.max(16, rect.top - 210) : rect.bottom + 18,
      }
    : {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }

  if (steps.length === 0) return null

  const tourOverlay = open && current && mounted ? (() => {
    const missingTargetHint = !rect ? getMissingTargetHint(pathname, current) : null
    return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      <div className="absolute inset-0 bg-slate-950/65" aria-hidden="true" />
      {highlightStyle && (
        <div
          className="absolute rounded-xl border-2 border-emerald-400 bg-white/10 shadow-[0_0_0_9999px_rgba(2,6,23,0.62)] transition-all pointer-events-none"
          style={highlightStyle}
          aria-hidden="true"
        />
      )}
      <div
        className="pointer-events-auto absolute z-[201] w-[min(340px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-4 shadow-2xl"
        style={bubbleStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Step {stepIndex + 1} of {steps.length}
            </p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">{current.title}</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void closeTour(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{current.body}</p>
        {current.bullets && current.bullets.length > 0 && (
          <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">
            {current.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}
        {!rect && missingTargetHint && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {missingTargetHint}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            disabled={stepIndex === 0}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          {stepIndex === steps.length - 1 ? (
            <Button size="sm" onClick={() => void closeTour(true)}>
              Finish
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}>
              Next
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
    )
  })() : null

  return (
    <>
      <Button
        type="button"
        size="icon"
        className="fixed bottom-4 left-4 z-40 h-11 w-11 rounded-full shadow-lg lg:bottom-6 lg:left-72"
        onClick={() => {
          setStepIndex(0)
          setOpen(true)
        }}
        title="Page tutorial"
      >
        <HelpCircle className="h-5 w-5" />
      </Button>

      {tourOverlay && createPortal(tourOverlay, document.body)}
    </>
  )
}
