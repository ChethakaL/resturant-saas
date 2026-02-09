import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Store, TrendingUp, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function SupplierDashboardPage() {
  const session = await getServerSession(authOptions)
  const supplierId = session?.user?.supplierId
  if (!supplierId) return null

  const [productCount, activeProductCount, restaurantCount, pendingRequestsCount] = await Promise.all([
    prisma.supplierProduct.count({ where: { supplierId } }),
    prisma.supplierProduct.count({ where: { supplierId, isActive: true } }),
    prisma.restaurantSupplierLink.count({ where: { supplierId } }),
    prisma.stockRequest.count({ where: { supplierId, status: 'PENDING' } }),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">Welcome back, {session?.user?.supplierName}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total products</CardTitle>
            <Package className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{productCount}</p>
            <p className="text-xs text-slate-500">{activeProductCount} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Restaurants using your products</CardTitle>
            <Store className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{restaurantCount}</p>
            <Link href="/supplier/restaurants">
              <Button variant="link" className="px-0 text-amber-600">View list</Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending stock requests</CardTitle>
            <ShoppingCart className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingRequestsCount}</p>
            <Link href="/supplier/stock-requests">
              <Button variant="link" className="px-0 text-amber-600">View requests</Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Analytics</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">Recipe-based usage & trends</p>
            <Link href="/supplier/analytics">
              <Button variant="link" className="px-0 text-amber-600">Open analytics</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
          <CardDescription>Manage your catalog and view restaurant usage</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Link href="/supplier/products">
            <Button>My Products</Button>
          </Link>
          <Link href="/supplier/products?add=1">
            <Button variant="outline">Add product</Button>
          </Link>
          <Link href="/supplier/stock-requests">
            <Button variant="outline">Stock requests</Button>
          </Link>
          <Link href="/supplier/restaurants">
            <Button variant="outline">Restaurants using my products</Button>
          </Link>
          <Link href="/supplier/map">
            <Button variant="outline">View map</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
