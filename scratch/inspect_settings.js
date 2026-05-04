const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: 'cmmq30lvq0000xiqobh0bygwt' }
  })
  if (restaurant) {
    console.log('RESTAURANT NAME:', restaurant.name)
    console.log('THEME PRESET IN DB:', restaurant.settings?.themePreset)
    console.log('PRIMARY COLOR IN DB:', restaurant.settings?.theme?.primaryColor)
  } else {
    console.log('RESTAURANT NOT FOUND')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
