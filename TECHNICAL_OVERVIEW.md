# PDF RAG 시스템 기술 개요

## 아키텍처 설계

본 프로젝트는 PDF 문서와 자연어로 대화할 수 있는 RAG(Retrieval-Augmented Generation) 시스템으로, 하이브리드 아키텍처를 채택하여 각 언어의 강점을 최대한 활용합니다.

### 핵심 설계 원칙

**언어별 역할 분담**: Python은 PDF 처리와 텍스트 추출에, JavaScript는 임베딩 생성과 벡터 연산에 특화되어 각자의 생태계 강점을 활용합니다.

**마이크로서비스 패턴**: FastAPI 백엔드와 Next.js 프론트엔드가 독립적으로 배포되고 확장 가능하도록 설계되었습니다.

**벡터 데이터베이스 통합**: Supabase의 pgvector 확장을 활용하여 관계형 데이터베이스와 벡터 검색을 단일 스택에서 처리합니다.

## 기술 스택

### 프론트엔드 (Next.js 15)
- **프레임워크**: Next.js 15 App Router
- **언어**: TypeScript
- **임베딩**: Transformers.js (Xenova/all-MiniLM-L6-v2)
- **인증**: Supabase Auth (Google, GitHub OAuth)
- **UI**: Tailwind CSS
- **벡터 연산**: 브라우저 네이티브 WebAssembly

### 백엔드 (FastAPI)
- **프레임워크**: FastAPI
- **언어**: Python
- **PDF 처리**: PyMuPDF, pymupdf4llm
- **텍스트 청킹**: RecursiveCharacterTextSplitter
- **서버**: Uvicorn (ASGI)

### 데이터베이스
- **주 데이터베이스**: Supabase (PostgreSQL)
- **벡터 확장**: pgvector
- **벡터 인덱스**: HNSW (Hierarchical Navigable Small World)
- **유사도 메트릭**: 코사인 유사도

### LLM 통합
- **로컬 LLM**: Ollama
- **스트리밍**: Server-Sent Events
- **컨텍스트 관리**: 벡터 유사도 기반 문서 검색

## 데이터 플로우

### PDF 처리 파이프라인

**1단계: PDF 업로드 및 검증**
사용자가 업로드한 PDF 파일은 Next.js API 라우트에서 파일 타입과 크기를 검증합니다. 최대 50MB까지 지원하며, MIME 타입 검사를 통해 보안을 강화합니다.

**2단계: Python 백엔드 텍스트 추출**
FastAPI 백엔드로 PDF 바이너리가 전송되어 pymupdf4llm을 통해 마크다운 형식으로 변환됩니다. 이 과정에서 텍스트 구조와 레이아웃 정보가 보존되며, 한국어 텍스트에 최적화된 청킹 알고리즘이 적용됩니다.

**3단계: 텍스트 청킹**
추출된 텍스트는 RecursiveCharacterTextSplitter를 사용해 1000자 단위로 분할되며, 200자의 오버랩을 두어 문맥의 연속성을 보장합니다. 한국어 특성을 고려한 구분자 우선순위가 적용됩니다.

**4단계: JavaScript 임베딩 생성**
분할된 텍스트 청크들은 프론트엔드로 반환되어 Transformers.js를 통해 임베딩 벡터로 변환됩니다. all-MiniLM-L6-v2 모델을 사용하여 384차원 벡터를 생성하며, 브라우저에서 직접 처리되어 서버 부하를 분산시킵니다.

**5단계: 벡터 데이터베이스 저장**
생성된 임베딩은 메타데이터와 함께 Supabase의 document_chunks 테이블에 저장됩니다. pgvector의 HNSW 인덱스를 통해 빠른 유사도 검색이 가능합니다.

### 질의응답 파이프라인

**1단계: 질문 임베딩 생성**
사용자 질문이 동일한 all-MiniLM-L6-v2 모델로 임베딩되어 검색 쿼리로 변환됩니다.

**2단계: 벡터 유사도 검색**
질문 임베딩과 저장된 문서 청크 간 코사인 유사도를 계산하여 가장 관련성 높은 상위 K개 청크를 검색합니다. Supabase의 RPC 함수를 통해 효율적인 벡터 검색이 수행됩니다.

**3단계: 컨텍스트 구성 및 LLM 호출**
검색된 청크들이 컨텍스트로 구성되어 Ollama 로컬 LLM에 전송됩니다. 스트리밍 응답을 통해 실시간으로 답변이 생성되며, Server-Sent Events로 클라이언트에 전달됩니다.

## 주요 리팩토링 과정

### pymupdf4llm 통합 문제 해결

**문제**: 초기 구현에서 pymupdf4llm 라이브러리가 PDF 바이트 데이터를 직접 처리하지 못해 "bad filename: type(filename)=<class 'bytes'>" 오류가 발생했습니다.

**해결**: 임시 파일 패턴을 도입하여 PDF 바이트를 임시 파일로 저장한 후 파일 경로를 전달하는 방식으로 변경했습니다. 또한 page_chunks=True 옵션에서 반환되는 딕셔너리 리스트를 적절히 처리하는 로직을 추가했습니다.

```python
with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
    tmp_file.write(pdf_bytes)
    tmp_file.flush()

    md_result = pymupdf4llm.to_markdown(
        tmp_file.name,
        page_chunks=True,
        write_images=False,
        force_text=True,
    )
```

### API 응답 형식 표준화

**문제**: 백엔드에서 text 필드로 응답하는데 프론트엔드에서는 chunks 배열을 기대하는 형식 불일치가 발생했습니다.

**해결**: Pydantic 모델에 chunks 필드를 추가하고, 백엔드 응답에서 청킹된 텍스트 배열을 직접 반환하도록 수정했습니다.

```python
class ProcessResponse(BaseModel):
    ok: bool
    text: Optional[str] = None
    chunks: Optional[List[str]] = None  # 추가
    metadata: Optional[Dict[str, Any]] = None
```

### Supabase 스키마 최적화

**문제**: 프론트엔드에서 user_id 필드를 삽입하려 했으나 데이터베이스 스키마에 해당 컬럼이 정의되지 않아 PGRST204 오류가 발생했습니다.

**해결**: user_id를 메타데이터 JSON 필드에 저장하는 방식으로 변경하여 스키마 호환성을 유지하면서도 사용자 정보를 보존할 수 있도록 했습니다.

## 성능 최적화

### 임베딩 생성 최적화
브라우저에서 Transformers.js를 활용한 클라이언트 사이드 임베딩 생성으로 서버 리소스를 절약하고, 사용자별 병렬 처리가 가능합니다. WebAssembly 기반 연산으로 네이티브 수준의 성능을 달성합니다.

### 벡터 검색 최적화
pgvector의 HNSW 인덱스를 통해 근사 최근접 이웃 검색을 수행하여 대용량 벡터 데이터에서도 밀리초 단위의 검색 속도를 보장합니다.

### 텍스트 청킹 최적화
한국어 특성을 고려한 계층적 구분자 시스템을 적용하여 문맥의 의미를 보존하면서도 적절한 크기의 청크를 생성합니다.

```python
separators = [
    '\n\n',      # 문단 분리
    '.\n',       # 문장 끝 + 줄바꿈
    '. ',        # 문장 끝
    '\n',        # 줄바꿈
    '! ',        # 감탄문
    '? ',        # 의문문
]
```

## 보안 고려사항

**파일 업로드 검증**: MIME 타입 검사와 파일 크기 제한으로 악성 파일 업로드를 방지합니다.

**인증 통합**: Supabase Auth를 통한 OAuth 인증으로 보안과 사용자 경험을 모두 확보합니다.

**CORS 정책**: 명시적인 CORS 설정으로 프론트엔드-백엔드 간 안전한 통신을 보장합니다.

## 확장성 설계

**마이크로서비스 아키텍처**: 각 컴포넌트가 독립적으로 확장 가능하도록 설계되어 트래픽 증가에 대응할 수 있습니다.

**데이터베이스 파티셔닝**: user_id 기반 데이터 분할이 가능하도록 스키마가 설계되었습니다.

**CDN 호환성**: 정적 파일과 API 엔드포인트가 분리되어 CDN 배포에 최적화되어 있습니다.

이러한 기술적 구현을 통해 PDF 문서와의 자연스러운 대화가 가능한 고성능 RAG 시스템을 구축했습니다.