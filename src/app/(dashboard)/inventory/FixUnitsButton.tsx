'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ConversionPlanItem } from '@/app/api/inventory/normalize-units/route'

interface Props {
  badUnitCount: number
}

export default function FixUnitsButton({ badUnitCount }: Props) {
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState<ConversionPlanItem[] | null>(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState<number | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  if (applied !== null) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3 text-sm text-emerald-800">
        <Check className="h-4 w-4 shrink-0" />
        <span>
          <strong>{applied}</strong> ingredient{applied !== 1 ? 's' : ''} updated to standard units (g, kg, ml, L).
          Refresh the page to see the changes.
        </span>
        <button
          className="ml-auto text-xs underline underline-offset-2"
          onClick={() => window.location.reload()}
        >
          Refresh
        </button>
      </div>
    )
  }

  const fetchPlan = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inventory/normalize-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: false }),
      })
      const data = await res.json()
      setPlan(data.plan ?? [])
    } finally {
      setLoading(false)
    }
  }

  const applyFix = async () => {
    setApplying(true)
    try {
      const res = await fetch('/api/inventory/normalize-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const data = await res.json()
      setApplied(data.applied ?? 0)
    } finally {
      setApplying(false)
    }
  }

  if (plan === null) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          <strong>{badUnitCount}</strong> ingredient{badUnitCount !== 1 ? 's have' : ' has'} non-standard units
          (e.g. cups, tbsp, tsp). Only g, kg, ml, and L are allowed.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-400 text-amber-900 hover:bg-amber-100"
          onClick={fetchPlan}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          Preview fix
        </Button>
      </div>
    )
  }

  const canConvert = plan.filter((p) => p.canConvert)
  const cannotConvert = plan.filter((p) => !p.canConvert)

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Unit conversion plan
        </div>
        <button
          className="text-xs text-amber-700 underline underline-offset-2 flex items-center gap-1"
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showDetails ? 'Hide details' : 'Show details'}
        </button>
      </div>

      <p className="text-amber-800">
        <strong>{canConvert.length}</strong> ingredient{canConvert.length !== 1 ? 's' : ''} can be auto-converted.
        {cannotConvert.length > 0 && (
          <> <strong>{cannotConvert.length}</strong> will need manual updating.</>
        )}
      </p>

      {showDetails && (
        <div className="rounded border border-amber-200 bg-white divide-y divide-amber-100 max-h-56 overflow-y-auto text-xs">
          {plan.map((item) => (
            <div key={item.id} className={`px-3 py-2 flex items-center gap-2 ${item.canConvert ? '' : 'bg-amber-50/60'}`}>
              <span className="flex-1 font-medium text-slate-700">{item.name}</span>
              {item.canConvert ? (
                <span className="text-slate-500">
                  {item.oldUnit} → <strong>{item.newUnit}</strong>
                  &nbsp;·&nbsp;cost: {item.oldCostPerUnit} → <strong>{Math.round(item.newCostPerUnit)}</strong>
                </span>
              ) : (
                <span className="text-amber-700">⚠ {item.note}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canConvert.length > 0 && (
          <Button
            size="sm"
            onClick={applyFix}
            disabled={applying}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
            Apply to {canConvert.length} ingredient{canConvert.length !== 1 ? 's' : ''}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-amber-700"
          onClick={() => setPlan(null)}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
