'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import { User } from '@supabase/supabase-js'

interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
  last_message_content: string | null
}

interface SidebarProps {
  user: User | null
  currentSessionId?: string
  onSessionSelect: (sessionId: string) => void
  onNewChat: () => void
}

export default function Sidebar({ user, currentSessionId, onSessionSelect, onNewChat }: SidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      loadSessions()
    }
  }, [user])

  const loadSessions = async () => {
    if (!user) return
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .rpc('get_user_recent_sessions', {
          user_uuid: user.id,
          limit_count: 20
        })

      if (error) {
        console.error('세션 로드 오류:', error)
        return
      }

      setSessions(data || [])
    } catch (error) {
      console.error('세션 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      setSessions([])
    } catch (error) {
      console.error('로그아웃 오류:', error)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) {
      return '방금 전'
    } else if (diffInHours < 24) {
      return `${diffInHours}시간 전`
    } else {
      const diffInDays = Math.floor(diffInHours / 24)
      if (diffInDays < 7) {
        return `${diffInDays}일 전`
      } else {
        return date.toLocaleDateString('ko-KR', { 
          month: 'short', 
          day: 'numeric' 
        })
      }
    }
  }

  const truncateTitle = (title: string, maxLength: number = 30) => {
    return title.length > maxLength ? `${title.slice(0, maxLength)}...` : title
  }

  return (
    <div className="w-80 h-screen bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* 헤더 */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewChat}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          새 채팅
        </button>
      </div>

      {/* 채팅 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            로딩 중...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm">아직 채팅이 없습니다</p>
            <p className="text-xs text-gray-400 mt-1">새 채팅을 시작해보세요</p>
          </div>
        ) : (
          <div className="p-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSessionSelect(session.id)}
                className={`w-full p-3 mb-2 rounded-lg text-left hover:bg-gray-100 transition-colors ${
                  currentSessionId === session.id ? 'bg-blue-100 border-l-4 border-blue-500' : 'bg-white'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-medium text-gray-900 text-sm leading-5">
                    {truncateTitle(session.title)}
                  </h3>
                  <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                    {formatDate(session.updated_at)}
                  </span>
                </div>
                {session.last_message_content && (
                  <p className="text-xs text-gray-600 line-clamp-2 leading-4">
                    {truncateTitle(session.last_message_content, 50)}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">
                    {session.message_count}개 메시지
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 사용자 정보 */}
      {user && (
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.user_metadata?.name || user.email}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              title="로그아웃"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}