import { prisma } from '../src/lib/prisma'
import { inferMenuTags } from '../src/lib/menu-tags-ai'

async function main() {
  const menuItems = await prisma.menuItem.findMany({
    include: {
      category: { select: { name: true } },
      ingredients: { include: { ingredient: { select: { name: true } } } },
      restaurant: { select: { name: true, slug: true } },
    },
    orderBy: [{ restaurantId: 'asc' }, { name: 'asc' }],
  })

  console.log(`Found ${menuItems.length} menu items`)

  let updated = 0
  for (const item of menuItems) {
    const inferredTags = await inferMenuTags({
      itemName: item.name,
      description: item.description,
      categoryName: item.category?.name ?? null,
      ingredientNames: item.ingredients.map((ingredient) => ingredient.ingredient.name),
      existingTags: [],
      protein: item.protein,
      carbs: item.carbs,
    })

    const current = JSON.stringify([...(item.tags ?? [])].sort())
    const next = JSON.stringify([...inferredTags].sort())
    if (current === next) continue

    await prisma.menuItem.update({
      where: { id: item.id },
      data: { tags: inferredTags },
    })

    updated += 1
    console.log(
      `[updated] ${item.restaurant.slug} :: ${item.name} -> ${inferredTags.join(', ') || '(none)'}`
    )
  }

  console.log(`Updated ${updated} menu items`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
