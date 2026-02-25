'use client'

import { useState } from 'react'
import RestaurantDNAOnboarding from './RestaurantDNAOnboarding'

interface RestaurantDNAGateProps {
    onboardingComplete: boolean
    restaurantName: string
}

export default function RestaurantDNAGate({
    onboardingComplete,
    restaurantName,
}: RestaurantDNAGateProps) {
    const [showOnboarding, setShowOnboarding] = useState(!onboardingComplete)

    if (!showOnboarding) return null

    const handleComplete = async (theme: Record<string, unknown>) => {
        try {
            // Save the recommended theme
            await fetch('/api/settings/theme', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    primaryColor: theme.primaryColor,
                    accentColor: theme.accentColor,
                    chefPickColor: theme.chefPickColor,
                    borderColor: theme.borderColor,
                    backgroundStyle: theme.backgroundStyle,
                    fontFamily: theme.fontFamily,
                    menuCarouselStyle: theme.menuCarouselStyle,
                    ...(theme.restaurantName && { restaurantName: theme.restaurantName }),
                    ...(theme.descriptionTone && { descriptionTone: theme.descriptionTone }),
                }),
            })
            // Mark onboarding as complete
            await fetch('/api/restaurant-dna/onboarding', { method: 'POST' })
            setShowOnboarding(false)
            // Refresh the page to load new theme
            window.location.reload()
        } catch {
            // Still dismiss the modal
            setShowOnboarding(false)
        }
    }

    const handleSkip = async () => {
        try {
            await fetch('/api/restaurant-dna/onboarding', { method: 'POST' })
        } catch {
            // ignore
        }
        setShowOnboarding(false)
    }

    return (
        <RestaurantDNAOnboarding
            onComplete={handleComplete}
            onSkip={handleSkip}
            restaurantName={restaurantName}
        />
    )
}
