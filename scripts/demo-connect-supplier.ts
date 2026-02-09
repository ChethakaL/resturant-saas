/**
 * Connects the demo restaurant to the demo supplier so that:
 * - Supplier portal "Restaurants" page shows the restaurant
 * - Inventory "Request more" works for at least one ingredient (Basmati Rice)
 *
 * Run after seed (or if Restaurants / Request more are empty):
 *   npx tsx scripts/demo-connect-supplier.ts
 *
 * Uses DATABASE_URL from .env.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_SUPPLIER_EMAIL = 'support@caff.iq'

async function main() {
  const restaurant = await prisma.restaurant.findFirst({
    orderBy: { createdAt: 'asc' },
  })
  if (!restaurant) {
    console.log('No restaurant found. Run the full seed first: npm run db:seed')
    process.exit(1)
  }

  let supplier = await prisma.supplier.findFirst({
    where: { email: DEMO_SUPPLIER_EMAIL },
  })
  if (!supplier) {
    supplier = await prisma.supplier.findFirst({
      where: { status: 'APPROVED' },
      orderBy: { createdAt: 'asc' },
    })
  }
  if (!supplier) {
    console.log('No approved supplier found. Run seed with data/suppliers.csv (e.g. support@caff.iq).')
    process.exit(1)
  }

  console.log(`Linking restaurant "${restaurant.name}" to supplier "${supplier.name}" (${supplier.email})...`)

  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      city: restaurant.city || 'Baghdad',
      address: restaurant.address || 'Baghdad, Iraq',
      lat: restaurant.lat ?? 33.3152,
      lng: restaurant.lng ?? 44.3661,
    },
  })

  await prisma.restaurantSupplierLink.upsert({
    where: {
      restaurantId_supplierId: {
        restaurantId: restaurant.id,
        supplierId: supplier.id,
      },
    },
    create: {
      restaurantId: restaurant.id,
      supplierId: supplier.id,
    },
    update: {},
  })
  console.log('  • RestaurantSupplierLink created/updated')

  let riceIngredient = await prisma.ingredient.findFirst({
    where: { restaurantId: restaurant.id, name: 'Basmati Rice' },
  })
  if (!riceIngredient) {
    riceIngredient = await prisma.ingredient.findFirst({
      where: { restaurantId: restaurant.id },
      orderBy: { name: 'asc' },
    })
  }

  const supplierProducts = await prisma.supplierProduct.findMany({
    where: { supplierId: supplier.id },
    include: {
      prices: {
        where: { effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
        take: 1,
      },
    },
  })
  const firstProduct = supplierProducts.find((p) => p.name.toLowerCase().includes('rice')) ?? supplierProducts[0]

  if (riceIngredient && firstProduct) {
    await prisma.ingredient.update({
      where: { id: riceIngredient.id },
      data: { preferredSupplierId: supplier.id },
    })
    console.log(`  • Set preferred supplier on ingredient "${riceIngredient.name}"`)

    const activePrice = firstProduct.prices[0]
    const unitCost = activePrice ? activePrice.price / firstProduct.packSize : 0
    const recipeLines = await prisma.menuItemIngredient.findMany({
      where: { ingredientId: riceIngredient.id },
      select: { id: true },
    })
    for (const line of recipeLines) {
      await prisma.menuItemIngredient.update({
        where: { id: line.id },
        data: {
          supplierProductId: firstProduct.id,
          unitCostCached: unitCost,
          currency: activePrice?.currency ?? 'IQD',
          lastPricedAt: new Date(),
        },
      })
    }
    console.log(`  • Updated ${recipeLines.length} recipe lines with supplier product`)
  }

  const existingRequests = await prisma.stockRequest.count({
    where: { restaurantId: restaurant.id, supplierId: supplier.id },
  })
  if (existingRequests === 0 && firstProduct) {
    await prisma.stockRequest.create({
      data: {
        restaurantId: restaurant.id,
        supplierId: supplier.id,
        status: 'PENDING',
        notes: 'Weekly order',
        lines: {
          create: [
            {
              supplierProductId: firstProduct.id,
              quantity: 50,
              unit: firstProduct.packUnit,
              notes: 'Restock',
            },
          ],
        },
      },
    })
    const secondProduct = supplierProducts.find((p) => p.id !== firstProduct.id) ?? supplierProducts[1]
    if (secondProduct) {
      await prisma.stockRequest.create({
        data: {
          restaurantId: restaurant.id,
          supplierId: supplier.id,
          status: 'CONFIRMED',
          notes: 'Urgent order',
          lines: {
            create: [
              { supplierProductId: secondProduct.id, quantity: 20, unit: secondProduct.packUnit },
            ],
          },
        },
      })
    }
    console.log('  • Created 2 sample stock requests')
  }

  console.log('')
  console.log('Done. Supplier portal Restaurants page and Inventory "Request more" (for linked ingredient) should now show data.')
  console.log('  Supplier login: support@caff.iq / password123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
