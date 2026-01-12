'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ShoppingCart, Plus, Minus, Trash2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Category, Ingredient, MenuItem, MenuItemIngredient } from '@prisma/client'

interface MenuItemWithDetails extends MenuItem {
  category: Category
  ingredients: (MenuItemIngredient & { ingredient: Ingredient })[]
}

interface OrderItem {
  menuItemId: string
  quantity: number
}

export default function NewOrderForm({
  menuItems,
  categories,
}: {
  menuItems: MenuItemWithDetails[]
  categories: Category[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [orderDetails, setOrderDetails] = useState({
    customerName: '',
    tableNumber: '',
    paymentMethod: 'CASH',
    notes: '',
  })
  const [cashReceived, setCashReceived] = useState('')

  // Filter menu items based on search and category
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [menuItems, searchTerm, selectedCategory])

  // Calculate order totals
  const orderSummary = useMemo(() => {
    let total = 0
    let totalCost = 0

    orderItems.forEach((orderItem) => {
      const menuItem = menuItems.find((m) => m.id === orderItem.menuItemId)
      if (menuItem) {
        const itemCost = menuItem.ingredients.reduce(
          (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
          0
        )
        total += menuItem.price * orderItem.quantity
        totalCost += itemCost * orderItem.quantity
      }
    })

    const profit = total - totalCost

    return { total, totalCost, profit }
  }, [orderItems, menuItems])

  const cashReceivedAmount = parseFloat(cashReceived) || 0
  const changeDue = Math.max(cashReceivedAmount - orderSummary.total, 0)

  // Check stock availability for order
  const stockWarnings = useMemo(() => {
    const warnings: string[] = []
    const ingredientUsage = new Map<string, number>()

    // Calculate total ingredient usage for the order
    orderItems.forEach((orderItem) => {
      const menuItem = menuItems.find((m) => m.id === orderItem.menuItemId)
      if (menuItem) {
        menuItem.ingredients.forEach((ing) => {
          const currentUsage = ingredientUsage.get(ing.ingredientId) || 0
          ingredientUsage.set(
            ing.ingredientId,
            currentUsage + ing.quantity * orderItem.quantity
          )
        })
      }
    })

    // Check if we have enough stock
    ingredientUsage.forEach((usage, ingredientId) => {
      const ingredient = menuItems
        .flatMap((m) => m.ingredients)
        .find((i) => i.ingredientId === ingredientId)?.ingredient

      if (ingredient && ingredient.stockQuantity < usage) {
        warnings.push(
          `Insufficient ${ingredient.name}: Need ${usage.toFixed(2)} ${ingredient.unit}, have ${ingredient.stockQuantity.toFixed(2)} ${ingredient.unit}`
        )
      }
    })

    return warnings
  }, [orderItems, menuItems])

  const addToOrder = (menuItemId: string) => {
    const existing = orderItems.find((item) => item.menuItemId === menuItemId)
    if (existing) {
      setOrderItems(
        orderItems.map((item) =>
          item.menuItemId === menuItemId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      )
    } else {
      setOrderItems([...orderItems, { menuItemId, quantity: 1 }])
    }
  }

  const updateQuantity = (menuItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setOrderItems(orderItems.filter((item) => item.menuItemId !== menuItemId))
    } else {
      setOrderItems(
        orderItems.map((item) =>
          item.menuItemId === menuItemId ? { ...item, quantity } : item
        )
      )
    }
  }

  const removeFromOrder = (menuItemId: string) => {
    setOrderItems(orderItems.filter((item) => item.menuItemId !== menuItemId))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (orderItems.length === 0) {
      alert('Please add at least one item to the order')
      return
    }

    if (cashReceivedAmount < orderSummary.total) {
      alert('Cash received must cover the total amount.')
      return
    }

    if (stockWarnings.length > 0) {
      alert('Cannot complete order due to insufficient stock:\n\n' + stockWarnings.join('\n'))
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: orderDetails.customerName || null,
          tableNumber: orderDetails.tableNumber || null,
          paymentMethod: orderDetails.paymentMethod,
          notes: orderDetails.notes || null,
          items: orderItems,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create order')
      }

      const order = await response.json()

      // Redirect to order details/receipt
      router.push(`/dashboard/orders/${order.id}`)
      router.refresh()
    } catch (error: any) {
      console.error('Error creating order:', error)
      alert(error.message || 'Failed to create order. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">New Order</h1>
          <p className="text-slate-500 mt-1">Create a new order and process payment</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Select Items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Search Menu</Label>
                    <Input
                      placeholder="Search items..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Filter by Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {filteredMenuItems.map((item) => {
                    const cost = item.ingredients.reduce(
                      (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
                      0
                    )
                    const isInOrder = orderItems.some((o) => o.menuItemId === item.id)

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addToOrder(item.id)}
                        className={`text-left p-4 rounded-lg border-2 transition-all ${
                          isInOrder
                            ? 'border-green-500 bg-green-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-14 w-20 overflow-hidden rounded-md bg-slate-100">
                            <img
                              src={
                                item.imageUrl ||
                                'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
                              }
                              alt={item.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-slate-900">{item.name}</div>
                            <div className="text-sm text-slate-500">{item.category.name}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-slate-900">
                              {formatCurrency(item.price)}
                            </div>
                            <div className="text-xs text-slate-500">
                              Cost: {formatCurrency(cost)}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {filteredMenuItems.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    No menu items found matching your search.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="customerName">Customer Name</Label>
                    <Input
                      id="customerName"
                      value={orderDetails.customerName}
                      onChange={(e) =>
                        setOrderDetails({ ...orderDetails, customerName: e.target.value })
                      }
                      placeholder="Optional"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tableNumber">Table Number</Label>
                    <Input
                      id="tableNumber"
                      value={orderDetails.tableNumber}
                      onChange={(e) =>
                        setOrderDetails({ ...orderDetails, tableNumber: e.target.value })
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <div className="h-10 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                    Cash (IQD)
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Order Notes</Label>
                  <Textarea
                    id="notes"
                    value={orderDetails.notes}
                    onChange={(e) =>
                      setOrderDetails({ ...orderDetails, notes: e.target.value })
                    }
                    placeholder="Special instructions..."
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {orderItems.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">
                      No items in order yet
                    </p>
                  ) : (
                    <>
                      {orderItems.map((orderItem) => {
                        const menuItem = menuItems.find((m) => m.id === orderItem.menuItemId)
                        if (!menuItem) return null

                        const itemTotal = menuItem.price * orderItem.quantity

                        return (
                          <div
                            key={orderItem.menuItemId}
                            className="flex items-start gap-2 pb-3 border-b border-slate-100"
                          >
                            <div className="flex-1">
                              <div className="font-medium text-sm">{menuItem.name}</div>
                              <div className="text-xs text-slate-500">
                                {formatCurrency(menuItem.price)} each
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    updateQuantity(orderItem.menuItemId, orderItem.quantity - 1)
                                  }
                                  className="h-6 w-6 p-0"
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-sm font-medium w-8 text-center">
                                  {orderItem.quantity}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    updateQuantity(orderItem.menuItemId, orderItem.quantity + 1)
                                  }
                                  className="h-6 w-6 p-0"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFromOrder(orderItem.menuItemId)}
                                  className="h-6 w-6 p-0 ml-auto text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="font-medium text-sm">{formatCurrency(itemTotal)}</div>
                          </div>
                        )
                      })}

                      <div className="space-y-2 pt-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Cost:</span>
                          <span className="font-mono">{formatCurrency(orderSummary.totalCost)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Profit:</span>
                          <span className="font-mono text-green-600">
                            {formatCurrency(orderSummary.profit)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t-2 border-slate-900">
                          <span className="font-bold text-lg">Total:</span>
                          <span className="font-bold text-2xl">
                            {formatCurrency(orderSummary.total)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {orderItems.length > 0 && (
                  <div className="mt-6 space-y-3 border-t border-slate-200 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="cashReceived">Cash Received (IQD)</Label>
                      <Input
                        id="cashReceived"
                        type="number"
                        min="0"
                        step="1"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        placeholder="Enter cash received"
                      />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Change Due:</span>
                      <span className="font-mono font-medium text-emerald-600">
                        {formatCurrency(changeDue)}
                      </span>
                    </div>
                  </div>
                )}

                {stockWarnings.length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <div className="flex gap-2 items-start">
                      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-red-800">
                        <strong>Stock Warning:</strong>
                        <ul className="mt-1 space-y-1">
                          {stockWarnings.map((warning, idx) => (
                            <li key={idx} className="text-xs">
                              {warning}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={
                  loading ||
                  orderItems.length === 0 ||
                  stockWarnings.length > 0 ||
                  cashReceivedAmount < orderSummary.total
                }
                size="lg"
                className="w-full"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                {loading ? 'Processing...' : 'Complete Order'}
              </Button>
              <Link href="/dashboard/orders" className="w-full">
                <Button type="button" variant="outline" disabled={loading} className="w-full">
                  Cancel
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
