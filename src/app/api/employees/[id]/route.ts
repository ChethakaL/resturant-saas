import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const employee = await prisma.employee.findUnique({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      include: {
        sales: {
          include: {
            items: {
              include: {
                menuItem: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
        shifts: {
          orderBy: {
            date: 'desc',
          },
          take: 30,
        },
        payrolls: {
          orderBy: {
            period: 'desc',
          },
          take: 12,
        },
      },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    return NextResponse.json(employee)
  } catch (error) {
    console.error('Error fetching employee:', error)
    return NextResponse.json(
      { error: 'Failed to fetch employee' },
      { status: 500 }
    )
  }
}

import bcrypt from 'bcryptjs'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    const updateData: { name?: string; position?: string; phone?: string; email?: string; salary?: number; salaryType?: string; isActive?: boolean; password?: string } = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.position !== undefined) updateData.position = data.position
    if (data.phone !== undefined) updateData.phone = data.phone
    if (data.email !== undefined) updateData.email = data.email
    if (data.salary !== undefined) updateData.salary = data.salary
    if (data.salaryType !== undefined) updateData.salaryType = data.salaryType
    if (data.isActive !== undefined) updateData.isActive = data.isActive

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10)
    }

    const employee = await prisma.employee.update({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      data: updateData,
    })

    return NextResponse.json(employee)
  } catch (error: any) {
    console.error('Error updating employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update employee' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Soft delete by setting isActive to false
    await prisma.employee.update({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      data: {
        isActive: false,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete employee' },
      { status: 500 }
    )
  }
}
