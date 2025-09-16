## 📚 PDF Reader RAG (Next.js + FastAPI + Supabase + Ollama)

PDF를 업로드하고 검색 증강 생성(RAG)으로 질문에 답하는 클라우드 기반 데모입니다. 프론트엔드는 Next.js(App Router), 백엔드는 FastAPI로 구성되어 있으며, PDF → Markdown 변환, 텍스트 청크 분할, 임베딩 생성, Supabase pgvector 저장, Ollama LLM 호출까지의 엔드투엔드 흐름을 제공합니다.

### 핵심 기능
- **PDF 인덱싱**: PDF → Markdown → 청크 → 임베딩 → Supabase pgvector 저장
- **질의응답**: 질문 임베딩 → 벡터 유사도 검색 → 컨텍스트 기반 LLM 응답
- **하이브리드 실행**: 로컬 LLM + 클라우드 벡터DB로 확장성과 성능 최적화

---

## 🔧 요구 사항
- Node.js 18+ (권장 20+)
- Python 3.9+
- Supabase 프로젝트 (무료 tier 가능)
- Ollama(로컬 LLM) 설치 및 실행 가능 상태

---

## 🗂️ 프로젝트 구조(주요 파일)
```
pdfreader/
├─ backend/
│  └─ main.py                  # FastAPI 서버: /ingest, /ask
├─ src/
│  └─ app/
│     ├─ api/
│     │  ├─ ingest/route.ts    # Next API → FastAPI /ingest 프록시
│     │  └─ ask/route.ts       # Next API → FastAPI /ask 프록시
│     └─ page.tsx              # 업로드/질문 UI
├─ supabase_schema.sql         # Supabase DB 스키마
├─ requirements.txt            # Python 의존성
└─ .env.example                # 환경변수 템플릿
```

---

## ⚙️ 설치

### 1) 저장소 클론 및 의존성 설치
```bash
git clone <REPO_URL> pdfreader
cd pdfreader

# Node 의존성
npm install

# Python 가상환경 및 패키지
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

### 2) Supabase 설정
1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `supabase_schema.sql` 실행하여 테이블 및 함수 생성
3. Project Settings → API에서 URL과 anon key 확인

### 3) 환경 변수 설정
`.env.example`을 복사하여 `.env` 파일 생성:

```bash
cp .env.example .env
```

`.env` 파일 내용 수정:
```bash
# Supabase Configuration (필수)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# Embedding Model (선택)
EMBED_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2

# Ollama Configuration (선택)
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=exaone3.5:7.8b
```

프론트엔드용 `.env.local` 파일도 생성:
```bash
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

---

## ▶️ 실행

### 한 번에 실행(프론트+백엔드)
```bash
npm run dev
```

### 각각 실행
```bash
# 백엔드(FastAPI)
. .venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000

# 프론트(Next.js)
npm run dev:web
```

브라우저에서 `http://localhost:3000` 접속.

---

## 🧠 동작 방식
- **업로드**: PDF → `pymupdf4llm.to_markdown()` → `RecursiveCharacterTextSplitter`로 청크 → `SentenceTransformer` 임베딩 → Supabase `document_chunks` 테이블에 저장
- **검색/생성**: 질문 임베딩 → Supabase pgvector 코사인 유사도 검색 → 컨텍스트+질문으로 프롬프트 생성 → Ollama `OLLAMA_MODEL` 호출 → 답변 반환

---

## 🔌 API 요약

### FastAPI (백엔드)
- `POST /ingest`
  - 멀티파트 필드 이름: `file` (PDF)
  - 반환: `{ ok: boolean, doc_id: string, chunks: number }`
- `POST /ask`
  - 본문: `{ question: string, top_k?: number }`
  - 반환: `{ ok: boolean, answer?: string, contexts?: string[], metadatas?: any[], model?: string, reason?: string }`

### Next.js API (프록시)
- `POST /api/ingest` → FastAPI `/ingest`
- `POST /api/ask` → FastAPI `/ask`

---

## 🖥️ 사용 방법(웹 UI)
1. PDF 파일 선택 후 "PDF 인덱싱" 클릭 → 인덱싱 완료 알림 확인
2. 질문 입력 후 "질문하기" 클릭 → 컨텍스트 기반 답변 표시

---

## 🧪 스크립트
```bash
npm run dev        # 웹+API 동시 실행(concurrently)
npm run dev:web    # 웹만 실행
npm run dev:api    # API만 실행
npm run build      # Next 빌드
npm run start      # Next 프로덕션 실행
npm run stop       # 포트 3000/3001/8000 프로세스 종료 도우미
```

---

## 🛠️ 트러블슈팅
- **Supabase 연결 오류**: `SUPABASE_URL`과 `SUPABASE_ANON_KEY` 환경변수 확인
- **pgvector 확장 오류**: Supabase SQL Editor에서 `CREATE EXTENSION vector;` 실행
- **벡터 검색 결과 없음**: `match_threshold` 값을 낮춰서 더 많은 결과 확인
- **LLM 모델/엔드포인트 변경**: `OLLAMA_URL`, `OLLAMA_MODEL`로 설정
- **npm 캐시 권한 문제**: `npm install --cache "$(pwd)/.npm-cache" --no-audit --no-fund`

---

## 🚀 ChromaDB에서 마이그레이션한 경우
이전에 ChromaDB를 사용하던 프로젝트라면:
1. 기존 `backend/chroma/` 디렉터리 삭제 가능
2. PDF 파일들을 다시 인덱싱 필요 (기존 데이터는 Supabase로 자동 이전되지 않음)
3. 성능 향상: 클라우드 기반 확장성과 관계형 데이터 통합 가능

---

## 📄 라이선스
이 리포지토리는 개인 학습/실험 목적의 예제입니다. 별도 라이선스 명시 전까지는 상업적 사용 전 문의를 권장합니다.