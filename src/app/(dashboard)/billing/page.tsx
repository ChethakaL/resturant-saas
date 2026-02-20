import { redirect } from 'next/navigation'

/** Redirect old /billing URLs to Settings > Subscription */
export default function BillingPage() {
  redirect('/settings?tab=subscription')
}
