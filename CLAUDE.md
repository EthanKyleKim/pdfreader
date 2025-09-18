# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a PDF RAG (Retrieval-Augmented Generation) system with a modern JavaScript-first architecture:
- **Frontend**: Next.js 15 with App Router and TypeScript
- **Backend**: Next.js API routes with server-side processing
- **PDF Processing**: JavaScript-based with pdf-parse library
- **Embeddings**: Transformers.js with Xenova/all-MiniLM-L6-v2 model
- **Vector DB**: Supabase with pgvector extension for embeddings storage
- **LLM**: Local Ollama server for text generation
- **Authentication**: Supabase OAuth (Google, GitHub)

## Development Commands

### Development
```bash
npm run dev          # Start Next.js development server
npm run build        # Build Next.js for production
npm run start        # Start Next.js production server
npm run lint         # Run ESLint
```

### Package Management
```bash
npm install          # Install all dependencies
```

## Architecture and Data Flow

### Core Components
1. **Frontend UI** (`src/app/page.tsx`) - Chat interface with sidebar and authentication
2. **Authentication** (`src/components/AuthWrapper.tsx`) - Supabase OAuth integration
3. **Chat Interface** (`src/components/ChatInterface.tsx`) - PDF upload and Q&A interface
4. **Sidebar** (`src/components/Sidebar.tsx`) - Chat history and session management
5. **JavaScript APIs** (`src/app/api/`) - Server-side processing with Next.js
6. **Core Libraries** (`src/lib/`) - PDF processing, embeddings, text chunking
7. **Supabase Database** - pgvector storage with authentication and chat history

### Request Flow
1. **Authentication**: Browser → Supabase OAuth → User session
2. **PDF Ingestion**: Browser → `/api/ingest-js` → PDF processing → Text chunking → Embeddings → Supabase
3. **Q&A**: Browser → `/api/ask-stream-js` → Vector search → Ollama LLM → SSE streaming response

### Key Implementation Details
- **PDF Processing**: Uses `pdf-parse` library for text extraction
- **Text Chunking**: Custom JavaScript implementation with Korean language support
- **Embeddings**: Transformers.js with `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- **Vector Search**: Supabase RPC function `search_document_chunks` with cosine similarity
- **LLM Integration**: Direct HTTP calls to Ollama `/api/generate` with streaming support
- **Authentication**: Supabase Auth with Google and GitHub OAuth providers

## Environment Configuration

### Required Files
- `.env.local` - Configuration for Next.js and Supabase

### Critical Environment Variables
```bash
# .env.local (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Optional Ollama configuration
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=exaone3.5:7.8b
```

### Supabase Setup Requirements
1. Create Supabase project
2. Run `supabase_schema.sql` in SQL Editor to create:
   - `document_chunks` table with vector column
   - `search_document_chunks` RPC function
   - pgvector extension and HNSW index

## Common Issues and Solutions

### "SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required"
- Missing or invalid `.env.local` file
- Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly

### 500 errors on /ingest-js or /ask-js endpoints
- Supabase connection issues (check credentials)
- Missing `document_chunks` table (run `supabase_schema.sql`)
- pgvector extension not enabled (run `CREATE EXTENSION vector;`)

### "Failed to load model" errors
- Transformers.js model loading issues
- Check internet connection (models are downloaded from HuggingFace Hub)
- Clear browser cache if running in development

### Authentication errors
- OAuth provider not configured in Supabase
- Redirect URLs not set correctly
- Missing authentication tables (run `supabase_auth_schema.sql`)

## Development Notes

### JavaScript-First Architecture
The project uses a pure JavaScript stack with Next.js handling both frontend and backend concerns through API routes.

### API Response Formats
- `/api/ingest-js`: `{ ok: boolean, doc_id: string, chunks: number, processing_time: number, metadata: object }`
- `/api/ask-js`: `{ ok: boolean, answer?: string, contexts?: string[], metadatas?: any[], model?: string, stats?: object }`
- `/api/ask-stream-js`: Server-Sent Events with `{ type: 'content'|'sources'|'done'|'error', content?: string, sources?: any[] }`

### Vector Dimension Consistency
The embedding model produces 384-dimensional vectors. If changing models, update the Supabase schema `VECTOR(384)` accordingly.

### Error Handling Strategy
- Next.js API routes return structured error responses with `{ ok: false, reason: string }` format
- Frontend handles both network errors and application errors gracefully
- Streaming endpoints use SSE error events for error communication

### Performance Considerations
- Transformers.js models are cached in browser/Node.js memory
- First model load takes longer (model download from HuggingFace Hub)
- PDF processing is done server-side for better performance
- Embedding generation is batched for efficiency