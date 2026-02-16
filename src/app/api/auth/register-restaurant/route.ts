import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      restaurantName,
      slug: slugInput,
      restaurantEmail,
      restaurantPhone,
      restaurantAddress,
      userName,
      userEmail,
      password,
    } = body as {
      restaurantName?: string
      slug?: string
      restaurantEmail?: string
      restaurantPhone?: string
      restaurantAddress?: string
      userName?: string
      userEmail?: string
      password?: string
    }

    if (!restaurantName?.trim()) {
      return NextResponse.json(
        { error: 'Restaurant name is required' },
        { status: 400 }
      )
    }
    if (!userName?.trim() || !userEmail?.trim() || !password) {
      return NextResponse.json(
        { error: 'Owner name, email, and password are required' },
        { status: 400 }
      )
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const slug = (slugInput?.trim() || slugify(restaurantName)).toLowerCase()
    if (!slug) {
      return NextResponse.json(
        { error: 'Could not generate a valid slug from restaurant name' },
        { status: 400 }
      )
    }

    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { slug },
    })
    if (existingRestaurant) {
      return NextResponse.json(
        { error: 'A restaurant with this name/slug already exists. Try a different name or slug.' },
        { status: 409 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: userEmail.trim().toLowerCase() },
    })
    if (existingUser) {
      return NextResponse.json(
        { error: 'This email is already registered as a restaurant user.' },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantName.trim(),
        slug,
        email: restaurantEmail?.trim() || userEmail.trim(),
        phone: restaurantPhone?.trim() || null,
        address: restaurantAddress?.trim() || null,
      },
    })

    await prisma.user.create({
      data: {
        email: userEmail.trim().toLowerCase(),
        password: hashedPassword,
        name: userName.trim(),
        role: 'OWNER',
        restaurantId: restaurant.id,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Restaurant registered. You can sign in now.',
      slug: restaurant.slug,
    })
  } catch (error) {
    console.error('Register restaurant error:', error)
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    )
  }
}
