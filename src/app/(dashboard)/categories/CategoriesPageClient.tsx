'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { HelpCircle, ChevronRight, ChevronLeft, X } from 'lucide-react'
import CategoriesManager, { type CategoryWithItems } from '@/components/dashboard/CategoriesManager'

const TOUR_STEPS = [
  {
    id: null as string | null,
    title: 'Welcome to Category Manager',
    body: 'This page helps you organize your menu into sections (e.g. Main Dishes, Drinks). Take a quick tour to see what each part does.',
  },
  {
    id: 'tour-ai-categorization',
    title: 'AI categorization',
    body: 'Run this to auto-assign your menu items into standard categories like Signature Dishes, Main Dishes, Shareables, Add-ons, Drinks, Desserts, Kids, and Sides. Great for a new menu or a reset.',
  },
  {
    id: 'tour-add-category',
    title: 'Add Category',
    body: 'Create a new section by name and optional description. New categories appear in the list below and on your guest menu.',
  },
  {
    id: 'tour-current-categories',
    title: 'Current Categories',
    body: 'See which dishes are in each category. You can edit category names, show or hide sections on the menu, move items between categories with the dropdown, or delete a category.',
  },
  {
    id: null as string | null,
    title: "You're all set",
    body: 'Use AI categorization to start, then tweak names and move items as needed. Categories control how your menu is organized for guests.',
  },
]

interface CategoriesPageClientProps {
  initialCategories: CategoryWithItems[]
}

export default function CategoriesPageClient({ initialCategories }: CategoriesPageClientProps) {
  const [tourOpen, setTourOpen] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  const step = TOUR_STEPS[tourStep]
  const isFirst = tourStep === 0
  const isLast = tourStep === TOUR_STEPS.length - 1

  useEffect(() => {
    if (!tourOpen || !step?.id) {
      setTargetRect(null)
      return
    }
    const el = document.querySelector(`[data-tour="${step.id}"]`)
    if (!el) {
      setTargetRect(null)
      return
    }
    const rect = el.getBoundingClientRect()
    setTargetRect(rect)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [tourOpen, tourStep, step?.id])

  // Update target rect on resize/scroll when tour is open with a target
  useEffect(() => {
    if (!tourOpen || !step?.id) return
    const el = document.querySelector(`[data-tour="${step.id}"]`)
    if (!el) return
    const onUpdate = () => setTargetRect(el.getBoundingClientRect())
    window.addEventListener('scroll', onUpdate, true)
    window.addEventListener('resize', onUpdate)
    return () => {
      window.removeEventListener('scroll', onUpdate, true)
      window.removeEventListener('resize', onUpdate)
    }
  }, [tourOpen, tourStep, step?.id])

  const goNext = () => {
    if (isLast) setTourOpen(false)
    else setTourStep((s) => s + 1)
  }

  const goBack = () => {
    if (!isFirst) setTourStep((s) => s - 1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Category Manager</h1>
          <p className="text-slate-500 mt-1">
            Create and clean up the sections that organize your menu. See which dishes are in each category and move them or edit names.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => {
            setTourOpen(true)
            setTourStep(0)
          }}
          aria-label="Start interactive tour"
        >
          <HelpCircle className="h-4 w-4" />
          Tour this page
        </Button>
      </div>

      <CategoriesManager initialCategories={initialCategories} />

      {/* Tour overlay */}
      {tourOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog" aria-label="Page tour">
          {/* Dimmed backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setTourOpen(false)}
            aria-hidden="true"
          />
          {/* Highlight ring around current target */}
          {targetRect && step?.id && (
            <div
              className="absolute pointer-events-none rounded-xl ring-4 ring-emerald-400 ring-offset-4 ring-offset-transparent bg-transparent transition-all duration-200"
              style={{
                left: targetRect.left - 8,
                top: targetRect.top - 8,
                width: targetRect.width + 16,
                height: targetRect.height + 16,
              }}
              aria-hidden="true"
            />
          )}
          {/* Tooltip card */}
          <div
            className="relative z-10 mx-4 w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="text-lg font-semibold text-slate-900">{step?.title}</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 -mr-2 -mt-1"
                onClick={() => setTourOpen(false)}
                aria-label="Close tour"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-slate-600 mb-5">{step?.body}</p>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {!isFirst && (
                  <Button type="button" variant="outline" size="sm" onClick={goBack} className="gap-1">
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>
                )}
              </div>
              <Button type="button" size="sm" onClick={goNext} className="gap-1">
                {isLast ? 'Finish' : 'Next'}
                {!isLast && <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-center text-xs text-slate-400 mt-3">
              {tourStep + 1} of {TOUR_STEPS.length}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
