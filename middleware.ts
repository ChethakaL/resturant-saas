import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  const isLoggedIn = Boolean(token)
  const { pathname } = request.nextUrl

  if (!isLoggedIn && (pathname.startsWith('/dashboard') || pathname.startsWith('/menu') || pathname === '/settings' || pathname.startsWith('/billing') || pathname.startsWith('/orders') || pathname.startsWith('/tables') || pathname.startsWith('/profit-loss'))) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (!isLoggedIn && pathname.startsWith('/waiter/dashboard')) {
    const loginUrl = new URL('/waiter/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/menu/:path*', '/menu', '/settings/:path*', '/billing/:path*', '/billing', '/orders/:path*', '/tables/:path*', '/profit-loss/:path*', '/waiter/dashboard/:path*'],
}
