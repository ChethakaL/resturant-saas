import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  messages: Message[]
  context?: {
    pendingAction?: string
    actionData?: any
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.GOOGLE_AI_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    const { messages, context }: ChatRequest = await request.json()

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    })

    // Get user's restaurant info
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      include: {
        categories: {
          select: { id: true, name: true },
          orderBy: { displayOrder: 'asc' },
        },
        ingredients: {
          select: { id: true, name: true, unit: true },
          orderBy: { name: 'asc' },
          take: 50,
        },
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    // Build system prompt
    const systemPrompt = `You are an intelligent restaurant management assistant for "${restaurant.name}". You help users manage their menu and operations efficiently.

**Your Capabilities:**
1. Create menu items with AI assistance
2. Search the web for recipes and information
3. Generate images for menu items
4. Help with ingredient calculations and pricing
5. Answer questions about the restaurant management system

**Available Categories:**
${restaurant.categories.map((c) => `- ${c.name} (ID: ${c.id})`).join('\n')}

**Sample Ingredients (first 50):**
${restaurant.ingredients.map((i) => `- ${i.name} (${i.unit})`).join('\n')}

**Important Guidelines:**
1. BE AUTONOMOUS - Don't ask for confirmation on descriptions, prices, or categories. Make smart decisions yourself.
2. When user wants to create a menu item, ask ONLY if they want you to search for a recipe or provide their own
3. If searching, use: [SEARCH: query]
4. After getting recipe info, AUTOMATICALLY:
   - Generate a compelling description
   - Estimate a reasonable price (1000-5000 IQD based on ingredients/complexity)
   - Choose the most appropriate category
   - Set dietary tags based on recipe
   - Skip ingredients mapping (we'll create without detailed ingredients)
5. Use [GENERATE_IMAGE: prompt] to create the image
6. Use [CREATE_MENU_ITEM: json] with complete data - NO INGREDIENTS ARRAY
7. Only ask user to confirm if something is CRITICAL (like dish name or special requirements)
8. Be confident, autonomous, and fast

**Example Flow:**
User: "Create BBQ devilled chicken"
You: "Let me search for a BBQ devilled chicken recipe. [SEARCH: bbq devilled chicken recipe calories]"
(After search)
You: "Found it! Creating your menu item with image now... [GENERATE_IMAGE: professional food photography BBQ devilled chicken] [CREATE_MENU_ITEM: {complete data}]"

**Menu Item JSON Format (NO INGREDIENTS):**
{
  "name": "BBQ Devilled Chicken",
  "description": "Tender chicken pieces marinated in smoky BBQ sauce with a spicy kick...",
  "price": 2500,
  "categoryId": "select-appropriate-category-id",
  "available": true,
  "calories": 450,
  "tags": ["spicy", "non-vegetarian"],
  "imageUrl": null
}

**DO NOT include ingredients array - it causes errors!**
**Choose categoryId from the available categories list above**
**Be autonomous - don't ask for confirmation unless absolutely necessary**

Current conversation context: ${context ? JSON.stringify(context) : 'None'}

Be helpful and guide the user step by step!`

    // Build conversation history
    const conversationHistory = messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }))

    // Start chat with history
    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
        {
          role: 'model',
          parts: [{ text: 'I understand! I\'m ready to assist you with restaurant management tasks. I can help create menu items, search for recipes, generate images, and more. What would you like to do?' }],
        },
        ...conversationHistory.slice(0, -1),
      ],
    })

    // Get the last user message
    const lastMessage = messages[messages.length - 1].content

    // Send message and get response
    const result = await chat.sendMessage(lastMessage)
    const response = result.response.text()

    // Parse special commands
    let needsWebSearch = false
    let searchQuery = ''
    let needsImageGeneration = false
    let imagePrompt = ''
    let needsMenuItemCreation = false
    let menuItemData = null

    // Check for [SEARCH: query]
    const searchMatch = response.match(/\[SEARCH:\s*(.+?)\]/i)
    if (searchMatch) {
      needsWebSearch = true
      searchQuery = searchMatch[1].trim()
    }

    // Check for [GENERATE_IMAGE: prompt]
    const imageMatch = response.match(/\[GENERATE_IMAGE:\s*(.+?)\]/i)
    if (imageMatch) {
      needsImageGeneration = true
      imagePrompt = imageMatch[1].trim()
    }

    // Check for [CREATE_MENU_ITEM: data]
    const createMatch = response.match(/\[CREATE_MENU_ITEM:\s*(\{.+?\})\]/is)
    if (createMatch) {
      try {
        needsMenuItemCreation = true
        menuItemData = JSON.parse(createMatch[1])
      } catch (e) {
        console.error('Failed to parse menu item data:', e)
      }
    }

    // Clean response by removing special commands
    let cleanResponse = response
      .replace(/\[SEARCH:\s*.+?\]/gi, '')
      .replace(/\[GENERATE_IMAGE:\s*.+?\]/gi, '')
      .replace(/\[CREATE_MENU_ITEM:\s*\{.+?\}\]/gis, '')
      .trim()

    return NextResponse.json({
      message: cleanResponse,
      actions: {
        webSearch: needsWebSearch ? { query: searchQuery } : null,
        imageGeneration: needsImageGeneration ? { prompt: imagePrompt } : null,
        menuItemCreation: needsMenuItemCreation ? { data: menuItemData } : null,
      },
      categories: restaurant.categories,
      ingredients: restaurant.ingredients,
    })
  } catch (error) {
    console.error('Chatbot error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process message',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
