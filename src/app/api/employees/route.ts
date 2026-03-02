import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    const restaurantId = session?.user?.restaurantId
    if (!restaurantId || typeof restaurantId !== 'string' || restaurantId.trim() === '') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const position = searchParams.get('position')
    const isActive = searchParams.get('isActive')

    const where: { restaurantId: string; position?: string; isActive?: boolean } = {
      restaurantId: restaurantId.trim(),
    }

    if (position && position !== 'all') {
      where.position = position
    }

    if (isActive !== null && isActive !== 'all') {
      where.isActive = isActive === 'true'
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        _count: {
          select: {
            sales: true,
            shifts: true,
            payrolls: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(employees)
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    )
  }
}

import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    let hashedPassword = undefined
    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 10)
    }

    const employee = await prisma.employee.create({
      data: {
        name: data.name,
        position: data.position,
        phone: data.phone,
        email: data.email,
        password: hashedPassword,
        salary: data.salary,
        salaryType: data.salaryType,
        hireDate: data.hireDate ? new Date(data.hireDate) : new Date(),
        restaurantId: session.user.restaurantId,
      },
    })

    return NextResponse.json(employee)
  } catch (error: any) {
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create employee' },
      { status: 500 }
    )
  }
}
