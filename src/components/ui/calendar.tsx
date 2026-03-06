import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type CalendarProps = {
  locale?: 'en' | 'ku' | 'ar-fusha'
  month: Date
  selected?: Date | null
  onSelect: (date: Date) => void
  onMonthChange: (date: Date) => void
  className?: string
}

export default function Calendar({
  locale = 'en',
  month,
  selected,
  onSelect,
  onMonthChange,
  className,
}: CalendarProps) {
  const intlLocale = locale === 'ar-fusha' ? 'ar' : locale === 'ku' ? 'ku' : 'en'
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(intlLocale, { weekday: 'short' }).format(
      addDays(startOfWeek(new Date(2026, 0, 4)), index)
    )
  )

  const rows: JSX.Element[] = []
  let days: JSX.Element[] = []
  let day = startDate

  while (day <= endDate) {
    for (let i = 0; i < 7; i += 1) {
      const cloneDay = day
      const isCurrentMonth = isSameMonth(day, monthStart)
      const isSelected = selected ? isSameDay(day, selected) : false

      days.push(
        <button
          key={day.toISOString()}
          type="button"
          onClick={() => onSelect(cloneDay)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md text-sm transition',
            isCurrentMonth ? 'text-slate-900' : 'text-slate-400',
            isSelected ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
          )}
          aria-selected={isSelected}
        >
          {format(day, 'd')}
        </button>
      )
      day = addDays(day, 1)
    }

    rows.push(
      <div key={day.toISOString()} className="grid grid-cols-7 gap-1">
        {days}
      </div>
    )
    days = []
  }

  return (
    <div className={cn('w-[280px] space-y-3 rounded-md bg-white p-2', className)}>
      <div className="flex items-center justify-between px-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMonthChange(subMonths(month, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold text-slate-900">
          {new Intl.DateTimeFormat(intlLocale, {
            month: 'long',
            year: 'numeric',
          }).format(monthStart)}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
        {weekDays.map((dayLabel) => (
          <div key={dayLabel}>{dayLabel}</div>
        ))}
      </div>
      <div className="space-y-1">{rows}</div>
    </div>
  )
}
