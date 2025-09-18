import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')

  // OAuth 에러 처리
  if (error) {
    console.error('OAuth 에러:', error)
    const errorDescription = requestUrl.searchParams.get('error_description')
    console.error('에러 설명:', errorDescription)

    // 에러가 있으면 홈으로 리디렉션 (로그인 화면이 다시 표시됨)
    return NextResponse.redirect(`${requestUrl.origin}/?error=auth_failed`)
  }

  if (code) {
    const cookieStore = await cookies()
    const response = NextResponse.redirect(`${requestUrl.origin}/?login=success`)

    // 서버 클라이언트 생성 (쿠키 기반)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    try {
      // 코드를 세션으로 교환
      const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

      if (sessionError) {
        console.error('세션 교환 오류:', sessionError)
        return NextResponse.redirect(`${requestUrl.origin}/?error=session_failed`)
      }

      if (data.session) {
        console.log('로그인 성공:', data.user?.email)
        return response
      }
    } catch (error) {
      console.error('인증 처리 오류:', error)
      return NextResponse.redirect(`${requestUrl.origin}/?error=auth_error`)
    }
  }

  // 코드가 없으면 홈으로 리디렉션
  return NextResponse.redirect(`${requestUrl.origin}/`)
}