import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const wasteRecord = await prisma.wasteRecord.findUnique({
      where: { id: params.id },
      include: {
        ingredient: true,
      },
    })

    if (!wasteRecord || wasteRecord.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Waste record not found' }, { status: 404 })
    }

    // Restore the stock (reverse the waste)
    await prisma.$transaction(async (tx) => {
      await tx.ingredient.update({
        where: { id: wasteRecord.ingredientId },
        data: {
          stockQuantity: {
            increment: wasteRecord.quantity,
          },
        },
      })

      // Delete the waste record
      await tx.wasteRecord.delete({
        where: { id: params.id },
      })

      // Note: We don't delete the expense transaction automatically
      // The user should handle that separately if needed
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting waste record:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete waste record' },
      { status: 500 }
    )
  }
}
