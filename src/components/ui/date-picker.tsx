import { useEffect, useMemo, useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'

import Calendar from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const parseDateInput = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

const formatDateInput = (date: Date) =>
  format(date, 'yyyy-MM-dd')

type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

export default function DatePicker({
  value,
  onChange,
  className,
  placeholder = 'Select date',
}: DatePickerProps) {
  const parsedValue = useMemo(() => parseDateInput(value), [value])
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(parsedValue || new Date())

  useEffect(() => {
    if (parsedValue) {
      setMonth(parsedValue)
    }
  }, [parsedValue])

  const displayValue = parsedValue ? format(parsedValue, 'MMM dd, yyyy') : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            !parsedValue && 'text-slate-400',
            className
          )}
        >
          <span>{displayValue}</span>
          <CalendarIcon className="h-4 w-4 text-slate-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Calendar
          month={month}
          selected={parsedValue}
          onMonthChange={setMonth}
          onSelect={(date) => {
            onChange(formatDateInput(date))
            setMonth(date)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
