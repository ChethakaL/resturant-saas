'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
    Send,
    Loader2,
    Sparkles,
    Dna,
    Check,
    ArrowRight,
} from 'lucide-react'

interface Message {
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
}

interface ThemeRecommendation {
    restaurantName?: string
    primaryColor?: string
    accentColor?: string
    chefPickColor?: string
    borderColor?: string
    backgroundStyle?: string
    fontFamily?: string
    menuCarouselStyle?: string
    description?: string
    openingTimes?: string
    /** Tone for AI menu descriptions (e.g. fast casual vs fine dining). */
    descriptionTone?: string
}

interface RestaurantDNAOnboardingProps {
    onComplete: (theme: ThemeRecommendation) => void
    onSkip: () => void
    restaurantName?: string
}

const FONT_LABELS: Record<string, string> = {
    sans: 'DM Sans (Modern)',
    serif: 'Playfair Display (Elegant)',
    display: 'Cormorant (Classic)',
    mono: 'Space Mono (Tech)',
    rounded: 'Nunito (Friendly)',
    handwritten: 'Caveat (Artsy)',
    condensed: 'Barlow (Bold)',
    slab: 'Roboto Slab (Strong)',
}

export default function RestaurantDNAOnboarding({
    onComplete,
    onSkip,
    restaurantName,
}: RestaurantDNAOnboardingProps) {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: `Welcome to Restaurant DNA. I'll help you set up your restaurant's visual identity for your digital menu.\n\nWhat is the name of your restaurant?`,
            timestamp: new Date(),
        },
    ])
    const [input, setInput] = useState(restaurantName || '')
    const [isLoading, setIsLoading] = useState(false)
    const [themeRecommendation, setThemeRecommendation] = useState<ThemeRecommendation | null>(null)
    const [step, setStep] = useState(0)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const stepLabels = [
        'Restaurant Name',
        'Your Story',
        'Cuisine Type',
        'Restaurant Vibe',
        'Opening Hours',
        'Your DNA',
    ]

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    useEffect(() => {
        scrollToBottom()
    }, [messages, scrollToBottom])

    useEffect(() => {
        if (!isLoading) inputRef.current?.focus()
    }, [isLoading])

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        }

        const updatedMessages = [...messages, userMessage]
        setMessages(updatedMessages)
        setInput('')
        setIsLoading(true)

        try {
            const res = await fetch('/api/restaurant-dna/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: updatedMessages.map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                    phase: 'onboarding',
                }),
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed')

            const assistantMessage: Message = {
                role: 'assistant',
                content: data.message,
                timestamp: new Date(),
            }
            setMessages((prev) => [...prev, assistantMessage])

            // Advance step
            setStep((s) => Math.min(s + 1, stepLabels.length - 1))

            if (data.themeRecommendation) {
                setThemeRecommendation(data.themeRecommendation)
                setStep(stepLabels.length - 1)
            }
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'Oops, something went wrong. Could you try that again?',
                    timestamp: new Date(),
                },
            ])
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const handleApplyTheme = () => {
        if (themeRecommendation) {
            onComplete(themeRecommendation)
        }
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative flex flex-col w-full max-w-2xl h-[85vh] mx-4 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50"
                style={{
                    background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
                }}
            >
                {/* Header */}
                <div className="relative px-8 pt-8 pb-4">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-600 via-slate-500 to-slate-400" />
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-700/50 border border-slate-500/30">
                            <Dna className="w-6 h-6 text-slate-300" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Restaurant DNA</h2>
                            <p className="text-sm text-slate-400">Discovering your brand identity</p>
                        </div>
                        <button
                            onClick={onSkip}
                            className="ml-auto text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-white/5"
                        >
                            Skip for now →
                        </button>
                    </div>
                    {/* Progress Steps */}
                    <div className="flex items-center gap-1 mt-2">
                        {stepLabels.map((label, i) => (
                            <div key={label} className="flex-1 flex flex-col items-center gap-1">
                                <div
                                    className={`h-1.5 w-full rounded-full transition-all duration-500 ${i <= step
                                        ? 'bg-slate-400'
                                        : 'bg-white/10'
                                        }`}
                                />
                                <span
                                    className={`text-[9px] tracking-wider uppercase transition-colors hidden sm:block ${i <= step ? 'text-slate-300' : 'text-slate-600'
                                        }`}
                                >
                                    {label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto px-8 py-4 space-y-4 scroll-smooth">
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                        >
                            {msg.role === 'assistant' && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-slate-700/50 flex items-center justify-center mr-2 mt-1 border border-slate-500/30">
                                    <Sparkles className="w-4 h-4 text-slate-300" />
                                </div>
                            )}
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-slate-700 text-white rounded-br-md'
                                    : 'bg-white/5 text-slate-200 border border-white/5 rounded-bl-md'
                                    }`}
                            >
                                {msg.content.split('\n').map((line, j) => (
                                    <p key={j} className={j > 0 ? 'mt-2' : ''}>
                                        {line}
                                    </p>
                                ))}
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex justify-start animate-in fade-in">
                            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-slate-700/50 flex items-center justify-center mr-2 border border-slate-500/30">
                                <Sparkles className="w-4 h-4 text-slate-300" />
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl rounded-bl-md px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                    <span className="text-sm text-slate-400">Thinking...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Theme Recommendation Preview */}
                    {themeRecommendation && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4">
                            <div className="rounded-2xl border border-slate-600/30 bg-slate-800/50 p-5 space-y-4">
                                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-slate-300" />
                                    Your Restaurant DNA Theme
                                </h3>
                                <div className="flex flex-wrap gap-3">
                                    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                                        <div
                                            className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                                            style={{ backgroundColor: themeRecommendation.primaryColor }}
                                        />
                                        <span className="text-xs text-slate-300">Brand</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                                        <div
                                            className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                                            style={{ backgroundColor: themeRecommendation.accentColor }}
                                        />
                                        <span className="text-xs text-slate-300">Accent</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                                        <div
                                            className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                                            style={{ backgroundColor: themeRecommendation.chefPickColor }}
                                        />
                                        <span className="text-xs text-slate-300">Chef&apos;s Pick</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                                        <div
                                            className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                                            style={{ backgroundColor: themeRecommendation.borderColor }}
                                        />
                                        <span className="text-xs text-slate-300">Highlight</span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <span className="bg-white/5 text-slate-300 px-3 py-1.5 rounded-full border border-white/5">
                                        🎨 {themeRecommendation.backgroundStyle === 'dark' ? 'Dark Mode' : themeRecommendation.backgroundStyle === 'light' ? 'Light Mode' : 'Gradient'}
                                    </span>
                                    <span className="bg-white/5 text-slate-300 px-3 py-1.5 rounded-full border border-white/5">
                                        ✍️ {FONT_LABELS[themeRecommendation.fontFamily || 'sans'] || themeRecommendation.fontFamily}
                                    </span>
                                    <span className="bg-white/5 text-slate-300 px-3 py-1.5 rounded-full border border-white/5">
                                        🎠 {themeRecommendation.menuCarouselStyle === 'static' ? 'Static Row' : 'Sliding Carousel'}
                                    </span>
                                </div>

                                {/* Menu Preview */}
                                <div
                                    className="rounded-xl p-5 mt-3 border border-white/5"
                                    style={{
                                        background: themeRecommendation.backgroundStyle === 'light'
                                            ? '#f1f5f9'
                                            : themeRecommendation.backgroundStyle === 'gradient'
                                                ? `linear-gradient(135deg, #020617, #0f172a, #020617)`
                                                : '#020617',
                                        color: themeRecommendation.backgroundStyle === 'light' ? '#0f172a' : '#f8fafc',
                                    }}
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div
                                            className="w-8 h-8 rounded-full"
                                            style={{ backgroundColor: themeRecommendation.primaryColor }}
                                        />
                                        <div>
                                            <p className="text-sm font-bold">{themeRecommendation.restaurantName || 'Your Restaurant'}</p>
                                            <p className="text-[10px] opacity-60">Digital Menu Preview</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                        <div className="h-1.5 w-10 rounded-full" style={{ backgroundColor: themeRecommendation.primaryColor }} />
                                        <div className="h-1.5 w-5 rounded-full" style={{ backgroundColor: themeRecommendation.accentColor }} />
                                        <div className="h-1.5 w-5 rounded-full opacity-30" style={{ backgroundColor: themeRecommendation.accentColor }} />
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <div className="flex-1 rounded-lg p-2 border" style={{ borderColor: themeRecommendation.borderColor + '40' }}>
                                            <div className="w-full h-8 rounded bg-current opacity-5" />
                                            <div className="flex items-center justify-between mt-2">
                                                <div className="h-2 w-16 rounded-full bg-current opacity-20" />
                                                <div className="h-5 w-12 rounded-full text-[8px] flex items-center justify-center text-white font-bold"
                                                    style={{ backgroundColor: themeRecommendation.accentColor }}
                                                >
                                                    Add
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-1 rounded-lg p-2 border border-transparent">
                                            <div className="w-full h-8 rounded bg-current opacity-5" />
                                            <div className="flex items-center justify-between mt-2">
                                                <div className="h-2 w-12 rounded-full bg-current opacity-20" />
                                                <div className="h-5 w-12 rounded-full text-[8px] flex items-center justify-center text-white font-bold"
                                                    style={{ backgroundColor: themeRecommendation.accentColor }}
                                                >
                                                    Add
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button
                                        onClick={handleApplyTheme}
                                        className="flex-1 h-11 bg-slate-700 hover:bg-slate-400 text-white border-0 rounded-xl font-medium"
                                    >
                                        <Check className="w-4 h-4 mr-2" />
                                        Apply this theme
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={onSkip}
                                        className="h-11 border-slate-600 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl"
                                    >
                                        Customize later
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                {!themeRecommendation && (
                    <div className="px-8 pb-8 pt-4">
                        <div className="flex items-center gap-2 bg-white/5 rounded-2xl border border-slate-600/30 px-4 py-2 focus-within:border-slate-400/50 transition-colors">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type your answer..."
                                disabled={isLoading}
                                className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none py-2"
                            />
                            <Button
                                onClick={sendMessage}
                                disabled={!input.trim() || isLoading}
                                size="sm"
                                className="bg-slate-700 hover:bg-slate-400 text-white border-0 rounded-xl h-9 w-9 p-0"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <ArrowRight className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
