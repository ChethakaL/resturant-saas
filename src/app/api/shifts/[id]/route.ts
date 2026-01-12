import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

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

    const calculateHours = (startTime: string, endTime: string) => {
      const [startHour, startMin] = startTime.split(':').map(Number)
      const [endHour, endMin] = endTime.split(':').map(Number)

      let hours = endHour - startHour
      let minutes = endMin - startMin

      if (minutes < 0) {
        hours -= 1
        minutes += 60
      }

      return hours + minutes / 60
    }

    const updateData: any = {}
    if (data.startTime) updateData.startTime = data.startTime
    if (data.endTime) updateData.endTime = data.endTime
    if (data.notes !== undefined) updateData.notes = data.notes

    if (data.startTime || data.endTime) {
      const shift = await prisma.shift.findUnique({
        where: { id: params.id },
      })
      if (shift) {
        updateData.hoursWorked = calculateHours(
          data.startTime || shift.startTime,
          data.endTime || shift.endTime
        )
      }
    }

    const shift = await prisma.shift.update({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      data: updateData,
      include: {
        employee: true,
      },
    })

    return NextResponse.json(shift)
  } catch (error: any) {
    console.error('Error updating shift:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update shift' },
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

    await prisma.shift.delete({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting shift:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete shift' },
      { status: 500 }
    )
  }
}
