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
    const employeeId = searchParams.get('employeeId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {
      restaurantId: session.user.restaurantId,
    }

    if (employeeId) {
      where.employeeId = employeeId
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        employee: true,
      },
      orderBy: {
        date: 'desc',
      },
    })

    return NextResponse.json(shifts)
  } catch (error) {
    console.error('Error fetching shifts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch shifts' },
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

    // Calculate hours worked
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

    const hoursWorked = calculateHours(data.startTime, data.endTime)

    const shift = await prisma.shift.create({
      data: {
        employeeId: data.employeeId,
        date: new Date(data.date),
        startTime: data.startTime,
        endTime: data.endTime,
        hoursWorked,
        notes: data.notes,
        restaurantId: session.user.restaurantId,
      },
      include: {
        employee: true,
      },
    })

    return NextResponse.json(shift)
  } catch (error: any) {
    console.error('Error creating shift:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create shift' },
      { status: 500 }
    )
  }
}
