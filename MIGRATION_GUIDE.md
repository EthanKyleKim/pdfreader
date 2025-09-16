# ChromaDB → Supabase 마이그레이션 가이드

이 문서는 기존 ChromaDB 기반 RAG 시스템을 Supabase pgvector로 마이그레이션하는 과정을 설명합니다.

## 🔄 마이그레이션 완료 항목

### ✅ 1. 데이터베이스 스키마 변경
- **이전**: ChromaDB (로컬 영속 저장소)
- **이후**: Supabase pgvector (클라우드 PostgreSQL)
- **파일**: `supabase_schema.sql` 생성

### ✅ 2. Python 의존성 업데이트
- **제거**: `chromadb`
- **추가**: `supabase>=2.0.0`, `python-dotenv`
- **파일**: `requirements.txt` 생성

### ✅ 3. 백엔드 코드 리팩터링
- **파일**: `backend/main.py`
- **변경사항**:
  - ChromaDB 클라이언트 → Supabase 클라이언트
  - `collection.add()` → `supabase.table().insert()`
  - `collection.query()` → `supabase.rpc('search_document_chunks')`
  - 에러 핸들링 개선 (HTTPException 추가)

### ✅ 4. 환경 변수 설정
- **추가**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- **파일**: `.env.example` 생성
- **제거**: `PERSIST_DIR`, `COLLECTION_NAME` 관련 코드

### ✅ 5. 문서 업데이트
- **파일**: `README.md`
- **변경사항**:
  - Supabase 설정 가이드 추가
  - ChromaDB 관련 내용 제거
  - 새로운 설치/실행 가이드

## 🚀 설정 방법

### 1. Supabase 프로젝트 생성
1. [Supabase](https://supabase.com) 방문
2. 새 프로젝트 생성
3. Project Settings → API에서 URL과 anon key 확인

### 2. 데이터베이스 스키마 설정
```sql
-- Supabase SQL Editor에서 실행
\i supabase_schema.sql
```

### 3. 환경 변수 설정
```bash
# .env 파일 생성
cp .env.example .env

# Supabase 정보 입력
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. 새 의존성 설치
```bash
. .venv/bin/activate
pip install -r requirements.txt
```

## 📊 성능 및 기능 개선사항

### 성능 향상
- **벡터 검색 속도**: pgvector HNSW 인덱스로 대규모 벡터 검색 최적화
- **동시성**: PostgreSQL 기반으로 다중 사용자 지원
- **확장성**: 클라우드 인프라로 자동 스케일링

### 새로운 기능
- **유사도 점수**: 검색 결과에 코사인 유사도 점수 포함
- **메타데이터 검색**: JSONB 필드로 복잡한 메타데이터 쿼리 지원
- **관계형 데이터**: 벡터 데이터와 구조화된 데이터 통합 관리

### 운영 개선
- **백업**: Supabase 자동 백업 및 복구
- **모니터링**: 내장 대시보드로 성능 모니터링
- **보안**: Row Level Security (RLS) 지원

## ⚠️ 주의사항

### 기존 데이터
- **자동 마이그레이션 없음**: 기존 ChromaDB 데이터는 자동으로 이전되지 않습니다
- **재인덱싱 필요**: PDF 파일들을 다시 업로드하여 인덱싱해야 합니다
- **데이터 삭제**: `backend/chroma/` 디렉터리는 안전하게 삭제 가능합니다

### 네트워크 의존성
- **인터넷 연결 필요**: 로컬 DB에서 클라우드 DB로 변경
- **지연 시간**: 네트워크 지연으로 인한 응답 시간 증가 가능
- **API 제한**: Supabase 무료 tier 제한 확인 필요

## 🔧 트러블슈팅

### 연결 오류
```python
ValueError: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required
```
→ `.env` 파일에 Supabase 정보 확인

### 벡터 검색 오류
```python
{"ok": false, "reason": "No relevant documents found"}
```
→ `match_threshold` 값을 0.1로 낮춰서 테스트

### pgvector 확장 오류
```sql
ERROR: extension "vector" is not available
```
→ Supabase SQL Editor에서 `CREATE EXTENSION vector;` 실행

## 🎯 다음 단계 권장사항

### 단기 개선
1. **배치 삽입**: 대량 청크 삽입 시 배치 처리 구현
2. **연결 풀링**: Supabase 연결 풀 설정으로 성능 개선
3. **캐싱**: 자주 사용되는 쿼리 결과 캐싱

### 장기 확장
1. **사용자 인증**: Supabase Auth 연동으로 멀티 테넌트 지원
2. **파일 저장**: Supabase Storage로 PDF 원본 파일 관리
3. **실시간 업데이트**: Supabase Realtime으로 실시간 검색 결과 업데이트