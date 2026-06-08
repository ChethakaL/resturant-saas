/**
 * Safe upsert seed for the isolated P&L test tenant (pnl-test / pnlseed_rest_001).
 *
 * Does NOT delete or modify any other restaurant's data.
 *
 * Run: npm run db:seed-pnl-restaurant
 *
 * Login: pnl-test@example.com / password123
 * Live P&L verification range: 2026-03-01 → 2026-03-31
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const RESTAURANT_ID = 'pnlseed_rest_001'
const USER_ID = 'pnlseed_user_001'
const USER_EMAIL = 'pnl-test@example.com'

const settings = {
  livePnl: {
    salesTaxRate: 10,
    profitTaxRate: 5,
    serviceChargeRate: 0,
    operatingDaysInMonth: 30,
  },
  onboardingComplete: true,
  setupOnboardingSeen: true,
  setupOnboardingCompleted: true,
  primaryColor: '#C2410C',
  accentColor: '#EA580C',
  chefPickColor: '#F59E0B',
  borderColor: '#292524',
  backgroundStyle: 'dark',
  fontFamily: 'Inter',
  menuCarouselStyle: 'sliding',
  themePreset: 'ethnic',
  descriptionTone: 'Warm, inviting descriptions for an Iraqi grill restaurant in Baghdad.',
  managementLanguage: 'en',
  menuTimezone: 'Asia/Baghdad',
  tableOrderingEnabled: true,
  showKurdishOnMenu: true,
  showArabicOnMenu: true,
  operatingHours: { open: '10:00', close: '23:00' },
  tables: 10,
  seatingCapacity: 40,
  restaurantCity: 'Baghdad',
  restaurantAddress: 'Karrada, Baghdad',
}

async function upsertRestaurant() {
  const periodEnd = new Date()
  periodEnd.setFullYear(periodEnd.getFullYear() + 1)

  await prisma.restaurant.upsert({
    where: { id: RESTAURANT_ID },
    update: {
      name: 'P&L Test Restaurant',
      slug: 'pnl-test',
      email: 'pnl-test@example.com',
      phone: '+964 770 999 0001',
      address: 'Karrada, Baghdad, Iraq',
      city: 'Baghdad',
      lat: 33.3152,
      lng: 44.3661,
      currency: 'IQD',
      timezone: 'Asia/Baghdad',
      settings,
      subscriptionStatus: 'active',
      currentPeriodEnd: periodEnd,
    },
    create: {
      id: RESTAURANT_ID,
      name: 'P&L Test Restaurant',
      slug: 'pnl-test',
      email: 'pnl-test@example.com',
      phone: '+964 770 999 0001',
      address: 'Karrada, Baghdad, Iraq',
      city: 'Baghdad',
      lat: 33.3152,
      lng: 44.3661,
      currency: 'IQD',
      timezone: 'Asia/Baghdad',
      settings,
      subscriptionStatus: 'active',
      currentPeriodEnd: periodEnd,
    },
  })
}

async function upsertUser() {
  const password = await bcrypt.hash('password123', 10)
  await prisma.user.upsert({
    where: { email: USER_EMAIL },
    update: {
      id: USER_ID,
      password,
      name: 'P&L Test Owner',
      role: 'OWNER',
      restaurantId: RESTAURANT_ID,
      isActive: true,
    },
    create: {
      id: USER_ID,
      email: USER_EMAIL,
      password,
      name: 'P&L Test Owner',
      role: 'OWNER',
      restaurantId: RESTAURANT_ID,
      isActive: true,
    },
  })
}

async function upsertCategories() {
  const rows = [
    { id: 'pnlseed_cat_app', name: 'Appetizers', pnlParent: 'FOOD' as const, pnlType: 'PRODUCT' as const, taxRate: 0, order: 1 },
    { id: 'pnlseed_cat_grills', name: 'Grills', pnlParent: 'FOOD' as const, pnlType: 'PRODUCT' as const, taxRate: 0, order: 2 },
    { id: 'pnlseed_cat_mains', name: 'Main Dishes', pnlParent: 'FOOD' as const, pnlType: 'PRODUCT' as const, taxRate: 0, order: 3 },
    { id: 'pnlseed_cat_bev', name: 'Beverages', pnlParent: 'BEVERAGES' as const, pnlType: 'PRODUCT' as const, taxRate: 10, order: 4 },
    { id: 'pnlseed_cat_product', name: 'Family Platters (P&L test)', pnlParent: 'FOOD' as const, pnlType: 'PRODUCT' as const, taxRate: 0, order: 5 },
    { id: 'pnlseed_cat_taxable', name: 'Premium Platters (10% tax)', pnlParent: 'FOOD' as const, pnlType: 'PRODUCT' as const, taxRate: 10, order: 6 },
    { id: 'pnlseed_cat_income', name: 'Service Fees', pnlParent: 'CATERING' as const, pnlType: 'INCOME' as const, taxRate: 10, order: 7 },
  ]

  for (const row of rows) {
    await prisma.category.upsert({
      where: { id: row.id },
      update: {
        name: row.name,
        displayOrder: row.order,
        showOnMenu: true,
        pnlParent: row.pnlParent,
        pnlType: row.pnlType,
        taxRate: row.taxRate,
        restaurantId: RESTAURANT_ID,
      },
      create: {
        id: row.id,
        name: row.name,
        displayOrder: row.order,
        showOnMenu: true,
        pnlParent: row.pnlParent,
        pnlType: row.pnlType,
        taxRate: row.taxRate,
        restaurantId: RESTAURANT_ID,
      },
    })
  }
}

async function upsertIngredients() {
  const rows = [
    { id: 'pnlseed_ing_chicken', name: 'Chicken Breast', unit: 'kg', stock: 500, cost: 8000, min: 40, category: 'PROTEIN' },
    { id: 'pnlseed_ing_lamb', name: 'Lamb Meat', unit: 'kg', stock: 120, cost: 15000, min: 20, category: 'PROTEIN' },
    { id: 'pnlseed_ing_rice', name: 'Basmati Rice', unit: 'kg', stock: 200, cost: 2500, min: 50, category: 'GRAIN' },
    { id: 'pnlseed_ing_chickpea', name: 'Chickpeas', unit: 'kg', stock: 80, cost: 3000, min: 15, category: 'OTHER' },
    { id: 'pnlseed_ing_tahini', name: 'Tahini', unit: 'kg', stock: 25, cost: 12000, min: 5, category: 'OTHER' },
    { id: 'pnlseed_ing_tea', name: 'Tea Leaves', unit: 'kg', stock: 10, cost: 18000, min: 2, category: 'BEVERAGE' },
    { id: 'pnlseed_ing_spices', name: 'Mixed Grill Spices', unit: 'kg', stock: 8, cost: 15000, min: 2, category: 'SPICE' },
    { id: 'pnlseed_ing_oil', name: 'Vegetable Oil', unit: 'L', stock: 60, cost: 3000, min: 10, category: 'OTHER' },
  ]

  for (const row of rows) {
    await prisma.ingredient.upsert({
      where: { id: row.id },
      update: {
        name: row.name,
        unit: row.unit,
        stockQuantity: row.stock,
        costPerUnit: row.cost,
        minStockLevel: row.min,
        category: row.category,
        supplier: 'Baghdad Local Supplier',
        restaurantId: RESTAURANT_ID,
      },
      create: {
        id: row.id,
        name: row.name,
        unit: row.unit,
        stockQuantity: row.stock,
        costPerUnit: row.cost,
        minStockLevel: row.min,
        category: row.category,
        supplier: 'Baghdad Local Supplier',
        restaurantId: RESTAURANT_ID,
      },
    })
  }
}

async function upsertMenuItems() {
  const rows = [
    { id: 'pnlseed_menu_hummus', name: 'Hummus', price: 5000, cat: 'pnlseed_cat_app', cost: 1800 },
    { id: 'pnlseed_menu_kebab', name: 'Chicken Kebab', price: 12000, cat: 'pnlseed_cat_grills', cost: 4200 },
    { id: 'pnlseed_menu_lamb', name: 'Lamb Kebab', price: 18000, cat: 'pnlseed_cat_grills', cost: 7500 },
    { id: 'pnlseed_menu_mixed', name: 'Mixed Grill Platter', price: 25000, cat: 'pnlseed_cat_grills', cost: 9000 },
    { id: 'pnlseed_menu_biryani', name: 'Chicken Biryani', price: 13000, cat: 'pnlseed_cat_mains', cost: 4500 },
    { id: 'pnlseed_menu_kabsa', name: 'Lamb Kabsa', price: 20000, cat: 'pnlseed_cat_mains', cost: 8000 },
    { id: 'pnlseed_menu_tea', name: 'Iraqi Tea', price: 2200, cat: 'pnlseed_cat_bev', cost: 400 },
    { id: 'pnlseed_item_a', name: 'Family Mixed Grill (P&L Test A)', price: 100000, cat: 'pnlseed_cat_product', cost: 30000 },
    { id: 'pnlseed_item_b', name: 'Chef Premium Platter (P&L Test B)', price: 110000, cat: 'pnlseed_cat_taxable', cost: 20000 },
    { id: 'pnlseed_item_c', name: 'Private Catering Fee (P&L Test C)', price: 55000, cat: 'pnlseed_cat_income', cost: 10000 },
  ]

  for (const row of rows) {
    await prisma.menuItem.upsert({
      where: { id: row.id },
      update: {
        name: row.name,
        price: row.price,
        available: true,
        status: 'ACTIVE',
        costingStatus: 'COMPLETE',
        categoryId: row.cat,
        restaurantId: RESTAURANT_ID,
      },
      create: {
        id: row.id,
        name: row.name,
        price: row.price,
        available: true,
        status: 'ACTIVE',
        costingStatus: 'COMPLETE',
        categoryId: row.cat,
        restaurantId: RESTAURANT_ID,
      },
    })
  }
}

async function upsertRecipes() {
  const rows = [
    { id: 'pnlseed_mii_hummus', menu: 'pnlseed_menu_hummus', ing: 'pnlseed_ing_chickpea', qty: 0.15 },
    { id: 'pnlseed_mii_hummus2', menu: 'pnlseed_menu_hummus', ing: 'pnlseed_ing_tahini', qty: 0.05 },
    { id: 'pnlseed_mii_kebab', menu: 'pnlseed_menu_kebab', ing: 'pnlseed_ing_chicken', qty: 0.25 },
    { id: 'pnlseed_mii_kebab2', menu: 'pnlseed_menu_kebab', ing: 'pnlseed_ing_spices', qty: 0.02 },
    { id: 'pnlseed_mii_lamb', menu: 'pnlseed_menu_lamb', ing: 'pnlseed_ing_lamb', qty: 0.22 },
    { id: 'pnlseed_mii_mixed', menu: 'pnlseed_menu_mixed', ing: 'pnlseed_ing_chicken', qty: 0.15 },
    { id: 'pnlseed_mii_mixed2', menu: 'pnlseed_menu_mixed', ing: 'pnlseed_ing_lamb', qty: 0.12 },
    { id: 'pnlseed_mii_biryani', menu: 'pnlseed_menu_biryani', ing: 'pnlseed_ing_rice', qty: 0.2 },
    { id: 'pnlseed_mii_biryani2', menu: 'pnlseed_menu_biryani', ing: 'pnlseed_ing_chicken', qty: 0.18 },
    { id: 'pnlseed_mii_kabsa', menu: 'pnlseed_menu_kabsa', ing: 'pnlseed_ing_rice', qty: 0.25 },
    { id: 'pnlseed_mii_kabsa2', menu: 'pnlseed_menu_kabsa', ing: 'pnlseed_ing_lamb', qty: 0.2 },
    { id: 'pnlseed_mii_tea', menu: 'pnlseed_menu_tea', ing: 'pnlseed_ing_tea', qty: 0.01 },
    { id: 'pnlseed_mii_a', menu: 'pnlseed_item_a', ing: 'pnlseed_ing_chicken', qty: 0.3 },
    { id: 'pnlseed_mii_b', menu: 'pnlseed_item_b', ing: 'pnlseed_ing_lamb', qty: 0.25 },
    { id: 'pnlseed_mii_c', menu: 'pnlseed_item_c', ing: 'pnlseed_ing_chicken', qty: 0.1 },
  ]

  for (const row of rows) {
    await prisma.menuItemIngredient.upsert({
      where: { id: row.id },
      update: { menuItemId: row.menu, ingredientId: row.ing, quantity: row.qty },
      create: { id: row.id, menuItemId: row.menu, ingredientId: row.ing, quantity: row.qty },
    })
  }
}

async function upsertTables() {
  for (let i = 1; i <= 10; i++) {
    const number = `T${i}`
    const existing = await prisma.table.findFirst({
      where: { restaurantId: RESTAURANT_ID, number },
    })
    if (existing) {
      await prisma.table.update({
        where: { id: existing.id },
        data: { capacity: i % 3 === 0 ? 6 : 4, status: 'AVAILABLE' },
      })
    } else {
      await prisma.table.create({
        data: {
          id: `pnlseed_table_${String(i).padStart(2, '0')}`,
          number,
          capacity: i % 3 === 0 ? 6 : 4,
          status: 'AVAILABLE',
          restaurantId: RESTAURANT_ID,
        },
      })
    }
  }
}

async function upsertEmployeesAndPayroll() {
  const employees = [
    { id: 'pnlseed_emp_001', name: 'Karim Al-Masri', position: 'CHEF' as const, salary: 1500000 },
    { id: 'pnlseed_emp_002', name: 'Noor Hassan', position: 'WAITER' as const, salary: 800000 },
    { id: 'pnlseed_emp_003', name: 'Sara Ibrahim', position: 'MANAGER' as const, salary: 1200000 },
  ]

  for (const emp of employees) {
    await prisma.employee.upsert({
      where: { id: emp.id },
      update: {
        name: emp.name,
        position: emp.position,
        salary: emp.salary,
        salaryType: 'MONTHLY',
        isActive: true,
        restaurantId: RESTAURANT_ID,
      },
      create: {
        id: emp.id,
        name: emp.name,
        position: emp.position,
        salary: emp.salary,
        salaryType: 'MONTHLY',
        isActive: true,
        restaurantId: RESTAURANT_ID,
      },
    })
  }

  // March payroll totals 400,000 IQD (deterministic P&L verification)
  const payrolls = [
    { id: 'pnlseed_pay_001', emp: 'pnlseed_emp_001', period: '2026-03-01', paid: 200000 },
    { id: 'pnlseed_pay_002', emp: 'pnlseed_emp_002', period: '2026-03-01', paid: 200000 },
    { id: 'pnlseed_pay_jun_001', emp: 'pnlseed_emp_001', period: '2026-06-01', paid: 1500000 },
    { id: 'pnlseed_pay_jun_002', emp: 'pnlseed_emp_002', period: '2026-06-01', paid: 800000 },
    { id: 'pnlseed_pay_jun_003', emp: 'pnlseed_emp_003', period: '2026-06-01', paid: 1200000 },
  ]

  for (const p of payrolls) {
    await prisma.payroll.upsert({
      where: { id: p.id },
      update: {
        employeeId: p.emp,
        period: new Date(p.period),
        baseSalary: p.paid,
        bonuses: 0,
        deductions: 0,
        totalPaid: p.paid,
        paidDate: new Date(p.period.replace('-01', '-28')),
        status: 'PAID',
        restaurantId: RESTAURANT_ID,
      },
      create: {
        id: p.id,
        employeeId: p.emp,
        period: new Date(p.period),
        baseSalary: p.paid,
        bonuses: 0,
        deductions: 0,
        totalPaid: p.paid,
        paidDate: new Date(p.period.replace('-01', '-28')),
        status: 'PAID',
        restaurantId: RESTAURANT_ID,
      },
    })
  }
}

async function upsertExpenses() {
  // Remove obsolete test row if a prior seed run created it
  await prisma.expense.deleteMany({
    where: { id: 'pnlseed_exp_elec', restaurantId: RESTAURANT_ID },
  })

  const recurring = [
    { id: 'pnlseed_exp_rent', name: 'Rent', category: 'Occupancy', amount: 200000, cadence: 'MONTHLY' as const },
    { id: 'pnlseed_exp_mkt', name: 'Marketing retainer', category: 'Marketing', amount: 50000, cadence: 'MONTHLY' as const },
    { id: 'pnlseed_exp_clean', name: 'Cleaning service', category: 'Operations', amount: 20000, cadence: 'WEEKLY' as const },
  ]

  for (const e of recurring) {
    await prisma.expense.upsert({
      where: { id: e.id },
      update: {
        name: e.name,
        category: e.category,
        amount: e.amount,
        cadence: e.cadence,
        startDate: new Date('2026-01-01'),
        restaurantId: RESTAURANT_ID,
      },
      create: {
        id: e.id,
        name: e.name,
        category: e.category,
        amount: e.amount,
        cadence: e.cadence,
        startDate: new Date('2026-01-01'),
        restaurantId: RESTAURANT_ID,
      },
    })
  }

  const txs = [
    { id: 'pnlseed_et_util', name: 'Electricity bill', category: 'UTILITIES' as const, amount: 80000, date: '2026-03-10', notes: 'March utilities' },
    { id: 'pnlseed_et_mkt', name: 'Flyer campaign', category: 'MARKETING' as const, amount: 30000, date: '2026-03-15', notes: 'One-time marketing' },
    { id: 'pnlseed_et_rent', name: 'March rent top-up', category: 'RENT' as const, amount: 100000, date: '2026-03-01', notes: 'Extra rent payment' },
    { id: 'pnlseed_et_stock', name: 'Chicken delivery', category: 'INVENTORY_PURCHASE' as const, amount: 500000, date: '2026-03-06', notes: 'Stock purchase — excluded from OpEx', ing: 'pnlseed_ing_chicken' },
    { id: 'pnlseed_et_cogs', name: 'Manual stock adjustment', category: 'OTHER' as const, amount: 25000, date: '2026-03-18', notes: 'COGS: manual adjustment for spoiled batch' },
    { id: 'pnlseed_et_jun_util', name: 'June electricity', category: 'UTILITIES' as const, amount: 420000, date: '2026-06-05', notes: 'June utilities' },
  ]

  for (const tx of txs) {
    await prisma.expenseTransaction.upsert({
      where: { id: tx.id },
      update: {
        name: tx.name,
        category: tx.category,
        amount: tx.amount,
        date: new Date(tx.date),
        notes: tx.notes,
        ingredientId: tx.ing ?? null,
        restaurantId: RESTAURANT_ID,
      },
      create: {
        id: tx.id,
        name: tx.name,
        category: tx.category,
        amount: tx.amount,
        date: new Date(tx.date),
        notes: tx.notes,
        ingredientId: tx.ing ?? null,
        restaurantId: RESTAURANT_ID,
      },
    })
  }
}

async function upsertMealPrepAndWaste() {
  await prisma.mealPrepSession.upsert({
    where: { id: 'pnlseed_prep_001' },
    update: {
      prepDate: new Date('2026-03-08'),
      sessionTime: '08:00',
      preparedBy: 'Karim Al-Masri',
      notes: 'Morning prep — P&L seed',
      restaurantId: RESTAURANT_ID,
    },
    create: {
      id: 'pnlseed_prep_001',
      prepDate: new Date('2026-03-08'),
      sessionTime: '08:00',
      preparedBy: 'Karim Al-Masri',
      notes: 'Morning prep — P&L seed',
      restaurantId: RESTAURANT_ID,
    },
  })

  await prisma.mealPrepInventoryUsage.upsert({
    where: { id: 'pnlseed_prep_use_001' },
    update: { prepSessionId: 'pnlseed_prep_001', ingredientId: 'pnlseed_ing_chicken', quantityUsed: 6.25 },
    create: {
      id: 'pnlseed_prep_use_001',
      prepSessionId: 'pnlseed_prep_001',
      ingredientId: 'pnlseed_ing_chicken',
      quantityUsed: 6.25,
    },
  })

  await prisma.wasteRecord.upsert({
    where: { id: 'pnlseed_waste_001' },
    update: {
      ingredientId: 'pnlseed_ing_chicken',
      quantity: 15,
      cost: 15000,
      date: new Date('2026-03-22'),
      reason: 'spoilage',
      notes: 'P&L seed waste record',
      restaurantId: RESTAURANT_ID,
    },
    create: {
      id: 'pnlseed_waste_001',
      ingredientId: 'pnlseed_ing_chicken',
      quantity: 15,
      cost: 15000,
      date: new Date('2026-03-22'),
      reason: 'spoilage',
      notes: 'P&L seed waste record',
      restaurantId: RESTAURANT_ID,
    },
  })
}

async function upsertPnlVerificationSales() {
  const sales = [
    { id: 'pnlseed_sale_1', order: 'PNL-2026-001', total: 1000000, status: 'COMPLETED' as const, ts: '2026-03-05T12:00:00+03:00' },
    { id: 'pnlseed_sale_2', order: 'PNL-2026-002', total: 550000, status: 'COMPLETED' as const, ts: '2026-03-12T13:00:00+03:00' },
    { id: 'pnlseed_sale_3', order: 'PNL-2026-003', total: 110000, status: 'COMPLETED' as const, ts: '2026-03-20T14:00:00+03:00' },
    { id: 'pnlseed_sale_4', order: 'PNL-2026-X04', total: 999999, status: 'CANCELLED' as const, ts: '2026-03-25T15:00:00+03:00' },
    { id: 'pnlseed_sale_apr_profit_1', order: 'PNL-2026-APR-P01', total: 7650000, status: 'COMPLETED' as const, ts: '2026-04-10T13:00:00+03:00' },
    { id: 'pnlseed_sale_apr_cancel_1', order: 'PNL-2026-APR-X01', total: 5000000, status: 'CANCELLED' as const, ts: '2026-04-12T13:00:00+03:00' },
    { id: 'pnlseed_sale_jun_1', order: 'PNL-2026-J01', total: 29000, status: 'COMPLETED' as const, ts: '2026-06-03T12:00:00+03:00' },
    { id: 'pnlseed_sale_jun_2', order: 'PNL-2026-J02', total: 50000, status: 'COMPLETED' as const, ts: '2026-06-06T18:00:00+03:00' },
  ]

  for (const s of sales) {
    await prisma.sale.upsert({
      where: { id: s.id },
      update: {
        orderNumber: s.order,
        total: s.total,
        paymentMethod: 'CASH',
        status: s.status,
        restaurantId: RESTAURANT_ID,
        timestamp: new Date(s.ts),
        paidAt: s.status === 'COMPLETED' ? new Date(s.ts) : null,
      },
      create: {
        id: s.id,
        orderNumber: s.order,
        total: s.total,
        paymentMethod: 'CASH',
        status: s.status,
        restaurantId: RESTAURANT_ID,
        timestamp: new Date(s.ts),
        paidAt: s.status === 'COMPLETED' ? new Date(s.ts) : null,
      },
    })
  }

  const items = [
    { id: 'pnlseed_si_1a', sale: 'pnlseed_sale_1', menu: 'pnlseed_item_a', qty: 10, price: 100000, cost: 30000 },
    { id: 'pnlseed_si_2b', sale: 'pnlseed_sale_2', menu: 'pnlseed_item_b', qty: 5, price: 110000, cost: 20000 },
    { id: 'pnlseed_si_3c', sale: 'pnlseed_sale_3', menu: 'pnlseed_item_c', qty: 2, price: 55000, cost: 10000 },
    { id: 'pnlseed_si_4x', sale: 'pnlseed_sale_4', menu: 'pnlseed_item_a', qty: 99, price: 100000, cost: 30000 },
    { id: 'pnlseed_si_apr_profit_a', sale: 'pnlseed_sale_apr_profit_1', menu: 'pnlseed_item_a', qty: 60, price: 100000, cost: 30000 },
    { id: 'pnlseed_si_apr_profit_b', sale: 'pnlseed_sale_apr_profit_1', menu: 'pnlseed_item_b', qty: 10, price: 110000, cost: 20000 },
    { id: 'pnlseed_si_apr_profit_c', sale: 'pnlseed_sale_apr_profit_1', menu: 'pnlseed_item_c', qty: 10, price: 55000, cost: 10000 },
    { id: 'pnlseed_si_apr_cancel_a', sale: 'pnlseed_sale_apr_cancel_1', menu: 'pnlseed_item_a', qty: 50, price: 100000, cost: 30000 },
    { id: 'pnlseed_si_jun_1', sale: 'pnlseed_sale_jun_1', menu: 'pnlseed_menu_kebab', qty: 2, price: 12000, cost: 4200 },
    { id: 'pnlseed_si_jun_2', sale: 'pnlseed_sale_jun_1', menu: 'pnlseed_menu_hummus', qty: 1, price: 5000, cost: 1800 },
    { id: 'pnlseed_si_jun_3', sale: 'pnlseed_sale_jun_2', menu: 'pnlseed_menu_mixed', qty: 2, price: 25000, cost: 9000 },
  ]

  for (const item of items) {
    await prisma.saleItem.upsert({
      where: { id: item.id },
      update: {
        saleId: item.sale,
        menuItemId: item.menu,
        quantity: item.qty,
        price: item.price,
        cost: item.cost,
      },
      create: {
        id: item.id,
        saleId: item.sale,
        menuItemId: item.menu,
        quantity: item.qty,
        price: item.price,
        cost: item.cost,
      },
    })
  }
}

async function main() {
  console.log('🌱 Upserting P&L test restaurant (pnl-test) — no other tenants touched')

  await upsertRestaurant()
  await upsertUser()
  await upsertCategories()
  await upsertIngredients()
  await upsertMenuItems()
  await upsertRecipes()
  await upsertTables()
  await upsertEmployeesAndPayroll()
  await upsertExpenses()
  await upsertMealPrepAndWaste()
  await upsertPnlVerificationSales()

  const counts = await Promise.all([
    prisma.category.count({ where: { restaurantId: RESTAURANT_ID } }),
    prisma.ingredient.count({ where: { restaurantId: RESTAURANT_ID } }),
    prisma.menuItem.count({ where: { restaurantId: RESTAURANT_ID } }),
    prisma.table.count({ where: { restaurantId: RESTAURANT_ID } }),
    prisma.sale.count({ where: { restaurantId: RESTAURANT_ID, status: 'COMPLETED' } }),
  ])

  console.log('✅ P&L test restaurant ready')
  console.log(`   Login: ${USER_EMAIL} / password123`)
  console.log(`   Categories: ${counts[0]}, Ingredients: ${counts[1]}, Menu items: ${counts[2]}, Tables: ${counts[3]}`)
  console.log(`   Completed sales: ${counts[4]}`)
  console.log('   Live P&L verification: 2026-03-01 → 2026-03-31 (expected EBITDA ≈ 136,429 IQD)')
  console.log('   Current month (June 2026) also has sample sales + payroll for default date range')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
