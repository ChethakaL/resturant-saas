import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Realistic Iraq market prices (IQD) - Updated for 2024/2025
// Based on typical Baghdad market rates
const iraqMarketPrices: Record<string, number> = {
  // Grains & Staples
  'Basmati Rice': 3000, // 2,500-3,500 IQD per kg
  'Bulgur Wheat': 2500, // 2,000-3,000 IQD per kg
  'Flour': 1800, // 1,500-2,000 IQD per kg
  'Red Lentils': 3500, // 3,000-4,000 IQD per kg
  'Ground Chickpeas': 4000, // 3,500-4,500 IQD per kg
  
  // Meats
  'Chicken Breast': 8500, // 8,000-9,000 IQD per kg
  'Beef': 12000, // 11,000-13,000 IQD per kg
  'Lamb Meat': 18000, // 16,000-20,000 IQD per kg
  'Fresh Fish (Carp)': 12000, // 10,000-14,000 IQD per kg
  
  // Vegetables
  'Tomatoes': 2000, // 1,500-2,500 IQD per kg
  'Onions': 1500, // 1,000-2,000 IQD per kg
  'Bell Peppers': 2500, // 2,000-3,000 IQD per kg
  'Eggplant': 2000, // 1,500-2,500 IQD per kg
  'Cucumbers': 1500, // 1,200-2,000 IQD per kg
  'Lettuce': 1500, // 1,200-2,000 IQD per kg
  'Garlic': 5000, // 4,000-6,000 IQD per kg
  'Parsley': 4000, // 3,000-5,000 IQD per kg
  'Mint': 4000, // 3,000-5,000 IQD per kg
  
  // Dairy & Fats
  'Butter': 10000, // 9,000-11,000 IQD per kg
  'Cheese (Akkawi)': 15000, // 12,000-18,000 IQD per kg
  'Yogurt': 4500, // 4,000-5,000 IQD per kg
  'Olive Oil': 15000, // 12,000-18,000 IQD per liter
  'Vegetable Oil': 3500, // 3,000-4,000 IQD per liter
  
  // Spices & Seasonings
  'Black Pepper': 25000, // 20,000-30,000 IQD per kg
  'Cumin': 15000, // 12,000-18,000 IQD per kg
  'Cinnamon': 20000, // 18,000-25,000 IQD per kg
  'Cardamom': 100000, // 80,000-120,000 IQD per kg
  'Turmeric': 18000, // 15,000-22,000 IQD per kg
  'Sumac': 16000, // 14,000-18,000 IQD per kg
  'Saffron': 2500, // 2,000-3,000 IQD per gram (very expensive)
  'Za\'atar Mix': 12000, // 10,000-15,000 IQD per kg
  'Salt': 500, // 400-600 IQD per kg (very cheap)
  'Sugar': 2000, // 1,800-2,200 IQD per kg
  
  // Specialty Items
  'Grape Leaves': 6000, // 5,000-7,000 IQD per kg
  'Phyllo Dough': 6000, // 5,000-7,000 IQD per kg
  'Tahini': 9000, // 8,000-10,000 IQD per kg
  'Pistachios': 50000, // 45,000-55,000 IQD per kg
  'Dates': 7000, // 6,000-8,000 IQD per kg
  
  // Beverages & Extracts
  'Coffee Beans': 30000, // 25,000-35,000 IQD per kg
  'Tea Leaves': 20000, // 18,000-25,000 IQD per kg
  'Lemon Juice': 6000, // 5,000-7,000 IQD per liter
  'Orange Juice (Fresh)': 9000, // 8,000-10,000 IQD per liter
  'Rose Water': 18000, // 15,000-20,000 IQD per liter
  
  // Bread
  'Pita Bread': 600, // 500-700 IQD per piece
}

async function updateIngredientPrices() {
  try {
    console.log('🔄 Starting ingredient price update...\n')

    // Get all restaurants
    const restaurants = await prisma.restaurant.findMany()
    
    if (restaurants.length === 0) {
      console.log('❌ No restaurants found in database')
      return
    }

    let totalUpdated = 0
    let totalSkipped = 0

    for (const restaurant of restaurants) {
      console.log(`\n${'='.repeat(70)}`)
      console.log(`Restaurant: ${restaurant.name}`)
      console.log(`${'='.repeat(70)}\n`)

      const ingredients = await prisma.ingredient.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { name: 'asc' },
      })

      if (ingredients.length === 0) {
        console.log('⚠️  No ingredients found for this restaurant\n')
        continue
      }

      console.log(`Found ${ingredients.length} ingredients\n`)
      console.log('Price Updates:')
      console.log('-'.repeat(70))
      console.log(
        `${'Name'.padEnd(30)} | ${'Old Price'.padEnd(15)} | ${'New Price'.padEnd(15)} | Status`
      )
      console.log('-'.repeat(70))

      for (const ingredient of ingredients) {
        const newPrice = iraqMarketPrices[ingredient.name]
        
        if (newPrice === undefined) {
          console.log(
            `${ingredient.name.padEnd(30)} | ${ingredient.costPerUnit.toFixed(2).padEnd(15)} | ${'N/A'.padEnd(15)} | ⚠️  NOT FOUND`
          )
          totalSkipped++
          continue
        }

        const oldPrice = ingredient.costPerUnit
        const priceChanged = Math.abs(oldPrice - newPrice) > 0.01

        if (priceChanged) {
          await prisma.ingredient.update({
            where: { id: ingredient.id },
            data: { costPerUnit: newPrice },
          })

          const change = ((newPrice - oldPrice) / oldPrice) * 100
          const changeSymbol = change > 0 ? '↑' : '↓'
          const changeColor = Math.abs(change) > 10 ? '🔴' : '🟡'

          console.log(
            `${ingredient.name.padEnd(30)} | ${oldPrice.toFixed(2).padEnd(15)} | ${newPrice.toFixed(2).padEnd(15)} | ✅ UPDATED ${changeColor} ${changeSymbol}${Math.abs(change).toFixed(1)}%`
          )
          totalUpdated++
        } else {
          console.log(
            `${ingredient.name.padEnd(30)} | ${oldPrice.toFixed(2).padEnd(15)} | ${newPrice.toFixed(2).padEnd(15)} | ✓ Already correct`
          )
        }
      }
    }

    console.log(`\n${'='.repeat(70)}`)
    console.log('📊 Summary:')
    console.log(`   ✅ Updated: ${totalUpdated} ingredients`)
    console.log(`   ⚠️  Skipped: ${totalSkipped} ingredients (not in price list)`)
    console.log(`${'='.repeat(70)}\n`)
    console.log('✨ Price update completed successfully!')

  } catch (error) {
    console.error('❌ Error updating ingredient prices:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the update
updateIngredientPrices()
  .then(() => {
    console.log('\n✅ Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
