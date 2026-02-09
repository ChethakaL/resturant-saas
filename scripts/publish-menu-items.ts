/**
 * Publish all menu items except Baklava, Beef Tikka, and Chicken Biryani (keep as draft).
 * Run: npx tsx scripts/publish-menu-items.ts
 * Uses DATABASE_URL from .env.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const KEEP_DRAFT_NAMES = ['Baklava', 'Beef Tikka', 'Chicken Biryani']

async function main() {
  const namesLower = KEEP_DRAFT_NAMES.map((n) => n.toLowerCase())

  const all = await prisma.menuItem.findMany({
    select: { id: true, name: true, status: true },
  })

  const toPublish = all.filter((item) => !namesLower.includes(item.name.toLowerCase()))
  const toDraft = all.filter((item) => namesLower.includes(item.name.toLowerCase()))

  await prisma.menuItem.updateMany({
    where: { id: { in: toPublish.map((i) => i.id) } },
    data: { status: 'ACTIVE' },
  })
  console.log(`Published ${toPublish.length} menu items.`)

  if (toDraft.length > 0) {
    await prisma.menuItem.updateMany({
      where: { id: { in: toDraft.map((i) => i.id) } },
      data: { status: 'DRAFT' },
    })
    console.log(`Kept as draft (${toDraft.length}): ${toDraft.map((i) => i.name).join(', ')}`)
  } else {
    console.log('(None of the "keep draft" names found in DB; all were published.)')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
