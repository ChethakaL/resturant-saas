import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Generate a menu background image from a vibe description using Gemini.
 * Returns a data URL that can be stored as backgroundImageUrl.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const description = typeof body.description === 'string' ? body.description.trim() : ''

    if (!description) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      )
    }

    if (!process.env.GOOGLE_AI_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    const imagePrompt = `Wide, high-quality ambient background image for a restaurant menu or dining app. Mood and style: ${description}. The image should be suitable as a full-screen background behind menu text - atmospheric, not too busy, with soft lighting. No text, no logos. Photorealistic or tasteful illustration. 16:9 aspect ratio, horizontal.`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_AI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt }] }],
          generationConfig: {
            responseModalities: ['image'],
            temperature: 0.9,
          },
        }),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini background gen error:', err)
      return NextResponse.json(
        { error: 'Failed to generate background image' },
        { status: 500 }
      )
    }

    const data = await response.json()
    const candidates = data.candidates
    if (!candidates?.length || !candidates[0].content?.parts) {
      return NextResponse.json(
        { error: 'No image in response' },
        { status: 500 }
      )
    }

    let imageBase64: string | null = null
    let mimeType = 'image/png'
    for (const part of candidates[0].content.parts) {
      if (part.inlineData?.data) {
        imageBase64 = part.inlineData.data
        mimeType = part.inlineData.mimeType || mimeType
        break
      }
    }

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'No image data in response' },
        { status: 500 }
      )
    }

    const imageUrl = `data:${mimeType};base64,${imageBase64}`

    return NextResponse.json({ imageUrl })
  } catch (error) {
    console.error('Generate background error:', error)
    return NextResponse.json(
      { error: 'Failed to generate background', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
