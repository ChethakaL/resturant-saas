'use client'

import { useState } from 'react'
import { Check, Printer } from 'lucide-react'
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
import { buildKitchenReceiptHtml, buildReceiptHtml, type ReceiptOrder } from '@/lib/receipt'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'

type PayOrderItem = {
  menuItem: { name: string }
  quantity: number
  price: number
}

export type WaiterPayOrder = {
  id: string
  orderNumber: string
  total: number
  status: string
  customerName?: string | null
  notes?: string | null
  timestamp: string | Date
  table?: { number: string | number } | null
  items: PayOrderItem[]
}

type WaiterPayOrderButtonProps = {
  order: Pick<WaiterPayOrder, 'id' | 'orderNumber' | 'total' | 'status'>
  tableNumber?: string | number | null
  /** Load full order (items, notes) when the dialog opens. */
  loadOrder?: () => Promise<WaiterPayOrder | null>
  onCompleted?: (order: WaiterPayOrder) => void
  className?: string
  size?: 'default' | 'sm' | 'lg'
  variant?: 'default' | 'outline' | 'emerald'
  label?: string
  disabled?: boolean
}

function mapToReceiptOrder(order: WaiterPayOrder): ReceiptOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    total: order.total,
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    tableNumber: order.table?.number != null ? Number(order.table.number) : null,
    customerName: order.customerName ?? null,
    notes: order.notes ?? null,
    timestamp: order.timestamp,
    items: order.items.map((item) => ({
      name: item.menuItem.name,
      quantity: item.quantity,
      price: item.price,
    })),
  }
}

function printHtml(html: string) {
  if (typeof window === 'undefined') return
  const printWindow = window.open('', '_blank', 'width=600,height=700')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 300)
}

export function WaiterPayOrderButton({
  order,
  tableNumber,
  loadOrder,
  onCompleted,
  className,
  size = 'default',
  variant = 'emerald',
  label = 'Pay & Print Receipt',
  disabled = false,
}: WaiterPayOrderButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [orderDetails, setOrderDetails] = useState<WaiterPayOrder | null>(null)
  const [receiptOrder, setReceiptOrder] = useState<ReceiptOrder | null>(null)
  const [cashReceived, setCashReceived] = useState('')
  const { toast } = useToast()

  const isPayable = ['PENDING', 'PREPARING', 'READY'].includes(order.status)
  const activeOrder = orderDetails ?? null
  const orderTotal = activeOrder?.total ?? order.total
  const cashInput = cashReceived.trim()
  /** Empty = exact payment (assumes customer paid the total). */
  const effectiveCashReceived = cashInput === '' ? orderTotal : Number(cashReceived) || 0
  const changeDue = Math.max(effectiveCashReceived - orderTotal, 0)
  const canPay = cashInput === '' || effectiveCashReceived >= orderTotal
  const cashTooLow = cashInput !== '' && effectiveCashReceived < orderTotal

  const resetDialog = () => {
    setReceiptOrder(null)
    setCashReceived('')
    setOrderDetails(null)
    setLoadingOrder(false)
  }

  const handleDialogOpenChange = async (open: boolean) => {
    if (!open) {
      resetDialog()
      setDialogOpen(false)
      return
    }

    setDialogOpen(true)
    if (!loadOrder) return

    setLoadingOrder(true)
    try {
      const loaded = await loadOrder()
      if (loaded) setOrderDetails(loaded)
    } catch {
      toast({
        title: 'Could not load order',
        description: 'Try again or open the order details.',
        variant: 'destructive',
      })
      setDialogOpen(false)
      resetDialog()
    } finally {
      setLoadingOrder(false)
    }
  }

  const handleCompleteOrder = async () => {
    setCompleting(true)
    try {
      const response = await fetch(`/api/orders/${order.id}/complete`, { method: 'POST' })
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || 'Failed to complete order')
      }

      const data = await response.json()
      const completed = data.order as WaiterPayOrder
      const receipt = mapToReceiptOrder({
        ...completed,
        items: completed.items?.length ? completed.items : activeOrder?.items ?? [],
      })

      setReceiptOrder(receipt)
      printHtml(buildReceiptHtml(receipt))

      toast({
        title: 'Payment completed',
        description: tableNumber
          ? `Table ${tableNumber} will be freed when all orders are paid.`
          : 'Receipt sent to printer.',
      })

      onCompleted?.({
        ...completed,
        items: completed.items?.length ? completed.items : activeOrder?.items ?? [],
      })
    } catch (error) {
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Failed to complete order.',
        variant: 'destructive',
      })
    } finally {
      setCompleting(false)
    }
  }

  if (!isPayable) return null

  const buttonClass =
    variant === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
      : variant === 'outline'
        ? ''
        : ''

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{receiptOrder ? 'Receipt Ready' : 'Take Payment'}</DialogTitle>
            <DialogDescription>
              {receiptOrder
                ? 'Payment recorded. Reprint receipts if needed, then close.'
                : 'Cash received is optional — leave blank for exact payment, or enter amount for change.'}
            </DialogDescription>
          </DialogHeader>

          {!receiptOrder ? (
            <div className="space-y-4 pt-2">
              <div className="text-sm text-slate-600">
                Order {order.orderNumber}
                {tableNumber != null ? ` · Table ${tableNumber}` : ''}
              </div>

              {loadingOrder ? (
                <p className="text-sm text-slate-500">Loading order items…</p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3 bg-white/80">
                  {(activeOrder?.items ?? []).map((item, index) => (
                    <div
                      key={`${item.menuItem.name}-${index}`}
                      className="flex justify-between text-sm text-slate-700"
                    >
                      <span>
                        {item.menuItem.name} × {item.quantity}
                      </span>
                      <span>{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  {(activeOrder?.items ?? []).length === 0 && (
                    <div className="text-sm text-slate-500">Total: {formatCurrency(orderTotal)}</div>
                  )}
                  <div className="flex justify-between border-t pt-2 text-sm font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{formatCurrency(orderTotal)}</span>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`waiter-cash-${order.id}`}>
                    Cash received <span className="font-normal text-slate-500">(optional)</span>
                  </Label>
                  <Input
                    id={`waiter-cash-${order.id}`}
                    type="number"
                    min="0"
                    step="1"
                    value={cashReceived}
                    onChange={(event) => setCashReceived(event.target.value)}
                    placeholder={`Exact: ${formatCurrency(orderTotal)}`}
                    disabled={completing || loadingOrder}
                  />
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase text-slate-500">Change due</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-600">{formatCurrency(changeDue)}</p>
                  {cashInput === '' && (
                    <p className="mt-1 text-xs text-slate-500">No cash entered — assumes exact payment.</p>
                  )}
                </div>
              </div>
              {cashTooLow && (
                <p className="text-sm text-red-600">Cash received must cover the order total.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <p className="text-sm text-slate-500">Order #{receiptOrder.orderNumber}</p>
                <p className="text-base font-semibold text-slate-900">{formatCurrency(receiptOrder.total)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printHtml(buildKitchenReceiptHtml(receiptOrder))}
                  className="flex items-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print Kitchen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printHtml(buildReceiptHtml(receiptOrder))}
                  className="flex items-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print Receipt
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="pt-4">
            {!receiptOrder ? (
              <Button
                onClick={handleCompleteOrder}
                disabled={completing || loadingOrder || !canPay}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {completing ? 'Taking payment…' : 'Pay & Print'}
              </Button>
            ) : null}
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
        type="button"
        size={size}
        className={`${buttonClass} ${className ?? ''}`.trim()}
        disabled={disabled}
        onClick={() => void handleDialogOpenChange(true)}
      >
        <Check className="mr-2 h-4 w-4" />
        {label}
      </Button>
    </>
  )
}
