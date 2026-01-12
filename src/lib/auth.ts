import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const DEMO_EMAIL = 'owner@alrafidain.iq'
const DEMO_PASSWORD = 'password123'

async function ensureDemoUser() {
  const userCount = await prisma.user.count()
  if (userCount > 0) {
    return
  }

  const existingRestaurant = await prisma.restaurant.findFirst({
    where: { slug: 'al-rafidain' },
  })

  const restaurant =
    existingRestaurant ||
    (await prisma.restaurant.create({
      data: {
        name: 'Al-Rafidain Restaurant',
        slug: 'al-rafidain',
        email: 'owner@alrafidain.iq',
        phone: '+964 770 000 0000',
        address: 'Baghdad, Iraq',
      },
    }))

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10)

  await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      password: hashedPassword,
      name: 'Demo Owner',
      role: 'OWNER',
      restaurantId: restaurant.id,
    },
  })
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        await ensureDemoUser()

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { restaurant: true },
        })

        if (!user || !user.isActive) {
          throw new Error('Invalid credentials')
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isPasswordValid) {
          throw new Error('Invalid credentials')
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          restaurantId: user.restaurantId,
          restaurantName: user.restaurant.name,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.restaurantId = user.restaurantId
        token.restaurantName = user.restaurantName
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.restaurantId = token.restaurantId as string
        session.user.restaurantName = token.restaurantName as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
