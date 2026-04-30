import twilio from 'twilio'
import { normalizeTwilioWhatsAppAddress } from '@/lib/restaurant-whatsapp'

type OrderLine = {
  name: string
  quantity: number
  price: number
}

type SendRestaurantOrderWhatsAppInput = {
  restaurantName: string
  restaurantPhone?: string | null
  orderNumber: string
  tableNumber?: string | null
  customerName?: string | null
  total: number
  items: OrderLine[]
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString('en-US')} IQD`
}

function buildOrderMessage(input: SendRestaurantOrderWhatsAppInput) {
  const tableLine = input.tableNumber ? `Table ${input.tableNumber}` : 'No table selected'
  const itemLines = input.items.map((item) => {
    const lineTotal = item.price * item.quantity
    return `- ${item.quantity}x ${item.name} (${formatMoney(lineTotal)})`
  })

  return [
    `New order for ${input.restaurantName}`,
    `Order: ${input.orderNumber}`,
    tableLine,
    input.customerName ? `Customer: ${input.customerName}` : null,
    '',
    'Items:',
    ...itemLines,
    '',
    `Total: ${formatMoney(input.total)}`,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

export async function sendRestaurantOrderWhatsApp(input: SendRestaurantOrderWhatsAppInput) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = normalizeTwilioWhatsAppAddress(process.env.TWILIO_PHONE_NUMBER)
  const to = normalizeTwilioWhatsAppAddress(input.restaurantPhone)

  if (!accountSid || !authToken || !from || !to) {
    console.warn('[whatsapp-orders] Skipping WhatsApp notification: missing Twilio config or restaurant phone')
    return { sent: false, skipped: true }
  }

  const client = twilio(accountSid, authToken)

  await client.messages.create({
    from,
    to,
    body: buildOrderMessage(input),
  })

  return { sent: true, skipped: false }
}
