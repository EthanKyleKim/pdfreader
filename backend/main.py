from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import os
import uuid
import requests
from dotenv import load_dotenv

from supabase import create_client, Client
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pymupdf4llm

load_dotenv()

EMBED_MODEL_NAME = os.environ.get("EMBED_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL_NAME = os.environ.get("OLLAMA_MODEL", "exaone3.5:7.8b")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
embedder = SentenceTransformer(EMBED_MODEL_NAME)


class AskPayload(BaseModel):
    question: str
    top_k: int = 5


def pdf_to_markdown(file_bytes: bytes) -> str:
    tmp_path = f"/tmp/{uuid.uuid4()}.pdf"
    with open(tmp_path, "wb") as f:
        f.write(file_bytes)
    try:
        md = pymupdf4llm.to_markdown(tmp_path)
        return md
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


def split_text(md: str) -> List[str]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_text(md)
    return chunks


@app.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    try:
        content = await file.read()
        md = pdf_to_markdown(content)
        chunks = split_text(md)

        embeddings = embedder.encode(chunks, show_progress_bar=False, normalize_embeddings=True)

        doc_id = str(uuid.uuid4())

        # Prepare data for Supabase insertion
        chunk_data = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_data.append({
                "id": f"{doc_id}_{i}",
                "doc_id": doc_id,
                "content": chunk,
                "embedding": embedding.tolist(),  # Convert numpy array to list
                "metadata": {"doc_id": doc_id, "source_name": file.filename, "chunk_index": i},
                "source_name": file.filename,
                "chunk_index": i
            })

        # Insert into Supabase
        result = supabase.table("document_chunks").insert(chunk_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to insert chunks into database")

        return {"ok": True, "doc_id": doc_id, "chunks": len(chunks)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


def build_prompt(question: str, contexts: List[str]) -> str:
    context_block = "\n\n".join([f"- {c}" for c in contexts])
    prompt = (
        "당신은 주어진 컨텍스트로만 답하는 한국어 어시스턴트입니다.\n"
        "모르면 모른다고 답하세요. 추측하지 마세요.\n\n"
        f"컨텍스트:\n{context_block}\n\n"
        f"질문: {question}\n\n"
        "한국어로 간결하고 정확하게 답변하세요."
    )
    return prompt


@app.post("/ask")
async def ask(payload: AskPayload):
    try:
        q = payload.question.strip()
        if not q:
            return {"ok": False, "reason": "Empty question"}

        # Generate query embedding
        q_emb = embedder.encode([q], show_progress_bar=False, normalize_embeddings=True)[0]

        # Use Supabase RPC function for vector search
        result = supabase.rpc(
            "search_document_chunks",
            {
                "query_embedding": q_emb.tolist(),
                "match_threshold": 0.1,  # Lower threshold for more results
                "match_count": payload.top_k
            }
        ).execute()

        if not result.data:
            return {"ok": False, "reason": "No relevant documents found"}

        # Extract contexts and metadata
        contexts = [item["content"] for item in result.data]
        metadatas = [
            {
                "doc_id": item["doc_id"],
                "source_name": item["source_name"],
                "chunk_index": item["chunk_index"],
                "similarity": item["similarity"]
            }
            for item in result.data
        ]

        prompt = build_prompt(q, contexts)

        # Call Ollama for answer generation
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": MODEL_NAME, "prompt": prompt, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        answer = data.get("response", "")

        return {
            "ok": True,
            "answer": answer,
            "contexts": contexts,
            "metadatas": metadatas,
            "model": MODEL_NAME,
        }

    except Exception as e:
        return {"ok": False, "reason": f"Search failed: {str(e)}"}