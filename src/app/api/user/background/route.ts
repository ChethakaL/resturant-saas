import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const promptValue = typeof body.prompt === 'string' ? body.prompt.trim() : ''

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        defaultBackgroundPrompt: promptValue || null,
      },
    })

    return NextResponse.json({
      defaultBackgroundPrompt: user.defaultBackgroundPrompt,
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
