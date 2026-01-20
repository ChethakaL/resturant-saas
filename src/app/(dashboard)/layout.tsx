import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        restaurantName={session.user.restaurantName}
        userName={session.user.name}
        userRole={session.user.role}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-slate-50 min-h-screen">
        <div className="p-8">
          {children}
        </div>
      </div>

      {/* AI Chatbot Widget */}
      <ChatbotWidget />
    </div>
  )
}
