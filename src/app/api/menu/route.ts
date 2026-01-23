import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Create menu item with ingredients in a transaction
    const menuItem = await prisma.$transaction(async (tx) => {
      // Create the menu item
      const item = await tx.menuItem.create({
        data: {
          name: data.name,
          description: data.description,
          price: data.price,
          imageUrl: data.imageUrl,
          available: data.available,
          categoryId: data.categoryId,
          restaurantId: session.user.restaurantId,
          calories: data.calories,
          protein: data.protein,
          carbs: data.carbs,
          tags: data.tags || [],
          // Recipe details
          prepTime: data.prepTime || null,
          cookTime: data.cookTime || null,
          recipeSteps: data.recipeSteps || [],
          recipeTips: data.recipeTips || [],
        },
      })

      // Create recipe ingredients - only if valid ingredient IDs are provided
      if (data.ingredients && data.ingredients.length > 0) {
        const validIngredients = data.ingredients.filter(
          (ing: any) => ing.ingredientId && ing.quantity > 0
        )

        if (validIngredients.length > 0) {
          await tx.menuItemIngredient.createMany({
            data: validIngredients.map((ing: any) => ({
              menuItemId: item.id,
              ingredientId: ing.ingredientId,
              quantity: ing.quantity,
              pieceCount: ing.pieceCount || null,
            })),
          })
        }
      }

      // Create add-on associations
      if (data.addOnIds && data.addOnIds.length > 0) {
        await tx.menuItemAddOn.createMany({
          data: data.addOnIds.map((addOnId: string) => ({
            menuItemId: item.id,
            addOnId,
          })),
        })
      }

      return item
    })

    // Revalidate the public menu page so new items appear immediately
    revalidatePath('/')

    return NextResponse.json(menuItem)
  } catch (error) {
    console.error('Error creating menu item:', error)
    return NextResponse.json(
      { error: 'Failed to create menu item' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId: session.user.restaurantId },
      include: {
        category: true,
        ingredients: {
          include: {
            ingredient: true,
          },
        },
        addOns: {
          include: {
            addOn: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(menuItems)
  } catch (error) {
    console.error('Error fetching menu items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menu items' },
      { status: 500 }
    )
  }
}
