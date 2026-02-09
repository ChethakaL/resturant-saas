/**
 * Seed supplier portal demo data: suppliers, supplier users, products, prices, restaurant links.
 * Re-runnable: uses upsert / check-existing so you can run multiple times.
 *
 * Demo credentials (use at /supplier/login):
 *   Supplier 1: supplier1@demo.iq / password123
 *   Supplier 2: supplier2@demo.iq / password123
 *   Supplier 3: supplier3@demo.iq / password123
 *
 * Run: npx tsx prisma/seed-supplier.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEMO_PASSWORD = 'password123'

const SUPPLIERS = [
  {
    name: 'Baghdad Fresh Produce',
    email: 'supplier1@demo.iq',
    phone: '+964 770 111 1001',
    address: 'Karrada, Baghdad',
    city: 'Baghdad',
    lat: 33.3152,
    lng: 44.3661,
    deliveryAreas: ['Baghdad', 'Kadhimiya', 'Karrada', 'Mansour'],
    status: 'APPROVED' as const,
  },
  {
    name: 'Iraqi Dry Goods Co',
    email: 'supplier2@demo.iq',
    phone: '+964 770 222 2002',
    address: 'Industrial District, Basra',
    city: 'Basra',
    lat: 30.5085,
    lng: 47.7804,
    deliveryAreas: ['Basra', 'Baghdad', 'Nasiriyah'],
    status: 'APPROVED' as const,
  },
  {
    name: 'Northern Dairy & Beverages',
    email: 'supplier3@demo.iq',
    phone: '+964 750 333 3003',
    address: 'Erbil, Kurdistan',
    city: 'Erbil',
    lat: 36.1911,
    lng: 44.0091,
    deliveryAreas: ['Erbil', 'Sulaymaniyah', 'Duhok', 'Kirkuk'],
    status: 'APPROVED' as const,
  },
]

/** Global ingredient names we need; will create if missing. */
const GLOBAL_INGREDIENT_SPECS = [
  { name: 'Rice', category: 'Dry Goods', defaultUnit: 'kg' },
  { name: 'Basmati Rice', category: 'Dry Goods', defaultUnit: 'kg' },
  { name: 'Chicken', category: 'Meat', defaultUnit: 'kg' },
  { name: 'Tomato', category: 'Produce', defaultUnit: 'kg' },
  { name: 'Onion', category: 'Produce', defaultUnit: 'kg' },
  { name: 'Vegetable Oil', category: 'Dry Goods', defaultUnit: 'L' },
  { name: 'Yogurt', category: 'Dairy', defaultUnit: 'kg' },
  { name: 'Lamb', category: 'Meat', defaultUnit: 'kg' },
  { name: 'Lemon', category: 'Produce', defaultUnit: 'kg' },
  { name: 'Mint', category: 'Produce', defaultUnit: 'kg' },
  { name: 'Chickpeas', category: 'Dry Goods', defaultUnit: 'kg' },
  { name: 'Flour', category: 'Dry Goods', defaultUnit: 'kg' },
  { name: 'Sugar', category: 'Dry Goods', defaultUnit: 'kg' },
  { name: 'Black Tea', category: 'Beverages', defaultUnit: 'kg' },
  { name: 'Olive Oil', category: 'Dry Goods', defaultUnit: 'L' },
]

/** Product definitions: base name (for global ingredient match), category, pack size/unit, brand, sku. Spread across suppliers. */
const PRODUCT_DEFS = [
  { ingredientName: 'Rice', name: 'Rice - Premium Bag', category: 'Dry Goods', packSize: 25, packUnit: 'kg', brand: 'Local Premium', sku: 'RICE-25' },
  { ingredientName: 'Basmati Rice', name: 'Basmati Rice 5kg', category: 'Dry Goods', packSize: 5, packUnit: 'kg', brand: 'Al Burj', sku: 'BASM-5' },
  { ingredientName: 'Chicken', name: 'Chicken Whole', category: 'Meat', packSize: 1, packUnit: 'kg', brand: null, sku: 'CHK-1' },
  { ingredientName: 'Tomato', name: 'Tomato Crate', category: 'Produce', packSize: 10, packUnit: 'kg', brand: null, sku: 'TOM-10' },
  { ingredientName: 'Onion', name: 'Onion Sack', category: 'Produce', packSize: 15, packUnit: 'kg', brand: null, sku: 'ONN-15' },
  { ingredientName: 'Vegetable Oil', name: 'Vegetable Oil 5L', category: 'Dry Goods', packSize: 5, packUnit: 'L', brand: 'Sunflower', sku: 'OIL-5L' },
  { ingredientName: 'Yogurt', name: 'Yogurt Tub 5kg', category: 'Dairy', packSize: 5, packUnit: 'kg', brand: 'Local', sku: 'YOG-5' },
  { ingredientName: 'Lamb', name: 'Lamb Leg', category: 'Meat', packSize: 2, packUnit: 'kg', brand: null, sku: 'LAMB-2' },
  { ingredientName: 'Lemon', name: 'Lemon Box', category: 'Produce', packSize: 5, packUnit: 'kg', brand: null, sku: 'LEM-5' },
  { ingredientName: 'Mint', name: 'Fresh Mint Bunch', category: 'Produce', packSize: 0.5, packUnit: 'kg', brand: null, sku: 'MINT-05' },
  { ingredientName: 'Chickpeas', name: 'Chickpeas 10kg', category: 'Dry Goods', packSize: 10, packUnit: 'kg', brand: null, sku: 'CHP-10' },
  { ingredientName: 'Flour', name: 'Flour 50kg', category: 'Dry Goods', packSize: 50, packUnit: 'kg', brand: 'Mill', sku: 'FLR-50' },
  { ingredientName: 'Sugar', name: 'Sugar 25kg', category: 'Dry Goods', packSize: 25, packUnit: 'kg', brand: null, sku: 'SUG-25' },
  { ingredientName: 'Black Tea', name: 'Black Tea 1kg', category: 'Beverages', packSize: 1, packUnit: 'kg', brand: 'Iraqi Tea', sku: 'TEA-1' },
  { ingredientName: 'Olive Oil', name: 'Olive Oil 1L', category: 'Dry Goods', packSize: 1, packUnit: 'L', brand: 'Extra Virgin', sku: 'OLV-1' },
]

async function ensureGlobalIngredients(): Promise<Map<string, string>> {
  const byName = new Map<string, string>()
  for (const spec of GLOBAL_INGREDIENT_SPECS) {
    const existing = await prisma.globalIngredient.findFirst({
      where: { name: spec.name, category: spec.category, defaultUnit: spec.defaultUnit },
    })
    if (existing) {
      byName.set(spec.name.toLowerCase(), existing.id)
    } else {
      const created = await prisma.globalIngredient.create({
        data: { name: spec.name, category: spec.category, defaultUnit: spec.defaultUnit },
      })
      byName.set(spec.name.toLowerCase(), created.id)
    }
  }
  return byName
}

async function main() {
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('🏭 SUPPLIER PORTAL SEED')
  console.log('═══════════════════════════════════════════════════════════════')

  const globalByName = await ensureGlobalIngredients()
  console.log(`✅ Global ingredients: ${globalByName.size} (by name)`)

  const restaurants = await prisma.restaurant.findMany({ select: { id: true, name: true } })
  if (restaurants.length === 0) {
    console.log('⚠️  No restaurants found. Run main seed first: npm run db:seed')
    process.exit(1)
  }
  console.log(`✅ Restaurants: ${restaurants.length}`)

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const supplierIds: string[] = []

  for (const s of SUPPLIERS) {
    let supplier = await prisma.supplier.findFirst({ where: { email: s.email } })
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: s.name,
          email: s.email,
          phone: s.phone,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          deliveryAreas: s.deliveryAreas,
          status: s.status,
        },
      })
    } else {
      supplier = await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          name: s.name,
          phone: s.phone,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          deliveryAreas: s.deliveryAreas,
          status: s.status,
        },
      })
    }
    supplierIds.push(supplier.id)

    await prisma.supplierUser.upsert({
      where: { supplierId_email: { supplierId: supplier.id, email: s.email } },
      create: {
        supplierId: supplier.id,
        name: s.name + ' Admin',
        email: s.email,
        passwordHash,
        role: 'user',
      },
      update: { name: s.name + ' Admin', passwordHash },
    })
  }
  console.log(`✅ Suppliers: ${SUPPLIERS.length} | Supplier users: ${SUPPLIERS.length}`)

  const productIds: { id: string; supplierId: string; index: number }[] = []
  for (let i = 0; i < PRODUCT_DEFS.length; i++) {
    const def = PRODUCT_DEFS[i]
    const supplierId = supplierIds[i % supplierIds.length]
    const globalIngredientId = globalByName.get(def.ingredientName.toLowerCase()) ?? null

    let product = await prisma.supplierProduct.findFirst({
      where: { supplierId, name: def.name, packSize: def.packSize },
    })
    if (!product) {
      product = await prisma.supplierProduct.create({
        data: {
          supplierId,
          globalIngredientId,
          name: def.name,
          category: def.category,
          packSize: def.packSize,
          packUnit: def.packUnit,
          brand: def.brand,
          sku: def.sku,
          isActive: true,
        },
      })
    }
    productIds.push({ id: product.id, supplierId, index: i })
  }
  console.log(`✅ Supplier products: ${productIds.length}`)

  const now = new Date()
  const oldStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const oldEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0)
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1)
  let pricesCreated = 0
  for (const p of productIds) {
    const count = await prisma.supplierPrice.count({ where: { supplierProductId: p.id } })
    if (count >= 2) continue

    const useMinQty = p.index % 3 === 0
    const useUsd = p.index % 4 === 0
    const iqdPrice = 45000 + (p.index % 10) * 5000
    const usdPrice = 25 + (p.index % 5) * 5

    if (count === 0) {
      await prisma.supplierPrice.createMany({
        data: [
          {
            supplierProductId: p.id,
            price: useUsd ? usdPrice : iqdPrice,
            currency: useUsd ? 'USD' : 'IQD',
            effectiveFrom: oldStart,
            effectiveTo: oldEnd,
            minOrderQty: useMinQty ? 5 : null,
          },
          {
            supplierProductId: p.id,
            price: useUsd ? usdPrice + 2 : iqdPrice + 5000,
            currency: useUsd ? 'USD' : 'IQD',
            effectiveFrom: currentStart,
            effectiveTo: null,
            minOrderQty: useMinQty ? 5 : null,
          },
        ],
      })
      pricesCreated += 2
    } else if (count === 1) {
      await prisma.supplierPrice.create({
        data: {
          supplierProductId: p.id,
          price: useUsd ? usdPrice + 2 : iqdPrice + 5000,
          currency: useUsd ? 'USD' : 'IQD',
          effectiveFrom: currentStart,
          effectiveTo: null,
          minOrderQty: useMinQty ? 5 : null,
        },
      })
      pricesCreated += 1
    }
  }
  console.log(`✅ Supplier prices: 2 per product (IQD/USD, some minOrderQty); ${pricesCreated} new rows`)

  for (const restaurant of restaurants) {
    for (const supplierId of supplierIds) {
      await prisma.restaurantSupplierLink.upsert({
        where: {
          restaurantId_supplierId: { restaurantId: restaurant.id, supplierId },
        },
        create: {
          restaurantId: restaurant.id,
          supplierId,
        },
        update: {},
      })
    }
  }
  console.log(`✅ Restaurant–supplier links: ${restaurants.length} restaurants × ${supplierIds.length} suppliers`)

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('🎉 SUPPLIER SEED DONE')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
  console.log('📧 Demo credentials (login at /supplier/login):')
  SUPPLIERS.forEach((s, i) => {
    console.log(`   Supplier ${i + 1}: ${s.email} / ${DEMO_PASSWORD}`)
  })
  console.log('')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
