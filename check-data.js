const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkData() {
  try {
    const restaurants = await prisma.restaurant.count()
    const users = await prisma.user.count()
    const ingredients = await prisma.ingredient.count()
    const categories = await prisma.category.count()
    const menuItems = await prisma.menuItem.count()
    const sales = await prisma.sale.count()
    const saleItems = await prisma.saleItem.count()

    console.log('\n📊 DATABASE STATUS CHECK')
    console.log('═══════════════════════════════════════')
    console.log(`✅ Restaurants: ${restaurants}`)
    console.log(`✅ Users: ${users}`)
    console.log(`✅ Ingredients: ${ingredients}`)
    console.log(`✅ Categories: ${categories}`)
    console.log(`✅ Menu Items: ${menuItems}`)
    console.log(`✅ Sales Orders: ${sales}`)
    console.log(`✅ Sale Items: ${saleItems}`)
    console.log('═══════════════════════════════════════')

    if (sales > 0) {
      const firstSale = await prisma.sale.findFirst({
        orderBy: { timestamp: 'asc' },
        include: { items: true }
      })
      const lastSale = await prisma.sale.findFirst({
        orderBy: { timestamp: 'desc' },
        include: { items: true }
      })

      console.log(`\n📅 Sales Date Range:`)
      console.log(`   First order: ${firstSale.timestamp.toLocaleDateString()}`)
      console.log(`   Last order: ${lastSale.timestamp.toLocaleDateString()}`)
      console.log(`   Total revenue: ${sales} orders, ${saleItems} items sold`)
    }

    console.log('\n✅ DATABASE SEED SUCCESSFUL!\n')
  } catch (error) {
    console.error('❌ Error checking data:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkData()
