import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getServerTranslations } from '@/lib/i18n/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, CheckCircle, Clock, XCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { redirect } from 'next/navigation'

async function getPayrolls(restaurantId: string) {
  const payrolls = await prisma.payroll.findMany({
    where: { restaurantId },
    include: {
      employee: true,
    },
    orderBy: { period: 'desc' },
    take: 50,
  })

  return payrolls
}

function getStatusColor(status: string) {
  switch (status) {
    case 'PAID':
      return 'bg-green-100 text-green-800'
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800'
    case 'CANCELLED':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'PAID':
      return CheckCircle
    case 'PENDING':
      return Clock
    case 'CANCELLED':
      return XCircle
    default:
      return Clock
  }
}

export default async function PayrollPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId
  if (session!.user.role === 'STAFF') {
    redirect('/dashboard/orders')
  }

  const [payrolls, restaurant] = await Promise.all([
    getPayrolls(restaurantId),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { currency: true } }),
  ])
  const currency = restaurant?.currency ?? 'IQD'

  const stats = {
    total: payrolls.length,
    pending: payrolls.filter((p) => p.status === 'PENDING').length,
    paid: payrolls.filter((p) => p.status === 'PAID').length,
    totalPending: payrolls
      .filter((p) => p.status === 'PENDING')
      .reduce((sum, p) => sum + p.totalPaid, 0),
  }

  const currentMonth = new Date().toISOString().slice(0, 7)

  const { t } = await getServerTranslations()

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t.hr_payroll_title}</h1>
          <p className="text-slate-500 mt-1">{t.hr_payroll_subtitle}</p>
        </div>
        <Button asChild>
          <Link href="/hr/payroll/generate">
            <Plus className="mr-2 h-4 w-4" />
            Generate Payroll
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.paid}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Amount Due</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.totalPending, currency)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {payrolls.map((payroll) => {
              const StatusIcon = getStatusIcon(payroll.status)
              return (
                <div
                  key={payroll.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <StatusIcon className={`h-5 w-5 ${payroll.status === 'PAID' ? 'text-green-600' :
                        payroll.status === 'PENDING' ? 'text-yellow-600' :
                          'text-red-600'
                      }`} />
                    <div>
                      <div className="font-medium">{payroll.employee.name}</div>
                      <div className="text-sm text-slate-500">
                        {payroll.employee.position.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm text-slate-600">Period</div>
                      <div className="font-medium">
                        {new Date(payroll.period).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-slate-600">Base Salary</div>
                      <div className="font-medium">{formatCurrency(payroll.baseSalary, currency)}</div>
                    </div>

                    {payroll.bonuses > 0 && (
                      <div className="text-right">
                        <div className="text-sm text-slate-600">Bonuses</div>
                        <div className="font-medium text-green-600">
                          +{formatCurrency(payroll.bonuses, currency)}
                        </div>
                      </div>
                    )}

                    {payroll.deductions > 0 && (
                      <div className="text-right">
                        <div className="text-sm text-slate-600">Deductions</div>
                        <div className="font-medium text-red-600">
                          -{formatCurrency(payroll.deductions, currency)}
                        </div>
                      </div>
                    )}

                    <div className="text-right min-w-[120px]">
                      <div className="text-sm text-slate-600">Total Paid</div>
                      <div className="text-lg font-bold text-green-600">
                        {formatCurrency(payroll.totalPaid, currency)}
                      </div>
                    </div>

                    <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getStatusColor(payroll.status)}`}>
                      {payroll.status}
                    </span>

                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/hr/payroll/${payroll.id}`}>View</Link>
                    </Button>
                  </div>
                </div>
              )
            })}

            {payrolls.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <p className="mb-4">No payroll records found.</p>
                <Button asChild>
                  <Link href="/hr/payroll/generate">
                    <Plus className="mr-2 h-4 w-4" />
                    Generate First Payroll
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
