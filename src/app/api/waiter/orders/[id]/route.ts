import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const resolvedParams = typeof params === 'object' && 'then' in params
            ? await params
            : params
        const orderId = resolvedParams.id

        const data = await request.json()

        const existing = await prisma.sale.findFirst({
            where: {
                id: orderId,
                restaurantId: session.user.restaurantId,
            },
            include: { table: true },
        })

        if (!existing) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        }

        const updateData: any = {}

        if (data.status) {
            updateData.status = data.status

            // If marking as COMPLETED, set paidAt and free the table
            if (data.status === 'COMPLETED') {
                updateData.paidAt = new Date()
                if (existing.tableId) {
                    // Check if there are other active orders on this table
                    const otherActive = await prisma.sale.count({
                        where: {
                            tableId: existing.tableId,
                            id: { not: orderId },
                            status: { in: ['PENDING', 'PREPARING', 'READY'] },
                        },
                    })
                    if (otherActive === 0) {
                        await prisma.table.update({
                            where: { id: existing.tableId },
                            data: { status: 'AVAILABLE' },
                        })
                    }
                }
            }
        }

        if (data.notes !== undefined) {
            updateData.notes = data.notes
        }

        const order = await prisma.sale.update({
            where: { id: orderId },
            data: updateData,
            include: {
                items: {
                    include: {
                        menuItem: {
                            include: {
                                category: true,
                            },
                        },
                    },
                },
                table: true,
                waiter: true,
            },
        })

        return NextResponse.json(order)
    } catch (error: any) {
        console.error('Error updating order:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update order' },
            { status: 500 }
        )
    }
}

// Remove an item from order
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const resolvedParams = typeof params === 'object' && 'then' in params
            ? await params
            : params
        const orderId = resolvedParams.id

        const { searchParams } = new URL(request.url)
        const saleItemId = searchParams.get('saleItemId')

        if (!saleItemId) {
            return NextResponse.json({ error: 'saleItemId is required' }, { status: 400 })
        }

        const order = await prisma.$transaction(async (tx) => {
            const existing = await tx.sale.findFirst({
                where: {
                    id: orderId,
                    restaurantId: session.user.restaurantId,
                },
                include: {
                    items: true,
                },
            })

            if (!existing) {
                throw new Error('Order not found')
            }

            if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
                throw new Error('Cannot modify completed or cancelled order')
            }

            const itemToRemove = existing.items.find((i) => i.id === saleItemId)
            if (!itemToRemove) {
                throw new Error('Item not found in order')
            }

            // Remove the item
            await tx.saleItem.delete({
                where: { id: saleItemId },
            })

            // Update the total
            const updatedSale = await tx.sale.update({
                where: { id: orderId },
                data: {
                    total: {
                        decrement: itemToRemove.price * itemToRemove.quantity,
                    },
                },
                include: {
                    items: {
                        include: {
                            menuItem: {
                                include: {
                                    category: true,
                                },
                            },
                        },
                    },
                    table: true,
                    waiter: true,
                },
            })

            return updatedSale
        })

        return NextResponse.json(order)
    } catch (error: any) {
        console.error('Error removing item from order:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to remove item' },
            { status: 500 }
        )
    }
}
