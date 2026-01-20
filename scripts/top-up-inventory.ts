import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Reasonable stock levels for ingredients (based on minStockLevel or typical restaurant needs)
async function topUpInventory() {
  try {
    console.log('🔄 Topping up inventory...\n')

    const restaurants = await prisma.restaurant.findMany()
    
    if (restaurants.length === 0) {
      console.log('❌ No restaurants found')
      return
    }

    for (const restaurant of restaurants) {
      console.log(`\n${'='.repeat(70)}`)
      console.log(`Restaurant: ${restaurant.name}`)
      console.log(`${'='.repeat(70)}\n`)

      const ingredients = await prisma.ingredient.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { name: 'asc' },
      })

      let updatedCount = 0
      let skippedCount = 0

      console.log('📦 Updating stock levels:')
      console.log('-'.repeat(70))
      console.log(
        `${'Name'.padEnd(30)} | ${'Old Stock'.padEnd(12)} | ${'New Stock'.padEnd(12)} | Status`
      )
      console.log('-'.repeat(70))

      for (const ingredient of ingredients) {
        let newStock = ingredient.stockQuantity
        let shouldUpdate = false

        // If stock is zero, set it to at least minStockLevel or a reasonable default
        if (ingredient.stockQuantity === 0) {
          if (ingredient.minStockLevel > 0) {
            newStock = ingredient.minStockLevel * 2 // Set to 2x minimum for safety
          } else {
            // Set reasonable defaults based on ingredient type
            const defaults: Record<string, number> = {
              'Salt': 50, // kg
              'Red Lentils': 30, // kg
            }
            newStock = defaults[ingredient.name] || 20
          }
          shouldUpdate = true
        }
        // If stock is very low (< 25% of min), top it up to minStockLevel
        else if (ingredient.minStockLevel > 0 && ingredient.stockQuantity < ingredient.minStockLevel * 0.25) {
          newStock = ingredient.minStockLevel * 1.5 // Set to 1.5x minimum
          shouldUpdate = true
        }
        // If stock is below minimum, top it up to minimum
        else if (ingredient.minStockLevel > 0 && ingredient.stockQuantity < ingredient.minStockLevel) {
          newStock = ingredient.minStockLevel * 1.2 // Set to 1.2x minimum
          shouldUpdate = true
        }

        if (shouldUpdate) {
          await prisma.ingredient.update({
            where: { id: ingredient.id },
            data: { stockQuantity: newStock },
          })

          const change = newStock - ingredient.stockQuantity
          console.log(
            `${ingredient.name.padEnd(30)} | ${ingredient.stockQuantity.toFixed(2).padEnd(12)} | ${newStock.toFixed(2).padEnd(12)} | ✅ +${change.toFixed(2)} ${ingredient.unit}`
          )
          updatedCount++
        } else {
          console.log(
            `${ingredient.name.padEnd(30)} | ${ingredient.stockQuantity.toFixed(2).padEnd(12)} | ${ingredient.stockQuantity.toFixed(2).padEnd(12)} | ✓ OK`
          )
          skippedCount++
        }
      }

      console.log(`\n${'='.repeat(70)}`)
      console.log('📊 Summary:')
      console.log(`   ✅ Updated: ${updatedCount} ingredients`)
      console.log(`   ✓ Skipped: ${skippedCount} ingredients (already sufficient)`)
      console.log(`${'='.repeat(70)}\n`)
    }

    console.log('✨ Inventory top-up completed successfully!')
  } catch (error) {
    console.error('❌ Error topping up inventory:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

topUpInventory()
  .then(() => {
    console.log('\n✅ Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
