import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding P&L data...')

  // Get the restaurant
  const restaurant = await prisma.restaurant.findFirst()
  if (!restaurant) {
    console.error('No restaurant found. Please run the main seed first.')
    return
  }

  const restaurantId = restaurant.id

  // Get some ingredients for inventory purchases
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId },
    take: 10,
  })

  if (ingredients.length === 0) {
    console.error('No ingredients found. Please run the main seed first.')
    return
  }

  // Create expense transactions for the last 90 days
  const now = new Date()
  const expenseCategories = ['RENT', 'UTILITIES', 'INVENTORY_PURCHASE', 'MARKETING', 'MAINTENANCE', 'OTHER'] as const

  // Monthly rent (first of each month)
  for (let i = 0; i < 3; i++) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1)
    await prisma.expenseTransaction.create({
      data: {
        name: 'Monthly Rent',
        category: 'RENT',
        amount: 5000000, // 5M IQD
        date: month,
        restaurantId,
        notes: 'Monthly restaurant rent payment',
      },
    })
  }

  // Utilities (every 15th of month)
  for (let i = 0; i < 3; i++) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 15)
    await prisma.expenseTransaction.create({
      data: {
        name: 'Electricity and Water Bill',
        category: 'UTILITIES',
        amount: 800000 + Math.random() * 200000, // 800k-1M IQD
        date: month,
        restaurantId,
        notes: 'Monthly utilities payment',
      },
    })
  }

  // Inventory purchases (random dates, 2-3 per month)
  for (let i = 0; i < 8; i++) {
    const daysAgo = Math.floor(Math.random() * 90)
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)
    
    const ingredient = ingredients[Math.floor(Math.random() * ingredients.length)]
    const quantity = 10 + Math.random() * 50
    const unitCost = ingredient.costPerUnit * (0.9 + Math.random() * 0.2) // Slight variation
    const totalCost = quantity * unitCost

    await prisma.expenseTransaction.create({
      data: {
        name: `Purchase: ${ingredient.name}`,
        category: 'INVENTORY_PURCHASE',
        amount: totalCost,
        date,
        ingredientId: ingredient.id,
        quantity,
        unitCost,
        restaurantId,
        notes: `Inventory purchase from supplier`,
      },
    })

    // Update ingredient stock
    await prisma.ingredient.update({
      where: { id: ingredient.id },
      data: {
        stockQuantity: {
          increment: quantity,
        },
        // Update cost with weighted average
        costPerUnit: (ingredient.stockQuantity * ingredient.costPerUnit + totalCost) / 
                     (ingredient.stockQuantity + quantity),
      },
    })

    // Create stock adjustment
    await prisma.stockAdjustment.create({
      data: {
        ingredientId: ingredient.id,
        quantityChange: quantity,
        reason: 'purchase',
        notes: `Purchase via expense transaction`,
      },
    })
  }

  // Marketing expenses (random)
  for (let i = 0; i < 5; i++) {
    const daysAgo = Math.floor(Math.random() * 90)
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)

    await prisma.expenseTransaction.create({
      data: {
        name: ['Social Media Ads', 'Print Advertising', 'Promotional Event', 'Flyer Distribution', 'Online Marketing'][i],
        category: 'MARKETING',
        amount: 200000 + Math.random() * 300000, // 200k-500k IQD
        date,
        restaurantId,
        notes: 'Marketing and advertising expense',
      },
    })
  }

  // Maintenance expenses
  for (let i = 0; i < 4; i++) {
    const daysAgo = Math.floor(Math.random() * 90)
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)

    await prisma.expenseTransaction.create({
      data: {
        name: ['Equipment Repair', 'Kitchen Maintenance', 'Cleaning Supplies', 'Equipment Service'][i],
        category: 'MAINTENANCE',
        amount: 150000 + Math.random() * 200000, // 150k-350k IQD
        date,
        restaurantId,
        notes: 'Maintenance expense',
      },
    })
  }

  // Other expenses (various)
  const otherExpenses = [
    { name: 'Insurance Premium', amount: 300000 },
    { name: 'License Renewal', amount: 500000 },
    { name: 'Accounting Services', amount: 400000 },
    { name: 'Legal Fees', amount: 250000 },
  ]

  for (let i = 0; i < otherExpenses.length; i++) {
    const daysAgo = Math.floor(Math.random() * 90)
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)

    await prisma.expenseTransaction.create({
      data: {
        name: otherExpenses[i].name,
        category: 'OTHER',
        amount: otherExpenses[i].amount,
        date,
        restaurantId,
        notes: 'Other operating expense',
      },
    })
  }

  // Create waste records (automatic waste tracking)
  for (let i = 0; i < 15; i++) {
    const daysAgo = Math.floor(Math.random() * 90)
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)

    const ingredient = ingredients[Math.floor(Math.random() * ingredients.length)]
    const wasteQuantity = 0.5 + Math.random() * 5 // 0.5 to 5.5 units
    const wasteCost = wasteQuantity * ingredient.costPerUnit

    // Check if ingredient has enough stock
    const currentIngredient = await prisma.ingredient.findUnique({
      where: { id: ingredient.id },
    })

    if (!currentIngredient || currentIngredient.stockQuantity < wasteQuantity) {
      continue // Skip if not enough stock
    }

    const wasteRecord = await prisma.wasteRecord.create({
      data: {
        ingredientId: ingredient.id,
        quantity: wasteQuantity,
        cost: wasteCost,
        date,
        reason: ['spoilage', 'leftover', 'damage', 'expired', 'spillage'][Math.floor(Math.random() * 5)],
        notes: `Waste recorded: ${wasteQuantity.toFixed(2)} ${ingredient.unit}`,
        restaurantId,
      },
    })

    // Deduct from inventory
    await prisma.ingredient.update({
      where: { id: ingredient.id },
      data: {
        stockQuantity: {
          decrement: wasteQuantity,
        },
      },
    })

    // Create stock adjustment
    await prisma.stockAdjustment.create({
      data: {
        ingredientId: ingredient.id,
        quantityChange: -wasteQuantity,
        reason: 'waste',
        notes: `Waste: ${wasteRecord.reason}`,
      },
    })

    // Create expense transaction for waste
    await prisma.expenseTransaction.create({
      data: {
        name: `Waste: ${ingredient.name}`,
        category: 'OTHER',
        amount: wasteCost,
        date,
        notes: `Waste record: ${wasteQuantity.toFixed(2)} ${ingredient.unit} of ${ingredient.name}. ${wasteRecord.reason}`,
        restaurantId,
      },
    })
  }

  console.log('✅ P&L seed data created successfully!')
  console.log(`   - Expense transactions: ~${8 + 5 + 4 + 4} records`)
  console.log(`   - Waste records: ~15 records`)
  console.log(`   - Inventory purchases: 8 records`)
}

main()
  .catch((e) => {
    console.error('Error seeding P&L data:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
