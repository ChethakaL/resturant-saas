import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const chefPicks = await prisma.chefPick.findMany({
      where: { restaurantId: session.user.restaurantId },
      orderBy: { displayOrder: 'asc' },
    })

    return NextResponse.json(chefPicks)
  } catch (error) {
    console.error('Error fetching chef picks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chef picks' },
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

    const body = await request.json()
    const menuItemId = body?.menuItemId
    if (!menuItemId) {
      return NextResponse.json(
        { error: 'menuItemId is required' },
        { status: 400 }
      )
    }

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        id: menuItemId,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!menuItem) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      )
    }

    const existing = await prisma.chefPick.findFirst({
      where: {
        menuItemId,
        restaurantId: session.user.restaurantId,
      },
    })

    if (existing) {
      return NextResponse.json(existing)
    }

    const lastPick = await prisma.chefPick.findFirst({
      where: { restaurantId: session.user.restaurantId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    })
    const nextOrder = (lastPick?.displayOrder ?? 0) + 1

    const chefPick = await prisma.chefPick.create({
      data: {
        restaurantId: session.user.restaurantId,
        menuItemId,
        displayOrder: nextOrder,
      },
    })

    revalidatePath('/')

    return NextResponse.json(chefPick)
  } catch (error) {
    console.error('Error creating chef pick:', error)
    return NextResponse.json(
      { error: 'Failed to create chef pick' },
      { status: 500 }
    )
  }
}
