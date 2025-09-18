# PDF RAG 챗봇 설정 가이드 (JavaScript Edition)

## 🚀 시스템 개요

PDF RAG 챗봇은 순수 JavaScript 기반으로 다음과 같은 기능을 제공합니다:

- **사용자 인증**: Supabase OAuth (Google, GitHub)
- **PDF 업로드 및 인덱싱**: JavaScript 기반 실시간 PDF 처리
- **임베딩 생성**: Transformers.js를 이용한 브라우저/서버 임베딩
- **대화형 인터페이스**: 채팅 기록 저장 및 관리
- **SSE 스트리밍**: 실시간 응답 생성
- **벡터 검색**: Supabase pgvector 기반 유사도 검색

## 📋 필수 요구사항

### 1. 시스템 요구사항
- Node.js 18+ 및 npm
- Supabase 프로젝트
- Ollama 서버 (로컬)
- 인터넷 연결 (Transformers.js 모델 다운로드용)

### 2. 외부 서비스
- **Supabase**: 데이터베이스 및 인증
- **Ollama**: LLM 추론 엔진
- **Google/GitHub OAuth**: 소셜 로그인
- **HuggingFace Hub**: 임베딩 모델 다운로드

## 🛠 설치 및 설정

### 1단계: Supabase 프로젝트 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 다음 스키마 실행:

```bash
# 인증 및 채팅 스키마
psql -h your-db-host -p 5432 -U postgres -d postgres < supabase_auth_schema.sql

# 기본 문서 청크 스키마 (기존에 없는 경우)
psql -h your-db-host -p 5432 -U postgres -d postgres < supabase_schema.sql
```

3. Authentication > Providers에서 Google/GitHub OAuth 설정
4. API 키 확인: Settings > API

### 2단계: 환경 변수 설정

#### `.env` (백엔드)
```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here

# Ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=exaone3.5:7.8b

# Embedding Model
EMBED_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
```

#### `.env.local` (프론트엔드)
```bash
# Backend URL
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 3단계: Ollama 설치 및 모델 다운로드

```bash
# Ollama 설치 (macOS)
brew install ollama

# 또는 공식 웹사이트에서 다운로드
# https://ollama.com

# Ollama 서버 시작
ollama serve

# 모델 다운로드 (별도 터미널)
ollama pull exaone3.5:7.8b
```

### 4단계: Node.js 패키지 설치

```bash
npm install
```

## 🏃 실행 방법

### 개발 환경
```bash
# Next.js 개발 서버 시작
npm run dev
```

### 프로덕션 빌드
```bash
npm run build
npm run start
```

## 🔧 트러블슈팅

### 1. "No such file or directory: .venv/bin/python"
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. "SUPABASE_URL 환경변수 필요"
- `.env` 파일에 올바른 Supabase 설정 확인
- Supabase 프로젝트에서 API 키 재확인

### 3. "Failed to insert chunks into database"
```sql
-- Supabase SQL Editor에서 실행
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. OAuth 로그인 실패
- Supabase Authentication > Providers 설정 확인
- 리디렉션 URL: `http://localhost:3000/auth/callback`
- Google/GitHub OAuth 앱 설정 확인

### 5. Ollama 연결 오류
```bash
# Ollama 서버 상태 확인
curl http://127.0.0.1:11434/api/tags

# 모델 존재 확인
ollama list
```

### 6. 채팅 세션 로드 실패
```sql
-- get_user_recent_sessions 함수 존재 확인
SELECT proname FROM pg_proc WHERE proname = 'get_user_recent_sessions';
```

## 📚 API 엔드포인트

### FastAPI 백엔드 (포트 8000)
- `POST /ingest`: PDF 파일 업로드 및 인덱싱
- `POST /ask`: 단일 질문-답변
- `POST /ask-stream`: SSE 스트리밍 응답

### Next.js API (포트 3000)
- `POST /api/ingest`: 백엔드 프록시
- `POST /api/ask`: 백엔드 프록시
- `GET /api/ask-stream`: SSE 스트리밍 프록시

## 🔒 보안 설정

### Supabase RLS (Row Level Security)
```sql
-- 사용자별 데이터 격리
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;
```

### OAuth 설정
- **Google**: [Google Cloud Console](https://console.cloud.google.com)
- **GitHub**: [GitHub Developer Settings](https://github.com/settings/developers)

## 📖 사용 방법

1. **로그인**: Google 또는 GitHub 계정으로 로그인
2. **새 채팅**: 좌측 상단 "새 채팅" 버튼 클릭
3. **PDF 업로드**: 하단 입력창의 📎 아이콘으로 PDF 업로드
4. **질문하기**: 업로드 후 PDF에 대해 질문
5. **채팅 관리**: 좌측 사이드바에서 이전 대화 확인

## ⚡ 성능 최적화

### 임베딩 모델 변경
```bash
# .env 파일에서 변경
EMBED_MODEL_NAME=sentence-transformers/all-mpnet-base-v2  # 더 정확한 모델
```

### Supabase 인덱스 최적화
```sql
-- 벡터 검색 성능 향상
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);
```

### 메모리 사용량 최적화
```python
# backend/main.py에서 청크 크기 조정
splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
```

## 🎯 다음 단계

- [ ] 사용자별 PDF 필터링 구현
- [ ] 채팅 세션 제목 자동 생성 개선
- [ ] 파일 타입 지원 확장 (DOCX, TXT 등)
- [ ] 다국어 지원
- [ ] 모바일 반응형 개선

## 💬 지원

문제 발생 시:
1. 로그 확인: 브라우저 개발자 도구 콘솔
2. 백엔드 로그: FastAPI 터미널 출력
3. Supabase 대시보드: 테이블 데이터 확인
4. Issue 등록: GitHub 저장소

---

🎉 **축하합니다!** PDF RAG 챗봇이 성공적으로 설정되었습니다.