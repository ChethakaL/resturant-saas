import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { enforceImageDimensions } from '@/lib/image-processor'
import {
  ImageOrientation,
  ImageSizePreset,
  imageOrientationPrompts,
  imageSizePrompts,
} from '@/lib/image-format'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      imageData,
      prompt,
      orientation = 'landscape',
      sizePreset = 'medium',
    }: {
      imageData?: string
      prompt?: string
      orientation?: ImageOrientation
      sizePreset?: ImageSizePreset
    } = await request.json()
    if (!imageData) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      )
    }

    if (!process.env.GOOGLE_AI_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    // Extract base64 data and mime type
    const base64Data = imageData.includes(',')
      ? imageData.split(',')[1]
      : imageData

    const originalMime = imageData.includes(',')
      ? imageData.split(',')[0].split(':')[1].split(';')[0]
      : 'image/jpeg'

    // Determine the mime type for Gemini (it prefers specific formats)
    let geminiMimeType = originalMime
    if (!geminiMimeType || !geminiMimeType.startsWith('image/')) {
      geminiMimeType = 'image/jpeg'
    }

    console.log('Enhancing image with Gemini 2.5 Flash Image API...')

    // Use Gemini 2.5 Flash Image API to enhance the image
    // Using a direct editing command format
    const userPrompt = (prompt || '').trim()
    const orientationHint = imageOrientationPrompts[orientation] ?? ''
    const sizeHint = imageSizePrompts[sizePreset] ?? ''
    const enhancementPrompt = `
You are editing a real photo of a cooked dish. Your job is to create a restaurant-quality menu photograph of THE SAME EXACT DISH.

GOAL:
- Make it look like professional food photography (studio lighting, appetizing color, crisp detail).
- Move the dish onto a clean, professional tabletop/studio background (e.g., neutral plate on a nice table or seamless backdrop).
- Improve composition: straighten perspective, crop, and reframe to a pleasing menu-photo angle (3/4 angle or top-down, whichever suits the dish).

STRICT PRESERVATION (MOST IMPORTANT):
- Do NOT change what the user cooked.
- Do NOT add, remove, replace, or invent any ingredients, garnishes, sauces, steam, props, utensils, extra food, or plate decorations that were not already present.
- Keep the same portion sizes, shapes, textures, and arrangement of the food and plate/bowl.
- Keep identifying details of the dish (toppings, edges, crumbs, burn marks, cuts, placement) consistent with the original.
- Only change: lighting, color grading, sharpness, perspective correction, and BACKGROUND/surface.

    BACKGROUND RULES:
    - Replace the messy/phone background with a clean, premium restaurant-style setting.
    - Use realistic shadows/reflections so the dish sits naturally in the new scene.
    - No text, no logos, no watermarks.

    ${orientationHint ? `COMPOSITION NOTES:\n${orientationHint}\n` : ''}
    ${sizeHint ? `SIZE NOTES:\n${sizeHint}\n` : ''}

    OUTPUT:
    - Photorealistic, high-quality menu-style image.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_AI_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: geminiMimeType,
                    data: base64Data,
                  },
                },
                {
                  text: enhancementPrompt + (userPrompt ? `\n\nUSER NOTE: ${userPrompt}` : ''),
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['image'],
            temperature: 0.3, // Lower temperature for more consistent, faithful enhancement
            topK: 20,
            topP: 0.85,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', errorText)
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log('Gemini enhancement response received')
    console.log('Response structure:', JSON.stringify(data, null, 2).substring(0, 500)) // Log first 500 chars

    // Extract the enhanced image data from the response
    const candidates = data.candidates
    if (!candidates || candidates.length === 0) {
      console.error('No candidates in response:', JSON.stringify(data, null, 2))
      return NextResponse.json(
        { error: 'No enhanced image generated by Gemini', details: JSON.stringify(data) },
        { status: 500 }
      )
    }

    if (!candidates[0].content || !candidates[0].content.parts) {
      console.error('Invalid candidate structure:', JSON.stringify(candidates[0], null, 2))
      return NextResponse.json(
        { error: 'Invalid response structure from Gemini', details: JSON.stringify(candidates[0]) },
        { status: 500 }
      )
    }

    const parts = candidates[0].content.parts
    console.log('Number of parts in response:', parts.length)
    console.log('Parts structure:', parts.map((p: any) => ({
      hasInlineData: !!p.inlineData,
      hasText: !!p.text,
      mimeType: p.inlineData?.mimeType,
      textPreview: p.text?.substring(0, 100)
    })))

    let imageBase64: string | null = null
    let imageMimeType: string = 'image/png'

    // Find the image in the response parts
    for (const part of parts) {
      if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
        imageBase64 = part.inlineData.data
        imageMimeType = part.inlineData.mimeType
        console.log('Found image in response:', {
          mimeType: imageMimeType,
          dataLength: imageBase64?.length || 0,
          dataPreview: imageBase64?.substring(0, 50) || 'none'
        })
        break
      }
    }

    if (!imageBase64) {
      // If no inline data, check if there's a text response with error
      const textResponse = parts.find((p: any) => p.text)?.text
      console.error('No image data found. Response parts:', JSON.stringify(parts, null, 2))
      return NextResponse.json(
        {
          error: 'No enhanced image data found in response',
          details: textResponse || 'Gemini did not return image data'
        },
        { status: 500 }
      )
    }

    const processedImage = await enforceImageDimensions(
      imageBase64,
      orientation,
      sizePreset
    )
    const imageDataUrl = `data:${processedImage.mimeType};base64,${processedImage.base64}`

    console.log('Image enhanced successfully with Gemini 2.5 Flash Image', {
      originalSize: base64Data.length,
      enhancedSize: processedImage.base64.length,
      mimeType: processedImage.mimeType,
    })

    return NextResponse.json({
      success: true,
      imageUrl: imageDataUrl,
      originalMimeType: originalMime,
    })
  } catch (error) {
    console.error('Error enhancing image:', error)
    return NextResponse.json(
      {
        error: 'Failed to enhance image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
