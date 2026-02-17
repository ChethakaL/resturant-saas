const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'postgresql://workflow_app:WORKFLOW_PASSWORD@54.169.179.180:5432/restaurant_test?schema=public'
        }
    }
})

async function main() {
    const restaurant = await prisma.restaurant.findFirst({
        where: { slug: 'sandwitch-palace' }
    })

    if (!restaurant) {
        console.log('Restaurant not found')
        return
    }

    console.log('=== SANDWICH PALACE - ALL MENU ITEMS ===\n')

    const items = await prisma.menuItem.findMany({
        where: { restaurantId: restaurant.id },
        include: {
            category: {
                select: { name: true }
            }
        },
        orderBy: { name: 'asc' }
    })

    items.forEach(item => {
        const tags = item.tags.join(', ') || 'no tags'
        const shareable = item.tags.some(t =>
            t.toLowerCase().includes('share') ||
            t.toLowerCase().includes('large') ||
            t.toLowerCase().includes('family') ||
            t.toLowerCase().includes('platter')
        )
        console.log(`${item.name}`)
        console.log(`  Category: ${item.category?.name || 'None'}`)
        console.log(`  Price: $${item.price}`)
        console.log(`  Tags: ${tags}`)
        if (shareable) {
            console.log(`  🔄 SHAREABLE ITEM`)
        }
        console.log()
    })

    console.log(`\nTotal items: ${items.length}`)
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
