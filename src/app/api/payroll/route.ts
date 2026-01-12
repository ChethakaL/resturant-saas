import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const period = searchParams.get('period')

    const where: any = {
      restaurantId: session.user.restaurantId,
    }

    if (status && status !== 'all') {
      where.status = status
    }

    if (period) {
      where.period = new Date(period)
    }

    const payrolls = await prisma.payroll.findMany({
      where,
      include: {
        employee: true,
      },
      orderBy: {
        period: 'desc',
      },
    })

    return NextResponse.json(payrolls)
  } catch (error) {
    console.error('Error fetching payrolls:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payrolls' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Generate payroll for specific employee or all employees
    if (data.generateForAll) {
      const employees = await prisma.employee.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          isActive: true,
        },
      })

      const payrolls = await Promise.all(
        employees.map((employee) => {
          const totalPaid = employee.salary + (data.bonuses || 0) - (data.deductions || 0)

          return prisma.payroll.create({
            data: {
              employeeId: employee.id,
              period: new Date(data.period),
              baseSalary: employee.salary,
              bonuses: data.bonuses || 0,
              deductions: data.deductions || 0,
              totalPaid,
              notes: data.notes,
              restaurantId: session.user.restaurantId,
            },
            include: {
              employee: true,
            },
          })
        })
      )

      return NextResponse.json(payrolls)
    } else {
      const employee = await prisma.employee.findUnique({
        where: { id: data.employeeId },
      })

      if (!employee) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      }

      const totalPaid = (data.baseSalary || employee.salary) + (data.bonuses || 0) - (data.deductions || 0)

      const payroll = await prisma.payroll.create({
        data: {
          employeeId: data.employeeId,
          period: new Date(data.period),
          baseSalary: data.baseSalary || employee.salary,
          bonuses: data.bonuses || 0,
          deductions: data.deductions || 0,
          totalPaid,
          notes: data.notes,
          restaurantId: session.user.restaurantId,
        },
        include: {
          employee: true,
        },
      })

      return NextResponse.json(payroll)
    }
  } catch (error: any) {
    console.error('Error creating payroll:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payroll' },
      { status: 500 }
    )
  }
}
