-- Supabase pgvector setup for PDF RAG
-- Run this in your Supabase SQL Editor

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(384), -- all-MiniLM-L6-v2 dimension
    metadata JSONB DEFAULT '{}',
    source_name TEXT,
    chunk_index INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON document_chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_created_at ON document_chunks(created_at);

-- Create vector similarity search index (HNSW for cosine similarity)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Optional: Create RLS policies if you plan to use authentication
-- ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_document_chunks_updated_at ON document_chunks;
CREATE TRIGGER update_document_chunks_updated_at
    BEFORE UPDATE ON document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Optional: Function for vector similarity search
CREATE OR REPLACE FUNCTION search_document_chunks(
    query_embedding VECTOR(384),
    match_threshold FLOAT DEFAULT 0.8,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id TEXT,
    doc_id TEXT,
    content TEXT,
    metadata JSONB,
    source_name TEXT,
    chunk_index INTEGER,
    similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
    SELECT
        document_chunks.id,
        document_chunks.doc_id,
        document_chunks.content,
        document_chunks.metadata,
        document_chunks.source_name,
        document_chunks.chunk_index,
        1 - (document_chunks.embedding <=> query_embedding) AS similarity
    FROM document_chunks
    WHERE 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
    ORDER BY document_chunks.embedding <=> query_embedding
    LIMIT match_count;
$$;