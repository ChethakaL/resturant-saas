import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    const restaurantId = session?.user?.restaurantId

    if (!restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { settings: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    const currentSettings = (restaurant.settings as Record<string, unknown>) || {}
    const resetSettings = {
      managementLanguage: (currentSettings.managementLanguage as string) || 'en',
      menuTimezone: (currentSettings.menuTimezone as string) || 'Asia/Baghdad',
      tableOrderingEnabled: currentSettings.tableOrderingEnabled !== false,
      showKurdishOnMenu: currentSettings.showKurdishOnMenu !== false,
      showArabicOnMenu: currentSettings.showArabicOnMenu !== false,
      onboardingComplete: false,
    }

    await prisma.$transaction(async (tx) => {
      await tx.menuEvent.deleteMany({ where: { restaurantId } })
      await tx.aIInsight.deleteMany({ where: { restaurantId } })
      await tx.dailySummary.deleteMany({ where: { restaurantId } })

      await tx.sale.deleteMany({ where: { restaurantId } })
      await tx.table.deleteMany({ where: { restaurantId } })
      await tx.branch.deleteMany({ where: { restaurantId } })

      await tx.payroll.deleteMany({ where: { restaurantId } })
      await tx.shift.deleteMany({ where: { restaurantId } })
      await tx.employee.deleteMany({ where: { restaurantId } })

      await tx.wasteRecord.deleteMany({ where: { restaurantId } })
      await tx.mealPrepSession.deleteMany({ where: { restaurantId } })
      await tx.delivery.deleteMany({ where: { restaurantId } })
      await tx.expenseTransaction.deleteMany({ where: { restaurantId } })
      await tx.expense.deleteMany({ where: { restaurantId } })

      await tx.stockRequest.deleteMany({ where: { restaurantId } })
      await tx.restaurantSupplierLink.deleteMany({ where: { restaurantId } })

      await tx.menuShowcase.deleteMany({ where: { restaurantId } })
      await tx.chefPick.deleteMany({ where: { restaurantId } })
      await tx.preppedDishStock.deleteMany({ where: { restaurantId } })
      await tx.menuItem.deleteMany({ where: { restaurantId } })
      await tx.addOn.deleteMany({ where: { restaurantId } })
      await tx.category.deleteMany({ where: { restaurantId } })
      await tx.ingredient.deleteMany({ where: { restaurantId } })

      await tx.user.updateMany({
        where: { restaurantId },
        data: {
          defaultBackgroundPrompt: null,
          defaultBackgroundImageData: null,
        },
      })

      await tx.restaurant.update({
        where: { id: restaurantId },
        data: {
          settings: resetSettings,
        },
      })
    })

    revalidatePath('/')
    revalidatePath('/dashboard')
    revalidatePath('/settings')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error resetting demo account:', error)
    return NextResponse.json(
      { error: 'Failed to reset demo account' },
      { status: 500 }
    )
  }
}
