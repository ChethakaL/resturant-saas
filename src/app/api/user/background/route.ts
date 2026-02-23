import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function generateTemplateImageFromPrompt(prompt: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey || !prompt.trim()) {
    return null
  }

  const imagePrompt =
    `Professional restaurant dish-photo background template. ${prompt.trim()}. ` +
    'Background only, no food, no plate, no utensils, no text, no logos. ' +
    'Photorealistic lighting and tabletop/studio scene suitable for placing many different dishes consistently.'

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: imagePrompt }] }],
        generationConfig: {
          responseModalities: ['image'],
          temperature: 0.4,
          topP: 0.8,
        },
      }),
    }
  )
  if (!response.ok) {
    return null
  }

  const data = await response.json()
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((part: any) => part.inlineData?.mimeType?.startsWith('image/'))
  const img = imagePart?.inlineData?.data
  const mime = imagePart?.inlineData?.mimeType || 'image/png'
  if (!img) {
    return null
  }

  return `data:${mime};base64,${img}`
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        defaultBackgroundPrompt: true,
        defaultBackgroundImageData: true,
      },
    })

    return NextResponse.json({
      defaultBackgroundPrompt: user?.defaultBackgroundPrompt ?? '',
      defaultBackgroundImageData: user?.defaultBackgroundImageData ?? null,
      hasDefaultBackgroundImage: Boolean(user?.defaultBackgroundImageData),
    })
  } catch (error) {
    console.error('Error loading background settings:', error)
    return NextResponse.json(
      {
        error: 'Failed to load background settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const hasPromptField = Object.prototype.hasOwnProperty.call(body, 'prompt')
    const promptValue = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const hasImageField = Object.prototype.hasOwnProperty.call(body, 'imageData')
    const imageValue =
      typeof body.imageData === 'string' && body.imageData.trim()
        ? body.imageData.trim()
        : null
    const generatedImageData =
      hasPromptField && !hasImageField && promptValue
        ? await generateTemplateImageFromPrompt(promptValue)
        : null

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(hasPromptField ? { defaultBackgroundPrompt: promptValue || null } : {}),
        ...(hasImageField
          ? { defaultBackgroundImageData: imageValue }
          : generatedImageData
          ? { defaultBackgroundImageData: generatedImageData }
          : {}),
      },
    })

    return NextResponse.json({
      defaultBackgroundPrompt: user.defaultBackgroundPrompt,
      defaultBackgroundImageData: user.defaultBackgroundImageData,
      hasDefaultBackgroundImage: Boolean(user.defaultBackgroundImageData),
    })
  } catch (error) {
    console.error('Error updating background prompt:', error)
    return NextResponse.json(
      {
        error: 'Failed to save background prompt',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
