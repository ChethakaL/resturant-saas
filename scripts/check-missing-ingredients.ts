import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkMissingIngredients() {
  try {
    console.log('🔍 Checking for missing ingredients...\n')

    // Get all restaurants
    const restaurants = await prisma.restaurant.findMany()
    
    if (restaurants.length === 0) {
      console.log('❌ No restaurants found')
      return
    }

    for (const restaurant of restaurants) {
      console.log(`\n${'='.repeat(70)}`)
      console.log(`Restaurant: ${restaurant.name}`)
      console.log(`${'='.repeat(70)}\n`)

      // Get all ingredients in inventory
      const inventoryIngredients = await prisma.ingredient.findMany({
        where: { restaurantId: restaurant.id },
        select: { id: true, name: true },
      })

      const inventoryMap = new Map(inventoryIngredients.map(ing => [ing.id, ing.name]))

      // Get all menu items with their recipes
      const menuItems = await prisma.menuItem.findMany({
        where: { restaurantId: restaurant.id },
        include: {
          ingredients: {
            include: {
              ingredient: true,
            },
          },
        },
      })

      // Find ingredients used in recipes but not in inventory
      const missingIngredients = new Set<string>()
      const usedIngredientIds = new Set<string>()

      menuItems.forEach(item => {
        item.ingredients.forEach(recipeIng => {
          usedIngredientIds.add(recipeIng.ingredientId)
          
          // Check if ingredient exists in inventory
          if (!inventoryMap.has(recipeIng.ingredientId)) {
            missingIngredients.add(recipeIng.ingredient.name)
          }
        })
      })

      // Also check for ingredients with zero stock
      const zeroStockIngredients = await prisma.ingredient.findMany({
        where: {
          restaurantId: restaurant.id,
          stockQuantity: 0,
        },
        select: { name: true, unit: true, costPerUnit: true },
      })

      console.log('📊 Summary:')
      console.log(`   Total menu items: ${menuItems.length}`)
      console.log(`   Ingredients in inventory: ${inventoryIngredients.length}`)
      console.log(`   Ingredients used in recipes: ${usedIngredientIds.size}`)
      console.log(`   Missing ingredients: ${missingIngredients.size}`)
      console.log(`   Zero stock ingredients: ${zeroStockIngredients.length}\n`)

      if (missingIngredients.size > 0) {
        console.log('❌ Missing Ingredients (used in recipes but not in inventory):')
        console.log('-'.repeat(70))
        missingIngredients.forEach(name => {
          console.log(`   - ${name}`)
        })
        console.log('')
      }

      if (zeroStockIngredients.length > 0) {
        console.log('⚠️  Zero Stock Ingredients:')
        console.log('-'.repeat(70))
        zeroStockIngredients.forEach(ing => {
          console.log(`   - ${ing.name} (${ing.unit}) - Price: ${ing.costPerUnit} IQD`)
        })
        console.log('')
      }

      // Show ingredients with very low stock
      const lowStockIngredients = await prisma.ingredient.findMany({
        where: {
          restaurantId: restaurant.id,
          stockQuantity: { gt: 0, lt: 1 },
        },
        select: { name: true, unit: true, stockQuantity: true, costPerUnit: true },
      })

      if (lowStockIngredients.length > 0) {
        console.log('⚠️  Very Low Stock (< 1 unit):')
        console.log('-'.repeat(70))
        lowStockIngredients.forEach(ing => {
          console.log(`   - ${ing.name}: ${ing.stockQuantity.toFixed(3)} ${ing.unit} - Price: ${ing.costPerUnit} IQD/${ing.unit}`)
        })
        console.log('')
      }

      // Show all ingredients and their stock levels
      const allIngredients = await prisma.ingredient.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { name: 'asc' },
        select: {
          name: true,
          unit: true,
          stockQuantity: true,
          costPerUnit: true,
          minStockLevel: true,
        },
      })

      console.log('📦 All Ingredients Inventory Status:')
      console.log('-'.repeat(70))
      console.log(
        `${'Name'.padEnd(30)} | ${'Stock'.padEnd(12)} | ${'Unit'.padEnd(8)} | ${'Min Level'.padEnd(12)} | Status`
      )
      console.log('-'.repeat(70))

      allIngredients.forEach(ing => {
        const status = ing.stockQuantity === 0 
          ? '🔴 ZERO'
          : ing.stockQuantity < ing.minStockLevel * 0.25
          ? '🔴 CRITICAL'
          : ing.stockQuantity < ing.minStockLevel
          ? '🟡 LOW'
          : '🟢 OK'
        
        console.log(
          `${ing.name.padEnd(30)} | ${ing.stockQuantity.toFixed(2).padEnd(12)} | ${ing.unit.padEnd(8)} | ${ing.minStockLevel.toFixed(2).padEnd(12)} | ${status}`
        )
      })
    }
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkMissingIngredients()
