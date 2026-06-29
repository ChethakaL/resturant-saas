/**
 * Copy menu data (categories, items, translations, showcases) from one restaurant to another.
 * Does NOT copy ingredients, sales, or other restaurant-specific operational data.
 * Usage: node scripts/copy-menu-between-restaurants.mjs <sourceId> <targetId> [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const SOURCE_ID = process.argv[2];
const TARGET_ID = process.argv[3];
const DRY_RUN = process.argv.includes('--dry-run');

if (!SOURCE_ID || !TARGET_ID) {
  console.error('Usage: node scripts/copy-menu-between-restaurants.mjs <sourceId> <targetId> [--dry-run]');
  process.exit(1);
}

async function backupTarget(targetId) {
  const [categories, menuItems, translations, showcases, showcaseItems] = await Promise.all([
    prisma.category.findMany({ where: { restaurantId: targetId } }),
    prisma.menuItem.findMany({ where: { restaurantId: targetId } }),
    prisma.menuItemTranslation.findMany({
      where: { menuItem: { restaurantId: targetId } },
    }),
    prisma.menuShowcase.findMany({ where: { restaurantId: targetId } }),
    prisma.menuShowcaseItem.findMany({
      where: { showcase: { restaurantId: targetId } },
    }),
  ]);

  const backup = {
    backedUpAt: new Date().toISOString(),
    targetId,
    counts: {
      categories: categories.length,
      menuItems: menuItems.length,
      translations: translations.length,
      showcases: showcases.length,
      showcaseItems: showcaseItems.length,
    },
    data: { categories, menuItems, translations, showcases, showcaseItems },
  };

  const dir = join('/tmp', 'menu-copy-backups');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `backup-${targetId}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2));
  return file;
}

async function main() {
  const [source, target] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: SOURCE_ID } }),
    prisma.restaurant.findUnique({ where: { id: TARGET_ID } }),
  ]);

  if (!source) throw new Error(`Source restaurant not found: ${SOURCE_ID}`);
  if (!target) throw new Error(`Target restaurant not found: ${TARGET_ID}`);

  console.log(`Source: ${source.name} (${source.id})`);
  console.log(`Target: ${target.name} (${target.id})`);
  console.log(`Dry run: ${DRY_RUN}`);

  const backupFile = await backupTarget(TARGET_ID);
  console.log(`Backup saved: ${backupFile}`);

  const sourceCounts = {
    categories: await prisma.category.count({ where: { restaurantId: SOURCE_ID } }),
    menuItems: await prisma.menuItem.count({ where: { restaurantId: SOURCE_ID } }),
    translations: await prisma.menuItemTranslation.count({
      where: { menuItem: { restaurantId: SOURCE_ID } },
    }),
    showcases: await prisma.menuShowcase.count({ where: { restaurantId: SOURCE_ID } }),
    showcaseItems: await prisma.menuShowcaseItem.count({
      where: { showcase: { restaurantId: SOURCE_ID } },
    }),
  };
  console.log('Source counts:', sourceCounts);

  if (DRY_RUN) {
    console.log('Dry run complete — no data copied.');
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const categoryMap = new Map();
    const itemMap = new Map();
    const showcaseMap = new Map();

    const sourceCategories = await tx.category.findMany({
      where: { restaurantId: SOURCE_ID },
      orderBy: { displayOrder: 'asc' },
    });

    for (const cat of sourceCategories) {
      const created = await tx.category.create({
        data: {
          name: cat.name,
          description: cat.description,
          displayOrder: cat.displayOrder,
          showOnMenu: cat.showOnMenu,
          restaurantId: TARGET_ID,
          pnlParent: cat.pnlParent,
          pnlType: cat.pnlType,
          systemLocked: cat.systemLocked,
          taxRate: cat.taxRate,
        },
      });
      categoryMap.set(cat.id, created.id);
    }

    const sourceItems = await tx.menuItem.findMany({
      where: { restaurantId: SOURCE_ID },
      orderBy: { createdAt: 'asc' },
    });

    for (const item of sourceItems) {
      const newCategoryId = categoryMap.get(item.categoryId);
      if (!newCategoryId) {
        throw new Error(`Missing category mapping for item ${item.name} (${item.id})`);
      }

      const created = await tx.menuItem.create({
        data: {
          name: item.name,
          description: item.description,
          price: item.price,
          imageUrl: item.imageUrl,
          available: item.available,
          status: item.status,
          costingStatus: item.costingStatus,
          categoryId: newCategoryId,
          restaurantId: TARGET_ID,
          calories: item.calories,
          popularityScore: item.popularityScore,
          tags: item.tags,
          cookTime: item.cookTime,
          prepTime: item.prepTime,
          recipeSteps: item.recipeSteps,
          recipeTips: item.recipeTips,
          carbs: item.carbs,
          protein: item.protein,
        },
      });
      itemMap.set(item.id, created.id);
    }

    const sourceTranslations = await tx.menuItemTranslation.findMany({
      where: { menuItem: { restaurantId: SOURCE_ID } },
    });

    for (const tr of sourceTranslations) {
      const newItemId = itemMap.get(tr.menuItemId);
      if (!newItemId) continue;
      await tx.menuItemTranslation.create({
        data: {
          menuItemId: newItemId,
          language: tr.language,
          translatedName: tr.translatedName,
          translatedDescription: tr.translatedDescription,
          aiDescription: tr.aiDescription,
          sourceHash: tr.sourceHash,
          sourceUpdatedAt: tr.sourceUpdatedAt,
          protein: tr.protein,
          carbs: tr.carbs,
        },
      });
    }

    const sourceShowcases = await tx.menuShowcase.findMany({
      where: { restaurantId: SOURCE_ID },
      orderBy: { displayOrder: 'asc' },
    });

    for (const sc of sourceShowcases) {
      const newInsertAfterCategoryId = sc.insertAfterCategoryId
        ? categoryMap.get(sc.insertAfterCategoryId) ?? null
        : null;
      const created = await tx.menuShowcase.create({
        data: {
          restaurantId: TARGET_ID,
          title: sc.title,
          type: sc.type,
          displayVariant: sc.displayVariant,
          position: sc.position,
          insertAfterCategoryId: newInsertAfterCategoryId,
          displayOrder: sc.displayOrder,
          isActive: sc.isActive,
          schedule: sc.schedule ?? undefined,
        },
      });
      showcaseMap.set(sc.id, created.id);
    }

    const sourceShowcaseItems = await tx.menuShowcaseItem.findMany({
      where: { showcase: { restaurantId: SOURCE_ID } },
      orderBy: { displayOrder: 'asc' },
    });

    for (const si of sourceShowcaseItems) {
      const newShowcaseId = showcaseMap.get(si.showcaseId);
      const newItemId = itemMap.get(si.menuItemId);
      if (!newShowcaseId || !newItemId) continue;
      await tx.menuShowcaseItem.create({
        data: {
          showcaseId: newShowcaseId,
          menuItemId: newItemId,
          displayOrder: si.displayOrder,
        },
      });
    }

    return {
      categoriesCopied: categoryMap.size,
      itemsCopied: itemMap.size,
      translationsCopied: sourceTranslations.length,
      showcasesCopied: showcaseMap.size,
      showcaseItemsCopied: sourceShowcaseItems.length,
    };
  }, { timeout: 120000 });

  const afterCounts = {
    categories: await prisma.category.count({ where: { restaurantId: TARGET_ID } }),
    menuItems: await prisma.menuItem.count({ where: { restaurantId: TARGET_ID } }),
    translations: await prisma.menuItemTranslation.count({
      where: { menuItem: { restaurantId: TARGET_ID } },
    }),
    showcases: await prisma.menuShowcase.count({ where: { restaurantId: TARGET_ID } }),
    showcaseItems: await prisma.menuShowcaseItem.count({
      where: { showcase: { restaurantId: TARGET_ID } },
    }),
  };

  console.log('Copy result:', result);
  console.log('Target counts after:', afterCounts);
}

main()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
