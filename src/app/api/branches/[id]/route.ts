import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const branch = await prisma.branch.findFirst({
            where: { id: params.id, restaurantId: session.user.restaurantId },
        })
        if (!branch) {
            return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
        }

        const { name, address, phone, isActive } = await request.json()

        const updated = await prisma.branch.update({
            where: { id: params.id },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(address !== undefined && { address: address?.trim() || null }),
                ...(phone !== undefined && { phone: phone?.trim() || null }),
                ...(isActive !== undefined && { isActive }),
            },
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error('Error updating branch:', error)
        return NextResponse.json({ error: 'Failed to update branch' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const branch = await prisma.branch.findFirst({
            where: { id: params.id, restaurantId: session.user.restaurantId },
        })
        if (!branch) {
            return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
        }

        // Unassign tables and sales before deleting
        await prisma.table.updateMany({
            where: { branchId: params.id },
            data: { branchId: null },
        })
        await prisma.sale.updateMany({
            where: { branchId: params.id },
            data: { branchId: null },
        })

        await prisma.branch.delete({ where: { id: params.id } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting branch:', error)
        return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500 })
    }
}
