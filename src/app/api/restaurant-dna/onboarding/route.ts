import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const restaurant = await prisma.restaurant.findUnique({
            where: { id: session.user.restaurantId },
            select: { settings: true },
        })

        const currentSettings = (restaurant?.settings as Record<string, unknown>) || {}
        await prisma.restaurant.update({
            where: { id: session.user.restaurantId },
            data: {
                settings: {
                    ...currentSettings,
                    onboardingComplete: true,
                },
            },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error completing onboarding:', error)
        return NextResponse.json(
            { error: 'Failed to complete onboarding' },
            { status: 500 }
        )
    }
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const restaurant = await prisma.restaurant.findUnique({
            where: { id: session.user.restaurantId },
            select: { settings: true },
        })

        const settings = (restaurant?.settings as Record<string, unknown>) || {}
        return NextResponse.json({
            onboardingComplete: !!settings.onboardingComplete,
        })
    } catch (error) {
        console.error('Error checking onboarding:', error)
        return NextResponse.json(
            { error: 'Failed to check onboarding status' },
            { status: 500 }
        )
    }
}
