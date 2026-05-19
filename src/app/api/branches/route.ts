import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { isActiveStripeSubscription } from '@/lib/billing-branches'
import { getPlatformConfig } from '@/lib/platform-config'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const branches = await prisma.branch.findMany({
            where: { restaurantId: session.user.restaurantId },
            include: {
                _count: { select: { tables: true, sales: true } },
            },
            orderBy: { createdAt: 'asc' },
        })

        return NextResponse.json(branches)
    } catch (error) {
        console.error('Error fetching branches:', error)
        return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const restaurant = await prisma.restaurant.findUnique({
            where: { id: session.user.restaurantId },
            select: { settings: true, stripeSubscriptionId: true },
        })

        const platformCfg = await getPlatformConfig()
        const stripeConfigured = !!(platformCfg.stripeSecretKey || process.env.STRIPE_SECRET_KEY)

        if (stripeConfigured && restaurant?.stripeSubscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId)
            if (isActiveStripeSubscription(subscription)) {
                return NextResponse.json(
                    {
                        error:
                            'Add branches from Subscription (Billing). Extra branches are $10/month each.',
                    },
                    { status: 403 }
                )
            }
        }

        // Check branch limit
        const settings = (restaurant?.settings as Record<string, unknown>) || {}
        const maxBranches = (settings.maxBranches as number) || 1
        const currentCount = await prisma.branch.count({
            where: { restaurantId: session.user.restaurantId },
        })

        if (currentCount >= maxBranches) {
            return NextResponse.json(
                { error: `Branch limit reached (${maxBranches}). Upgrade your plan to add more branches.` },
                { status: 403 }
            )
        }

        const { name, address, phone } = await request.json()
        if (!name?.trim()) {
            return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
        }

        const branch = await prisma.branch.create({
            data: {
                name: name.trim(),
                address: address?.trim() || null,
                phone: phone?.trim() || null,
                restaurantId: session.user.restaurantId,
            },
        })

        return NextResponse.json(branch)
    } catch (error) {
        console.error('Error creating branch:', error)
        return NextResponse.json({ error: 'Failed to create branch' }, { status: 500 })
    }
}
