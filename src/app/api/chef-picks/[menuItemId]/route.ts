import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function DELETE(
  _request: Request,
  { params }: { params: { menuItemId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.chefPick.deleteMany({
      where: {
        restaurantId: session.user.restaurantId,
        menuItemId: params.menuItemId,
      },
    })

    revalidatePath('/')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting chef pick:', error)
    return NextResponse.json(
      { error: 'Failed to delete chef pick' },
      { status: 500 }
    )
  }
}
