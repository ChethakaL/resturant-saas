import { prisma } from '../src/lib/prisma'

async function checkPromo() {
  const code = 'WELCOMEISERVE'
  const promo = await prisma.promoCode.findUnique({ where: { code } })
  console.log('Promo Code:', JSON.stringify(promo, null, 2))
}

checkPromo()
  .catch(console.error)
  .finally(() => process.exit())
