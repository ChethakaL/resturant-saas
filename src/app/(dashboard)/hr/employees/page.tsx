import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getServerTranslations } from '@/lib/i18n/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Mail, Phone, Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { redirect } from 'next/navigation'

async function getEmployees(restaurantId: string) {
  const employees = await prisma.employee.findMany({
    where: { restaurantId },
    include: {
      _count: {
        select: {
          sales: true,
          shifts: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return employees
}

function getPositionColor(position: string) {
  switch (position) {
    case 'WAITER':
      return 'bg-blue-100 text-blue-800'
    case 'CHEF':
      return 'bg-purple-100 text-purple-800'
    case 'KITCHEN_STAFF':
      return 'bg-green-100 text-green-800'
    case 'CASHIER':
      return 'bg-amber-100 text-amber-800'
    case 'MANAGER':
      return 'bg-red-100 text-red-800'
    case 'CLEANER':
      return 'bg-slate-100 text-slate-800'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

export default async function EmployeesPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId
  if (session!.user.role === 'STAFF') {
    redirect('/dashboard/orders')
  }

  const employees = await getEmployees(restaurantId)

  const activeEmployees = employees.filter((e) => e.isActive)
  const stats = {
    total: employees.length,
    active: activeEmployees.length,
    waiters: activeEmployees.filter((e) => e.position === 'WAITER').length,
    chefs: activeEmployees.filter((e) => e.position === 'CHEF').length,
  }

  const { t } = await getServerTranslations()

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t.hr_employees_title}</h1>
          <p className="text-slate-500 mt-1">{t.hr_employees_subtitle}</p>
        </div>
        <Button asChild>
          <Link href="/hr/employees/new">
            <Plus className="mr-2 h-4 w-4" />
            {t.hr_add_employee}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Staff</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Waiters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.waiters}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-600">Chefs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.chefs}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {employees.map((employee) => (
          <Link key={employee.id} href={`/hr/employees/${employee.id}`}>
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer ${!employee.isActive ? 'opacity-60' : ''}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{employee.name}</CardTitle>
                    <span className={`inline-block mt-2 px-2 py-1 rounded text-xs font-semibold ${getPositionColor(employee.position)}`}>
                      {employee.position.replace('_', ' ')}
                    </span>
                  </div>
                  {!employee.isActive && (
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                      Inactive
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {employee.email && (
                    <div className="flex items-center text-sm text-slate-600">
                      <Mail className="mr-2 h-4 w-4" />
                      {employee.email}
                    </div>
                  )}
                  {employee.phone && (
                    <div className="flex items-center text-sm text-slate-600">
                      <Phone className="mr-2 h-4 w-4" />
                      {employee.phone}
                    </div>
                  )}
                  <div className="flex items-center text-sm text-slate-600">
                    <Calendar className="mr-2 h-4 w-4" />
                    Joined {new Date(employee.hireDate).toLocaleDateString()}
                  </div>

                  <div className="pt-3 border-t mt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Salary:</span>
                      <span className="font-bold">
                        {formatCurrency(employee.salary)}
                        <span className="text-xs text-slate-500 ml-1">
                          /{employee.salaryType.toLowerCase()}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-slate-600">
                    <div>
                      Orders: <span className="font-semibold text-slate-900">{employee._count.sales}</span>
                    </div>
                    <div>
                      Shifts: <span className="font-semibold text-slate-900">{employee._count.shifts}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {employees.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-slate-500 mb-4">No employees found. Add your first employee to get started.</p>
            <Button asChild>
              <Link href="/hr/employees/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
