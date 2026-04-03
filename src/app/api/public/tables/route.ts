import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get('restaurantId')

    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not specified' }, { status: 400 })
    }

    const tables = await prisma.table.findMany({
      where: { restaurantId },
      select: {
        id: true,
        number: true,
        status: true,
      },
      orderBy: { number: 'asc' },
    })

    return NextResponse.json(tables, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Error fetching public tables:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tables' },
      { status: 500 }
    )
  }
}
