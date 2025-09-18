import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { generateEmbeddings } from '@/lib/embedding'
import { v4 as uuidv4 } from 'uuid'

// Supabase 클라이언트
const supabase = createClient()

export async function POST(request: NextRequest) {
  console.log('📁 PDF 인덱싱 요청 (Python → JavaScript 하이브리드)')

  try {
    // FormData에서 파일과 메타데이터 추출
    const formData = await request.formData()
    const file = formData.get('file') as File
    const userId = formData.get('user_id') as string
    const sessionId = formData.get('session_id') as string
    const method = formData.get('method') as string || 'auto'

    // 파일 유효성 검사
    if (!file) {
      return NextResponse.json(
        { ok: false, reason: '파일이 제공되지 않았습니다' },
        { status: 400 }
      )
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { ok: false, reason: 'PDF 파일만 지원됩니다' },
        { status: 400 }
      )
    }

    console.log(`📄 처리할 파일: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)

    const startTime = Date.now()

    // 1. Python 백엔드로 PDF 텍스트 추출 요청
    console.log('🐍 Python 백엔드로 PDF 처리 중...')

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
    const pythonFormData = new FormData()
    pythonFormData.append('file', file)
    pythonFormData.append('method', method)
    if (userId) pythonFormData.append('user_id', userId)
    if (sessionId) pythonFormData.append('session_id', sessionId)

    const pythonResponse = await fetch(`${backendUrl}/ingest`, {
      method: 'POST',
      body: pythonFormData,
    })

    if (!pythonResponse.ok) {
      const errorData = await pythonResponse.json()
      console.error('Python 백엔드 오류:', errorData)
      return NextResponse.json(
        { ok: false, reason: errorData.detail || 'PDF 처리 실패' },
        { status: pythonResponse.status }
      )
    }

    const pythonResult = await pythonResponse.json()

    if (!pythonResult.ok || !pythonResult.chunks) {
      return NextResponse.json(
        { ok: false, reason: pythonResult.reason || 'PDF에서 텍스트 청크를 추출할 수 없습니다' },
        { status: 400 }
      )
    }

    const chunks = pythonResult.chunks
    const pdfMetadata = pythonResult.metadata

    console.log(`📊 Python 처리 완료: ${chunks.length}개 청크, ${pdfMetadata.page_count}페이지 (${pythonResult.method})`)

    if (chunks.length === 0) {
      return NextResponse.json(
        { ok: false, reason: 'PDF에서 텍스트 청크를 생성할 수 없습니다' },
        { status: 400 }
      )
    }

    // 2. JavaScript로 임베딩 생성
    console.log('🧠 JavaScript로 임베딩 생성 중...')
    const embeddingStartTime = Date.now()

    const embeddings = await generateEmbeddings(chunks)

    const embeddingTime = Date.now() - embeddingStartTime
    console.log(`⚡ 임베딩 생성 완료: ${embeddingTime}ms (${Math.round(embeddingTime / chunks.length)}ms/청크)`)

    // 3. 문서 ID 생성 및 Supabase 저장
    const docId = uuidv4()

    const chunkData = chunks.map((chunk, index) => ({
      id: `${docId}_${index}`,
      doc_id: docId,
      content: chunk,
      embedding: embeddings[index],
      metadata: {
        doc_id: docId,
        source_name: file.name,
        chunk_index: index,
        total_chunks: chunks.length,
        pages: pdfMetadata.page_count,
        extraction_method: pythonResult.method,
        user_id: userId || null, // user_id를 metadata에 저장
      },
      source_name: file.name,
      chunk_index: index,
    }))

    // Supabase에 벡터 데이터 저장
    console.log('💾 Supabase에 저장 중...')
    const { data: insertResult, error: insertError } = await supabase
      .from('document_chunks')
      .insert(chunkData)

    if (insertError) {
      console.error('❌ Supabase 저장 실패:', insertError)
      return NextResponse.json(
        { ok: false, reason: `데이터베이스 저장 실패: ${insertError.message}` },
        { status: 500 }
      )
    }

    // 사용자 문서 정보 저장 (옵션)
    if (userId && sessionId) {
      try {
        await supabase.from('user_documents').insert({
          user_id: userId,
          session_id: sessionId,
          filename: file.name,
          doc_id: docId,
          chunks_count: chunks.length,
        })
      } catch (error) {
        console.warn('⚠️ 사용자 문서 정보 저장 실패:', error)
      }
    }

    const totalTime = Date.now() - startTime

    console.log('✅ 하이브리드 PDF 인덱싱 완료')

    // 성공 응답
    return NextResponse.json({
      ok: true,
      doc_id: docId,
      chunks: chunks.length,
      processing_time: totalTime,
      metadata: {
        filename: file.name,
        pages: pdfMetadata.page_count,
        total_chunks: chunks.length,
        extraction_method: pythonResult.method,
        pdf_processing_time: pythonResult.processing_time,
        embedding_time: embeddingTime,
        embedding_model: 'Xenova/all-MiniLM-L6-v2',
        total_processing_time: totalTime,
        architecture: 'Python(PDF+Chunking) + JavaScript(Embedding)',
      },
    })

  } catch (error) {
    console.error('❌ 하이브리드 PDF 인덱싱 실패:', error)

    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'

    return NextResponse.json(
      {
        ok: false,
        reason: `인덱싱 실패: ${errorMessage}`,
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