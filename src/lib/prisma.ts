import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaShutdownHandlerRegistered: boolean | undefined
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return databaseUrl

  try {
    const url = new URL(databaseUrl)
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', process.env.PRISMA_CONNECTION_LIMIT || '5')
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', process.env.PRISMA_POOL_TIMEOUT || '20')
    }
    return url.toString()
  } catch {
    return databaseUrl
  }
}

const databaseUrl = getDatabaseUrl()

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    ...(databaseUrl
      ? {
          datasources: {
            db: { url: databaseUrl },
          },
        }
      : {}),
  })

globalForPrisma.prisma = prisma

if (!globalForPrisma.prismaShutdownHandlerRegistered) {
  globalForPrisma.prismaShutdownHandlerRegistered = true

  const disconnect = async () => {
    await prisma.$disconnect()
  }

  process.once('beforeExit', disconnect)
}

export default prisma
