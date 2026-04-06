import { prisma } from '@/lib/prisma'

type ContextShowcaseDefinition = {
  title: string
  schedule: Record<string, unknown>
  itemIds: string[]
}

export async function upsertContextShowcases(params: {
  restaurantId: string
  existingShowcases: Array<{ id: string; title: string; displayOrder: number | null }>
  definitions: ContextShowcaseDefinition[]
}) {
  const { restaurantId, existingShowcases, definitions } = params
  let nextDisplayOrder =
    existingShowcases.reduce((max, showcase) => Math.max(max, showcase.displayOrder ?? 0), 0) + 1

  for (const definition of definitions) {
    const existing = existingShowcases.find((showcase) => showcase.title === definition.title)
    const showcase =
      existing ??
      (await prisma.menuShowcase.create({
        data: {
          restaurantId,
          title: definition.title,
          type: 'CHEFS_HIGHLIGHTS',
          displayVariant: 'hero',
          position: 'top',
          displayOrder: nextDisplayOrder++,
          schedule: definition.schedule,
          isActive: true,
        },
        select: { id: true, title: true, displayOrder: true },
      }))

    await prisma.menuShowcase.update({
      where: { id: showcase.id },
      data: {
        type: 'CHEFS_HIGHLIGHTS',
        displayVariant: 'hero',
        position: 'top',
        isActive: true,
        schedule: definition.schedule,
      },
    })

    await prisma.menuShowcaseItem.deleteMany({ where: { showcaseId: showcase.id } })
    if (definition.itemIds.length > 0) {
      await prisma.menuShowcaseItem.createMany({
        data: definition.itemIds.map((menuItemId, index) => ({
          showcaseId: showcase.id,
          menuItemId,
          displayOrder: index + 1,
        })),
      })
    }
  }
}
