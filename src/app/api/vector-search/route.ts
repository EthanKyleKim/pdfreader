import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embedding'

// Supabase 클라이언트
const supabase = createClient()

export async function POST(request: NextRequest) {
  console.log('🔍 벡터 검색 요청 (JavaScript 임베딩)')

  try {
    const body = await request.json()
    const { question, top_k = 5 } = body

    if (!question?.trim()) {
      return NextResponse.json(
        { ok: false, reason: '질문이 제공되지 않았습니다' },
        { status: 400 }
      )
    }

    console.log(`🔍 검색 질문: ${question}`)

    const startTime = Date.now()

    // 1. 질문 임베딩 생성
    console.log('🧠 임베딩 생성 중...')
    const queryEmbedding = await generateEmbedding(question)

    // 2. 벡터 유사도 검색
    console.log('🎯 벡터 검색 중...')
    const { data: searchResults, error: searchError } = await supabase.rpc(
      'search_document_chunks',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.1,
        match_count: top_k,
      }
    )

    if (searchError) {
      console.error('벡터 검색 실패:', searchError)
      return NextResponse.json(
        { ok: false, reason: `벡터 검색 실패: ${searchError.message}` },
        { status: 500 }
      )
    }

    const searchTime = Date.now() - startTime
    console.log(`✅ 검색 완료: ${searchTime}ms, ${searchResults?.length || 0}개 결과`)

    // 3. 결과 정리
    if (!searchResults || searchResults.length === 0) {
      console.log('📭 관련 문서를 찾을 수 없음')

      return NextResponse.json({
        ok: true,
        results: [],
        contexts: [],
        metadatas: [],
        processing_time: searchTime,
        total_results: 0
      })
    }

    // 4. 컨텍스트 및 메타데이터 추출
    const contexts = searchResults.map((result: any) => result.content)
    const metadatas = searchResults.map((result: any) => ({
      doc_id: result.doc_id,
      source_name: result.source_name,
      chunk_index: result.chunk_index,
      similarity: result.similarity,
    }))

    console.log(`📚 ${contexts.length}개 컨텍스트 발견`)

    // 5. 성공 응답
    return NextResponse.json({
      ok: true,
      results: searchResults,
      contexts,
      metadatas,
      processing_time: searchTime,
      total_results: searchResults.length,
      stats: {
        embedding_model: 'Xenova/all-MiniLM-L6-v2',
        search_threshold: 0.1,
        max_results: top_k
      }
    })

  } catch (error) {
    console.error('❌ 벡터 검색 실패:', error)

    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'

    return NextResponse.json(
      {
        ok: false,
        reason: `벡터 검색 실패: ${errorMessage}`,
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError'
      },
      { status: 500 }
    )
  }
}

// OPTIONS 요청 처리 (CORS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}