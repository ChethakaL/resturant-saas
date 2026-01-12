import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Calendar as CalendarIcon, Clock, Users } from 'lucide-react'
import { redirect } from 'next/navigation'

async function getShifts(restaurantId: string) {
  const startOfWeek = new Date()
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(endOfWeek.getDate() + 7)

  const shifts = await prisma.shift.findMany({
    where: {
      restaurantId,
      date: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
    },
    include: {
      employee: true,
    },
    orderBy: {
      date: 'asc',
    },
  })

  const employees = await prisma.employee.findMany({
    where: {
      restaurantId,
      isActive: true,
    },
    orderBy: {
      name: 'asc',
    },
  })

  return { shifts, employees, startOfWeek, endOfWeek }
}

export default async function ShiftsPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId
  if (session!.user.role === 'STAFF') {
    redirect('/dashboard/orders')
  }

  const { shifts, employees } = await getShifts(restaurantId)

  const stats = {
    totalShifts: shifts.length,
    totalHours: shifts.reduce((sum, s) => sum + (s.hoursWorked || 0), 0),
    uniqueEmployees: new Set(shifts.map(s => s.employeeId)).size,
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())

  const weekDays = days.map((day, idx) => {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + idx)
    return {
      name: day,
      date: date,
      dateStr: date.toISOString().split('T')[0],
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Shift Schedule</h1>
          <p className="text-slate-500 mt-1">Manage employee work schedules</p>
        </div>
        <Button asChild>
          <Link href="/hr/shifts/schedule">
            <Plus className="mr-2 h-4 w-4" />
            Schedule Shift
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Shifts This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalShifts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Total Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalHours.toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Staff Scheduled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.uniqueEmployees}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This Week's Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {weekDays.map((day) => {
              const dayShifts = shifts.filter(
                (s) => s.date.toISOString().split('T')[0] === day.dateStr
              )
              const isToday = day.dateStr === today.toISOString().split('T')[0]

              return (
                <div key={day.dateStr} className={`border-l-4 pl-4 ${isToday ? 'border-blue-500' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className={`font-bold ${isToday ? 'text-blue-600' : 'text-slate-900'}`}>
                        {day.name}
                        {isToday && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Today</span>}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <span className="text-sm text-slate-600">{dayShifts.length} shifts</span>
                  </div>

                  {dayShifts.length > 0 ? (
                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {dayShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="p-3 border rounded-lg bg-white hover:shadow-md transition-shadow"
                        >
                          <div className="font-medium">{shift.employee.name}</div>
                          <div className="text-sm text-slate-600">{shift.employee.position.replace('_', ' ')}</div>
                          <div className="flex items-center gap-2 mt-2 text-sm">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span>{shift.startTime} - {shift.endTime}</span>
                            <span className="text-slate-400">({shift.hoursWorked?.toFixed(1)}h)</span>
                          </div>
                          {shift.notes && (
                            <div className="mt-2 text-xs text-slate-500 italic">{shift.notes}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400 border border-dashed rounded-lg">
                      No shifts scheduled
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {shifts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-slate-500 mb-4">No shifts scheduled yet.</p>
            <Button asChild>
              <Link href="/hr/shifts/schedule">
                <Plus className="mr-2 h-4 w-4" />
                Schedule First Shift
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
