if (typeof window !== "undefined") {
  throw new Error("src/lib/rag/embed.ts is server-only");
}

import { EMBEDDING_BASE_URL, EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "../utils/constants";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.NINE_ROUTER_API_KEY ?? process.env.EMBEDDING_API_KEY ?? "";
  const res = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    const e = new Error(
      "Document indexing failed. You can still chat, but document search may not work for this file.",
    ) as Error & { code: string };
    e.code = "ERR-014";
    throw e;
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  const vectors = data.data.map((d) => d.embedding as number[]);
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMENSION) {
      console.warn(`Embedding dimension mismatch ${v.length} != ${EMBEDDING_DIMENSION}`);
    }
  }
  return vectors;
}

export async function embedQuery(query: string): Promise<number[]> {
  const vectors = await embedTexts([query]);
  return vectors[0];
}
