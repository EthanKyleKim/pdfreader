# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a PDF RAG (Retrieval-Augmented Generation) system with a unique hybrid architecture:
- **Frontend**: Next.js 15 with App Router and TypeScript
- **Backend**: FastAPI with Python serving /ingest and /ask endpoints
- **Vector DB**: Supabase with pgvector extension for embeddings storage
- **LLM**: Local Ollama server for text generation
- **Proxy Pattern**: Next.js API routes (`/api/ingest`, `/api/ask`) proxy to FastAPI

## Development Commands

### Primary Development
```bash
npm run dev          # Start both frontend and backend concurrently
npm run dev:web      # Start only Next.js frontend
npm run dev:api      # Start only FastAPI backend
npm run stop         # Kill all development servers (ports 3000,3001,8000)
```

### Python Environment Setup
```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

### Build and Production
```bash
npm run build        # Build Next.js for production
npm run start        # Start Next.js production server
npm run lint         # Run ESLint
```

## Architecture and Data Flow

### Core Components
1. **Frontend UI** (`src/app/page.tsx`) - PDF upload and Q&A interface
2. **Next.js API Proxy** (`src/app/api/`) - CORS-safe proxy to FastAPI
3. **FastAPI Backend** (`backend/main.py`) - PDF processing and vector operations
4. **Supabase Database** - pgvector storage with `document_chunks` table

### Request Flow
1. **PDF Ingestion**: Browser → `/api/ingest` → FastAPI `/ingest` → PDF→Markdown→Chunks→Embeddings → Supabase
2. **Q&A**: Browser → `/api/ask` → FastAPI `/ask` → Vector Search → Ollama LLM → Response

### Key Implementation Details
- **PDF Processing**: Uses `pymupdf4llm.to_markdown()` for conversion
- **Text Chunking**: `RecursiveCharacterTextSplitter` with 1000 char chunks, 200 overlap
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions)
- **Vector Search**: Supabase RPC function `search_document_chunks` with cosine similarity
- **LLM Integration**: Direct HTTP calls to Ollama `/api/generate` endpoint

## Environment Configuration

### Required Files
- `.env` - Backend configuration (Supabase, Ollama, embedding model)
- `.env.local` - Frontend configuration (backend URL)

### Critical Environment Variables
```bash
# .env (required for backend)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key

# .env.local (required for frontend)
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

### Supabase Setup Requirements
1. Create Supabase project
2. Run `supabase_schema.sql` in SQL Editor to create:
   - `document_chunks` table with vector column
   - `search_document_chunks` RPC function
   - pgvector extension and HNSW index

## Common Issues and Solutions

### "No such file or directory: .venv/bin/python"
- Python virtual environment missing
- Run: `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`

### "SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required"
- Missing or invalid `.env` file
- Copy `.env.example` to `.env` and fill in real Supabase credentials

### 500 errors on /ingest or /ask endpoints
- Supabase connection issues (check credentials)
- Missing `document_chunks` table (run `supabase_schema.sql`)
- pgvector extension not enabled (run `CREATE EXTENSION vector;`)

### Frontend can't reach backend
- Missing `.env.local` file
- Backend not running (check `npm run dev` starts both services)
- Port conflicts (use `npm run stop` to clean up)

## Development Notes

### Concurrency Pattern
The project uses `concurrently` to run both Next.js and FastAPI simultaneously. Both must be running for full functionality.

### API Contract Preservation
When modifying backend endpoints, maintain the existing response format:
- `/ingest`: `{ ok: boolean, doc_id: string, chunks: number }`
- `/ask`: `{ ok: boolean, answer?: string, contexts?: string[], metadatas?: any[], model?: string, reason?: string }`

### Vector Dimension Consistency
The embedding model produces 384-dimensional vectors. If changing models, update the Supabase schema `VECTOR(384)` accordingly.

### Error Handling Strategy
- FastAPI uses HTTPException with detailed error messages
- Next.js API routes proxy errors with appropriate status codes
- Frontend should handle both network and application errors gracefully