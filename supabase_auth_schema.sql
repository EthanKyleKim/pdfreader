-- Supabase Auth + 채팅 시스템을 위한 스키마
-- Supabase SQL Editor에서 실행

-- 1. 기존 pgvector 확장 확인 (이미 있으면 skip)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 채팅 세션 테이블 (사용자별)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 채팅 메시지 테이블
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sources JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 사용자별 업로드 문서 정보
CREATE TABLE IF NOT EXISTS user_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    doc_id TEXT NOT NULL, -- document_chunks와 연결되는 ID
    chunks_count INTEGER NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 기존 document_chunks 테이블에 user_id 컬럼 추가 (이미 있는 경우)
-- ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 6. Row Level Security (RLS) 활성화

-- 채팅 세션 RLS
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sessions"
ON chat_sessions FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 채팅 메시지 RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own messages"
ON chat_messages FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 사용자 문서 RLS
ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own documents"
ON user_documents FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 기존 document_chunks에도 RLS 적용 (user_id 컬럼이 있는 경우)
-- ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can access their own chunks"
-- ON document_chunks FOR ALL
-- USING (auth.uid() = user_id)
-- WITH CHECK (auth.uid() = user_id);

-- 7. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_session_id ON user_documents(session_id);

-- 8. updated_at 자동 업데이트 함수 (이미 있으면 skip)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 9. 채팅 세션 updated_at 자동 업데이트 트리거
DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 10. 유틸리티 함수: 사용자의 최근 채팅 세션 가져오기
CREATE OR REPLACE FUNCTION get_user_recent_sessions(user_uuid UUID, limit_count INT DEFAULT 10)
RETURNS TABLE (
    id UUID,
    title TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    message_count BIGINT,
    last_message_content TEXT
)
LANGUAGE SQL STABLE
AS $$
    SELECT
        cs.id,
        cs.title,
        cs.created_at,
        cs.updated_at,
        COUNT(cm.id) as message_count,
        (
            SELECT content
            FROM chat_messages
            WHERE session_id = cs.id
            ORDER BY created_at DESC
            LIMIT 1
        ) as last_message_content
    FROM chat_sessions cs
    LEFT JOIN chat_messages cm ON cs.id = cm.session_id
    WHERE cs.user_id = user_uuid
    GROUP BY cs.id, cs.title, cs.created_at, cs.updated_at
    ORDER BY cs.updated_at DESC
    LIMIT limit_count;
$$;