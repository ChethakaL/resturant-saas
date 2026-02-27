import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTranslations, type ManagementLocale, type TranslationStrings } from './translations'

/**
 * Server-side helper to get the current management language and translations.
 * Use this in server components (pages, layouts) that need translated strings.
 */
export async function getServerTranslations(): Promise<{
    locale: ManagementLocale
    t: TranslationStrings
}> {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return { locale: 'en', t: getTranslations('en') }
        }

        const restaurant = await prisma.restaurant.findUnique({
            where: { id: session.user.restaurantId },
            select: { settings: true },
        })

        const settings = (restaurant?.settings as Record<string, unknown>) || {}
        const lang = (settings.managementLanguage as string) || 'en'

        let locale: ManagementLocale = 'en'
        if (lang === 'ku') locale = 'ku'
        else if (lang === 'ar-fusha' || lang === 'ar_fusha') locale = 'ar-fusha'

        return { locale, t: getTranslations(locale) }
    } catch {
        return { locale: 'en', t: getTranslations('en') }
    }
}
