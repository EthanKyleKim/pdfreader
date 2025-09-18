"""
스트리밍 질문-답변 처리를 위한 핸들러
JavaScript 임베딩 서비스와 연동하여 벡터 검색 및 Ollama LLM 스트리밍 응답
"""
import os
import json
import logging
from typing import Dict, List, Any, Optional
import httpx
from fastapi import HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class QuestionRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    top_k: int = 5

class AskHandler:
    """스트리밍 질문-답변 처리 핸들러"""

    def __init__(self):
        self.frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3001')
        self.ollama_url = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434')
        self.ollama_model = os.getenv('OLLAMA_MODEL', 'exaone3.5:7.8b')

    def build_prompt(self, question: str, contexts: List[str]) -> str:
        """LLM 프롬프트 생성"""
        context_block = '\n\n'.join([f"{i+1}. {context}" for i, context in enumerate(contexts)])

        return f"""당신은 주어진 컨텍스트를 바탕으로 정확하고 도움이 되는 답변을 제공하는 한국어 어시스턴트입니다.

컨텍스트:
{context_block}

질문: {question}

지침:
- 주어진 컨텍스트만을 사용하여 답변하세요
- 컨텍스트에서 찾을 수 없는 정보는 "주어진 문서에서 해당 정보를 찾을 수 없습니다"라고 답하세요
- 추측하거나 컨텍스트 외의 정보를 사용하지 마세요
- 한국어로 자연스럽고 정확하게 답변하세요

답변:"""

    async def search_vectors_via_frontend(self, question: str, top_k: int = 5) -> Dict[str, Any]:
        """프론트엔드의 JavaScript 임베딩 서비스를 통한 벡터 검색"""
        try:
            # 프론트엔드에 임베딩 및 검색 요청
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.frontend_url}/api/vector-search",
                    json={
                        "question": question,
                        "top_k": top_k
                    }
                )

                if response.status_code != 200:
                    raise HTTPException(
                        status_code=500,
                        detail=f"벡터 검색 실패: {response.status_code}"
                    )

                return response.json()

        except Exception as e:
            logger.error(f"벡터 검색 실패: {str(e)}")
            # 임시로 빈 결과 반환 (나중에 직접 구현 가능)
            return {
                "ok": True,
                "results": [],
                "contexts": [],
                "metadatas": []
            }

    async def stream_response(self, request: QuestionRequest):
        """스트리밍 응답 생성"""
        try:
            logger.info(f"스트리밍 응답 시작: {request.question}")

            # 먼저 소스 정보 전송 (임시)
            yield f"data: {json.dumps({'type': 'sources', 'sources': []})}\n\n"

            # 벡터 검색
            search_result = await self.search_vectors_via_frontend(
                request.question,
                request.top_k
            )

            if not search_result.get('ok', False):
                yield f"data: {json.dumps({'type': 'error', 'message': '벡터 검색 실패'})}\n\n"
                return

            contexts = search_result.get('contexts', [])
            metadatas = search_result.get('metadatas', [])

            # 소스 정보 업데이트
            if metadatas:
                yield f"data: {json.dumps({'type': 'sources', 'sources': metadatas})}\n\n"

            if not contexts:
                message = "죄송합니다. 업로드된 문서에서 관련된 정보를 찾을 수 없습니다."
                yield f"data: {json.dumps({'type': 'content', 'content': message})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            # Ollama 스트리밍 호출
            prompt = self.build_prompt(request.question, contexts)

            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.ollama_model,
                        "prompt": prompt,
                        "stream": True,
                        "options": {
                            "temperature": 0.1,
                            "top_p": 0.9,
                            "top_k": 40,
                        }
                    }
                ) as response:

                    if response.status_code != 200:
                        yield f"data: {json.dumps({'type': 'error', 'message': f'Ollama API 오류: {response.status_code}'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if line.strip():
                            try:
                                data = json.loads(line)

                                if data.get('response'):
                                    yield f"data: {json.dumps({'type': 'content', 'content': data['response']})}\n\n"

                                if data.get('done'):
                                    yield f"data: {json.dumps({'type': 'done', 'model': self.ollama_model})}\n\n"
                                    return

                            except json.JSONDecodeError:
                                continue

        except Exception as e:
            logger.error(f"스트리밍 응답 실패: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'스트리밍 실패: {str(e)}'})}\n\n"

# 글로벌 핸들러 인스턴스
ask_handler = AskHandler()