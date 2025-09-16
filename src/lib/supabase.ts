import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { getCookie, setCookie } from 'cookies-next'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 브라우저용 Supabase 클라이언트
export const createClient = () => {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// 서버용 Supabase 클라이언트 (SSR/API Routes)
export const createServerSupabaseClient = () => {
  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return getCookie(name)
        },
        set(name: string, value: string, options: any) {
          setCookie(name, value, options)
        },
        remove(name: string, options: any) {
          setCookie(name, '', { ...options, maxAge: 0 })
        },
      },
    }
  )
}

// 사용자 타입 정의
export interface User {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
  }
}

// 세션 타입 정의
export interface Session {
  access_token: string
  refresh_token: string
  user: User
}