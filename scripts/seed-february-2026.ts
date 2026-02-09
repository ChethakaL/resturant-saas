/**
 * Seed February 2026 with realistic sales, expenses, payroll, and waste
 * so the dashboard shows a full, believable month.
 *
 * Run: npx tsx scripts/seed-february-2026.ts
 * Uses DATABASE_URL from .env.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FEB_2026_START = new Date(2026, 1, 1) // Feb 1, 2026
const FEB_2026_END = new Date(2026, 1, 28, 23, 59, 59) // Feb 28

function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

function setTime(d: Date, hour: number, minute: number): Date {
  const out = new Date(d)
  out.setHours(hour, minute, 0, 0)
  return out
}

async function main() {
  const restaurant = await prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!restaurant) {
    console.log('No restaurant found. Run the main seed first: npm run db:seed')
    process.exit(1)
  }

  const [menuItems, employees, tables, ingredients] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, status: 'ACTIVE', available: true },
      include: {
        ingredients: { include: { ingredient: true } },
      },
    }),
    prisma.employee.findMany({ where: { restaurantId: restaurant.id } }),
    prisma.table.findMany({ where: { restaurantId: restaurant.id } }),
    prisma.ingredient.findMany({ where: { restaurantId: restaurant.id } }),
  ])

  if (menuItems.length === 0) {
    console.log('No menu items. Run the main seed first.')
    process.exit(1)
  }

  const menuItemCosts = new Map<string, number>()
  for (const item of menuItems) {
    const cost = item.ingredients.reduce(
      (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    menuItemCosts.set(item.id, cost)
  }

  const waiters = employees.filter((e) => e.position === 'WAITER')
  const ingredientIds = ingredients.map((i) => i.id)

  // Weight by price band for variety (mix of high and low ticket)
  const selectRandomItem = () => {
    const i = Math.floor(Math.random() * menuItems.length)
    return menuItems[i]
  }

  console.log('🗑️  Clearing existing February 2026 data for this restaurant...')
  await prisma.saleItem.deleteMany({
    where: {
      sale: {
        restaurantId: restaurant.id,
        timestamp: { gte: FEB_2026_START, lte: FEB_2026_END },
      },
    },
  })
  await prisma.sale.deleteMany({
    where: {
      restaurantId: restaurant.id,
      timestamp: { gte: FEB_2026_START, lte: FEB_2026_END },
    },
  })
  await prisma.expenseTransaction.deleteMany({
    where: {
      restaurantId: restaurant.id,
      date: { gte: FEB_2026_START, lte: FEB_2026_END },
    },
  })
  await prisma.wasteRecord.deleteMany({
    where: {
      restaurantId: restaurant.id,
      date: { gte: FEB_2026_START, lte: FEB_2026_END },
    },
  })
  await prisma.payroll.deleteMany({
    where: {
      restaurantId: restaurant.id,
      period: { gte: FEB_2026_START, lte: FEB_2026_END },
    },
  })

  let orderCounter = 1
  const peakLunch = [12, 13, 14]
  const peakDinner = [19, 20, 21]
  const offPeak = [10, 11, 15, 16, 17, 18, 22]

  type SaleRow = {
    orderNumber: string
    total: number
    paymentMethod: 'CASH' | 'CARD'
    paymentProvider: string | null
    status: string
    restaurantId: string
    timestamp: Date
    waiterId: string | null
    tableId: string | null
    items: { menuItemId: string; quantity: number; price: number; cost: number }[]
  }

  const salesToInsert: SaleRow[] = []
  for (let day = 0; day < 28; day++) {
    const saleDate = addDays(FEB_2026_START, day)
    const dayOfWeek = saleDate.getDay()
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6
    const baseOrders = isWeekend ? 28 : 20
    const ordersToday = baseOrders + Math.floor(Math.random() * 12)

    for (let i = 0; i < ordersToday; i++) {
      const isPeak = Math.random() < 0.62
      const hour = isPeak
        ? (Math.random() < 0.55
            ? peakLunch[Math.floor(Math.random() * peakLunch.length)]
            : peakDinner[Math.floor(Math.random() * peakDinner.length)])
        : offPeak[Math.floor(Math.random() * offPeak.length)]
      const minute = Math.floor(Math.random() * 60)
      const orderTime = setTime(new Date(saleDate), hour, minute)

      const itemCount = Math.min(menuItems.length, Math.floor(Math.random() * 4) + 1)
      const used = new Set<string>()
      const orderItems: { menuItemId: string; quantity: number; price: number; cost: number }[] = []
      let orderTotal = 0
      for (let j = 0; j < itemCount; j++) {
        const item = selectRandomItem()
        if (used.has(item.id)) continue
        used.add(item.id)
        const qty = Math.floor(Math.random() * 2) + 1
        const price = item.price
        const cost = menuItemCosts.get(item.id) ?? 0
        orderItems.push({ menuItemId: item.id, quantity: qty, price, cost })
        orderTotal += price * qty
      }
      if (orderItems.length === 0) continue

      const isCard = Math.random() < 0.38
      const waiter = waiters[Math.floor(Math.random() * waiters.length)]
      const table = tables[Math.floor(Math.random() * tables.length)]

      salesToInsert.push({
        orderNumber: `ORD-${String(orderCounter++).padStart(5, '0')}`,
        total: orderTotal,
        paymentMethod: isCard ? 'CARD' : 'CASH',
        paymentProvider: isCard ? 'STRIPE' : null,
        status: 'COMPLETED',
        restaurantId: restaurant.id,
        timestamp: orderTime,
        waiterId: waiter?.id ?? null,
        tableId: table?.id ?? null,
        items: orderItems,
      })
    }
  }

  console.log('💰 Creating February 2026 sales...')
  const BATCH = 45
  for (let i = 0; i < salesToInsert.length; i += BATCH) {
    const chunk = salesToInsert.slice(i, i + BATCH)
    await Promise.all(
      chunk.map((sale) =>
        prisma.sale.create({
          data: {
            orderNumber: sale.orderNumber,
            total: sale.total,
            paymentMethod: sale.paymentMethod,
            paymentProvider: sale.paymentProvider,
            status: sale.status,
            restaurantId: sale.restaurantId,
            timestamp: sale.timestamp,
            waiterId: sale.waiterId,
            tableId: sale.tableId,
            items: { createMany: { data: sale.items } },
          },
        })
      )
    )
  }
  console.log(`   Created ${salesToInsert.length} sales for February 2026`)

  console.log('📋 Ensuring recurring expenses apply to Feb 2026...')
  const existingExpenses = await prisma.expense.count({ where: { restaurantId: restaurant.id } })
  if (existingExpenses === 0) {
    await prisma.expense.createMany({
      data: [
        {
          name: 'Rent',
          category: 'Facilities',
          amount: 1_500_000,
          cadence: 'MONTHLY',
          startDate: new Date(2026, 0, 1),
          restaurantId: restaurant.id,
        },
        {
          name: 'Electricity',
          category: 'Utilities',
          amount: 420_000,
          cadence: 'MONTHLY',
          startDate: new Date(2026, 0, 1),
          restaurantId: restaurant.id,
        },
        {
          name: 'Water & Sewage',
          category: 'Utilities',
          amount: 85_000,
          cadence: 'MONTHLY',
          startDate: new Date(2026, 0, 1),
          restaurantId: restaurant.id,
        },
        {
          name: 'Cleaning & Supplies',
          category: 'Operations',
          amount: 25_000,
          cadence: 'WEEKLY',
          startDate: new Date(2026, 0, 1),
          restaurantId: restaurant.id,
        },
        {
          name: 'Gas (Kitchen)',
          category: 'Utilities',
          amount: 180_000,
          cadence: 'MONTHLY',
          startDate: new Date(2026, 0, 1),
          restaurantId: restaurant.id,
        },
        {
          name: 'Marketing & Flyers',
          category: 'Growth',
          amount: 650_000,
          cadence: 'ANNUAL',
          startDate: new Date(2026, 0, 1),
          restaurantId: restaurant.id,
        },
      ],
    })
    console.log('   Created 6 recurring expenses')
  }

  console.log('📝 Creating expense transactions for February 2026...')
  const expenseTxs = [
    { date: 1, name: 'Vegetable & fruit delivery', category: 'INVENTORY_PURCHASE' as const, amount: 320_000 },
    { date: 3, name: 'LPG cylinders (2)', category: 'UTILITIES' as const, amount: 95_000 },
    { date: 5, name: 'Repair – exhaust fan', category: 'MAINTENANCE' as const, amount: 75_000 },
    { date: 7, name: 'Dry goods restock', category: 'INVENTORY_PURCHASE' as const, amount: 410_000 },
    { date: 10, name: 'Cleaning chemicals', category: 'OTHER' as const, amount: 42_000 },
    { date: 12, name: 'Dairy & eggs weekly', category: 'INVENTORY_PURCHASE' as const, amount: 185_000 },
    { date: 15, name: 'Plumber – sink repair', category: 'MAINTENANCE' as const, amount: 55_000 },
    { date: 18, name: 'Meat & poultry order', category: 'INVENTORY_PURCHASE' as const, amount: 520_000 },
    { date: 20, name: 'Paper & disposables', category: 'OTHER' as const, amount: 68_000 },
    { date: 24, name: 'Beverage restock', category: 'INVENTORY_PURCHASE' as const, amount: 140_000 },
  ]
  for (const tx of expenseTxs) {
    await prisma.expenseTransaction.create({
      data: {
        name: tx.name,
        category: tx.category,
        amount: tx.amount,
        date: addDays(FEB_2026_START, tx.date - 1),
        restaurantId: restaurant.id,
      },
    })
  }
  console.log(`   Created ${expenseTxs.length} expense transactions`)

  console.log('💵 Creating payroll for February 2026...')
  const period = new Date(2026, 1, 15)
  const paidDate = new Date(2026, 1, 16)
  for (const emp of employees) {
    const baseSalary = emp.salaryType === 'DAILY' ? emp.salary * 26 : emp.salary
    const bonuses = emp.position === 'WAITER' ? 45_000 : 0
    const deductions = emp.position === 'CLEANER' ? 20_000 : 0
    await prisma.payroll.create({
      data: {
        employeeId: emp.id,
        period,
        baseSalary,
        bonuses,
        deductions,
        totalPaid: baseSalary + bonuses - deductions,
        paidDate,
        status: 'PAID',
        restaurantId: restaurant.id,
      },
    })
  }
  console.log(`   Created ${employees.length} payroll records (PAID)`)

  console.log('🗑️  Creating waste records for February 2026...')
  const wasteReasons = ['Spoilage', 'Over-prep', 'Breakage', 'Expired']
  for (let day of [2, 5, 11, 17, 23]) {
    const ing = ingredients[Math.floor(Math.random() * ingredients.length)]
    const qty = 0.5 + Math.random() * 2
    const cost = qty * ing.costPerUnit
    await prisma.wasteRecord.create({
      data: {
        ingredientId: ing.id,
        quantity: qty,
        cost,
        date: addDays(FEB_2026_START, day - 1),
        reason: wasteReasons[Math.floor(Math.random() * wasteReasons.length)],
        restaurantId: restaurant.id,
      },
    })
  }
  console.log('   Created 5 waste records')

  console.log('')
  console.log('✅ February 2026 seed done. Dashboard should show a full month of sales, expenses, payroll, and waste.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
