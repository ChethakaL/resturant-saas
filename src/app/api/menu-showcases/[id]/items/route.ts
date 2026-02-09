import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const showcase = await prisma.menuShowcase.findFirst({
      where: { id: params.id, restaurantId: session.user.restaurantId },
    })

    if (!showcase) {
      return NextResponse.json(
        { error: 'Showcase not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const items: Array<{ menuItemId: string; displayOrder: number }> =
      body.items || []

    await prisma.$transaction([
      prisma.menuShowcaseItem.deleteMany({
        where: { showcaseId: params.id },
      }),
      ...items.map((item) =>
        prisma.menuShowcaseItem.create({
          data: {
            showcaseId: params.id,
            menuItemId: item.menuItemId,
            displayOrder: item.displayOrder,
          },
        })
      ),
    ])

    revalidatePath('/')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating showcase items:', error)
    return NextResponse.json(
      { error: 'Failed to update showcase items' },
      { status: 500 }
    )
  }
}
