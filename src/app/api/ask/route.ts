import { NextRequest, NextResponse } from "next/server";

const backend = process.env.NEXT_PUBLIC_BACKEND_URL!;

type AskBody = { question: string; top_k?: number };

export async function POST(req: NextRequest) {
  let body: AskBody | null = null;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    body = null;
  }
  const question = body?.question;
  const top_k = typeof body?.top_k === "number" ? body!.top_k : 5;

  if (!question || typeof question !== "string") {
    return NextResponse.json({ ok: false, reason: "question is required" }, { status: 400 });
  }

  const res = await fetch(`${backend}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.ok ? 200 : 500 });
}
