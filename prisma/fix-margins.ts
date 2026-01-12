import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Fixing margins by adjusting expenses and revenue...')

  // Get the restaurant
  const restaurant = await prisma.restaurant.findFirst()
  if (!restaurant) {
    console.error('No restaurant found.')
    return
  }

  const restaurantId = restaurant.id

  // Reduce monthly rent from 5M to 2M IQD
  console.log('Reducing rent expenses...')
  await prisma.expenseTransaction.updateMany({
    where: {
      restaurantId,
      category: 'RENT',
      amount: { gte: 4000000 },
    },
    data: {
      amount: 2000000, // 2M IQD instead of 5M
    },
  })

  // Reduce utilities from 800k-1M to 300k-400k
  console.log('Reducing utilities expenses...')
  await prisma.expenseTransaction.updateMany({
    where: {
      restaurantId,
      category: 'UTILITIES',
      amount: { gte: 700000 },
    },
    data: {
      amount: 350000, // 350k IQD average
    },
  })

  // Reduce marketing expenses by 50%
  console.log('Reducing marketing expenses...')
  const marketingExpenses = await prisma.expenseTransaction.findMany({
    where: {
      restaurantId,
      category: 'MARKETING',
    },
  })

  for (const expense of marketingExpenses) {
    await prisma.expenseTransaction.update({
      where: { id: expense.id },
      data: {
        amount: expense.amount * 0.5,
      },
    })
  }

  // Reduce maintenance expenses by 50%
  console.log('Reducing maintenance expenses...')
  const maintenanceExpenses = await prisma.expenseTransaction.findMany({
    where: {
      restaurantId,
      category: 'MAINTENANCE',
    },
  })

  for (const expense of maintenanceExpenses) {
    await prisma.expenseTransaction.update({
      where: { id: expense.id },
      data: {
        amount: expense.amount * 0.5,
      },
    })
  }

  // Reduce recurring expenses by 30%
  console.log('Reducing recurring expenses...')
  const recurringExpenses = await prisma.expense.findMany({
    where: { restaurantId },
  })

  for (const expense of recurringExpenses) {
    await prisma.expense.update({
      where: { id: expense.id },
      data: {
        amount: expense.amount * 0.7,
      },
    })
  }

  // Reduce payroll by 20% (if any)
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
        totalPaid: payroll.totalPaid * 0.8,
      },
    })
  }

  console.log('✅ Margin fixes applied!')
  console.log('   - Rent: 5M → 2M IQD')
  console.log('   - Utilities: 800k-1M → 350k IQD')
  console.log('   - Marketing: -50%')
  console.log('   - Maintenance: -50%')
  console.log('   - Recurring expenses: -30%')
  console.log('   - Payroll: -20%')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
