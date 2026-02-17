import 'next-auth'

export type AuthUserType = 'restaurant' | 'supplier' | 'customer' | 'superadmin' | 'waiter'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string
      type: AuthUserType
      restaurantId?: string
      restaurantName?: string
      supplierId?: string
      supplierName?: string
      employeeId?: string
    }
  }

  interface User {
    id: string
    email: string
    name: string
    role: string
    type: AuthUserType
    restaurantId?: string
    restaurantName?: string
    supplierId?: string
    supplierName?: string
    employeeId?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    type: AuthUserType
    restaurantId?: string
    restaurantName?: string
    supplierId?: string
    supplierName?: string
    employeeId?: string
  }
}
