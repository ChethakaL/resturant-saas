import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireRestaurantFeature } from '@/lib/require-product-feature'

export const dynamic = 'force-dynamic'

const orderListSelect = {
    id: true,
    orderNumber: true,
    total: true,
    status: true,
    deliveredAt: true,
    customerName: true,
    notes: true,
    timestamp: true,
    tableId: true,
    _count: {
        select: {
            items: true,
        },
    },
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
                },
            },
        },
        take: 4,
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
} as const

function mapOrderList<T extends { _count: { items: number }; items: unknown[] }>(order: T) {
    const { _count, ...rest } = order
    return {
        ...rest,
        itemCount: _count.items,
        items: rest.items,
    }
}

function branchScope(restaurantId: string, branchId?: string | null) {
    const where: { restaurantId: string; branchId?: string; OR?: unknown[] } = {
        restaurantId,
    }
    if (branchId) {
        where.OR = [{ branchId }, { table: { branchId } }]
    }
    return where
}

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const locked = await requireRestaurantFeature(session.user.restaurantId, 'waiterPortal', 'Waiter Portal')
        if (locked) return locked

        const { searchParams } = new URL(request.url)
        const orderFilter = searchParams.get('orderFilter') || 'active'
        const restaurantId = session.user.restaurantId
        const branchId = session.user.branchId

        const tableWhere: { restaurantId: string; branchId?: string } = { restaurantId }
        if (branchId) {
            tableWhere.branchId = branchId
        }

        const myOrdersWhere: Record<string, unknown> = {
            ...branchScope(restaurantId, branchId),
        }
        if (session.user.employeeId) {
            myOrdersWhere.waiterId = session.user.employeeId
        }
        if (orderFilter === 'active') {
            myOrdersWhere.status = { in: ['PENDING', 'PREPARING', 'READY'] }
        } else if (orderFilter !== 'all') {
            myOrdersWhere.status = orderFilter
        }

        const kitchenWhere: Record<string, unknown> = {
            ...branchScope(restaurantId, branchId),
            status: { in: ['PENDING', 'PREPARING', 'READY'] },
        }

        const unconfirmedWhere: Record<string, unknown> = {
            ...branchScope(restaurantId, branchId),
            tableId: { not: null },
            waiterId: null,
            status: { in: ['PENDING', 'PREPARING', 'READY'] },
        }

        const [tables, myOrders, kitchenOrders, unconfirmedOrders] = await Promise.all([
            prisma.table.findMany({
                where: tableWhere,
                select: {
                    id: true,
                    number: true,
                    capacity: true,
                    status: true,
                    sales: {
                        where: {
                            status: { in: ['PENDING', 'PREPARING', 'READY'] },
                        },
                        select: {
                            id: true,
                            orderNumber: true,
                            total: true,
                            status: true,
                            deliveredAt: true,
                            customerName: true,
                            notes: true,
                            timestamp: true,
                            tableId: true,
                            _count: { select: { items: true } },
                            table: { select: { id: true, number: true } },
                            waiter: { select: { id: true, name: true } },
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                },
                orderBy: { number: 'asc' },
            }),
            prisma.sale.findMany({
                where: myOrdersWhere,
                select: orderListSelect,
                orderBy: { timestamp: 'desc' },
                take: 50,
            }),
            prisma.sale.findMany({
                where: kitchenWhere,
                select: orderListSelect,
                orderBy: { timestamp: 'desc' },
                take: 50,
            }),
            prisma.sale.findMany({
                where: unconfirmedWhere,
                select: orderListSelect,
                orderBy: { timestamp: 'desc' },
                take: 20,
            }),
        ])

        return NextResponse.json({
            tables: tables.map((table) => ({
                ...table,
                sales: table.sales.map(({ _count, ...sale }) => ({
                    ...sale,
                    itemCount: _count.items,
                    items: [] as [],
                })),
            })),
            myOrders: myOrders.map(mapOrderList),
            kitchenOrders: kitchenOrders
                .filter((order) => order.status !== 'READY')
                .map(mapOrderList),
            unconfirmedOrders: unconfirmedOrders.map(mapOrderList),
        })
    } catch (error) {
        console.error('Error fetching waiter dashboard:', error)
        return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
    }
}
