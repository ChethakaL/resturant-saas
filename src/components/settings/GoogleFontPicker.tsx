import { useState, useEffect, useRef } from 'react'
import { Check, ChevronDown, Search, Loader2 } from 'lucide-react'
import { useDynamicTranslate } from '@/lib/i18n'
import {
  GoogleFont,
  DEFAULT_FONT_SUGGESTIONS,
  googleFontUrl,
  resolveGoogleFont,
} from '@/lib/google-fonts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface GoogleFontPickerProps {
  value: string
  onChange: (value: string) => void
}

export function GoogleFontPicker({ value, onChange }: GoogleFontPickerProps) {
  const { t: td } = useDynamicTranslate()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<GoogleFont[]>(DEFAULT_FONT_SUGGESTIONS)
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const canonicalValue = resolveGoogleFont(value)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced search to /api/fonts
  useEffect(() => {
    if (!search.trim()) {
      setResults(DEFAULT_FONT_SUGGESTIONS)
      return
    }

    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/fonts?q=${encodeURIComponent(search)}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data)
        }
      } catch (err) {
        console.error('Failed to search fonts', err)
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search])

  // Get currently selected font object
  const selectedFontObj =
    results.find((r) => r.family === canonicalValue) ||
    DEFAULT_FONT_SUGGESTIONS.find((f) => f.family === canonicalValue) ||
    { family: canonicalValue, category: 'sans-serif' }

  return (
    <div className="w-full relative">
      <link href={googleFontUrl(canonicalValue)} rel="stylesheet" />
      {results.map(r => (
         <link key={r.family} href={googleFontUrl(r.family)} rel="stylesheet" />
      ))}

      <div className="relative w-full" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-slate-800" style={{ fontFamily: `"${canonicalValue}", ${selectedFontObj.category}` }}>
                {canonicalValue}
              </p>
              <p className="text-xs text-slate-400 capitalize">{selectedFontObj.category}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isOpen && (
            <div className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-xl flex flex-col max-h-80 overflow-hidden">
              
              {/* Search Bar */}
              <div className="p-2 border-b border-slate-100 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 ml-2" />
                <input
                  type="text"
                  placeholder={td('Search fonts...')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none py-2 px-1 placeholder-slate-400"
                />
                {isLoading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin mr-2" />}
              </div>

              {/* Results List */}
              <div className="flex-1 overflow-y-auto w-full">
                {results.length === 0 && !isLoading ? (
                  <div className="p-4 text-center text-sm text-slate-500">
                    {td('No fonts found')}
                  </div>
                ) : (
                  results.map((font) => (
                    <button
                      key={font.family}
                      onClick={() => {
                        onChange(font.family)
                        setIsOpen(false)
                        setSearch('')
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                        canonicalValue === font.family ? 'bg-slate-50' : ''
                      }`}
                    >
                      <span
                        className="text-xl text-slate-900 w-8"
                        style={{ fontFamily: `"${font.family}", ${font.category}` }}
                      >
                        Aa
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700" style={{ fontFamily: `"${font.family}", ${font.category}` }}>
                          {font.family}
                        </p>
                        <p className="text-[10px] text-slate-400 capitalize">{font.category}</p>
                      </div>
                      {canonicalValue === font.family && <Check className="w-4 h-4 text-slate-900" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
    </div>
  )
}
