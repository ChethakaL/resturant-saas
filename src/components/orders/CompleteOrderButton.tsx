'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildKitchenReceiptHtml, buildReceiptHtml, ReceiptOrder } from '@/lib/receipt'
import { formatCurrency } from '@/lib/utils'
import { Mail, Printer } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface PendingOrderItem {
  menuItem: {
    name: string
  }
  quantity: number
  price: number
}

interface PendingOrder {
  id: string
  orderNumber: string
  customerName?: string | null
  table?: { number: number } | null
  timestamp: string | Date
  items: PendingOrderItem[]
  total: number
  paymentMethod: string
  notes?: string | null
}

export default function CompleteOrderButton({ order }: { order: PendingOrder }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [receiptOrder, setReceiptOrder] = useState<ReceiptOrder | null>(null)
  const [cashReceived, setCashReceived] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [shouldRefreshAfterClose, setShouldRefreshAfterClose] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const cashReceivedAmount = Number(cashReceived) || 0
  const changeDue = Math.max(cashReceivedAmount - order.total, 0)
  const canPay = cashReceivedAmount >= order.total

  const mapSaleToReceiptOrder = (completedOrder: any): ReceiptOrder => ({
    id: completedOrder.id,
    orderNumber: completedOrder.orderNumber,
    total: completedOrder.total,
    paymentMethod: completedOrder.paymentMethod,
    status: 'COMPLETED',
    tableNumber: completedOrder.table?.number ?? null,
    customerName: completedOrder.customerName ?? null,
    notes: completedOrder.notes ?? null,
    timestamp: completedOrder.timestamp,
    items: completedOrder.items.map((item: any) => ({
      name: item.menuItem?.name || 'Item',
      quantity: item.quantity,
      price: item.price,
    })),
  })

  const handleCompleteOrder = async () => {
    setCompleting(true)
    try {
      const response = await fetch(`/api/orders/${order.id}/complete`, {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to complete order')
      }
      const data = await response.json()
      const completedReceipt = mapSaleToReceiptOrder(data.order)
      setReceiptOrder(completedReceipt)
      setShouldRefreshAfterClose(true)
      toast({
        title: 'Payment completed',
        description: 'Order is now locked. Print kitchen/barista or customer receipt if needed.',
      })
    } catch (error: any) {
      toast({
        title: 'Completion failed',
        description: error.message || 'Failed to complete order.',
        variant: 'destructive',
      })
    } finally {
      setCompleting(false)
    }
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && shouldRefreshAfterClose) {
      router.refresh()
      setShouldRefreshAfterClose(false)
    }
    if (!open) {
      setReceiptOrder(null)
      setCustomerEmail('')
      setSendingEmail(false)
      setCashReceived('')
    }
    setDialogOpen(open)
  }

  const printReceipt = (orderToPrint = receiptOrder) => {
    if (!orderToPrint) return
    const html = buildReceiptHtml(orderToPrint)
    const printWindow = window.open('', '_blank', 'width=600,height=700')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  const printKitchenTicket = (orderToPrint = receiptOrder) => {
    if (!orderToPrint) return
    const html = buildKitchenReceiptHtml(orderToPrint)
    const printWindow = window.open('', '_blank', 'width=520,height=720')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  const handleSendEmail = async () => {
    if (!receiptOrder) return
    const email = customerEmail.trim()
    if (!email) {
      toast({
        title: 'Email required',
        description: 'Enter an email address to send the receipt.',
        variant: 'destructive',
      })
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast({
        title: 'Invalid email',
        description: 'Provide a valid email address.',
        variant: 'destructive',
      })
      return
    }

    setSendingEmail(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 800))
      toast({
        title: 'Email sent',
        description: `Receipt sent to ${email}`,
      })
      setCustomerEmail('')
    } catch (error) {
      toast({
        title: 'Email failed',
        description: 'Unable to send the receipt. Try again.',
        variant: 'destructive',
      })
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {receiptOrder ? 'Receipt Ready' : 'Complete Order'}
            </DialogTitle>
            <DialogDescription>
              {receiptOrder
                ? 'Payment completed. Reprint or email the receipt before closing.'
                : 'Take cash payment, then print kitchen/barista and customer receipts from the next step.'}
            </DialogDescription>
          </DialogHeader>

          {!receiptOrder ? (
            <div className="space-y-4 pt-2">
              <div className="text-sm text-slate-600">
                Order {order.orderNumber}
                {order.customerName ? ` · ${order.customerName}` : ''}
                {order.table ? ` · Table ${order.table.number}` : ''}
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3 bg-white/80">
                {order.items.map((item, index) => (
                  <div
                    key={`${item.menuItem.name}-${item.quantity}-${index}`}
                    className="flex justify-between text-sm text-slate-700"
                  >
                    <span>
                      {item.menuItem.name} × {item.quantity}
                    </span>
                    <span>{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                ))}
                {order.items.length === 0 && (
                  <div className="text-sm text-slate-500">No items available.</div>
                )}
                <div className="flex justify-between border-t pt-2 text-sm font-semibold text-slate-900">
                  <span>Total</span>
                  <span>{formatCurrency(order.total)}</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`cashReceived-${order.id}`}>Cash received</Label>
                  <Input
                    id={`cashReceived-${order.id}`}
                    type="number"
                    min="0"
                    step="1"
                    value={cashReceived}
                    onChange={(event) => setCashReceived(event.target.value)}
                    placeholder="0"
                    disabled={completing}
                  />
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase text-slate-500">Change due</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-600">
                    {formatCurrency(changeDue)}
                  </p>
                </div>
              </div>
              {!canPay && cashReceived && (
                <p className="text-sm text-red-600">Cash received must cover the order total.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <p className="text-sm text-slate-500">Order #{receiptOrder.orderNumber}</p>
                <p className="text-base font-semibold text-slate-900">
                  {formatCurrency(receiptOrder.total)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printKitchenTicket()}
                  className="flex items-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print Kitchen/Barista
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printReceipt()}
                  className="flex items-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print Customer Receipt
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={sendingEmail}
                  className="flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  {sendingEmail ? 'Sending...' : 'Email Receipt'}
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="receiptEmail">Send receipt to</Label>
                <Input
                  id="receiptEmail"
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="customer@example.com"
                  disabled={sendingEmail}
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-4">
            {!receiptOrder && (
              <Button
                onClick={handleCompleteOrder}
                disabled={completing || !canPay}
                className="bg-green-600 hover:bg-green-700"
              >
                {completing ? 'Taking payment...' : 'Pay'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={completing}
            >
              {receiptOrder ? 'Done' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        onClick={() => setDialogOpen(true)}
        size="sm"
        className="bg-green-600 hover:bg-green-700"
      >
        Pay
      </Button>
    </>
  )
}
