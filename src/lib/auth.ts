import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const DEMO_EMAIL = 'owner@alrafidain.iq'
const DEMO_PASSWORD = 'password123'
const DEMO_WAITER_EMAIL = 'waiter@alrafidain.iq'
const DEMO_WAITER_PASSWORD = 'waiter123'

async function ensureDemoUser() {
  const userCount = await prisma.user.count()
  if (userCount > 0) {
    return
  }

  const existingRestaurant = await prisma.restaurant.findFirst({
    where: { slug: 'al-rafidain' },
  })

  const oneYearFromNow = new Date()
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)
  const restaurant =
    existingRestaurant ||
    (await prisma.restaurant.create({
      data: {
        name: 'Al-Rafidain Restaurant',
        slug: 'al-rafidain',
        email: 'owner@alrafidain.iq',
        phone: '+964 770 000 0000',
        address: 'Baghdad, Iraq',
        subscriptionStatus: 'active',
        subscriptionPriceId: process.env.STRIPE_PRICE_ANNUAL ?? null,
        currentPeriodEnd: oneYearFromNow,
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

async function ensureDemoWaiter() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: 'al-rafidain' },
  })
  if (!restaurant) return

  const existing = await prisma.employee.findFirst({
    where: {
      email: DEMO_WAITER_EMAIL,
      restaurantId: restaurant.id,
    },
  })
  if (existing) return

  const hashedPw = await bcrypt.hash(DEMO_WAITER_PASSWORD, 10)

  await prisma.employee.create({
    data: {
      name: 'Ahmed (Demo Waiter)',
      position: 'WAITER',
      phone: '+964 770 111 1111',
      email: DEMO_WAITER_EMAIL,
      password: hashedPw,
      salary: 500000,
      salaryType: 'MONTHLY',
      isActive: true,
      restaurantId: restaurant.id,
    },
  })

  // Also ensure we have some demo tables
  const tableCount = await prisma.table.count({
    where: { restaurantId: restaurant.id },
  })
  if (tableCount === 0) {
    await prisma.table.createMany({
      data: [
        { number: '1', capacity: 2, restaurantId: restaurant.id },
        { number: '2', capacity: 4, restaurantId: restaurant.id },
        { number: '3', capacity: 4, restaurantId: restaurant.id },
        { number: '4', capacity: 6, restaurantId: restaurant.id },
        { number: '5', capacity: 2, restaurantId: restaurant.id },
        { number: '6', capacity: 8, restaurantId: restaurant.id },
        { number: '7', capacity: 4, restaurantId: restaurant.id },
        { number: '8', capacity: 2, restaurantId: restaurant.id },
        { number: '9', capacity: 6, restaurantId: restaurant.id },
        { number: '10', capacity: 4, restaurantId: restaurant.id },
        { number: '11', capacity: 4, restaurantId: restaurant.id },
        { number: '12', capacity: 8, restaurantId: restaurant.id },
      ],
    })
  }
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
          type: 'restaurant' as const,
          restaurantId: user.restaurantId,
          restaurantName: user.restaurant.name,
        }
      },
    }),
    CredentialsProvider({
      id: 'supplier-credentials',
      name: 'Supplier',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        const supplierUser = await prisma.supplierUser.findFirst({
          where: { email: credentials.email },
          include: { supplier: true },
        })

        if (!supplierUser) {
          throw new Error('Invalid credentials')
        }

        if (supplierUser.supplier.status === 'SUSPENDED') {
          throw new Error('Account suspended')
        }

        const valid = await bcrypt.compare(
          credentials.password,
          supplierUser.passwordHash
        )
        if (!valid) {
          throw new Error('Invalid credentials')
        }

        await prisma.supplierUser.update({
          where: { id: supplierUser.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: supplierUser.id,
          email: supplierUser.email,
          name: supplierUser.name,
          role: supplierUser.role,
          type: 'supplier' as const,
          supplierId: supplierUser.supplierId,
          supplierName: supplierUser.supplier.name,
        }
      },
    }),
    CredentialsProvider({
      id: 'customer-credentials',
      name: 'Customer',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        const customer = await prisma.customer.findUnique({
          where: { email: credentials.email },
        })

        if (!customer) {
          throw new Error('Invalid credentials')
        }

        const valid = await bcrypt.compare(credentials.password, customer.password)
        if (!valid) {
          throw new Error('Invalid credentials')
        }

        return {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          role: 'customer',
          type: 'customer' as const,
        }
      },
    }),
    CredentialsProvider({
      id: 'waiter-credentials',
      name: 'Waiter',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        await ensureDemoWaiter()

        // Find employee with WAITER position by email
        const employee = await prisma.employee.findFirst({
          where: {
            email: credentials.email,
            position: 'WAITER',
            isActive: true,
          },
          include: { restaurant: true },
        })

        if (!employee) {
          throw new Error('Invalid credentials')
        }

        if (!employee.password) {
          throw new Error('This employee does not have login credentials')
        }

        const valid = await bcrypt.compare(credentials.password, employee.password)

        if (!valid) {
          throw new Error('Invalid credentials')
        }

        return {
          id: employee.id,
          email: employee.email || '',
          name: employee.name,
          role: 'WAITER',
          type: 'waiter' as const,
          restaurantId: employee.restaurantId,
          restaurantName: employee.restaurant.name,
          employeeId: employee.id,
        }
      },
    }),
    CredentialsProvider({
      id: 'superadmin-credentials',
      name: 'SuperAdmin',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = process.env.SUPER_ADMIN_EMAIL
        const password = process.env.SUPER_ADMIN_PASSWORD
        if (!email || !password || !credentials?.email || !credentials?.password) {
          return null
        }
        if (credentials.email !== email || credentials.password !== password) {
          return null
        }
        return {
          id: 'superadmin',
          email: credentials.email,
          name: 'Super Admin',
          role: 'superadmin',
          type: 'superadmin' as const,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.type = user.type
        token.restaurantId = user.restaurantId
        token.restaurantName = user.restaurantName
        token.supplierId = user.supplierId
        token.supplierName = user.supplierName
        token.employeeId = user.employeeId
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.type = (token.type as 'restaurant' | 'supplier' | 'customer' | 'superadmin' | 'waiter') ?? 'restaurant'
        session.user.restaurantId = token.restaurantId as string | undefined
        session.user.restaurantName = token.restaurantName as string | undefined
        session.user.supplierId = token.supplierId as string | undefined
        session.user.supplierName = token.supplierName as string | undefined
        session.user.employeeId = token.employeeId as string | undefined
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
