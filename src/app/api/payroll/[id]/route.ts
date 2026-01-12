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

    const payroll = await prisma.payroll.findUnique({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      include: {
        employee: true,
      },
    })

    if (!payroll) {
      return NextResponse.json({ error: 'Payroll not found' }, { status: 404 })
    }

    return NextResponse.json(payroll)
  } catch (error) {
    console.error('Error fetching payroll:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payroll' },
      { status: 500 }
    )
  }
}

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

    const updateData: any = {}

    if (data.status) {
      updateData.status = data.status
      if (data.status === 'PAID') {
        updateData.paidDate = new Date()
      }
    }

    if (data.bonuses !== undefined) updateData.bonuses = data.bonuses
    if (data.deductions !== undefined) updateData.deductions = data.deductions
    if (data.notes !== undefined) updateData.notes = data.notes

    if (data.bonuses !== undefined || data.deductions !== undefined) {
      const payroll = await prisma.payroll.findUnique({
        where: { id: params.id },
      })
      if (payroll) {
        updateData.totalPaid =
          payroll.baseSalary +
          (data.bonuses !== undefined ? data.bonuses : payroll.bonuses) -
          (data.deductions !== undefined ? data.deductions : payroll.deductions)
      }
    }

    const payroll = await prisma.payroll.update({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      data: updateData,
      include: {
        employee: true,
      },
    })

    return NextResponse.json(payroll)
  } catch (error: any) {
    console.error('Error updating payroll:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update payroll' },
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

    await prisma.payroll.delete({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting payroll:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete payroll' },
      { status: 500 }
    )
  }
}
