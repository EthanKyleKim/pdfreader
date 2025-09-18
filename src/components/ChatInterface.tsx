'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: any[]
  created_at: string
}

interface ChatInterfaceProps {
  user: User
  sessionId: string | null
  onSessionCreated: (sessionId: string) => void
}

export default function ChatInterface({ user, sessionId, onSessionCreated }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  // 하이브리드 아키텍처 사용 (선택 불필요)
  const [processingStats, setProcessingStats] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (sessionId) {
      loadMessages()
    } else {
      setMessages([])
    }
  }, [sessionId])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingMessage])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadMessages = async () => {
    if (!sessionId) return

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('메시지 로드 오류:', error)
        return
      }

      setMessages(data || [])
    } catch (error) {
      console.error('메시지 로드 실패:', error)
    }
  }

  const createNewSession = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: 'New Chat'
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      onSessionCreated(data.id)
      return data.id
    } catch (error) {
      console.error('새 세션 생성 실패:', error)
      throw error
    }
  }

  const saveMessage = async (sessionId: string, role: 'user' | 'assistant', content: string, sources?: any[]) => {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          role,
          content,
          sources: sources || []
        })

      if (error) {
        console.error('메시지 저장 오류:', error)
      }
    } catch (error) {
      console.error('메시지 저장 실패:', error)
    }
  }

  const updateSessionTitle = async (sessionId: string, firstMessage: string) => {
    const title = firstMessage.length > 50 
      ? firstMessage.substring(0, 50) + '...' 
      : firstMessage

    try {
      await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', sessionId)
    } catch (error) {
      console.error('세션 제목 업데이트 실패:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() && !file) return
    if (loading) return

    setLoading(true)
    
    try {
      let currentSessionId = sessionId
      
      // 세션이 없으면 새로 생성
      if (!currentSessionId) {
        currentSessionId = await createNewSession()
      }

      let userMessage = input.trim()
      
      // PDF 파일이 있으면 먼저 인덱싱
      if (file) {
        userMessage = `[PDF: ${file.name}] ${userMessage || 'PDF 파일을 업로드했습니다.'}`
        
        const formData = new FormData()
        formData.append('file', file)
        formData.append('user_id', user.id)
        formData.append('session_id', currentSessionId)

        // 하이브리드 버전 사용 (Python PDF + JavaScript Embedding)
        const ingestEndpoint = '/api/ingest'
        const ingestResponse = await fetch(ingestEndpoint, {
          method: 'POST',
          body: formData,
        })

        const ingestResult = await ingestResponse.json()
        if (!ingestResult.ok) {
          throw new Error(ingestResult.reason || 'PDF 인덱싱 실패')
        }

        // 처리 통계 저장
        if (ingestResult.metadata) {
          setProcessingStats({
            type: 'ingest',
            ...ingestResult.metadata,
            processing_time: ingestResult.processing_time,
            version: 'Hybrid (Python + JavaScript)'
          })
        }
      }

      // 사용자 메시지 저장 및 화면에 표시
      const userMsg: Message = {
        id: Math.random().toString(),
        role: 'user',
        content: userMessage,
        created_at: new Date().toISOString()
      }
      
      setMessages(prev => [...prev, userMsg])
      await saveMessage(currentSessionId, 'user', userMessage)
      
      // 첫 번째 메시지면 세션 제목 업데이트
      if (messages.length === 0) {
        await updateSessionTitle(currentSessionId, input.trim() || file?.name || 'New Chat')
      }

      // SSE로 응답 받기
      setStreamingMessage('')
      setProcessingStats(null)

      // 스트리밍 응답 API 사용
      const streamEndpoint = '/api/ask-stream'
      const eventSource = new EventSource(`${streamEndpoint}?session_id=${currentSessionId}&question=${encodeURIComponent(input.trim() || 'PDF를 분석해주세요')}&user_id=${user.id}`)
      
      let assistantResponse = ''
      let sources: any[] = []
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        
        if (data.type === 'content') {
          assistantResponse += data.content
          setStreamingMessage(assistantResponse)
        } else if (data.type === 'sources') {
          sources = data.sources
        } else if (data.type === 'done') {
          eventSource.close()
          
          // 최종 메시지 저장
          const assistantMsg: Message = {
            id: Math.random().toString(),
            role: 'assistant',
            content: assistantResponse,
            sources,
            created_at: new Date().toISOString()
          }
          
          setMessages(prev => [...prev, assistantMsg])
          saveMessage(currentSessionId, 'assistant', assistantResponse, sources)
          setStreamingMessage('')
        }
      }
      
      eventSource.onerror = (error) => {
        console.error('SSE 오류:', error)
        eventSource.close()
        setStreamingMessage('')
        alert('응답 생성 중 오류가 발생했습니다.')
      }

    } catch (error) {
      console.error('전송 실패:', error)
      alert(error instanceof Error ? error.message : '메시지 전송에 실패했습니다.')
    } finally {
      setInput('')
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile)
    } else {
      alert('PDF 파일만 업로드 가능합니다.')
      e.target.value = ''
    }
  }

  const removeFile = () => {
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* 상단 정보 바 */}
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-medium text-gray-700">하이브리드 RAG 시스템</h3>
            <div className="text-xs text-gray-500">
              <span className="font-medium text-orange-600">PDF 처리: Python (PyMuPDF)</span>
              <span className="mx-2">•</span>
              <span className="font-medium text-green-600">임베딩: JavaScript (Transformers.js)</span>
              <span className="mx-2">•</span>
              <span className="font-medium text-blue-600">LLM: Ollama</span>
            </div>
          </div>

          {processingStats && (
            <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1 rounded-full">
              {processingStats.type === 'ingest' ? (
                <>📄 {processingStats.chunks}청크 생성 ({processingStats.processing_time}ms)</>
              ) : (
                <>💬 응답 생성 ({processingStats.total_time}ms)</>
              )}
              <span className="ml-2 font-medium text-purple-600">{processingStats.version}</span>
            </div>
          )}
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && !streamingMessage ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                PDF와 대화를 시작하세요
              </h2>
              <p className="text-gray-600 text-sm">
                PDF 파일을 업로드하고 질문하거나, 이미 업로드된 문서에 대해 질문할 수 있습니다.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-3xl ${
                  message.role === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white border border-gray-200'
                } rounded-2xl px-4 py-3 shadow-sm`}>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-500 mb-2">참조된 문서:</p>
                      <div className="space-y-1">
                        {message.sources.map((source, idx) => (
                          <div key={idx} className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                            {source.source_name} (유사도: {(source.similarity * 100).toFixed(1)}%)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {streamingMessage && (
              <div className="flex justify-start">
                <div className="max-w-3xl bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="whitespace-pre-wrap">{streamingMessage}</div>
                  <div className="flex items-center gap-1 mt-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="border-t border-gray-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {file && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium text-blue-900">{file.name}</span>
                <span className="text-xs text-blue-600">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
              </div>
              <button
                type="button"
                onClick={removeFile}
                className="text-blue-600 hover:text-blue-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="PDF에 대해 질문하거나 새 PDF를 업로드하세요..."
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  title="PDF 파일 업로드"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading || (!input.trim() && !file)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}