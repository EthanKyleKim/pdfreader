import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  console.log('🌊 SSE 스트리밍 질문 답변 요청 (Python 백엔드 프록시)')

  const searchParams = request.nextUrl.searchParams
  const question = searchParams.get('question')
  const sessionId = searchParams.get('session_id')
  const userId = searchParams.get('user_id')
  const topK = parseInt(searchParams.get('top_k') || '5')

  if (!question?.trim()) {
    return new Response('질문이 제공되지 않았습니다', { status: 400 })
  }

  console.log(`❓ 스트리밍 질문: ${question}`)

  try {
    // Python 백엔드 스트리밍 엔드포인트로 프록시
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
    const params = new URLSearchParams({
      question: question,
      session_id: sessionId || '',
      user_id: userId || '',
      top_k: topK.toString(),
    })

    const pythonResponse = await fetch(`${backendUrl}/ask-stream?${params}`)

    if (!pythonResponse.ok) {
      console.error('Python 백엔드 스트리밍 오류:', pythonResponse.status)

      const errorStream = new ReadableStream({
        start(controller) {
          controller.enqueue(`data: ${JSON.stringify({
            type: 'error',
            message: `Python 백엔드 오류: ${pythonResponse.status}`
          })}\\n\\n`)
          controller.close()
        }
      })

      return new Response(errorStream, {
        status: 200, // SSE는 200으로 반환해야 함
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }

    // Python 백엔드의 스트림을 그대로 프록시
    const stream = new ReadableStream({
      async start(controller) {
        const reader = pythonResponse.body?.getReader()
        if (!reader) {
          controller.enqueue(`data: ${JSON.stringify({
            type: 'error',
            message: '스트림을 읽을 수 없습니다'
          })}\\n\\n`)
          controller.close()
          return
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
        } catch (error) {
          console.error('스트림 프록시 오류:', error)
          controller.enqueue(`data: ${JSON.stringify({
            type: 'error',
            message: '스트림 처리 중 오류 발생'
          })}\\n\\n`)
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })

  } catch (error) {
    console.error('❌ 스트리밍 실패:', error)

    const errorStream = new ReadableStream({
      start(controller) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
        controller.enqueue(`data: ${JSON.stringify({
          type: 'error',
          message: `스트리밍 응답 생성 실패: ${errorMessage}`
        })}\\n\\n`)
        controller.close()
      }
    })

    return new Response(errorStream, {
      status: 200, // SSE는 200으로 반환해야 함
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })
  }
}