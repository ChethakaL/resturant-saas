'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
    type ManagementLocale,
    type TranslationStrings,
    getTranslations,
    getMenuTranslationLanguages,
} from '@/lib/i18n/translations'

import { MENU_LANGUAGES } from '@/lib/menu-languages'

const MENU_LANG_LABELS = Object.fromEntries(MENU_LANGUAGES.map((l) => [l.code, l.name]))
MENU_LANG_LABELS.en = 'English'

interface I18nContextValue {
    locale: ManagementLocale
    t: TranslationStrings
    setLocale: (locale: ManagementLocale) => void
    menuTranslationLanguages: { code: string; label: string }[]
    isRtl: boolean
    loaded: boolean
    currency: string
}

const I18nContext = createContext<I18nContextValue>({
    locale: 'en',
    t: getTranslations('en'),
    setLocale: () => { },
    menuTranslationLanguages: getMenuTranslationLanguages('en'),
    isRtl: false,
    loaded: false,
    currency: 'IQD',
})

export function useI18n() {
    return useContext(I18nContext)
}

interface I18nProviderProps {
    children: React.ReactNode
    /** Optional initial locale to avoid a flash on load */
    initialLocale?: ManagementLocale
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
    const [locale, setLocaleState] = useState<ManagementLocale>(initialLocale ?? 'en')
    const [loaded, setLoaded] = useState(!!initialLocale)

    const [currency, setCurrency] = useState('IQD')
    const [menuLang1, setMenuLang1] = useState('ar')
    const [menuLang2, setMenuLang2] = useState('ku')

    // On mount, fetch theme (management language, currency, menu translation languages)
    useEffect(() => {
        let cancelled = false
        fetch('/api/settings/theme')
            .then((res) => (res.ok ? res.json() : null))
            .then((theme: { managementLanguage?: string; currency?: string; menuTranslationLanguage1?: string; menuTranslationLanguage2?: string } | null) => {
                if (cancelled || !theme) return
                const lang = theme.managementLanguage ?? 'en'
                if (!initialLocale && (lang === 'ku' || lang === 'ar-fusha' || lang === 'ar_fusha')) {
                    setLocaleState(lang === 'ar_fusha' ? 'ar-fusha' : (lang as ManagementLocale))
                } else if (!initialLocale) {
                    setLocaleState('en')
                }
                setCurrency(theme.currency ?? 'IQD')
                setMenuLang1(theme.menuTranslationLanguage1 ?? 'ar')
                setMenuLang2(theme.menuTranslationLanguage2 ?? 'ku')
            })
            .catch(() => { })
            .finally(() => {
                if (!cancelled) setLoaded(true)
            })

        return () => {
            cancelled = true
        }
    }, [initialLocale])

    const setLocale = useCallback((newLocale: ManagementLocale) => {
        setLocaleState(newLocale)

        // Also update html lang attribute
        const root = document.documentElement
        root.setAttribute('dir', 'ltr') // admin is always LTR
        if (newLocale === 'ar-fusha') {
            root.setAttribute('lang', 'ar')
        } else if (newLocale === 'ku') {
            root.setAttribute('lang', 'ku')
        } else {
            root.setAttribute('lang', 'en')
        }
    }, [])

    // Also set lang attribute on initial load when fetched
    useEffect(() => {
        if (!loaded) return
        const root = document.documentElement
        root.setAttribute('dir', 'ltr')
        if (locale === 'ar-fusha') {
            root.setAttribute('lang', 'ar')
        } else if (locale === 'ku') {
            root.setAttribute('lang', 'ku')
        } else {
            root.setAttribute('lang', 'en')
        }
    }, [loaded, locale])

    const t = getTranslations(locale)
    const menuTranslationLanguages: { code: string; label: string }[] = [
        { code: menuLang1, label: MENU_LANG_LABELS[menuLang1] ?? menuLang1 },
        { code: menuLang2, label: MENU_LANG_LABELS[menuLang2] ?? menuLang2 },
    ]
    const isRtl = locale === 'ar-fusha'

    return (
        <I18nContext.Provider
            value={{ locale, t, setLocale, menuTranslationLanguages, isRtl, loaded, currency }}
        >
            {children}
        </I18nContext.Provider>
    )
}
