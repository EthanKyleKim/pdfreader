'use client'

import { useState } from 'react'
import AuthWrapper from '@/components/AuthWrapper'
import Sidebar from '@/components/Sidebar'
import ChatInterface from '@/components/ChatInterface'

export default function HomePage() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId)
  }

  const handleNewChat = () => {
    setCurrentSessionId(null)
  }

  const handleSessionCreated = (sessionId: string) => {
    setCurrentSessionId(sessionId)
  }

  return (
    <AuthWrapper>
      {(user, loading) => {
        if (loading) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            </div>
          )
        }

        return (
          <div className="flex h-screen bg-gray-50">
            <Sidebar
              user={user}
              currentSessionId={currentSessionId}
              onSessionSelect={handleSessionSelect}
              onNewChat={handleNewChat}
            />
            <ChatInterface
              user={user!}
              sessionId={currentSessionId}
              onSessionCreated={handleSessionCreated}
            />
          </div>
        )
      }}
    </AuthWrapper>
  )
}
