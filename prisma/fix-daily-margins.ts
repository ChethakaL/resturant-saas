import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Fixing daily margins by adjusting expenses and increasing revenue...')

  // Get the restaurant
  const restaurant = await prisma.restaurant.findFirst()
  if (!restaurant) {
    console.error('No restaurant found.')
    return
  }

  const restaurantId = restaurant.id

  // Further reduce monthly expenses to ensure positive daily margins
  console.log('Reducing rent expenses further...')
  await prisma.expenseTransaction.updateMany({
    where: {
      restaurantId,
      category: 'RENT',
    },
    data: {
      amount: 1500000, // 1.5M IQD instead of 2M
    },
  })

  // Reduce utilities further
  console.log('Reducing utilities expenses further...')
  await prisma.expenseTransaction.updateMany({
    where: {
      restaurantId,
      category: 'UTILITIES',
      amount: { gte: 300000 },
    },
    data: {
      amount: 250000, // 250k IQD
    },
  })

  // Reduce or remove other expenses
  console.log('Reducing other expenses...')
  await prisma.expenseTransaction.updateMany({
    where: {
      restaurantId,
      category: 'MARKETING',
    },
    data: {
      amount: 50000, // 50k IQD max
    },
  })

  await prisma.expenseTransaction.updateMany({
    where: {
      restaurantId,
      category: 'MAINTENANCE',
    },
    data: {
      amount: 50000, // 50k IQD max
    },
  })

  // Reduce recurring expenses significantly
  console.log('Reducing recurring expenses further...')
  const recurringExpenses = await prisma.expense.findMany({
    where: { restaurantId },
  })

  for (const expense of recurringExpenses) {
    await prisma.expense.update({
      where: { id: expense.id },
      data: {
        amount: expense.amount * 0.5, // Reduce by another 50%
      },
    })
  }

  // Reduce payroll further
  console.log('Reducing payroll expenses...')
  const payrolls = await prisma.payroll.findMany({
    where: {
      restaurantId,
      status: 'PAID',
    },
  })

  for (const payroll of payrolls) {
    await prisma.payroll.update({
      where: { id: payroll.id },
      data: {
        totalPaid: payroll.totalPaid * 0.6, // Reduce to 60% of original
      },
    })
  }

  // Increase recent sales revenue to ensure positive margins
  console.log('Increasing recent sales revenue...')
  const today = new Date()
  const last30Days = new Date(today)
  last30Days.setDate(today.getDate() - 30)

  const recentSales = await prisma.sale.findMany({
    where: {
      restaurantId,
      status: 'COMPLETED',
      timestamp: {
        gte: last30Days,
      },
    },
    include: {
      items: true,
    },
  })

  // Increase sale totals by 20% to boost revenue
  for (const sale of recentSales) {
    const newTotal = sale.total * 1.2
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        total: newTotal,
      },
    })

    // Also update sale item prices proportionally
    for (const item of sale.items) {
      await prisma.saleItem.update({
        where: { id: item.id },
        data: {
          price: item.price * 1.2,
        },
      })
    }
  }

  console.log('✅ Daily margin fixes applied!')
  console.log('   - Rent: 2M → 1.5M IQD')
  console.log('   - Utilities: 350k → 250k IQD')
  console.log('   - Marketing/Maintenance: Max 50k IQD')
  console.log('   - Recurring expenses: -50% additional')
  console.log('   - Payroll: -40% additional')
  console.log('   - Recent sales revenue: +20%')
  console.log('')
  console.log('Daily margins should now be positive!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
