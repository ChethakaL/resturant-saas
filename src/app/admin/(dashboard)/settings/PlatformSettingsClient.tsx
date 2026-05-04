'use client'

import { useState, useEffect, useCallback } from 'react'

interface ConfigState {
  // AI Keys
  geminiApiKey: string
  openaiApiKey: string
  anthropicApiKey: string

  // Pricing
  priceMonthly: string
  priceAnnual: string
  priceBranch: string
  referralDiscountAmount: string
}

const DEFAULTS: ConfigState = {
  geminiApiKey: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  priceMonthly: '59',
  priceAnnual: '590',
  priceBranch: '10',
  referralDiscountAmount: '10',
}

type SectionKey = 'ai' | 'pricing'

export default function PlatformSettingsClient() {
  const [config, setConfig] = useState<ConfigState>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SectionKey>('ai')

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/platform-config')
      const data = await res.json()
      const c = data.config ?? {}
      setConfig({
        geminiApiKey: (c.geminiApiKey as string) ?? '',
        openaiApiKey: (c.openaiApiKey as string) ?? '',
        anthropicApiKey: (c.anthropicApiKey as string) ?? '',
        priceMonthly: String(c.priceMonthly ?? '59'),
        priceAnnual: String(c.priceAnnual ?? '590'),
        priceBranch: String(c.priceBranch ?? '10'),
        referralDiscountAmount: String(c.referralDiscountAmount ?? '10'),
      })
    } catch {
      setError('Failed to load platform configuration.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updates: Record<string, unknown> = {}
      // Only save keys that are not masked (i.e. user typed a new value)
      if (config.geminiApiKey && !isMaskedValue(config.geminiApiKey)) updates.geminiApiKey = config.geminiApiKey
      if (config.openaiApiKey && !isMaskedValue(config.openaiApiKey)) updates.openaiApiKey = config.openaiApiKey
      if (config.anthropicApiKey && !isMaskedValue(config.anthropicApiKey)) updates.anthropicApiKey = config.anthropicApiKey
      updates.priceMonthly = Number(config.priceMonthly) || 59
      updates.priceAnnual = Number(config.priceAnnual) || 590
      updates.priceBranch = Number(config.priceBranch) || 10
      updates.referralDiscountAmount = Number(config.referralDiscountAmount) || 10

      const res = await fetch('/api/admin/platform-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      fetchConfig()
    } catch {
      setError('Failed to save configuration. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof ConfigState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, [key]: e.target.value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure platform-wide API keys and subscription pricing. Values saved here override the <code className="bg-slate-100 px-1 rounded text-xs">.env</code> file at runtime.
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(['ai', 'pricing'] as SectionKey[]).map((s) => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeSection === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {s === 'ai' ? '🤖 AI API Keys' : '💰 Subscription Pricing'}
          </button>
        ))}
      </div>

      {/* AI Keys Section */}
      {activeSection === 'ai' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-semibold text-slate-900">AI API Keys</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Stored securely in the database. Keys are shown as <code className="bg-slate-100 px-1 rounded">first4••••last4</code> once saved. Leave a field blank to keep the existing value.
            </p>
          </div>
          <div className="p-6 space-y-5">
            <ApiKeyField
              label="Google Gemini API Key"
              description="Used for AI menu descriptions, image analysis, and chat."
              id="geminiApiKey"
              value={config.geminiApiKey}
              onChange={set('geminiApiKey')}
              placeholder="AIza..."
            />
            <ApiKeyField
              label="OpenAI API Key"
              description="Used for GPT-based features and embeddings."
              id="openaiApiKey"
              value={config.openaiApiKey}
              onChange={set('openaiApiKey')}
              placeholder="sk-proj-..."
            />
            <ApiKeyField
              label="Anthropic Claude API Key"
              description="Used for monthly sales analysis and advanced reasoning tasks."
              id="anthropicApiKey"
              value={config.anthropicApiKey}
              onChange={set('anthropicApiKey')}
              placeholder="sk-ant-api03-..."
            />
          </div>
        </div>
      )}

      {/* Pricing Section */}
      {activeSection === 'pricing' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-semibold text-slate-900">Subscription Pricing</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Set the subscription prices shown to restaurant owners. Changes take effect immediately for new checkout sessions.
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <PriceField
                label="Monthly Price"
                description="Base monthly subscription (USD)"
                id="priceMonthly"
                value={config.priceMonthly}
                onChange={set('priceMonthly')}
                suffix="/month"
              />
              <PriceField
                label="Annual Price"
                description="Base annual subscription (USD)"
                id="priceAnnual"
                value={config.priceAnnual}
                onChange={set('priceAnnual')}
                suffix="/year"
              />
              <PriceField
                label="Branch Add-on Price"
                description="Per additional branch per month (USD)"
                id="priceBranch"
                value={config.priceBranch}
                onChange={set('priceBranch')}
                suffix="/month"
              />
              <PriceField
                label="Referral Discount"
                description="Discount amount applied with a referral code (USD)"
                id="referralDiscountAmount"
                value={config.referralDiscountAmount}
                onChange={set('referralDiscountAmount')}
                suffix="off/month"
              />
            </div>

            {/* Live pricing preview */}
            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Live Pricing Preview</p>
              <div className="flex flex-wrap gap-4">
                <PricePill label="Standard Monthly" amount={`$${config.priceMonthly}/mo`} color="blue" />
                <PricePill label="With Referral" amount={`$${Number(config.priceMonthly) - Number(config.referralDiscountAmount)}/mo`} color="green" />
                <PricePill label="Annual" amount={`$${config.priceAnnual}/yr`} color="purple" />
                <PricePill label="Extra Branch" amount={`+$${config.priceBranch}/mo`} color="amber" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Bar */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 -mx-6 flex items-center justify-between gap-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-600 font-medium">✓ Changes saved successfully</p>}
        {!error && !saved && <p className="text-sm text-slate-400">Changes take effect immediately after saving.</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors ml-auto"
        >
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if a value looks like a masked key (first4••••last4 pattern). */
function isMaskedValue(value: string): boolean {
  return /^.{4}•+.{4}$/.test(value)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ApiKeyField({
  label, description, id, value, onChange, placeholder,
}: {
  label: string
  description: string
  id: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder: string
}) {
  const masked = isMaskedValue(value)
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-0.5">{label}</label>
      <p className="text-xs text-slate-400 mb-2">{description}</p>
      <input
        id={id}
        type="text"
        value={value}
        onChange={onChange}
        placeholder={masked ? '(saved — type a new value to replace)' : placeholder}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
      />
      {masked && (
        <p className="text-[11px] text-amber-600 mt-1">
          ⚠ Key is saved. Enter a new value to replace it, or leave as-is to keep the existing key.
        </p>
      )}
    </div>
  )
}

function PriceField({
  label, description, id, value, onChange, suffix,
}: {
  label: string
  description: string
  id: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  suffix: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-0.5">{label}</label>
      <p className="text-xs text-slate-400 mb-2">{description}</p>
      <div className="flex items-center gap-2">
        <span className="text-slate-500 text-sm">$</span>
        <input
          id={id}
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={onChange}
          className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <span className="text-slate-400 text-sm">{suffix}</span>
      </div>
    </div>
  )
}

function PricePill({ label, amount, color }: { label: string; amount: string; color: 'blue' | 'green' | 'purple' | 'amber' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  return (
    <div className={`border rounded-lg px-3 py-2 text-center min-w-[110px] ${colors[color]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-base font-bold">{amount}</p>
    </div>
  )
}
