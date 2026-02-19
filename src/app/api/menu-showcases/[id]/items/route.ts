import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: showcaseId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const showcase = await prisma.menuShowcase.findFirst({
      where: { id: showcaseId, restaurantId: session.user.restaurantId },
    })

    if (!showcase) {
      return NextResponse.json(
        { error: 'Showcase not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const rawItems: Array<{ menuItemId: string; displayOrder: number }> =
      body.items || []

    // Dedupe by menuItemId (keep first occurrence) to avoid unique constraint on (showcaseId, menuItemId)
    const seen = new Set<string>()
    const items = rawItems.filter((item) => {
      if (seen.has(item.menuItemId)) return false
      seen.add(item.menuItemId)
      return true
    })

    await prisma.$transaction(async (tx) => {
      await tx.menuShowcaseItem.deleteMany({
        where: { showcaseId },
      })
      if (items.length > 0) {
        await tx.menuShowcaseItem.createMany({
          data: items.map((item) => ({
            showcaseId,
            menuItemId: item.menuItemId,
            displayOrder: item.displayOrder,
          })),
          skipDuplicates: true,
        })
      }
    })

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
