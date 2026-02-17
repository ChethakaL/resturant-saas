// Test the ingredient price estimator
import { estimateIngredientPrice } from './src/lib/ingredient-price-estimator'

async function testPricing() {
    console.log('=== Testing Ingredient Price Estimation ===\n')

    const testIngredients = [
        { name: 'fresh herbs (dill, chives)', unit: 'tbsp' },
        { name: 'fresh herbs (dill, chives, parsley)', unit: 'g' },
        { name: 'fresh mozzarella', unit: 'g' },
        { name: 'hibiscus tea', unit: 'serving' },
        { name: 'hibiscus tea bags', unit: 'piece' },
        { name: 'honey', unit: 'g' },
        { name: 'hot water', unit: 'ml' },
        { name: 'ice', unit: 'cup' },
        { name: 'lemon', unit: 'slice' },
        { name: 'chicken breast', unit: 'kg' },
    ]

    for (const ingredient of testIngredients) {
        const estimate = await estimateIngredientPrice(ingredient.name, ingredient.unit)
        console.log(`${ingredient.name} (${ingredient.unit}):`)
        console.log(`  Price: ${estimate.costPerUnit} IQD`)
        console.log(`  Source: ${estimate.source}`)
        console.log(`  Confidence: ${estimate.confidence}`)
        console.log()
    }
}

testPricing().catch(console.error)
