import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { ManagementLanguageProvider } from '@/components/layout/ManagementLanguageProvider'
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

  if (session.user.type === 'supplier') {
    redirect('/supplier')
  }

  return (
    <ManagementLanguageProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          userName={session.user.name}
          userRole={session.user.role}
        />

        {/* Main Content - min-h-0 lets flex child shrink so scroll height = content only (no extra white space) */}
        <div className="flex-1 min-h-0 overflow-auto bg-slate-50">
          <div className="p-8">
            {children}
          </div>
        </div>

        {/* AI Chatbot Widget */}
        <ChatbotWidget />
      </div>
    </ManagementLanguageProvider>
  )
}
