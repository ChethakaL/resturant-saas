import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const addOns = await prisma.addOn.findMany({
      where: { restaurantId: session.user.restaurantId },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(addOns)
  } catch (error) {
    console.error('Error fetching add-ons:', error)
    return NextResponse.json({ error: 'Failed to fetch add-ons' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, price, description } = await request.json()

    if (!name || price === undefined) {
      return NextResponse.json(
        { error: 'Name and price are required' },
        { status: 400 }
      )
    }

    const addOn = await prisma.addOn.create({
      data: {
        name,
        price: parseFloat(price),
        description: description || null,
        available: true,
        restaurantId: session.user.restaurantId,
      },
    })

    return NextResponse.json(addOn)
  } catch (error) {
    console.error('Error creating add-on:', error)
    return NextResponse.json({ error: 'Failed to create add-on' }, { status: 500 })
  }
}
