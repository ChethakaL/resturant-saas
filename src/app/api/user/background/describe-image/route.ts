import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/**
 * Accepts an image upload (form data or base64) and saves it as
 * User.defaultBackgroundImageData for consistent dish backgrounds.
 * If OpenAI is configured, also generates a background description and saves it
 * to User.defaultBackgroundPrompt.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.OPENAI_API_KEY

    let imageDataUrl: string

    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('image') as File | null
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'No image file provided. Use form field "image".' },
          { status: 400 }
        )
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: 'Invalid file type. Use JPEG, PNG, WebP, or GIF.' },
          { status: 400 }
        )
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File too large. Maximum 5MB.' },
          { status: 400 }
        )
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')
      imageDataUrl = `data:${file.type};base64,${base64}`
    } else {
      const body = await request.json().catch(() => ({}))
      const b64 = body.imageBase64 ?? body.base64
      const mime = body.mimeType ?? 'image/jpeg'
      if (!b64 || typeof b64 !== 'string') {
        return NextResponse.json(
          { error: 'No image data. Send multipart form with "image" file or JSON with "imageBase64".' },
          { status: 400 }
        )
      }
      imageDataUrl = `data:${mime};base64,${b64.replace(/^data:image\/\w+;base64,/, '')}`
    }

    let description = ''
    if (apiKey) {
      const openai = new OpenAI({ apiKey })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Describe the background and setting of this image in 1–3 short sentences, suitable for use as a prompt when generating restaurant dish photos. Focus only on: surface (e.g. table, plate, marble), lighting, style, and mood. Do not describe any food or objects in the foreground. Output only the description, no preamble.`,
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
        max_tokens: 150,
      })
      description = completion.choices[0]?.message?.content?.trim() || ''
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        defaultBackgroundImageData: imageDataUrl,
        ...(description ? { defaultBackgroundPrompt: description } : {}),
      },
    })

    return NextResponse.json({
      defaultBackgroundPrompt: user.defaultBackgroundPrompt,
      defaultBackgroundImageData: user.defaultBackgroundImageData,
      hasDefaultBackgroundImage: Boolean(user.defaultBackgroundImageData),
      description,
    })
  } catch (error) {
    console.error('Describe background image error:', error)
    return NextResponse.json(
      {
        error: 'Failed to describe image and save background prompt',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
