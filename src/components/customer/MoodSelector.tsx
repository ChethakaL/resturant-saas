'use client'

import type { MoodOption } from '@/types/menu-engine'

type LanguageCode = 'en' | 'ar' | 'ar_fusha' | 'ku'

interface MoodSelectorProps {
  moods: MoodOption[]
  language: LanguageCode
  selectedMoodId: string | null
  onSelectMood: (moodId: string | null) => void
  showAllLabel: string
  /** When false (light theme), use dark text on light buttons so they're visible. */
  isDarkTheme?: boolean
}

export function MoodSelector({
  moods,
  language,
  selectedMoodId,
  onSelectMood,
  showAllLabel,
  isDarkTheme = true,
}: MoodSelectorProps) {
  if (moods.length === 0) return null

  const getLabel = (mood: MoodOption) => mood.label[language === 'ar_fusha' ? 'ar' : language] ?? mood.label.en

  const selectedClass = 'bg-amber-500 text-white'
  const unselectedClass = isDarkTheme
    ? 'bg-white/10 text-white/90 hover:bg-white/20'
    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'

  return (
    <div className="w-full overflow-x-auto pb-2 -mx-2 px-2">
      <div className="flex gap-2 items-center min-w-max">
        <button
          type="button"
          onClick={() => onSelectMood(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedMoodId === null ? selectedClass : unselectedClass
          }`}
        >
          {showAllLabel}
        </button>
        {moods.map((mood) => (
          <button
            key={mood.id}
            type="button"
            onClick={() => onSelectMood(selectedMoodId === mood.id ? null : mood.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedMoodId === mood.id ? selectedClass : unselectedClass
            }`}
          >
            {getLabel(mood)}
          </button>
        ))}
      </div>
    </div>
  )
}
