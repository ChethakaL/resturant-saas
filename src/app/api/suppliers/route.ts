import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []

const mapSupplier = (supplier: any, linkedSupplierIds: Set<string>) => ({
  id: supplier.id,
  name: supplier.name,
  email: supplier.email,
  phone: supplier.phone,
  whatsapp: supplier.whatsapp,
  address: supplier.address,
  leadTimeDays: supplier.leadTimeDays,
  deliveryAreas: supplier.deliveryAreas ?? [],
  deliveryDays: supplier.deliveryDays ?? [],
  status: supplier.status,
  linkedToRestaurant: linkedSupplierIds.has(supplier.id),
  suppliedIngredients: (supplier.ingredients ?? []).map((ingredient: any) => ({
    id: ingredient.id,
    name: ingredient.name,
  })),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurantId = session.user.restaurantId

    const links = await prisma.restaurantSupplierLink.findMany({
      where: { restaurantId },
      select: { supplierId: true },
    })

    const linkedSupplierIds = new Set(links.map((link) => link.supplierId))

    const suppliers = await prisma.supplier.findMany({
      where: {
        OR: [
          { status: 'APPROVED' },
          { restaurantLinks: { some: { restaurantId } } },
        ],
      },
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
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(suppliers.map((supplier) => mapSupplier(supplier, linkedSupplierIds)))
  } catch (error) {
    console.error('Suppliers GET:', error)
    return NextResponse.json({ error: 'Failed to load suppliers' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurantId = session.user.restaurantId
    const body = await request.json()

    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim()

    if (!name) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ error: 'Supplier email is required' }, { status: 400 })
    }

    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: {
          name,
          email,
          phone: body.phone ? String(body.phone).trim() : null,
          whatsapp: body.whatsapp ? String(body.whatsapp).trim() : null,
          address: body.address ? String(body.address).trim() : null,
          leadTimeDays:
            body.leadTimeDays !== undefined && body.leadTimeDays !== null && body.leadTimeDays !== ''
              ? Number(body.leadTimeDays)
              : null,
          deliveryAreas: normalizeStringArray(body.deliveryAreas),
          deliveryDays: normalizeStringArray(body.deliveryDays),
          status: 'APPROVED',
        },
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

      await tx.restaurantSupplierLink.upsert({
        where: {
          restaurantId_supplierId: {
            restaurantId,
            supplierId: created.id,
          },
        },
        update: {},
        create: {
          restaurantId,
          supplierId: created.id,
        },
      })

      return created
    })

    return NextResponse.json({
      ...mapSupplier(supplier, new Set([supplier.id])),
      linkedToRestaurant: true,
    })
  } catch (error) {
    console.error('Suppliers POST:', error)
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
  }
}
