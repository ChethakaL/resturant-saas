import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

interface DNAChatRequest {
    messages: Message[]
    phase?: 'onboarding' | 'designer'
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!process.env.GOOGLE_AI_KEY) {
            return NextResponse.json(
                { error: 'Google AI API key not configured' },
                { status: 500 }
            )
        }

        const { messages, phase = 'designer' }: DNAChatRequest = await request.json()

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                temperature: 0.8,
                topP: 0.95,
                maxOutputTokens: 2048,
            },
        })

        const restaurant = await prisma.restaurant.findUnique({
            where: { id: session.user.restaurantId },
            select: {
                name: true,
                settings: true,
                categories: {
                    select: { name: true },
                    orderBy: { displayOrder: 'asc' },
                },
                menuItems: {
                    select: { name: true, price: true, imageUrl: true },
                    take: 20,
                },
            },
        })

        if (!restaurant) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
        }

        const settings = (restaurant.settings as Record<string, unknown>) || {}
        const currentTheme = (settings.theme as Record<string, string>) || {}

        const onboardingPrompt = `You are a friendly, enthusiastic restaurant brand designer called "DNA Designer". You are helping a restaurant owner set up their restaurant's visual identity (their "Restaurant DNA").

You are guiding them through these questions one at a time in a conversational, fun way. Ask ONE question at a time. Be warm, encouraging, and brief. Use emojis sparingly but naturally.

The questions to ask (in order):
1. "What's the name of your restaurant?" - If we already know it's "${restaurant.name}", confirm it with them
2. "Tell me about your restaurant - what makes it special? What's the story behind it?"
3. "What type of cuisine do you serve? (e.g., Italian, Middle Eastern, Fusion, Fast Casual, Fine Dining...)"
4. "What's the vibe of your restaurant? (e.g., Cozy & intimate, Modern & sleek, Fun & energetic, Elegant & upscale, Rustic & warm...)"
5. "What are your opening hours? (e.g., 9 AM - 11 PM daily, or different times for different days)"

After you have ALL 5 answers, generate a complete theme recommendation. Your response MUST include a JSON block in this exact format:

[THEME_RECOMMENDATION: {
  "restaurantName": "The Name",
  "primaryColor": "#hexcode",
  "accentColor": "#hexcode",
  "chefPickColor": "#hexcode",
  "borderColor": "#hexcode",
  "backgroundStyle": "dark|light|gradient",
  "fontFamily": "font-key",
  "menuCarouselStyle": "sliding|static",
  "description": "Brief explanation of why you chose these design elements",
  "openingTimes": "The opening times they mentioned"
}]

Available font keys: "sans" (DM Sans - modern/clean), "serif" (Playfair Display - elegant), "display" (Cormorant - classic), "mono" (Space Mono - tech/modern), "rounded" (Nunito - friendly/warm), "handwritten" (Caveat - casual/artsy), "condensed" (Barlow Condensed - bold/urban), "slab" (Roboto Slab - strong/reliable)

Choose colors that match the restaurant's personality:
- Fine dining / elegant: Deep navys (#1e293b), golds (#c9a227), rich burgundys (#7f1d1d)
- Fast food / casual: Vibrant reds (#dc2626), yellows (#fbbf24), oranges (#f97316)
- Cozy / warm: Ambers (#b45309), warm browns (#78350f), terracottas (#c2410c)
- Modern / minimal: Teals (#0f766e), cool grays (#475569), soft blues (#3b82f6)
- Luxe / upscale: Purples (#7c3aed), rose golds (#e879a0), deep emeralds (#065f46)
- Middle Eastern: Rich turquoise (#0f766e), gold (#d4a017), deep red (#991b1b)
- Asian: Red (#dc2626), black, gold accents (#eab308)
- Italian: Forest green (#15803d), terracotta (#c2410c), cream

After providing the recommendation, briefly explain your choices in a warm, exciting way. Make them feel like their restaurant is going to look amazing!

Do NOT ask all questions at once. Ask ONE question, wait for the answer, then ask the next.`

        const designerPrompt = `You are "Smart Designer", an AI restaurant brand consultant for "${restaurant.name}". You help restaurant owners make design decisions for their digital menu and brand.

Current theme settings:
- Primary color: ${currentTheme.primaryColor || '#10b981'}
- Accent color: ${currentTheme.accentColor || '#f59e0b'}
- Background: ${currentTheme.backgroundStyle || 'dark'}
- Font: ${currentTheme.fontFamily || 'sans'}
- Carousel style: ${(currentTheme as Record<string, string>).menuCarouselStyle || 'sliding'}

Available categories: ${restaurant.categories.map(c => c.name).join(', ') || 'None yet'}
Menu items: ${restaurant.menuItems.length} items

You can help with:
1. Recommending color schemes that match their brand
2. Suggesting font pairings and styles
3. Advising on carousel/showcase content strategy
4. Recommending which items to feature
5. Seasonal design changes
6. Overall brand consistency tips

When suggesting specific theme changes, include:
[APPLY_THEME: {"key": "value"}]

Available keys: primaryColor, accentColor, chefPickColor, borderColor, backgroundStyle (dark/light/gradient), fontFamily (sans/serif/display/mono/rounded/handwritten/condensed/slab), menuCarouselStyle (sliding/static)

Be conversational, helpful, and creative. Use concrete examples and explain the psychology behind your suggestions. Keep responses concise and actionable.`

        const systemPrompt = phase === 'onboarding' ? onboardingPrompt : designerPrompt

        const conversationHistory = messages.map((msg) => ({
            role: msg.role === 'user' ? 'user' as const : 'model' as const,
            parts: [{ text: msg.content }],
        }))

        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                {
                    role: 'model',
                    parts: [{
                        text: phase === 'onboarding'
                            ? `Hey there! Welcome to Restaurant DNA - where we discover your restaurant's unique identity and bring it to life! 🎨\n\nI'm your DNA Designer, and I'm going to help you create a stunning look for your digital menu that perfectly matches your restaurant's personality.\n\nLet's start with the basics - what's the name of your restaurant?`
                            : `Hey! I'm your Smart Designer. I can help you refine your restaurant's look and feel. What would you like to work on today?`
                    }],
                },
                ...conversationHistory.slice(0, -1),
            ],
        })

        const lastMessage = messages[messages.length - 1].content
        const result = await chat.sendMessage(lastMessage)
        const response = result.response.text()

        // Parse theme recommendation
        let themeRecommendation = null
        const themeMatch = response.match(/\[THEME_RECOMMENDATION:\s*(\{[\s\S]+?\})\]/i)
        if (themeMatch) {
            try {
                themeRecommendation = JSON.parse(themeMatch[1])
            } catch (e) {
                console.error('Failed to parse theme recommendation:', e)
            }
        }

        // Parse apply theme
        let applyTheme = null
        const applyMatch = response.match(/\[APPLY_THEME:\s*(\{[\s\S]+?\})\]/i)
        if (applyMatch) {
            try {
                applyTheme = JSON.parse(applyMatch[1])
            } catch (e) {
                console.error('Failed to parse apply theme:', e)
            }
        }

        // Clean response
        let cleanResponse = response
            .replace(/\[THEME_RECOMMENDATION:\s*\{[\s\S]+?\}\]/gi, '')
            .replace(/\[APPLY_THEME:\s*\{[\s\S]+?\}\]/gi, '')
            .trim()

        return NextResponse.json({
            message: cleanResponse,
            themeRecommendation,
            applyTheme,
        })
    } catch (error) {
        console.error('Restaurant DNA chat error:', error)
        return NextResponse.json(
            {
                error: 'Failed to process message',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
