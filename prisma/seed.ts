import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Unsplash image IDs for Iraqi/Middle Eastern food
const foodImages = {
  // Appetizers
  hummus: 'https://images.unsplash.com/photo-1571159456876-1eb03b6ac7f3',
  babaGhanoush: 'https://images.unsplash.com/photo-1570197788417-0e82375c9371',
  sambousek: 'https://images.unsplash.com/photo-1601050690597-df0568f70950',
  falafel: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783',
  fattoush: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c',

  // Grills
  chickenKebab: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143',
  lambKebab: 'https://images.unsplash.com/photo-1529042410759-befb1204b468',
  mixedGrill: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1',
  tikka: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0',

  // Mains
  biryani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8',
  kabsa: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7',
  masgouf: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2',
  dolma: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d',

  // Rice
  rice: 'https://images.unsplash.com/photo-1516684732162-798a0062be99',

  // Desserts
  baklava: 'https://images.unsplash.com/photo-1519676867240-f03562e64548',
  kunafa: 'https://images.unsplash.com/photo-1608039251485-b1e20e8f4f18',

  // Drinks
  tea: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9',
  juice: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba',
  coffee: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93',
}

async function main() {
  console.log('🌱 Starting seed...')

  // Note: No need to clear data after migrate reset

  // ═══════════════════════════════════════════════════════════════
  // 1. CREATE RESTAURANT
  // ═══════════════════════════════════════════════════════════════
  console.log('🏪 Creating restaurant...')
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Al-Rafidain Restaurant',
      slug: 'al-rafidain',
      email: 'info@alrafidain.iq',
      phone: '+964 770 123 4567',
      address: 'Baghdad, Iraq',
      currency: 'IQD',
      timezone: 'Asia/Baghdad',
      settings: {
        operatingHours: {
          open: '10:00',
          close: '23:00',
        },
        tables: 25,
        seatingCapacity: 100,
      },
    },
  })

  // ═══════════════════════════════════════════════════════════════
  // 2. CREATE USERS
  // ═══════════════════════════════════════════════════════════════
  console.log('👥 Creating users...')
  const hashedPassword = await bcrypt.hash('password123', 10)

  const owner = await prisma.user.create({
    data: {
      email: 'owner@alrafidain.iq',
      password: hashedPassword,
      name: 'Ahmad Al-Rafidain',
      role: 'OWNER',
      restaurantId: restaurant.id,
    },
  })

  await prisma.user.create({
    data: {
      email: 'manager@alrafidain.iq',
      password: hashedPassword,
      name: 'Fatima Hassan',
      role: 'MANAGER',
      restaurantId: restaurant.id,
    },
  })

  await prisma.user.create({
    data: {
      email: 'staff@alrafidain.iq',
      password: hashedPassword,
      name: 'Ali Mohammed',
      role: 'STAFF',
      restaurantId: restaurant.id,
    },
  })

  // ═══════════════════════════════════════════════════════════════
  // 3. CREATE INGREDIENTS
  // ═══════════════════════════════════════════════════════════════
  console.log('🥬 Creating ingredients...')

  const ingredients = await Promise.all([
    // Proteins
    prisma.ingredient.create({
      data: {
        name: 'Chicken Breast',
        unit: 'kg',
        stockQuantity: 45,
        costPerUnit: 8000,
        minStockLevel: 40,
        supplier: 'Baghdad Poultry Co.',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Lamb Meat',
        unit: 'kg',
        stockQuantity: 25,
        costPerUnit: 15000,
        minStockLevel: 20,
        supplier: 'Iraqi Meat Suppliers',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Beef',
        unit: 'kg',
        stockQuantity: 30,
        costPerUnit: 12000,
        minStockLevel: 25,
        supplier: 'Iraqi Meat Suppliers',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Fresh Fish (Carp)',
        unit: 'kg',
        stockQuantity: 15,
        costPerUnit: 10000,
        minStockLevel: 12,
        supplier: 'Tigris Fish Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Ground Chickpeas',
        unit: 'kg',
        stockQuantity: 20,
        costPerUnit: 3000,
        minStockLevel: 15,
        supplier: 'Local Market',
        restaurantId: restaurant.id,
      },
    }),

    // Grains & Bread
    prisma.ingredient.create({
      data: {
        name: 'Basmati Rice',
        unit: 'kg',
        stockQuantity: 120,
        costPerUnit: 2500,
        minStockLevel: 100,
        supplier: 'Al-Anbar Rice Traders',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Bulgur Wheat',
        unit: 'kg',
        stockQuantity: 40,
        costPerUnit: 2000,
        minStockLevel: 30,
        supplier: 'Local Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Flour',
        unit: 'kg',
        stockQuantity: 60,
        costPerUnit: 1500,
        minStockLevel: 50,
        supplier: 'Baghdad Mills',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Pita Bread',
        unit: 'piece',
        stockQuantity: 300,
        costPerUnit: 500,
        minStockLevel: 200,
        supplier: 'Local Bakery',
        restaurantId: restaurant.id,
      },
    }),

    // Vegetables
    prisma.ingredient.create({
      data: {
        name: 'Tomatoes',
        unit: 'kg',
        stockQuantity: 50,
        costPerUnit: 1500,
        minStockLevel: 40,
        supplier: 'Vegetable Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Onions',
        unit: 'kg',
        stockQuantity: 60,
        costPerUnit: 1000,
        minStockLevel: 50,
        supplier: 'Vegetable Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Bell Peppers',
        unit: 'kg',
        stockQuantity: 25,
        costPerUnit: 2000,
        minStockLevel: 20,
        supplier: 'Vegetable Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Eggplant',
        unit: 'kg',
        stockQuantity: 30,
        costPerUnit: 1800,
        minStockLevel: 25,
        supplier: 'Vegetable Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Lettuce',
        unit: 'kg',
        stockQuantity: 20,
        costPerUnit: 1200,
        minStockLevel: 15,
        supplier: 'Vegetable Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Cucumbers',
        unit: 'kg',
        stockQuantity: 25,
        costPerUnit: 1000,
        minStockLevel: 20,
        supplier: 'Vegetable Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Grape Leaves',
        unit: 'kg',
        stockQuantity: 8,
        costPerUnit: 5000,
        minStockLevel: 10,
        supplier: 'Specialty Market',
        notes: 'LOW STOCK - Below minimum',
        restaurantId: restaurant.id,
      },
    }),

    // Dairy
    prisma.ingredient.create({
      data: {
        name: 'Yogurt',
        unit: 'kg',
        stockQuantity: 40,
        costPerUnit: 3500,
        minStockLevel: 30,
        supplier: 'Dairy Farm',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Butter',
        unit: 'kg',
        stockQuantity: 15,
        costPerUnit: 8000,
        minStockLevel: 12,
        supplier: 'Dairy Farm',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Cheese (Akkawi)',
        unit: 'kg',
        stockQuantity: 12,
        costPerUnit: 12000,
        minStockLevel: 10,
        supplier: 'Damascus Cheese Co.',
        restaurantId: restaurant.id,
      },
    }),

    // Spices & Seasonings
    prisma.ingredient.create({
      data: {
        name: 'Turmeric',
        unit: 'kg',
        stockQuantity: 5,
        costPerUnit: 15000,
        minStockLevel: 3,
        supplier: 'Spice Souk',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Cumin',
        unit: 'kg',
        stockQuantity: 6,
        costPerUnit: 12000,
        minStockLevel: 4,
        supplier: 'Spice Souk',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Cardamom',
        unit: 'kg',
        stockQuantity: 3,
        costPerUnit: 80000,
        minStockLevel: 2,
        supplier: 'Spice Souk',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Saffron',
        unit: 'gram',
        stockQuantity: 50,
        costPerUnit: 2000,
        minStockLevel: 30,
        supplier: 'Premium Spice Traders',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Black Pepper',
        unit: 'kg',
        stockQuantity: 4,
        costPerUnit: 20000,
        minStockLevel: 3,
        supplier: 'Spice Souk',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Cinnamon',
        unit: 'kg',
        stockQuantity: 3.5,
        costPerUnit: 18000,
        minStockLevel: 2.5,
        supplier: 'Spice Souk',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Sumac',
        unit: 'kg',
        stockQuantity: 4,
        costPerUnit: 14000,
        minStockLevel: 3,
        supplier: 'Spice Souk',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Za\'atar Mix',
        unit: 'kg',
        stockQuantity: 5,
        costPerUnit: 10000,
        minStockLevel: 4,
        supplier: 'Spice Souk',
        restaurantId: restaurant.id,
      },
    }),

    // Oils & Fats
    prisma.ingredient.create({
      data: {
        name: 'Olive Oil',
        unit: 'liter',
        stockQuantity: 25,
        costPerUnit: 12000,
        minStockLevel: 20,
        supplier: 'Mediterranean Imports',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Vegetable Oil',
        unit: 'liter',
        stockQuantity: 40,
        costPerUnit: 3000,
        minStockLevel: 30,
        supplier: 'Local Market',
        restaurantId: restaurant.id,
      },
    }),

    // Others
    prisma.ingredient.create({
      data: {
        name: 'Tahini',
        unit: 'kg',
        stockQuantity: 15,
        costPerUnit: 8000,
        minStockLevel: 12,
        supplier: 'Local Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Lemon Juice',
        unit: 'liter',
        stockQuantity: 18,
        costPerUnit: 5000,
        minStockLevel: 15,
        supplier: 'Local Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Garlic',
        unit: 'kg',
        stockQuantity: 10,
        costPerUnit: 4000,
        minStockLevel: 8,
        supplier: 'Vegetable Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Parsley',
        unit: 'kg',
        stockQuantity: 5,
        costPerUnit: 3000,
        minStockLevel: 4,
        supplier: 'Vegetable Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Mint',
        unit: 'kg',
        stockQuantity: 4,
        costPerUnit: 3500,
        minStockLevel: 3,
        supplier: 'Vegetable Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Dates',
        unit: 'kg',
        stockQuantity: 20,
        costPerUnit: 6000,
        minStockLevel: 15,
        supplier: 'Basra Date Farm',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Phyllo Dough',
        unit: 'kg',
        stockQuantity: 10,
        costPerUnit: 5000,
        minStockLevel: 8,
        supplier: 'Bakery Supply',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Pistachios',
        unit: 'kg',
        stockQuantity: 8,
        costPerUnit: 45000,
        minStockLevel: 6,
        supplier: 'Premium Nuts Supplier',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Rose Water',
        unit: 'liter',
        stockQuantity: 6,
        costPerUnit: 15000,
        minStockLevel: 4,
        supplier: 'Specialty Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Sugar',
        unit: 'kg',
        stockQuantity: 50,
        costPerUnit: 1800,
        minStockLevel: 40,
        supplier: 'Local Market',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Tea Leaves',
        unit: 'kg',
        stockQuantity: 12,
        costPerUnit: 18000,
        minStockLevel: 10,
        supplier: 'Tea Importers',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Coffee Beans',
        unit: 'kg',
        stockQuantity: 15,
        costPerUnit: 25000,
        minStockLevel: 12,
        supplier: 'Iraqi Coffee Roasters',
        restaurantId: restaurant.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        name: 'Orange Juice (Fresh)',
        unit: 'liter',
        stockQuantity: 20,
        costPerUnit: 8000,
        minStockLevel: 15,
        supplier: 'Juice Bar Supply',
        restaurantId: restaurant.id,
      },
    }),
  ])

  const [
    chicken, lamb, beef, fish, chickpeas,
    rice, bulgur, flour, pita,
    tomatoes, onions, peppers, eggplant, lettuce, cucumbers, grapeLeaves,
    yogurt, butter, cheese,
    turmeric, cumin, cardamom, saffron, blackPepper, cinnamon, sumac, zaatar,
    oliveOil, vegOil,
    tahini, lemonJuice, garlic, parsley, mint, dates, phylloDough, pistachios, roseWater, sugar,
    teaLeaves, coffeeBeans, orangeJuiceIngredient
  ] = ingredients

  console.log(`✅ Created ${ingredients.length} ingredients`)

  // ═══════════════════════════════════════════════════════════════
  // 4. CREATE CATEGORIES
  // ═══════════════════════════════════════════════════════════════
  console.log('📂 Creating categories...')

  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Appetizers',
        description: 'Mezze and starters',
        displayOrder: 1,
        restaurantId: restaurant.id,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Grills',
        description: 'Grilled meats and kebabs',
        displayOrder: 2,
        restaurantId: restaurant.id,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Main Dishes',
        description: 'Traditional Iraqi mains',
        displayOrder: 3,
        restaurantId: restaurant.id,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Rice & Sides',
        description: 'Rice dishes and side orders',
        displayOrder: 4,
        restaurantId: restaurant.id,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Salads',
        description: 'Fresh salads',
        displayOrder: 5,
        restaurantId: restaurant.id,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Desserts',
        description: 'Sweet treats',
        displayOrder: 6,
        restaurantId: restaurant.id,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Beverages',
        description: 'Hot and cold drinks',
        displayOrder: 7,
        restaurantId: restaurant.id,
      },
    }),
  ])

  const [appetizersCategory, grillsCategory, mainsCategory, riceCategory, saladsCategory, dessertsCategory, beveragesCategory] = categories

  console.log(`✅ Created ${categories.length} categories`)

  // ═══════════════════════════════════════════════════════════════
  // 5. CREATE MENU ITEMS
  // ═══════════════════════════════════════════════════════════════
  console.log('🍽️  Creating menu items...')

  const menuItems = await Promise.all([
    // APPETIZERS
    prisma.menuItem.create({
      data: {
        name: 'Classic Hummus',
        description: 'Creamy chickpea dip with tahini, olive oil, and lemon',
        price: 5000,
        imageUrl: foodImages.hummus,
        categoryId: appetizersCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Baba Ghanoush',
        description: 'Smoky eggplant dip with tahini and garlic',
        price: 5500,
        imageUrl: foodImages.babaGhanoush,
        categoryId: appetizersCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Meat Sambousek',
        description: 'Crispy pastries filled with spiced ground beef',
        price: 7000,
        imageUrl: foodImages.sambousek,
        categoryId: appetizersCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Falafel Platter',
        description: 'Crispy chickpea fritters with tahini sauce',
        price: 6000,
        imageUrl: foodImages.falafel,
        categoryId: appetizersCategory.id,
        restaurantId: restaurant.id,
      },
    }),

    // GRILLS
    prisma.menuItem.create({
      data: {
        name: 'Chicken Tikka Kebab',
        description: 'Marinated grilled chicken skewers with Iraqi spices',
        price: 12000,
        imageUrl: foodImages.chickenKebab,
        categoryId: grillsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Lamb Kebab',
        description: 'Tender lamb skewers charcoal grilled to perfection',
        price: 18000,
        imageUrl: foodImages.lambKebab,
        categoryId: grillsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Mixed Grill Platter',
        description: 'Assortment of chicken, lamb, and beef kebabs',
        price: 25000,
        imageUrl: foodImages.mixedGrill,
        categoryId: grillsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Beef Tikka',
        description: 'Marinated beef cubes grilled on skewers',
        price: 15000,
        imageUrl: foodImages.tikka,
        categoryId: grillsCategory.id,
        restaurantId: restaurant.id,
      },
    }),

    // MAIN DISHES
    prisma.menuItem.create({
      data: {
        name: 'Chicken Biryani',
        description: 'Aromatic rice with spiced chicken, saffron, and nuts',
        price: 13000,
        imageUrl: foodImages.biryani,
        categoryId: mainsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Lamb Kabsa',
        description: 'Traditional spiced rice with tender lamb',
        price: 20000,
        imageUrl: foodImages.kabsa,
        categoryId: mainsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Masgouf (Iraqi Grilled Fish)',
        description: 'Tigris River carp butterflied and charcoal grilled',
        price: 22000,
        imageUrl: foodImages.masgouf,
        categoryId: mainsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Dolma (Stuffed Grape Leaves)',
        description: 'Grape leaves stuffed with rice, herbs, and spices',
        price: 11000,
        imageUrl: foodImages.dolma,
        categoryId: mainsCategory.id,
        restaurantId: restaurant.id,
      },
    }),

    // RICE & SIDES
    prisma.menuItem.create({
      data: {
        name: 'Saffron Rice',
        description: 'Fragrant basmati rice with saffron',
        price: 4000,
        imageUrl: foodImages.rice,
        categoryId: riceCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Vermicelli Rice',
        description: 'Rice pilaf with toasted vermicelli',
        price: 3500,
        imageUrl: foodImages.rice,
        categoryId: riceCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Yogurt with Cucumber',
        description: 'Refreshing yogurt dip with diced cucumber',
        price: 3000,
        imageUrl: foodImages.rice,
        categoryId: riceCategory.id,
        restaurantId: restaurant.id,
      },
    }),

    // SALADS
    prisma.menuItem.create({
      data: {
        name: 'Fattoush Salad',
        description: 'Mixed greens with crispy pita chips and sumac dressing',
        price: 6000,
        imageUrl: foodImages.fattoush,
        categoryId: saladsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Tabouleh',
        description: 'Parsley salad with bulgur, tomatoes, and lemon',
        price: 5500,
        imageUrl: foodImages.fattoush,
        categoryId: saladsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Shepherd Salad',
        description: 'Diced tomatoes, cucumbers, and onions',
        price: 5000,
        imageUrl: foodImages.fattoush,
        categoryId: saladsCategory.id,
        restaurantId: restaurant.id,
      },
    }),

    // DESSERTS
    prisma.menuItem.create({
      data: {
        name: 'Baklava',
        description: 'Layers of phyllo with pistachios and honey',
        price: 6000,
        imageUrl: foodImages.baklava,
        categoryId: dessertsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Kunafa with Cheese',
        description: 'Shredded phyllo dessert with sweet cheese',
        price: 7000,
        imageUrl: foodImages.kunafa,
        categoryId: dessertsCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Date Cookies',
        description: 'Traditional cookies filled with date paste',
        price: 4000,
        imageUrl: foodImages.baklava,
        categoryId: dessertsCategory.id,
        restaurantId: restaurant.id,
      },
    }),

    // BEVERAGES
    prisma.menuItem.create({
      data: {
        name: 'Iraqi Tea',
        description: 'Traditional black tea with cardamom',
        price: 1500,
        imageUrl: foodImages.tea,
        categoryId: beveragesCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Turkish Coffee',
        description: 'Strong coffee with cardamom',
        price: 2000,
        imageUrl: foodImages.coffee,
        categoryId: beveragesCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Fresh Orange Juice',
        description: 'Freshly squeezed orange juice',
        price: 3500,
        imageUrl: foodImages.juice,
        categoryId: beveragesCategory.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Ayran (Yogurt Drink)',
        description: 'Refreshing salted yogurt drink',
        price: 2500,
        imageUrl: foodImages.juice,
        categoryId: beveragesCategory.id,
        restaurantId: restaurant.id,
      },
    }),
  ])

  console.log(`✅ Created ${menuItems.length} menu items`)

  const [
    hummus, babaGhanoush, sambousek, falafel,
    chickenKebab, lambKebab, mixedGrill, beefTikka,
    chickenBiryani, lambKabsa, masgouf, dolma,
    saffronRice, vermicelliRice, yogurtCucumber,
    fattoush, tabouleh, shepherdSalad,
    baklava, kunafa, dateCookies,
    iraqiTea, turkishCoffee, orangeJuice, ayran
  ] = menuItems

  // ═══════════════════════════════════════════════════════════════
  // 6. CREATE MENU ITEM RECIPES (INGREDIENTS)
  // ═══════════════════════════════════════════════════════════════
  console.log('📝 Creating recipes (menu item ingredients)...')

  await Promise.all([
    // HUMMUS
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: hummus.id, ingredientId: chickpeas.id, quantity: 0.15 },
        { menuItemId: hummus.id, ingredientId: tahini.id, quantity: 0.05 },
        { menuItemId: hummus.id, ingredientId: lemonJuice.id, quantity: 0.03 },
        { menuItemId: hummus.id, ingredientId: garlic.id, quantity: 0.01 },
        { menuItemId: hummus.id, ingredientId: oliveOil.id, quantity: 0.02 },
      ],
    }),

    // BABA GHANOUSH
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: babaGhanoush.id, ingredientId: eggplant.id, quantity: 0.25 },
        { menuItemId: babaGhanoush.id, ingredientId: tahini.id, quantity: 0.04 },
        { menuItemId: babaGhanoush.id, ingredientId: lemonJuice.id, quantity: 0.02 },
        { menuItemId: babaGhanoush.id, ingredientId: garlic.id, quantity: 0.01 },
        { menuItemId: babaGhanoush.id, ingredientId: oliveOil.id, quantity: 0.02 },
      ],
    }),

    // SAMBOUSEK
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: sambousek.id, ingredientId: beef.id, quantity: 0.12 },
        { menuItemId: sambousek.id, ingredientId: flour.id, quantity: 0.08 },
        { menuItemId: sambousek.id, ingredientId: onions.id, quantity: 0.05 },
        { menuItemId: sambousek.id, ingredientId: blackPepper.id, quantity: 0.002 },
        { menuItemId: sambousek.id, ingredientId: vegOil.id, quantity: 0.05 },
      ],
    }),

    // FALAFEL
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: falafel.id, ingredientId: chickpeas.id, quantity: 0.2 },
        { menuItemId: falafel.id, ingredientId: onions.id, quantity: 0.05 },
        { menuItemId: falafel.id, ingredientId: garlic.id, quantity: 0.01 },
        { menuItemId: falafel.id, ingredientId: parsley.id, quantity: 0.03 },
        { menuItemId: falafel.id, ingredientId: cumin.id, quantity: 0.005 },
        { menuItemId: falafel.id, ingredientId: vegOil.id, quantity: 0.1 },
      ],
    }),

    // CHICKEN TIKKA KEBAB
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: chickenKebab.id, ingredientId: chicken.id, quantity: 0.3 },
        { menuItemId: chickenKebab.id, ingredientId: yogurt.id, quantity: 0.05 },
        { menuItemId: chickenKebab.id, ingredientId: lemonJuice.id, quantity: 0.02 },
        { menuItemId: chickenKebab.id, ingredientId: turmeric.id, quantity: 0.003 },
        { menuItemId: chickenKebab.id, ingredientId: cumin.id, quantity: 0.003 },
        { menuItemId: chickenKebab.id, ingredientId: garlic.id, quantity: 0.01 },
      ],
    }),

    // LAMB KEBAB
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: lambKebab.id, ingredientId: lamb.id, quantity: 0.35 },
        { menuItemId: lambKebab.id, ingredientId: onions.id, quantity: 0.05 },
        { menuItemId: lambKebab.id, ingredientId: sumac.id, quantity: 0.005 },
        { menuItemId: lambKebab.id, ingredientId: blackPepper.id, quantity: 0.003 },
        { menuItemId: lambKebab.id, ingredientId: oliveOil.id, quantity: 0.02 },
      ],
    }),

    // MIXED GRILL
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: mixedGrill.id, ingredientId: chicken.id, quantity: 0.15 },
        { menuItemId: mixedGrill.id, ingredientId: lamb.id, quantity: 0.2 },
        { menuItemId: mixedGrill.id, ingredientId: beef.id, quantity: 0.15 },
        { menuItemId: mixedGrill.id, ingredientId: onions.id, quantity: 0.08 },
        { menuItemId: mixedGrill.id, ingredientId: peppers.id, quantity: 0.08 },
        { menuItemId: mixedGrill.id, ingredientId: tomatoes.id, quantity: 0.1 },
      ],
    }),

    // BEEF TIKKA
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: beefTikka.id, ingredientId: beef.id, quantity: 0.3 },
        { menuItemId: beefTikka.id, ingredientId: yogurt.id, quantity: 0.05 },
        { menuItemId: beefTikka.id, ingredientId: turmeric.id, quantity: 0.003 },
        { menuItemId: beefTikka.id, ingredientId: cumin.id, quantity: 0.003 },
        { menuItemId: beefTikka.id, ingredientId: garlic.id, quantity: 0.01 },
      ],
    }),

    // CHICKEN BIRYANI
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: chickenBiryani.id, ingredientId: chicken.id, quantity: 0.25 },
        { menuItemId: chickenBiryani.id, ingredientId: rice.id, quantity: 0.25 },
        { menuItemId: chickenBiryani.id, ingredientId: onions.id, quantity: 0.08 },
        { menuItemId: chickenBiryani.id, ingredientId: tomatoes.id, quantity: 0.08 },
        { menuItemId: chickenBiryani.id, ingredientId: yogurt.id, quantity: 0.05 },
        { menuItemId: chickenBiryani.id, ingredientId: turmeric.id, quantity: 0.003 },
        { menuItemId: chickenBiryani.id, ingredientId: cumin.id, quantity: 0.003 },
        { menuItemId: chickenBiryani.id, ingredientId: cardamom.id, quantity: 0.002 },
        { menuItemId: chickenBiryani.id, ingredientId: saffron.id, quantity: 2 },
      ],
    }),

    // LAMB KABSA
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: lambKabsa.id, ingredientId: lamb.id, quantity: 0.35 },
        { menuItemId: lambKabsa.id, ingredientId: rice.id, quantity: 0.3 },
        { menuItemId: lambKabsa.id, ingredientId: onions.id, quantity: 0.1 },
        { menuItemId: lambKabsa.id, ingredientId: tomatoes.id, quantity: 0.1 },
        { menuItemId: lambKabsa.id, ingredientId: cardamom.id, quantity: 0.003 },
        { menuItemId: lambKabsa.id, ingredientId: cinnamon.id, quantity: 0.003 },
        { menuItemId: lambKabsa.id, ingredientId: blackPepper.id, quantity: 0.002 },
      ],
    }),

    // MASGOUF
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: masgouf.id, ingredientId: fish.id, quantity: 0.5 },
        { menuItemId: masgouf.id, ingredientId: tomatoes.id, quantity: 0.15 },
        { menuItemId: masgouf.id, ingredientId: onions.id, quantity: 0.1 },
        { menuItemId: masgouf.id, ingredientId: lemonJuice.id, quantity: 0.05 },
        { menuItemId: masgouf.id, ingredientId: turmeric.id, quantity: 0.003 },
      ],
    }),

    // DOLMA
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: dolma.id, ingredientId: grapeLeaves.id, quantity: 0.15 },
        { menuItemId: dolma.id, ingredientId: rice.id, quantity: 0.12 },
        { menuItemId: dolma.id, ingredientId: tomatoes.id, quantity: 0.08 },
        { menuItemId: dolma.id, ingredientId: onions.id, quantity: 0.05 },
        { menuItemId: dolma.id, ingredientId: parsley.id, quantity: 0.03 },
        { menuItemId: dolma.id, ingredientId: mint.id, quantity: 0.02 },
        { menuItemId: dolma.id, ingredientId: lemonJuice.id, quantity: 0.03 },
      ],
    }),

    // SAFFRON RICE
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: saffronRice.id, ingredientId: rice.id, quantity: 0.2 },
        { menuItemId: saffronRice.id, ingredientId: saffron.id, quantity: 1 },
        { menuItemId: saffronRice.id, ingredientId: butter.id, quantity: 0.02 },
      ],
    }),

    // VERMICELLI RICE
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: vermicelliRice.id, ingredientId: rice.id, quantity: 0.18 },
        { menuItemId: vermicelliRice.id, ingredientId: butter.id, quantity: 0.02 },
      ],
    }),

    // YOGURT CUCUMBER
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: yogurtCucumber.id, ingredientId: yogurt.id, quantity: 0.15 },
        { menuItemId: yogurtCucumber.id, ingredientId: cucumbers.id, quantity: 0.1 },
        { menuItemId: yogurtCucumber.id, ingredientId: garlic.id, quantity: 0.005 },
        { menuItemId: yogurtCucumber.id, ingredientId: mint.id, quantity: 0.01 },
      ],
    }),

    // FATTOUSH
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: fattoush.id, ingredientId: lettuce.id, quantity: 0.15 },
        { menuItemId: fattoush.id, ingredientId: tomatoes.id, quantity: 0.1 },
        { menuItemId: fattoush.id, ingredientId: cucumbers.id, quantity: 0.1 },
        { menuItemId: fattoush.id, ingredientId: pita.id, quantity: 2 },
        { menuItemId: fattoush.id, ingredientId: sumac.id, quantity: 0.005 },
        { menuItemId: fattoush.id, ingredientId: lemonJuice.id, quantity: 0.03 },
        { menuItemId: fattoush.id, ingredientId: oliveOil.id, quantity: 0.03 },
      ],
    }),

    // TABOULEH
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: tabouleh.id, ingredientId: parsley.id, quantity: 0.15 },
        { menuItemId: tabouleh.id, ingredientId: bulgur.id, quantity: 0.05 },
        { menuItemId: tabouleh.id, ingredientId: tomatoes.id, quantity: 0.1 },
        { menuItemId: tabouleh.id, ingredientId: onions.id, quantity: 0.03 },
        { menuItemId: tabouleh.id, ingredientId: mint.id, quantity: 0.02 },
        { menuItemId: tabouleh.id, ingredientId: lemonJuice.id, quantity: 0.04 },
        { menuItemId: tabouleh.id, ingredientId: oliveOil.id, quantity: 0.03 },
      ],
    }),

    // SHEPHERD SALAD
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: shepherdSalad.id, ingredientId: tomatoes.id, quantity: 0.15 },
        { menuItemId: shepherdSalad.id, ingredientId: cucumbers.id, quantity: 0.15 },
        { menuItemId: shepherdSalad.id, ingredientId: onions.id, quantity: 0.08 },
        { menuItemId: shepherdSalad.id, ingredientId: peppers.id, quantity: 0.08 },
        { menuItemId: shepherdSalad.id, ingredientId: lemonJuice.id, quantity: 0.02 },
        { menuItemId: shepherdSalad.id, ingredientId: oliveOil.id, quantity: 0.02 },
      ],
    }),

    // BAKLAVA
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: baklava.id, ingredientId: phylloDough.id, quantity: 0.1 },
        { menuItemId: baklava.id, ingredientId: pistachios.id, quantity: 0.08 },
        { menuItemId: baklava.id, ingredientId: butter.id, quantity: 0.05 },
        { menuItemId: baklava.id, ingredientId: sugar.id, quantity: 0.1 },
        { menuItemId: baklava.id, ingredientId: roseWater.id, quantity: 0.01 },
      ],
    }),

    // KUNAFA
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: kunafa.id, ingredientId: phylloDough.id, quantity: 0.12 },
        { menuItemId: kunafa.id, ingredientId: cheese.id, quantity: 0.15 },
        { menuItemId: kunafa.id, ingredientId: butter.id, quantity: 0.06 },
        { menuItemId: kunafa.id, ingredientId: sugar.id, quantity: 0.12 },
        { menuItemId: kunafa.id, ingredientId: roseWater.id, quantity: 0.015 },
      ],
    }),

    // DATE COOKIES
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: dateCookies.id, ingredientId: flour.id, quantity: 0.12 },
        { menuItemId: dateCookies.id, ingredientId: dates.id, quantity: 0.1 },
        { menuItemId: dateCookies.id, ingredientId: butter.id, quantity: 0.05 },
        { menuItemId: dateCookies.id, ingredientId: sugar.id, quantity: 0.05 },
      ],
    }),

    // IRAQI TEA
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: iraqiTea.id, ingredientId: teaLeaves.id, quantity: 0.01 },
        { menuItemId: iraqiTea.id, ingredientId: cardamom.id, quantity: 0.002 },
        { menuItemId: iraqiTea.id, ingredientId: sugar.id, quantity: 0.015 },
      ],
    }),

    // TURKISH COFFEE
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: turkishCoffee.id, ingredientId: coffeeBeans.id, quantity: 0.015 },
        { menuItemId: turkishCoffee.id, ingredientId: cardamom.id, quantity: 0.001 },
        { menuItemId: turkishCoffee.id, ingredientId: sugar.id, quantity: 0.01 },
      ],
    }),

    // ORANGE JUICE
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: orangeJuice.id, ingredientId: orangeJuiceIngredient.id, quantity: 0.3 },
        { menuItemId: orangeJuice.id, ingredientId: sugar.id, quantity: 0.02 },
      ],
    }),

    // AYRAN
    prisma.menuItemIngredient.createMany({
      data: [
        { menuItemId: ayran.id, ingredientId: yogurt.id, quantity: 0.2 },
        { menuItemId: ayran.id, ingredientId: mint.id, quantity: 0.005 },
      ],
    }),
  ])

  console.log('✅ Created all recipes')

  // ═══════════════════════════════════════════════════════════════
  // 7. CREATE SALES DATA (90 days history)
  // ═══════════════════════════════════════════════════════════════
  console.log('💰 Creating sales history (90 days)...')

  const now = new Date()
  const daysAgo90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // Helper to get menu item cost
  const getMenuItemCost = async (menuItemId: string) => {
    const ingredients = await prisma.menuItemIngredient.findMany({
      where: { menuItemId },
      include: { ingredient: true },
    })
    return ingredients.reduce((sum, ing) => sum + (ing.quantity * ing.ingredient.costPerUnit), 0)
  }

  // Pre-calculate costs for all menu items
  const menuItemCosts = new Map<string, number>()
  for (const item of menuItems) {
    const cost = await getMenuItemCost(item.id)
    menuItemCosts.set(item.id, cost)
  }

  // Popular items for weighted random selection
  const popularItems = [
    { item: chickenBiryani, weight: 15 },
    { item: lambKabsa, weight: 10 },
    { item: mixedGrill, weight: 12 },
    { item: chickenKebab, weight: 13 },
    { item: masgouf, weight: 8 },
    { item: lambKebab, weight: 9 },
    { item: falafel, weight: 11 },
    { item: fattoush, weight: 10 },
    { item: hummus, weight: 12 },
    { item: baklava, weight: 7 },
    { item: iraqiTea, weight: 20 },
  ]

  const lesserItems = [
    { item: babaGhanoush, weight: 5 },
    { item: sambousek, weight: 6 },
    { item: beefTikka, weight: 7 },
    { item: dolma, weight: 4 },
    { item: saffronRice, weight: 8 },
    { item: vermicelliRice, weight: 7 },
    { item: yogurtCucumber, weight: 6 },
    { item: tabouleh, weight: 6 },
    { item: shepherdSalad, weight: 5 },
    { item: kunafa, weight: 5 },
    { item: dateCookies, weight: 3 },
    { item: turkishCoffee, weight: 10 },
    { item: orangeJuice, weight: 9 },
    { item: ayran, weight: 8 },
  ]

  const allItemsForSelection = [...popularItems, ...lesserItems]

  // Weighted random selection
  const selectRandomItem = () => {
    const totalWeight = allItemsForSelection.reduce((sum, i) => sum + i.weight, 0)
    let random = Math.random() * totalWeight
    for (const itemWeight of allItemsForSelection) {
      random -= itemWeight.weight
      if (random <= 0) return itemWeight.item
    }
    return allItemsForSelection[0].item
  }

  let orderCounter = 1
  const sales: any[] = []

  for (let dayOffset = 89; dayOffset >= 0; dayOffset--) {
    const saleDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000)
    const dayOfWeek = saleDate.getDay()
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6 // Friday, Saturday

    // More orders on weekends
    const baseOrders = isWeekend ? 45 : 35
    const ordersToday = baseOrders + Math.floor(Math.random() * 15)

    // Peak hours: 12pm-2pm (lunch), 7pm-9pm (dinner)
    const peakHoursLunch = [12, 13, 14]
    const peakHoursDinner = [19, 20, 21]

    for (let i = 0; i < ordersToday; i++) {
      // Determine order time
      let hour: number
      const isPeakTime = Math.random() < 0.6 // 60% of orders during peak
      if (isPeakTime) {
        const isLunch = Math.random() < 0.55 // 55% lunch, 45% dinner
        hour = isLunch
          ? peakHoursLunch[Math.floor(Math.random() * peakHoursLunch.length)]
          : peakHoursDinner[Math.floor(Math.random() * peakHoursDinner.length)]
      } else {
        // Off-peak: 10-11am, 3-6pm, 9-11pm
        const offPeakHours = [10, 11, 15, 16, 17, 18, 22, 23]
        hour = offPeakHours[Math.floor(Math.random() * offPeakHours.length)]
      }

      const minute = Math.floor(Math.random() * 60)
      const orderTime = new Date(saleDate)
      orderTime.setHours(hour, minute, 0, 0)

      // Number of items in order (1-5)
      const itemCount = Math.floor(Math.random() * 4) + 1
      const orderItems: any[] = []
      let orderTotal = 0

      for (let j = 0; j < itemCount; j++) {
        const selectedItem = selectRandomItem()
        const quantity = Math.floor(Math.random() * 2) + 1 // 1-2 of each item
        const itemCost = menuItemCosts.get(selectedItem.id) || 0

        orderItems.push({
          menuItemId: selectedItem.id,
          quantity,
          price: selectedItem.price,
          cost: itemCost,
        })

        orderTotal += selectedItem.price * quantity
      }

      sales.push({
        orderNumber: `ORD-${String(orderCounter++).padStart(5, '0')}`,
        total: orderTotal,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        restaurantId: restaurant.id,
        timestamp: orderTime,
        items: orderItems,
      })
    }
  }

  // Insert sales in batches
  console.log(`📊 Inserting ${sales.length} sales...`)
  for (const sale of sales) {
    await prisma.sale.create({
      data: {
        orderNumber: sale.orderNumber,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        restaurantId: sale.restaurantId,
        timestamp: sale.timestamp,
        items: {
          createMany: {
            data: sale.items,
          },
        },
      },
    })
  }

  console.log(`✅ Created ${sales.length} sales orders`)

  // ═══════════════════════════════════════════════════════════════
  // 8. CREATE AI INSIGHTS
  // ═══════════════════════════════════════════════════════════════
  console.log('🤖 Creating AI insights...')

  await prisma.aIInsight.createMany({
    data: [
      {
        type: 'REVENUE_FORECAST',
        title: 'Expected Revenue Today',
        content: 'Based on historical data for this day of the week, expected revenue is 850,000 IQD with peak hours at 12-2pm and 7-9pm.',
        priority: 'NORMAL',
        restaurantId: restaurant.id,
        validUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
      {
        type: 'DEMAND_PREDICTION',
        title: 'High Demand Expected',
        content: 'Weekend approaching - expect 40% increase in orders. Ensure adequate stock of popular items like Chicken Biryani and Mixed Grill.',
        priority: 'HIGH',
        restaurantId: restaurant.id,
        validUntil: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      },
      {
        type: 'INVENTORY_ALERT',
        title: 'Low Stock Alert',
        content: 'Grape Leaves stock is below minimum level (8kg vs 10kg required). Restock recommended for Dolma preparation.',
        priority: 'CRITICAL',
        restaurantId: restaurant.id,
        validUntil: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      },
      {
        type: 'MENU_OPTIMIZATION',
        title: 'Trending Item: Masgouf',
        content: 'Masgouf sales increased 35% over last 30 days. Consider featuring it as a special or increasing preparation.',
        priority: 'NORMAL',
        restaurantId: restaurant.id,
        validUntil: new Date(now.getTime() + 168 * 60 * 60 * 1000),
      },
      {
        type: 'PEAK_TIME_ANALYSIS',
        title: 'Lunch Rush Staffing',
        content: 'Historical data shows 45% of daily orders occur between 12pm-2pm. Ensure adequate kitchen staff during this window.',
        priority: 'HIGH',
        restaurantId: restaurant.id,
        validUntil: new Date(now.getTime() + 168 * 60 * 60 * 1000),
      },
    ],
  })

  console.log('✅ Created AI insights')

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('🎉 SEED COMPLETED SUCCESSFULLY!')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
  console.log('📊 Summary:')
  console.log(`   • Restaurant: Al-Rafidain Restaurant`)
  console.log(`   • Users: 3 (owner@alrafidain.iq, manager@alrafidain.iq, staff@alrafidain.iq)`)
  console.log(`   • Password: password123`)
  console.log(`   • Ingredients: ${ingredients.length}`)
  console.log(`   • Categories: ${categories.length}`)
  console.log(`   • Menu Items: ${menuItems.length}`)
  console.log(`   • Sales Orders: ${sales.length} (90 days history)`)
  console.log(`   • AI Insights: 5`)
  console.log('')
  console.log('🌐 You can now login and explore the dashboard!')
  console.log('═══════════════════════════════════════════════════════════════')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
