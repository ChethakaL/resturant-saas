import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string
      restaurantId: string
      restaurantName: string
    }
  }

  interface User {
    id: string
    email: string
    name: string
    role: string
    restaurantId: string
    restaurantName: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    restaurantId: string
    restaurantName: string
  }
}
