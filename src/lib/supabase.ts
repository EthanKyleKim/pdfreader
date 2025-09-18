import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type Database = {
  public: {
    Tables: {
      chat_sessions: {
        Row: {
          id: string
          user_id: string
          title: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          created_at?: string
          updated_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          session_id: string
          user_id: string
          role: 'user' | 'assistant'
          content: string
          sources: any[]
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          role: 'user' | 'assistant'
          content: string
          sources?: any[]
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          role?: 'user' | 'assistant'
          content?: string
          sources?: any[]
          created_at?: string
        }
      }
      user_documents: {
        Row: {
          id: string
          user_id: string
          session_id: string
          filename: string
          doc_id: string
          chunks_count: number
          uploaded_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          filename: string
          doc_id: string
          chunks_count?: number
          uploaded_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string
          filename?: string
          doc_id?: string
          chunks_count?: number
          uploaded_at?: string
        }
      }
    }
  }
}