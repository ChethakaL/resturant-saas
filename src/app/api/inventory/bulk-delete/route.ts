import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const MAX_IDS = 200

/**
 * Deletes multiple ingredients for the current restaurant in one request.
 * Use for clearing bad OCR/translation rows before re-importing receipts.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null
    const raw = Array.isArray(body?.ids) ? body.ids : []
    const ids = raw
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, MAX_IDS)

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No ingredient ids provided' }, { status: 400 })
    }

    const restaurantId = session.user.restaurantId

    const result = await prisma.ingredient.deleteMany({
      where: {
        restaurantId,
        id: { in: ids },
      },
    })

    return NextResponse.json({ deleted: result.count, requested: ids.length })
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string }
    console.error('[inventory/bulk-delete]', error)
    if (err.code === 'P2003') {
      return NextResponse.json(
        {
          error:
            'Some ingredients could not be removed because they are linked to expenses or other records. Remove those links first, or delete those rows one by one.',
        },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: err.message ?? 'Failed to delete ingredients' },
      { status: 500 }
    )
  }
}
