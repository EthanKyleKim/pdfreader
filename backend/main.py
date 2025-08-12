from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import os
import uuid
import requests

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pymupdf4llm

PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma")
COLLECTION_NAME = "pdf_chunks"
EMBED_MODEL_NAME = os.environ.get("EMBED_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL_NAME = os.environ.get("OLLAMA_MODEL", "exaone3.5:7.8b")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = chromadb.PersistentClient(path=PERSIST_DIR, settings=Settings(allow_reset=True))
collection = client.get_or_create_collection(name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"})
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
    content = await file.read()
    md = pdf_to_markdown(content)
    chunks = split_text(md)

    embeddings = embedder.encode(chunks, show_progress_bar=False, normalize_embeddings=True)

    doc_id = str(uuid.uuid4())
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [{"doc_id": doc_id, "source_name": file.filename, "chunk_index": i} for i in range(len(chunks))]

    collection.add(ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadatas)

    return {"ok": True, "doc_id": doc_id, "chunks": len(chunks)}


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
    q = payload.question.strip()
    if not q:
        return {"ok": False, "reason": "Empty question"}

    q_emb = embedder.encode([q], show_progress_bar=False, normalize_embeddings=True)[0]
    results = collection.query(query_embeddings=[q_emb], n_results=payload.top_k)

    contexts = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]

    prompt = build_prompt(q, contexts)

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
