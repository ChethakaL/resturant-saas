'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface AIInsightsCardProps {
  initialContent: string | null
}

export default function AIInsightsCard({ initialContent }: AIInsightsCardProps) {
  const [content, setContent] = useState(initialContent)
  const [loading, setLoading] = useState(false)

  const generateInsights = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/insights/generate', { method: 'POST' })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate insights')
      }
      const data = await response.json()
      setContent(data.content)
    } catch (error: any) {
      console.error('Error generating insights:', error)
      alert(error.message || 'Failed to generate insights')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">AI Generated Insights</h3>
          <p className="text-sm text-slate-500">
            Quick takeaways based on the latest transactions.
          </p>
        </div>
        <Button size="sm" onClick={generateInsights} disabled={loading}>
          {loading ? 'Generating...' : 'Refresh'}
        </Button>
      </div>
      <div className="mt-4 whitespace-pre-line text-sm text-slate-700">
        {content || 'No insights yet. Click refresh to generate.'}
      </div>
    </div>
  )
}
