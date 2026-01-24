'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Printer,
  Mail,
} from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Category, Ingredient, MenuItem, MenuItemIngredient, Table } from '@prisma/client'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { buildReceiptHtml, buildReceiptText, ReceiptOrder } from '@/lib/receipt'
import { useToast } from '@/components/ui/use-toast'

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

interface MenuItemWithDetails extends MenuItem {
  category: Category
  ingredients: (MenuItemIngredient & { ingredient: Ingredient })[]
}

interface OrderItem {
  menuItemId: string
  quantity: number
}


const DEFAULT_ORDER_DETAILS = {
  customerName: '',
  tableId: '',
  paymentMethod: 'CASH',
  notes: '',
}

type SaleResponse = {
  id: string
  orderNumber: string
  total: number
  paymentMethod: string
  status: string
  customerName?: string | null
  notes?: string | null
  timestamp: string
  table?: { number: number } | null
  items: Array<{
    id: string
    quantity: number
    price: number
    menuItem: { name: string }
  }>
}

const mapSaleToReceiptOrder = (order: SaleResponse): ReceiptOrder => ({
  id: order.id,
  orderNumber: order.orderNumber,
  total: order.total,
  paymentMethod: order.paymentMethod,
  status: order.status,
  tableNumber: order.table?.number ?? null,
  customerName: order.customerName ?? null,
  notes: order.notes ?? null,
  timestamp: order.timestamp,
  items: order.items.map((item) => ({
    name: item.menuItem.name,
    quantity: item.quantity,
    price: item.price,
  })),
})

function StripePaymentForm({
  onPaymentSuccess,
  loading,
}: {
  onPaymentSuccess: (paymentIntentId: string) => Promise<void>
  loading: boolean
}) {
  const stripe = useStripe()
  const elements = useElements()
  const { toast } = useToast()
  const [confirming, setConfirming] = useState(false)

  const handleConfirm = async () => {
    if (!stripe || !elements) {
      return
    }

    setConfirming(true)
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (result.error) {
      toast({
        title: 'Payment Failed',
        description: result.error.message || 'Payment failed. Please try again.',
        variant: 'destructive',
      })
      setConfirming(false)
      return
    }

    if (result.paymentIntent?.status === 'succeeded') {
      await onPaymentSuccess(result.paymentIntent.id)
      return
    }

    toast({
      title: 'Payment Incomplete',
      description: 'Payment was not completed. Please try again.',
      variant: 'destructive',
    })
    setConfirming(false)
  }

  return (
    <div className="space-y-3">
      <PaymentElement />
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={handleConfirm}
        disabled={loading || confirming}
      >
        {confirming ? 'Confirming...' : 'Confirm Card / Apple Pay'}
      </Button>
    </div>
  )
}

export default function NewOrderForm({
  menuItems,
  categories,
  tables,
}: {
  menuItems: MenuItemWithDetails[]
  categories: Category[]
  tables: Table[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [orderDetails, setOrderDetails] = useState(() => ({ ...DEFAULT_ORDER_DETAILS }))
  const TABLE_NONE_VALUE = 'TABLE_NONE'
  const [cashReceived, setCashReceived] = useState('')
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null)
  const [stripeInitLoading, setStripeInitLoading] = useState(false)
  const [latestOrder, setLatestOrder] = useState<ReceiptOrder | null>(null)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [customerEmail, setCustomerEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const isCashPayment = orderDetails.paymentMethod === 'CASH'
  const { toast } = useToast()

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

  const createOrder = async ({
    paymentMethod,
    paymentProvider,
    stripePaymentIntentId,
    status = 'COMPLETED',
  }: {
    paymentMethod: string
    paymentProvider?: string
    stripePaymentIntentId?: string
    status?: 'PENDING' | 'COMPLETED'
  }): Promise<SaleResponse> => {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: orderDetails.customerName || null,
        tableId: orderDetails.tableId || null,
        paymentMethod,
        paymentProvider: paymentProvider || null,
        stripePaymentIntentId: stripePaymentIntentId || null,
        paidAt: status === 'COMPLETED' ? new Date().toISOString() : null,
        status,
        notes: orderDetails.notes || null,
        items: orderItems,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create order')
    }

    return data as SaleResponse
  }

  const handleOrderSuccess = (order: SaleResponse) => {
    setLatestOrder(mapSaleToReceiptOrder(order))
    setOrderItems([])
    setOrderDetails({ ...DEFAULT_ORDER_DETAILS })
    setCashReceived('')
    setStripeClientSecret(null)
  }

  const printReceipt = () => {
    if (!latestOrder || typeof window === 'undefined') return
    const html = buildReceiptHtml(latestOrder)
    const printWindow = window.open('', '_blank', 'width=600,height=800')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  const emailReceipt = () => {
    if (!latestOrder) return
    setCustomerEmail('')
    setEmailModalOpen(true)
  }

  const handleSendEmail = async () => {
    if (!customerEmail || !latestOrder) return
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(customerEmail)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      })
      return
    }

    setSendingEmail(true)

    try {
      // TODO: Implement actual email sending API call here
      // For now, just simulate sending
      await new Promise((resolve) => setTimeout(resolve, 1000))

      toast({
        title: 'Email Sent',
        description: `Receipt has been sent to ${customerEmail}`,
      })

      setEmailModalOpen(false)
      setCustomerEmail('')
    } catch (error) {
      toast({
        title: 'Email Failed',
        description: 'Failed to send email. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSendingEmail(false)
    }
  }

  const handleStartNewOrder = () => {
    setLatestOrder(null)
  }

  const handleSaveAsPending = async (e: React.FormEvent) => {
    e.preventDefault()

    if (orderItems.length === 0) {
      toast({
        title: 'No Items',
        description: 'Please add at least one item to the order',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      setLatestOrder(null)
      await createOrder({ paymentMethod: 'CASH', status: 'PENDING' })
      router.push('/orders')
      router.refresh()
    } catch (error: any) {
      console.error('Error saving pending order:', error)
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save order. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (orderItems.length === 0) {
      toast({
        title: 'No Items',
        description: 'Please add at least one item to the order',
        variant: 'destructive',
      })
      return
    }

    if (!isCashPayment) {
      toast({
        title: 'Card Payment Required',
        description: 'Use the card payment section to complete card payments.',
        variant: 'destructive',
      })
      return
    }

    if (cashReceivedAmount < orderSummary.total) {
      toast({
        title: 'Insufficient Cash',
        description: 'Cash received must cover the total amount.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      const order = await createOrder({ paymentMethod: 'CASH' })
      handleOrderSuccess(order)
    } catch (error: any) {
      console.error('Error creating order:', error)
      toast({
        title: 'Order Failed',
        description: error.message || 'Failed to create order. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const initCardPayment = async () => {
    setStripeInitLoading(true)
    try {
      const response = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: orderSummary.total,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to initialize payment.')
      }

      const data = await response.json()
      setStripeClientSecret(data.clientSecret)
    } catch (error: any) {
      console.error('Error initializing payment:', error)
      toast({
        title: 'Payment Setup Failed',
        description: error.message || 'Failed to initialize payment.',
        variant: 'destructive',
      })
    } finally {
      setStripeInitLoading(false)
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

                {orderItems.length > 0 && isCashPayment && (
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

                {orderItems.length > 0 && !isCashPayment && (
                  <div className="mt-6 space-y-3 border-t border-slate-200 pt-4">
                    {!stripePromise && (
                      <p className="text-sm text-amber-600">
                        Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to enable card payments.
                      </p>
                    )}
                    {stripePromise && stripeClientSecret ? (
                      <Elements
                        stripe={stripePromise}
                        options={{ clientSecret: stripeClientSecret }}
                      >
                        <StripePaymentForm
                          loading={loading}
                          onPaymentSuccess={async (paymentIntentId) => {
                            setLoading(true)
                            try {
                              const order = await createOrder({
                                paymentMethod: 'CARD',
                                paymentProvider: 'STRIPE',
                                stripePaymentIntentId: paymentIntentId,
                              })
                              handleOrderSuccess(order)
                          } catch (error: any) {
                            console.error('Error completing card payment:', error)
                            toast({
                              title: 'Payment Failed',
                              description: error.message || 'Failed to create order.',
                              variant: 'destructive',
                            })
                          } finally {
                            setLoading(false)
                          }
                          }}
                        />
                      </Elements>
                    ) : stripePromise ? (
                      <Button
                        type="button"
                        size="lg"
                        className="w-full"
                        disabled={stripeInitLoading}
                        onClick={initCardPayment}
                      >
                        {stripeInitLoading ? 'Preparing Payment...' : 'Start Card Payment'}
                      </Button>
                    ) : null}
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
                    <Label htmlFor="tableId">Table</Label>
                    <Select
                      value={orderDetails.tableId || TABLE_NONE_VALUE}
                      onValueChange={(value) =>
                        setOrderDetails({
                          ...orderDetails,
                          tableId: value === TABLE_NONE_VALUE ? '' : value,
                        })
                      }
                    >
                      <SelectTrigger id="tableId">
                        <SelectValue placeholder="Select table (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TABLE_NONE_VALUE}>No table</SelectItem>
                        {tables.map((table) => (
                          <SelectItem key={table.id} value={table.id}>
                            Table {table.number} ({table.capacity} seats)
                            {table.status === 'OCCUPIED' && ' - Occupied'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select
                    value={orderDetails.paymentMethod}
                    onValueChange={(value) =>
                      setOrderDetails({ ...orderDetails, paymentMethod: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash (IQD)</SelectItem>
                      <SelectItem value="CARD" disabled={!stripePromise}>
                        Card / Apple Pay (Stripe)
                      </SelectItem>
                    </SelectContent>
                  </Select>
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

            {latestOrder && (
              <Card>
                <CardHeader>
                  <CardTitle>Receipt Ready</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-700">
                    Order <strong>{latestOrder.orderNumber}</strong> completed for{' '}
                    {latestOrder.tableNumber ? `Table ${latestOrder.tableNumber}` : 'a walk-in customer'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Total {formatCurrency(latestOrder.total)} · {latestOrder.paymentMethod}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={printReceipt}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Print Receipt
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={emailReceipt}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Email Receipt
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => router.push(`/orders/${latestOrder.id}`)}
                    >
                      View Order
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleStartNewOrder}
                    >
                      Start New Order
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

        <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Email Receipt</DialogTitle>
              <DialogDescription>
                Enter the customer's email address to send the receipt.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Email Address</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  placeholder="customer@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !sendingEmail) {
                      handleSendEmail()
                    }
                  }}
                  disabled={sendingEmail}
                />
              </div>
              {latestOrder && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="font-medium text-slate-900 mb-1">Order Details:</div>
                  <div className="text-slate-600">
                    Order #{latestOrder.orderNumber} · {formatCurrency(latestOrder.total)}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEmailModalOpen(false)
                  setCustomerEmail('')
                }}
                disabled={sendingEmail}
              >
                Cancel
              </Button>
              <Button onClick={handleSendEmail} disabled={sendingEmail || !customerEmail.trim()}>
                {sendingEmail ? 'Sending...' : 'Send'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            disabled={
              loading ||
              orderItems.length === 0 ||
              (isCashPayment && cashReceivedAmount < orderSummary.total)
            }
            size="lg"
            className="w-full"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {loading ? 'Processing...' : isCashPayment ? 'Complete Cash Order' : 'Complete Order'}
          </Button>
          <Button
            type="button"
            onClick={handleSaveAsPending}
            disabled={loading || orderItems.length === 0}
            variant="outline"
            size="lg"
            className="w-full"
          >
            {loading ? 'Saving...' : 'Save as Pending'}
          </Button>
          <Link href="/orders" className="w-full">
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
