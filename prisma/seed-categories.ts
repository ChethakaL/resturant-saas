import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding categories from CSV...')

  // Get the first restaurant from the database
  const restaurant = await prisma.restaurant.findFirst()
  if (!restaurant) {
    throw new Error('No restaurant found. Please run the main seed first.')
  }
  console.log(`📍 Using restaurant: ${restaurant.name} (${restaurant.id})`)

  const categories = [
    {
      name: 'Main Dishes',
      description: 'Traditional Iraqi mains',
      displayOrder: 3,
      restaurantId: restaurant.id,
    },
    {
      name: 'Beverages',
      description: 'Hot and cold drinks',
      displayOrder: 7,
      restaurantId: restaurant.id,
    },
    {
      name: 'Appetizers',
      description: 'Mezze and starters',
      displayOrder: 1,
      restaurantId: restaurant.id,
    },
    {
      name: 'Salads',
      description: 'Fresh salads',
      displayOrder: 5,
      restaurantId: restaurant.id,
    },
    {
      name: 'Rice & Sides',
      description: 'Rice dishes and side orders',
      displayOrder: 4,
      restaurantId: restaurant.id,
    },
    {
      name: 'Desserts',
      description: 'Sweet treats',
      displayOrder: 6,
      restaurantId: restaurant.id,
    },
    {
      name: 'Grills',
      description: 'Grilled meats and kebabs',
      displayOrder: 2,
      restaurantId: restaurant.id,
    },
  ]

  // Delete existing categories for this restaurant first (to avoid duplicates)
  await prisma.category.deleteMany({
    where: { restaurantId: restaurant.id },
  })
  console.log('🗑️  Cleared existing categories')

  // Create all categories
  for (const category of categories) {
    await prisma.category.create({
      data: category,
    })
    console.log(`✅ Created category: ${category.name}`)
  }

  console.log('')
  console.log('🎉 Categories seeded successfully!')
  console.log(`   • Total categories: ${categories.length}`)
}

main()
  .catch((e) => {
    console.error('❌ Error seeding categories:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
