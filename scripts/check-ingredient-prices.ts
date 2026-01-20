import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkIngredientPrices() {
  try {
    // Get all restaurants
    const restaurants = await prisma.restaurant.findMany()
    
    if (restaurants.length === 0) {
      console.log('No restaurants found in database')
      return
    }

    console.log(`Found ${restaurants.length} restaurant(s)\n`)

    for (const restaurant of restaurants) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`Restaurant: ${restaurant.name} (${restaurant.id})`)
      console.log(`${'='.repeat(60)}\n`)

      const ingredients = await prisma.ingredient.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { name: 'asc' },
      })

      if (ingredients.length === 0) {
        console.log('No ingredients found for this restaurant\n')
        continue
      }

      console.log(`Found ${ingredients.length} ingredients:\n`)
      console.log('Current Prices:')
      console.log('-'.repeat(60))
      console.log(
        `${'Name'.padEnd(25)} | ${'Unit'.padEnd(10)} | ${'Current Price (IQD)'.padEnd(20)} | Stock`
      )
      console.log('-'.repeat(60))

      const ingredientList: Array<{
        id: string
        name: string
        unit: string
        currentPrice: number
        stockQuantity: number
      }> = []

      for (const ingredient of ingredients) {
        console.log(
          `${ingredient.name.padEnd(25)} | ${ingredient.unit.padEnd(10)} | ${ingredient.costPerUnit
            .toFixed(2)
            .padEnd(20)} | ${ingredient.stockQuantity}`
        )
        ingredientList.push({
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          currentPrice: ingredient.costPerUnit,
          stockQuantity: ingredient.stockQuantity,
        })
      }

      console.log('\n')
      console.log('JSON format for reference:')
      console.log(JSON.stringify(ingredientList, null, 2))
    }
  } catch (error) {
    console.error('Error checking ingredient prices:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkIngredientPrices()
