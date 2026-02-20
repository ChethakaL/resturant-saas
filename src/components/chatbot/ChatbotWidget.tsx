'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Sparkles,
  Search,
  Image as ImageIcon,
  CheckCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatAction {
  webSearch?: { query: string }
  imageGeneration?: { prompt: string }
  menuItemCreation?: { data: any }
}

export default function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')
  const [showImagePrompt, setShowImagePrompt] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm your restaurant assistant. I can help with menu items, recipes, inventory questions, and more. Use the image button below to generate a dish photo with AI.",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingActions, setPendingActions] = useState<ChatAction | null>(null)
  const [isProcessingAction, setIsProcessingAction] = useState(false)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Check for pending actions
      if (data.actions) {
        const hasActions =
          data.actions.webSearch ||
          data.actions.imageGeneration ||
          data.actions.menuItemCreation

        if (hasActions) {
          setPendingActions(data.actions)
          await handleActions(data.actions)
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleActions = async (actions: ChatAction) => {
    setIsProcessingAction(true)

    try {
      // Handle web search
      if (actions.webSearch) {
        const searchMessage: Message = {
          role: 'assistant',
          content: `🔍 Searching the web for: "${actions.webSearch.query}"...`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, searchMessage])

        const searchResponse = await fetch('/api/chatbot/web-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: actions.webSearch.query }),
        })

        const searchData = await searchResponse.json()

        if (searchResponse.ok) {
          const resultsMessage: Message = {
            role: 'assistant',
            content: `Here's what I found:\n\n${searchData.results}\n\nDoes this look good, or would you like me to search for something else?`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, resultsMessage])
        }
      }

      // Handle image generation
      if (actions.imageGeneration) {
        const imageMessage: Message = {
          role: 'assistant',
          content: `🎨 Generating image: "${actions.imageGeneration.prompt}"...`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, imageMessage])

        // This would call the existing image generation API
        const imageResponse = await fetch('/api/menu/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: actions.imageGeneration.prompt }),
        })

        const imageData = await imageResponse.json()

        if (imageResponse.ok && imageData.imageUrl) {
          setGeneratedImageUrl(imageData.imageUrl)
          const imageResultMessage: Message = {
            role: 'assistant',
            content: `✅ Image generated successfully! I'll use this for the menu item.`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, imageResultMessage])
        } else {
          const errorMessage: Message = {
            role: 'assistant',
            content: `❌ Failed to generate image: ${imageData.error || 'Unknown error'}. Would you like to try again or proceed without an image?`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, errorMessage])
        }
      }

      // Handle menu item creation
      if (actions.menuItemCreation) {
        const createMessage: Message = {
          role: 'assistant',
          content: `📝 Creating menu item...`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, createMessage])

        // Add the generated image URL if available
        const menuData = {
          ...actions.menuItemCreation.data,
          imageUrl: generatedImageUrl || actions.menuItemCreation.data.imageUrl,
        }

        const createResponse = await fetch('/api/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(menuData),
        })

        if (createResponse.ok) {
          setGeneratedImageUrl(null) // Reset for next creation
          const successMessage: Message = {
            role: 'assistant',
            content: `✅ Menu item created successfully! Would you like to view it or create another one?`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, successMessage])

          // Optionally redirect to menu page
          setTimeout(() => {
            router.refresh()
          }, 1000)
        } else {
          const errorData = await createResponse.json()
          const errorMessage: Message = {
            role: 'assistant',
            content: `❌ Failed to create menu item: ${errorData.error}. Would you like to try again with different information?`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, errorMessage])
        }
      }
    } catch (error) {
      console.error('Action error:', error)
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing that action.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsProcessingAction(false)
      setPendingActions(null)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return
    setGeneratingImage(true)
    setShowImagePrompt(false)
    const userMsg: Message = { role: 'user', content: `Generate image: ${imagePrompt.trim()}`, timestamp: new Date() }
    setMessages((prev) => [...prev, userMsg])
    try {
      const res = await fetch('/api/menu/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl)
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `Image generated! You can save the URL below or use it when adding a menu item.\n\n${data.imageUrl}`,
          timestamp: new Date(),
        }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Could not generate image: ${data.error || 'Unknown error'}`, timestamp: new Date() }])
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error generating image. Please try again.', timestamp: new Date() }])
    } finally {
      setGeneratingImage(false)
      setImagePrompt('')
    }
  }

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-emerald-500 hover:bg-emerald-600 z-50"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 w-[400px] h-[600px] shadow-2xl z-50 flex flex-col">
          <CardHeader className="bg-slate-900 text-white rounded-t-lg p-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-slate-300" />
              <CardTitle className="text-lg">AI Assistant</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs mt-1 opacity-50">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}

            {(isLoading || isProcessingAction || generatingImage) && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-lg p-3">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
                </div>
              </div>
            )}

            {pendingActions && (
              <div className="flex flex-wrap gap-2">
                {pendingActions.webSearch && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Search className="h-3 w-3" />
                    Searching...
                  </Badge>
                )}
                {pendingActions.imageGeneration && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    Generating Image...
                  </Badge>
                )}
                {pendingActions.menuItemCreation && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Creating...
                  </Badge>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </CardContent>

          <div className="border-t p-3 space-y-2">
            {/* Image generation quick action */}
            {showImagePrompt ? (
              <div className="flex gap-2">
                <Input
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Describe the dish image to generate..."
                  className="flex-1 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerateImage()
                    if (e.key === 'Escape') setShowImagePrompt(false)
                  }}
                  autoFocus
                />
                <Button size="sm" onClick={handleGenerateImage} disabled={!imagePrompt.trim() || generatingImage} className="bg-slate-800 hover:bg-slate-700 text-white shrink-0">
                  {generatingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowImagePrompt(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowImagePrompt(true)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Generate Image with AI
              </button>
            )}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={isLoading || isProcessingAction || generatingImage}
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={isLoading || isProcessingAction || generatingImage || !input.trim()}
                size="icon"
                className="bg-slate-800 hover:bg-slate-700"
              >
                {isLoading || isProcessingAction ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  )
}
