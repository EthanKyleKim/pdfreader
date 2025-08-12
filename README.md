## 📚 PDF Reader RAG (Next.js + FastAPI + Chroma + Ollama)

PDF를 업로드하고 검색 증강 생성(RAG)으로 질문에 답하는 로컬 개발용 데모입니다. 프론트엔드는 Next.js(App Router), 백엔드는 FastAPI로 구성되어 있으며, PDF → Markdown 변환, 텍스트 청크 분할, 임베딩 생성, ChromaDB 저장, Ollama LLM 호출까지의 엔드투엔드 흐름을 제공합니다.

### 핵심 기능
- **PDF 인덱싱**: PDF → Markdown → 청크 → 임베딩 → ChromaDB 영속 저장
- **질의응답**: 질문 임베딩 → 유사도 검색 → 컨텍스트 기반 LLM 응답
- **로컬 실행**: Node + Python 환경에서 동시에 개발 서버 실행(`npm run dev`)

---

## 🔧 요구 사항
- Node.js 18+ (권장 20+)
- Python 3.9+
- Ollama(로컬 LLM) 설치 및 실행 가능 상태

---

## 🗂️ 프로젝트 구조(주요 파일)
```
pdfreader/
├─ backend/
│  ├─ main.py                  # FastAPI 서버: /ingest, /ask
│  └─ chroma/                  # ChromaDB 영속 데이터 디렉터리(자동 생성)
├─ src/
│  └─ app/
│     ├─ api/
│     │  ├─ ingest/route.ts    # Next API → FastAPI /ingest 프록시
│     │  └─ ask/route.ts       # Next API → FastAPI /ask 프록시
│     └─ page.tsx              # 업로드/질문 UI
└─ .env.local                  # NEXT_PUBLIC_BACKEND_URL
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
python -m pip install -U pip
python -m pip install fastapi uvicorn pymupdf4llm "sentence-transformers<3" "chromadb>=0.5.0" langchain-text-splitters requests pydantic-settings python-multipart
```

### 2) 환경 변수
프론트엔드가 백엔드(FastAPI)를 프록시하기 위해 다음 파일을 생성합니다.

```
.env.local
```

내용:
```bash
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

선택(백엔드 환경 변수):
- `EMBED_MODEL_NAME`(기본: `sentence-transformers/all-MiniLM-L6-v2`)
- `OLLAMA_URL`(기본: `http://127.0.0.1:11434`)
- `OLLAMA_MODEL`(기본: `exaone3.5:7.8b`)

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
- 업로드: PDF → `pymupdf4llm.to_markdown()` → `RecursiveCharacterTextSplitter`로 청크 → `SentenceTransformer` 임베딩 → `Chroma` 저장(경로: `backend/chroma/`)
- 검색/생성: 질문 임베딩 → Chroma 유사도 검색 → 컨텍스트+질문으로 프롬프트 생성 → Ollama `OLLAMA_MODEL` 호출 → 답변 반환

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
1. PDF 파일 선택 후 “PDF 인덱싱” 클릭 → 인덱싱 완료 알림 확인
2. 질문 입력 후 “질문하기” 클릭 → 컨텍스트 기반 답변 표시

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
- Chroma 초기화가 필요하면 `backend/chroma/` 폴더를 삭제하세요.
- LLM 모델/엔드포인트 변경은 `OLLAMA_URL`, `OLLAMA_MODEL`로 설정하세요.
- npm 캐시 권한 문제 시: `npm install --cache "$(pwd)/.npm-cache" --no-audit --no-fund`
- 질문 누락 시: `/api/ask`는 `question` 필드가 필수입니다.

---

## 📄 라이선스
이 리포지토리는 개인 학습/실험 목적의 예제입니다. 별도 라이선스 명시 전까지는 상업적 사용 전 문의를 권장합니다.

