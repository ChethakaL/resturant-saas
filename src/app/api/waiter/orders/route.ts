import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')
        const myOnly = searchParams.get('myOnly') === 'true'
        const unassignedOnly = searchParams.get('unassigned') === 'true'

        const where: any = {
            restaurantId: session.user.restaurantId,
        }
        if (session.user.branchId) {
            where.OR = [
                { branchId: session.user.branchId },
                { table: { branchId: session.user.branchId } },
            ]
        }

        if (unassignedOnly) {
            where.tableId = { not: null }
            where.waiterId = null
            where.status = { in: ['PENDING', 'PREPARING', 'READY'] }
        } else if (myOnly && session.user.employeeId) {
            where.waiterId = session.user.employeeId
        }

        if (status && status !== 'all') {
            if (status === 'active') {
                where.status = { in: ['PENDING', 'PREPARING', 'READY'] }
            } else {
                where.status = status
            }
        }

        const orders = await prisma.sale.findMany({
            where,
            select: {
                id: true,
                orderNumber: true,
                total: true,
                status: true,
                customerName: true,
                notes: true,
                timestamp: true,
                tableId: true,
                items: {
                    select: {
                        id: true,
                        menuItemId: true,
                        quantity: true,
                        price: true,
                        menuItem: {
                            select: {
                                id: true,
                                name: true,
                                price: true,
                                description: true,
                                imageUrl: true,
                                category: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
                table: {
                    select: {
                        id: true,
                        number: true,
                    },
                },
                waiter: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: { timestamp: 'desc' },
            take: 50,
        })

        return NextResponse.json(orders)
    } catch (error) {
        console.error('Error fetching waiter orders:', error)
        return NextResponse.json(
            { error: 'Failed to fetch orders' },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const data = await request.json()

        // Generate order number
        const orderCount = await prisma.sale.count({
            where: { restaurantId: session.user.restaurantId },
        })
        const orderNumber = `ORD-${(orderCount + 1).toString().padStart(5, '0')}`

        const order = await prisma.$transaction(async (tx) => {
            // Fetch menu items with ingredients
            const menuItemsData = await tx.menuItem.findMany({
                where: {
                    id: { in: data.items.map((item: any) => item.menuItemId) },
                    restaurantId: session.user.restaurantId,
                },
                include: {
                    ingredients: {
                        include: {
                            ingredient: true,
                        },
                    },
                },
            })

            let total = 0
            const saleItems: any[] = []

            for (const orderItem of data.items) {
                const menuItem = menuItemsData.find((m) => m.id === orderItem.menuItemId)
                if (!menuItem) {
                    throw new Error(`Menu item not found: ${orderItem.menuItemId}`)
                }

                const cost = menuItem.ingredients.reduce(
                    (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
                    0
                )

                total += menuItem.price * orderItem.quantity

                saleItems.push({
                    menuItemId: menuItem.id,
                    quantity: orderItem.quantity,
                    price: menuItem.price,
                    cost: cost,
                })
            }

            // Update table status if table is assigned and get branchId
            let tableBranchId: string | null = null
            if (data.tableId) {
                const tableData = await tx.table.findFirst({
                    where: {
                        id: data.tableId,
                        restaurantId: session.user.restaurantId!,
                        ...(session.user.branchId ? { branchId: session.user.branchId } : {}),
                    },
                    select: { branchId: true },
                })
                if (!tableData) {
                    throw new Error('Table not found for this branch')
                }
                await tx.table.update({
                    where: { id: data.tableId },
                    data: { status: 'OCCUPIED' },
                })
                tableBranchId = tableData.branchId
            }

            // Create the sale with waiter assigned
            const sale = await tx.sale.create({
                data: {
                    orderNumber,
                    total,
                    paymentMethod: data.paymentMethod || 'CASH',
                    status: 'PENDING',
                    customerName: data.customerName,
                    tableId: data.tableId,
                    waiterId: session.user.employeeId || data.waiterId,
                    notes: data.notes,
                    restaurantId: session.user.restaurantId!,
                    branchId: tableBranchId,
                    items: {
                        create: saleItems,
                    },
                },
                include: {
                    items: {
                        include: {
                            menuItem: true,
                        },
                    },
                    table: true,
                    waiter: true,
                },
            })

            return sale
        })

        return NextResponse.json(order)
    } catch (error: any) {
        console.error('Error creating waiter order:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create order' },
            { status: 500 }
        )
    }
}
