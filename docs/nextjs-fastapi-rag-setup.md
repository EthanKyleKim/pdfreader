## Next.js + FastAPI + Chroma + Ollama(DeepSeek R1 7B)로 PDF RAG 파이프라인 구축기

이 글은 Next.js 프론트엔드와 Python(FastAPI) 백엔드로 구성된 PDF 기반 RAG 파이프라인을 로컬에서 동작시키기 위해 진행한 작업을 정리합니다. `pymupdf4llm`로 PDF를 Markdown으로 변환하고, `RecursiveCharacterTextSplitter`로 청크 분할, `SentenceTransformer` 임베딩과 `ChromaDB` 저장, 그리고 Ollama에서 구동 중인 `deepseek-r1:7b` 모델로 답변을 생성하는 전체 플로우를 담았습니다.

### 왜 이렇게 구성했나
- **분리된 책임**: PDF 파싱, 임베딩, 벡터DB는 Python 생태계가 안정적이므로 FastAPI로 처리. 프론트는 Next.js로 UI와 API 프록시만 담당.
- **유연성**: 임베딩 모델, 파라미터, 저장소 구조를 Python에서 쉽게 교체/튜닝.
- **간단한 개발 경험**: 프론트는 `/api/*`로 프록시하여 CORS/보안 이슈 최소화.

---

## 구성 요소 개요
- **프론트엔드**: Next.js(App Router, TypeScript, Tailwind). 업로드/질문 UI와 Next.js API 프록시(`/api/ingest`, `/api/ask`).
- **백엔드**: FastAPI.
  - PDF → Markdown: `pymupdf4llm`
  - 텍스트 청크: `RecursiveCharacterTextSplitter(chunk_size=1000, overlap=200)`
  - 임베딩: `SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")`
  - 벡터DB: Chroma Persistent(`backend/chroma/`)
  - 질의응답: 쿼리 임베딩 → Chroma 유사도 검색 → 컨텍스트+질문을 Ollama `deepseek-r1:7b`에 전달
- **LLM**: Ollama 로컬 서버(`http://127.0.0.1:11434`), 모델 `deepseek-r1:7b`.

---

## 개발 환경
- macOS: darwin 24.5.0
- Node/Next.js: Next.js 15.4.6 (App Router, TypeScript)
- Python: `.venv` 가상환경(프로젝트 루트)
- Ollama: `deepseek-r1:7b` 설치 및 로컬 구동

---

## 프로젝트 구조(중요 파일)
```
pdfreader/
├─ backend/
│  ├─ main.py                  # FastAPI 서버: /ingest, /ask
│  └─ chroma/                  # ChromaDB 영속 데이터 디렉토리(자동 생성)
├─ src/
│  └─ app/
│     ├─ api/
│     │  ├─ ingest/route.ts    # Next API → FastAPI /ingest 프록시
│     │  └─ ask/route.ts       # Next API → FastAPI /ask 프록시
│     └─ page.tsx              # 업로드/질문 UI
└─ .env.local                  # NEXT_PUBLIC_BACKEND_URL
```

---

## 백엔드(FastAPI) 구현 요약
- 파일: `backend/main.py`
- 핵심 포인트:
  - `POST /ingest`: PDF 업로드 → Markdown 변환 → 청크 분할 → 임베딩 → Chroma 저장
  - `POST /ask`: 질문 임베딩 → Chroma 유사도 검색 → 컨텍스트+질문으로 Ollama에 프롬프트 → 답변 반환
  - 영속 저장소: `backend/chroma/` 디렉터리
  - 기본 임베딩 모델: `sentence-transformers/all-MiniLM-L6-v2`
  - Ollama 기본 주소/모델: `http://127.0.0.1:11434`, `deepseek-r1:7b`

환경변수(선택):
- `EMBED_MODEL_NAME`: 임베딩 모델 교체용
- `OLLAMA_URL`: Ollama 서버 주소
- `OLLAMA_MODEL`: 사용할 모델명

가상환경/패키지 설치:
```bash
cd /Users/ethankim/Documents/PersonalProject/pdfreader
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -U pip
python -m pip install fastapi uvicorn pymupdf4llm "sentence-transformers<3" "chromadb>=0.5.0" langchain-text-splitters requests pydantic-settings python-multipart
```

개발 서버 실행:
```bash
. .venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```

---

## 프론트엔드(Next.js) 프록시/API
- 파일: `src/app/api/ingest/route.ts`
  - 클라이언트 업로드 파일을 FormData로 FastAPI `/ingest`에 전달
- 파일: `src/app/api/ask/route.ts`
  - JSON 요청 `{ question, top_k }`를 FastAPI `/ask`로 전달
  - ESLint 룰 준수(명시적 any 제거)

환경변수:
- `.env.local`: `NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000`

빌드/검증:
```bash
npm run build
npm run dev
```

---

## UI(간단 데모)
- 파일: `src/app/page.tsx`
  - PDF 업로드 버튼과 “PDF 인덱싱” 버튼
  - 질문 입력란과 “질문하기” 버튼
  - 응답 영역에 Ollama 생성 답변 출력

사용 흐름:
1) PDF 업로드 → “PDF 인덱싱” 클릭 → 백엔드에서 파싱/청크/임베딩/Chroma 저장 완료 알림
2) 질문 입력 → “질문하기” 클릭 → 컨텍스트 검색 후 DeepSeek R1 7B로 답변 생성

---

## 현재 프로젝트 동작 방식(런타임 플로우)
- 실행 시나리오(권장): `npm run dev`를 실행하면 다음 두 프로세스가 동시에 뜹니다.
  - **웹(Next.js)**: 개발 서버(`next dev`)로 프론트 UI와 `app/api/*` 프록시 라우트를 제공
  - **API(FastAPI)**: `uvicorn backend.main:app`으로 실제 RAG 처리(파싱·임베딩·검색·LLM 호출)를 담당

- 사용자 흐름(요청/응답)
  1) 사용자가 브라우저에서 PDF 업로드 → 프론트가 Next API(`/api/ingest`)로 전송
  2) Next API가 FastAPI의 `/ingest`로 그대로 프록시(멀티파트)
  3) FastAPI `/ingest` 내부 동작:
     - `pymupdf4llm.to_markdown()`으로 PDF → Markdown 변환
     - `RecursiveCharacterTextSplitter`로 텍스트 청크(기본 1000/overlap 200)
     - `SentenceTransformer`로 각 청크 임베딩 생성
     - `Chroma` 컬렉션에 `{ids, documents, embeddings, metadatas}` 저장(영속 디렉터리: `backend/chroma/`)
  4) 사용자가 질문 입력 → 프론트가 Next API(`/api/ask`)로 전송
  5) Next API가 FastAPI `/ask`로 JSON 프록시
  6) FastAPI `/ask` 내부 동작:
     - 질문 임베딩 생성 → `Chroma` 유사도 검색(top_k)
     - 상위 청크들을 컨텍스트로 묶어 프롬프트 생성
     - Ollama(`deepseek-r1:7b`)에 프롬프트 전달 → 응답을 받아 프론트로 반환

- 환경변수 및 구성 포인트
  - `NEXT_PUBLIC_BACKEND_URL`: Next API가 프록시할 FastAPI 주소(기본 `http://127.0.0.1:8000`)
  - `EMBED_MODEL_NAME`(선택): 임베딩 모델 교체
  - `OLLAMA_URL`/`OLLAMA_MODEL`(선택): LLM 엔드포인트·모델 교체

---

## 실행 순서
1. Ollama 서버 확인 및 모델 준비
```bash
# 모델이 없다면
ollama pull deepseek-r1:7b
# 서버 실행(필요 시)
OLLAMA_HOST=127.0.0.1:11434 ollama serve
```
2. FastAPI 실행
```bash
cd /Users/ethankim/Documents/PersonalProject/pdfreader
. .venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```
3. Next.js 실행
```bash
cd /Users/ethankim/Documents/PersonalProject/pdfreader
npm run dev
```
4. 브라우저 접속: `http://localhost:3000`

---

## 런타임 운영/관리(한 번에 켜고 끄기)
- 동시에 실행(프론트+백엔드)
```bash
npm run dev
```
- 각각 실행
```bash
npm run dev:web
npm run dev:api
```
- 동시에 종료(포트 3000/3001/8000 대상)
```bash
npm run stop
```
- 포트 충돌 시(예: 8000 점유) 수동 정리
```bash
kill -TERM $(lsof -ti tcp:8000) 2>/dev/null || true
kill -KILL $(lsof -ti tcp:8000) 2>/dev/null || true
```

---

## 트러블슈팅 메모
- **npm 캐시 권한 오류(EACCES)**: 전역 캐시 권한 문제로 설치 중단될 수 있음. 로컬 캐시 경로를 지정해 해결.
  - 예: `npm install --cache "$(pwd)/.npm-cache" --no-audit --no-fund`
- **ESLint any 사용 오류**: `src/app/api/ask/route.ts`의 `any` 제거 후 타입 안전하게 파싱.
- **대형 패키지(토치/onnxruntime) 설치 지연**: 설치 시간이 오래 걸릴 수 있음(첫 설치만). 네트워크/디스크 속도에 따라 차이.
- **Chroma 초기화**: DB를 초기화하려면 `backend/chroma/` 폴더 삭제.
- **임베딩 모델 교체**: 한국어 성능 향상이 필요하면 `intfloat/multilingual-e5-base` 등으로 교체 후 재인덱싱 권장.

---

## 커스터마이징 포인트
- **청크 파라미터**: `chunk_size`, `chunk_overlap` 조정으로 검색 품질/속도 균형 조절
- **프롬프트 템플릿**: 컨텍스트 사용 지침, 출력 형식, 언어 스타일 등 세부 제어
- **스트리밍 응답**: Ollama의 스트리밍 API 사용해 점진적 렌더링
- **근거 노출**: 선택된 컨텍스트(출처/페이지 등)를 UI에 함께 표시
- **임베딩/리랭킹**: e5/multilingual/e5-large, Cohere Rerank 등으로 품질 개선

---

## 작업 요약(이 글에서 수행한 변경 사항)
- **백엔드 추가**: `backend/main.py` (FastAPI, pymupdf4llm, SentenceTransformer, Chroma, Ollama 호출)
- **프론트 프록시 라우트**: `src/app/api/ingest/route.ts`, `src/app/api/ask/route.ts`
- **UI 교체**: `src/app/page.tsx` (업로드/질문 데모)
- **환경 변수**: `.env.local`에 `NEXT_PUBLIC_BACKEND_URL` 설정
- **빌드 검증**: ESLint 수정 후 `npm run build` 성공

---

## 마치며
본 구성을 통해 로컬 환경에서 빠르게 PDF 기반 RAG 파이프라인을 실험할 수 있습니다. 백엔드 파라미터와 임베딩 모델, 프롬프트를 점진적으로 개선해 품질을 끌어올리면 실서비스에도 적용 가능한 형태로 확장할 수 있습니다.
