import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function parseDataUri(value: string): { mime: string; data: Buffer } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  try {
    return {
      mime: match[1] || 'image/jpeg',
      data: Buffer.from(match[2], 'base64'),
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim()
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const item = await prisma.menuItem.findFirst({
    where: { id, available: true, status: 'ACTIVE' },
    select: { imageUrl: true, updatedAt: true },
  })

  if (!item?.imageUrl) {
    return new NextResponse('Not found', { status: 404 })
  }

  if (!item.imageUrl.startsWith('data:image')) {
    return NextResponse.redirect(item.imageUrl, 302)
  }

  const parsed = parseDataUri(item.imageUrl)
  if (!parsed) {
    return new NextResponse('Invalid image data', { status: 400 })
  }

  return new NextResponse(parsed.data, {
    status: 200,
    headers: {
      'Content-Type': parsed.mime,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      ETag: `"${item.updatedAt.getTime()}"`,
    },
  })
}

