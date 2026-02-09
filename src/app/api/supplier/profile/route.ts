import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: session.user.supplierId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        lat: true,
        lng: true,
        deliveryAreas: true,
        status: true,
      },
    })

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    return NextResponse.json(supplier)
  } catch (error) {
    console.error('Supplier profile GET:', error)
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, phone, address, deliveryAreas } = body

    const data: Record<string, unknown> = {}

    if (name !== undefined) data.name = String(name)
    if (phone !== undefined) data.phone = phone ? String(phone) : null
    if (address !== undefined) data.address = address ? String(address) : null
    if (deliveryAreas !== undefined) {
      data.deliveryAreas = Array.isArray(deliveryAreas) ? deliveryAreas : []
    }

    const updated = await prisma.supplier.update({
      where: { id: session.user.supplierId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        lat: true,
        lng: true,
        deliveryAreas: true,
        status: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Supplier profile PATCH:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
