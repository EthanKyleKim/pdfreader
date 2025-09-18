"""
FastAPI 백엔드 서버 - PDF 처리 전용
"""
import os
import logging
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv

from pdf_processor import process_pdf_file
from ask_handler import ask_handler, QuestionRequest

# 환경 변수 로드
load_dotenv()

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI 앱 생성
app = FastAPI(
    title="PDF RAG Backend",
    description="PDF 처리 및 텍스트 추출을 위한 백엔드 API",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 응답 모델
class ProcessResponse(BaseModel):
    ok: bool
    text: Optional[str] = None
    chunks: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    processing_time: Optional[float] = None
    method: Optional[str] = None
    reason: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    message: str
    version: str

# 환경 변수
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3001')
MAX_FILE_SIZE = int(os.getenv('MAX_PDF_SIZE_MB', '50'))

@app.get("/", response_model=HealthResponse)
async def root():
    """서버 상태 확인"""
    return HealthResponse(
        status="healthy",
        message="PDF RAG Backend API Server",
        version="1.0.0"
    )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """헬스 체크 엔드포인트"""
    return HealthResponse(
        status="healthy",
        message="All systems operational",
        version="1.0.0"
    )

@app.post("/ingest", response_model=ProcessResponse)
async def ingest_pdf(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
    method: str = Form("auto")
):
    """
    PDF 파일을 처리하여 텍스트를 추출합니다.

    Args:
        file: PDF 파일
        user_id: 사용자 ID (선택사항)
        method: 추출 방법 (auto, pymupdf4llm, structured, basic)

    Returns:
        추출된 텍스트와 메타데이터
    """
    import time
    start_time = time.time()

    try:
        logger.info(f"📁 PDF 처리 요청: {file.filename} ({user_id})")

        # 파일 검증
        if not file.filename:
            raise HTTPException(
                status_code=400,
                detail="파일명이 제공되지 않았습니다"
            )

        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400,
                detail="PDF 파일만 지원됩니다"
            )

        # 파일 크기 확인
        if file.size and file.size > MAX_FILE_SIZE * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail=f"파일이 너무 큽니다. 최대 {MAX_FILE_SIZE}MB까지 지원합니다"
            )

        # PDF 파일 읽기
        pdf_bytes = await file.read()

        if not pdf_bytes:
            raise HTTPException(
                status_code=400,
                detail="빈 파일입니다"
            )

        logger.info(f"📄 파일 크기: {len(pdf_bytes) / 1024 / 1024:.2f}MB")

        # PDF 처리
        try:
            result = process_pdf_file(
                pdf_bytes=pdf_bytes,
                filename=file.filename,
                method=method
            )
        except ValueError as e:
            logger.error(f"PDF 처리 오류: {str(e)}")
            raise HTTPException(
                status_code=400,
                detail=str(e)
            )
        except Exception as e:
            logger.error(f"PDF 처리 실패: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"PDF 처리 중 오류가 발생했습니다: {str(e)}"
            )

        processing_time = time.time() - start_time

        logger.info(
            f"✅ PDF 처리 완료: {file.filename} "
            f"({result['chunk_count']}개 청크, {processing_time:.2f}초, {result['extraction_method']})"
        )

        # JavaScript 임베딩 서비스에 전달하기 위한 응답 (새로운 청킹 형식)
        return {
            "ok": True,
            "chunks": result['chunks'],
            "metadata": {
                **result['metadata'],
                'extraction_method': result['extraction_method'],
                'file_size_mb': len(pdf_bytes) / 1024 / 1024,
                'chunk_count': result['chunk_count'],
            },
            "processing_time": processing_time,
            "method": result['extraction_method']
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 예상치 못한 오류: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류가 발생했습니다: {str(e)}"
        )

@app.post("/extract-text", response_model=ProcessResponse)
async def extract_text_only(
    file: UploadFile = File(...),
    method: str = Form("auto")
):
    """
    PDF에서 텍스트만 추출 (임베딩/저장 없이)
    """
    import time
    start_time = time.time()

    try:
        logger.info(f"📄 텍스트 추출 요청: {file.filename}")

        # 파일 검증
        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400,
                detail="PDF 파일만 지원됩니다"
            )

        # PDF 파일 읽기
        pdf_bytes = await file.read()

        # PDF 처리
        result = process_pdf_file(
            pdf_bytes=pdf_bytes,
            filename=file.filename,
            method=method
        )

        processing_time = time.time() - start_time

        logger.info(f"✅ 텍스트 추출 완료: {len(result['text'])}자")

        return ProcessResponse(
            ok=True,
            text=result['text'],
            metadata=result['metadata'],
            processing_time=processing_time,
            method=result['extraction_method']
        )

    except Exception as e:
        logger.error(f"❌ 텍스트 추출 실패: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"텍스트 추출 실패: {str(e)}"
        )

@app.get("/ask-stream")
async def ask_question_stream(
    question: str,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    top_k: int = 5
):
    """
    질문에 대한 스트리밍 답변 생성
    """
    logger.info(f"🌊 스트리밍 질문 답변 요청: {question}")

    if not question.strip():
        return JSONResponse(
            status_code=400,
            content={"ok": False, "reason": "질문이 제공되지 않았습니다"}
        )

    request = QuestionRequest(
        question=question,
        session_id=session_id,
        user_id=user_id,
        top_k=top_k
    )

    return StreamingResponse(
        ask_handler.stream_response(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    )

# 에러 핸들러
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "ok": False,
            "reason": "요청한 엔드포인트를 찾을 수 없습니다"
        }
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    logger.error(f"Internal server error: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "reason": "서버 내부 오류가 발생했습니다"
        }
    )

if __name__ == "__main__":
    # 개발 서버 실행
    port = int(os.getenv('PORT', '8000'))
    host = os.getenv('HOST', '127.0.0.1')

    logger.info(f"🚀 PDF RAG Backend 서버 시작: http://{host}:{port}")
    logger.info(f"📄 최대 파일 크기: {MAX_FILE_SIZE}MB")
    logger.info(f"🔗 프론트엔드 URL: {FRONTEND_URL}")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )