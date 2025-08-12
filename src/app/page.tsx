"use client";
import { useState } from "react";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const ingest = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setLoading(true);
    try {
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const j = await res.json();
      alert(res.ok ? `Ingested: ${j.chunks} chunks` : `Fail: ${j.reason ?? "unknown"}`);
    } finally {
      setLoading(false);
    }
  };

  const ask = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, top_k: 5 }),
      });
      const j = await res.json();
      setAnswer(j.answer ?? "");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 space-y-6">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">PDF RAG 데모</h1>
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button
          onClick={ingest}
          className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          disabled={!file || loading}
        >
          {loading ? "처리 중..." : "PDF 인덱싱"}
        </button>
      </section>

      <section className="space-y-3">
        <input
          className="border px-3 py-2 w-full"
          placeholder="질문을 입력하세요"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          onClick={ask}
          className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50"
          disabled={loading || !q.trim()}
        >
          {loading ? "불러오는 중..." : "질문하기"}
        </button>
        {answer && <div className="border p-3 whitespace-pre-wrap">{answer}</div>}
      </section>
    </main>
  );
}
