import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurantId = session.user.restaurantId
    const resolvedParams = params instanceof Promise ? await params : params
    const body = await request.json()

    const linked = await prisma.restaurantSupplierLink.findUnique({
      where: {
        restaurantId_supplierId: {
          restaurantId,
          supplierId: resolvedParams.id,
        },
      },
    })

    if (!linked) {
      return NextResponse.json({ error: 'Supplier not linked to this restaurant' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.email !== undefined) data.email = String(body.email).trim()
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null
    if (body.whatsapp !== undefined) data.whatsapp = body.whatsapp ? String(body.whatsapp).trim() : null
    if (body.address !== undefined) data.address = body.address ? String(body.address).trim() : null
    if (body.leadTimeDays !== undefined) {
      data.leadTimeDays =
        body.leadTimeDays === '' || body.leadTimeDays == null ? null : Number(body.leadTimeDays)
    }
    if (body.deliveryAreas !== undefined) data.deliveryAreas = normalizeStringArray(body.deliveryAreas)
    if (body.deliveryDays !== undefined) data.deliveryDays = normalizeStringArray(body.deliveryDays)

    const updated = await prisma.supplier.update({
      where: { id: resolvedParams.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        whatsapp: true,
        address: true,
        leadTimeDays: true,
        deliveryAreas: true,
        deliveryDays: true,
        status: true,
        ingredients: {
          where: { restaurantId },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
    })

    return NextResponse.json({
      ...updated,
      linkedToRestaurant: true,
      suppliedIngredients: updated.ingredients,
    })
  } catch (error) {
    console.error('Suppliers PATCH:', error)
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurantId = session.user.restaurantId
    const resolvedParams = params instanceof Promise ? await params : params

    const linked = await prisma.restaurantSupplierLink.findUnique({
      where: {
        restaurantId_supplierId: {
          restaurantId,
          supplierId: resolvedParams.id,
        },
      },
    })

    if (!linked) {
      return NextResponse.json({ error: 'Supplier not linked to this restaurant' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.ingredient.updateMany({
        where: {
          restaurantId,
          preferredSupplierId: resolvedParams.id,
        },
        data: {
          preferredSupplierId: null,
        },
      })

      await tx.restaurantSupplierLink.delete({
        where: {
          restaurantId_supplierId: {
            restaurantId,
            supplierId: resolvedParams.id,
          },
        },
      })

      const [remainingLinks, supplierUsage] = await Promise.all([
        tx.restaurantSupplierLink.count({
          where: { supplierId: resolvedParams.id },
        }),
        tx.supplier.findUnique({
          where: { id: resolvedParams.id },
          select: {
            users: { select: { id: true }, take: 1 },
            products: { select: { id: true }, take: 1 },
            stockRequests: { select: { id: true }, take: 1 },
          },
        }),
      ])

      if (
        remainingLinks === 0 &&
        supplierUsage &&
        supplierUsage.users.length === 0 &&
        supplierUsage.products.length === 0 &&
        supplierUsage.stockRequests.length === 0
      ) {
        await tx.supplier.delete({
          where: { id: resolvedParams.id },
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Suppliers DELETE:', error)
    return NextResponse.json({ error: 'Failed to remove supplier' }, { status: 500 })
  }
}
