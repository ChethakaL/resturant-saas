import { prisma } from '../src/lib/prisma'

async function checkConfig() {
  const config = await prisma.platformConfig.findUnique({ where: { id: 'global' } })
  console.log('Database Config:', JSON.stringify(config, null, 2))
}

checkConfig()
  .catch(console.error)
  .finally(() => process.exit())
