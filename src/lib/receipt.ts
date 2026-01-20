import { formatCurrency } from './utils'

export interface ReceiptItem {
  name: string
  quantity: number
  price: number
}

export interface ReceiptOrder {
  id: string
  orderNumber: string
  total: number
  paymentMethod: string
  status?: string
  tableNumber?: number | null
  customerName?: string | null
  notes?: string | null
  timestamp?: string | null
  items: ReceiptItem[]
}

export function buildReceiptText(order: ReceiptOrder): string {
  const lines: string[] = []
  lines.push(`Order ${order.orderNumber}`)
  if (order.timestamp) {
    const date = new Date(order.timestamp)
    lines.push(`Date: ${date.toLocaleString('en-IQ')}`)
  }
  if (order.tableNumber !== undefined && order.tableNumber !== null) {
    lines.push(`Table: ${order.tableNumber}`)
  }
  if (order.customerName) {
    lines.push(`Customer: ${order.customerName}`)
  }
  if (order.status) {
    lines.push(`Status: ${order.status}`)
  }

  lines.push('Items:')
  if (order.items.length === 0) {
    lines.push('  - No items added')
  } else {
    order.items.forEach((item) => {
      const line = `  • ${item.name} × ${item.quantity} @ ${formatCurrency(item.price)} = ${formatCurrency(
        item.price * item.quantity
      )}`
      lines.push(line)
    })
  }

  lines.push(`Total: ${formatCurrency(order.total)}`)
  lines.push(`Payment: ${order.paymentMethod}`)

  if (order.notes) {
    lines.push(`Notes: ${order.notes}`)
  }

  lines.push('')
  lines.push('Thank you for dining with us!')

  return lines.join('\n')
}

export function buildReceiptHtml(order: ReceiptOrder): string {
  const itemsRows =
    order.items.length > 0
      ? order.items
          .map(
            (item) => `
            <tr>
              <td>${item.name}</td>
              <td>${item.quantity}</td>
              <td>${formatCurrency(item.price)}</td>
              <td>${formatCurrency(item.price * item.quantity)}</td>
            </tr>
          `
          )
          .join('')
      : `
          <tr>
            <td colspan="4" style="text-align:center; padding: 12px;">No items added</td>
          </tr>
        `

  const dateLine = order.timestamp
    ? `<div><strong>Date:</strong> ${new Date(order.timestamp).toLocaleString('en-IQ')}</div>`
    : ''

  const tableLine =
    order.tableNumber !== undefined && order.tableNumber !== null
      ? `<div><strong>Table:</strong> ${order.tableNumber}</div>`
      : ''

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt ${order.orderNumber}</title>
        <style>
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 24px;
            color: #111827;
            background: #f8fafc;
          }
          h1 {
            margin-bottom: 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 24px;
          }
          th, td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
          }
          .totals {
            margin-top: 24px;
            font-weight: 700;
            font-size: 1.1rem;
          }
          .meta {
            margin-top: 4px;
            color: #475467;
            font-size: 0.95rem;
          }
        </style>
      </head>
      <body>
        <h1>Receipt</h1>
        <div class="meta">
          <div><strong>Order:</strong> ${order.orderNumber}</div>
          ${tableLine}
          ${order.customerName ? `<div><strong>Customer:</strong> ${order.customerName}</div>` : ''}
          ${dateLine}
          <div><strong>Payment:</strong> ${order.paymentMethod}</div>
          ${order.status ? `<div><strong>Status:</strong> ${order.status}</div>` : ''}
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
        <div class="totals">Total: ${formatCurrency(order.total)}</div>
        ${order.notes ? `<p class="meta"><strong>Notes:</strong> ${order.notes}</p>` : ''}
        <p class="meta">Thank you for dining with us!</p>
      </body>
    </html>
  `
}
