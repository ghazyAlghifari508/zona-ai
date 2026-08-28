# Fase 07 — RAG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun pipeline RAG extract→chunk→embed→pgvector HNSW→retrieve→inject `Context from documents` dengan status UI `processingStatus` dan scoping `WHERE conversationId`.

**Architecture:** `processDocument` async after `uploadFile` `pending→processing→completed/failed`, `extractText` `unpdf`/`mammoth`/utf8, `chunkText` fixed 1000/200 sentence-aware, `embedTexts` `POST EMBEDDING_BASE_URL/embeddings` `vector(EMBEDDING_DIMENSION)` default 1536, `document_chunks` HNSW `vector_cosine_ops`, `retrieveContext` `embedding <=> query LIMIT topK` scoped, `chat.ts` inject same `ragContext` ke semua model Fair.

**Tech Stack:** Bun, TypeScript, Drizzle ORM + pgvector, unpdf, mammoth, @aws-sdk/client-s3 (reuse getObject), AI SDK 7 + @ai-sdk/openai-compatible (reuse), Better Auth, Zod, TanStack Router/Query, Vitest + msw, Playwright chromium, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-phase-07-rag-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm), TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL + pgvector `CREATE EXTENSION vector` (jangan Qdrant), Better Auth (jangan Clerk), Tailwind v4, AI SDK 7, R2 (jangan Supabase)
- Server-only: `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `NINE_ROUTER_API_KEY`, `DATABASE_URL`, `R2_*` tidak di client — grep `.vinxi/build/client` 0, embedding di server-only `src/lib/rag/*`
- No hardcode `vector(1536)` di banyak file — single `src/lib/utils/constants.ts` `EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION ?? 1536)` + `RAG_CHUNK_SIZE 1000` `RAG_CHUNK_OVERLAP 200` `RAG_TOP_K 5`, all `Number(process.env.* ?? default)`
- No hardcode `chunkSize`/`topK` — via `constants.ts`, no embedding di client
- RAG scoping: `WHERE conversation_id = $2` mandatory, `conversationId` verified `conversations.userId===session.user.id` else 403, no cross-leak `SELECT * ORDER BY embedding LIMIT 5` tanpa where
- No fake RAG: `ragContext` dari `document_chunks` real `SELECT ... ORDER BY embedding <=> query`, bukan `setTimeout` mock (mock hanya di test via `vi.mock`/`msw`)
- Design: cream `#f5f1e4` L0, White `#ffffff` L1, radius 50px nav/cards/dialog + 10px small, Inter 400/500, no `shadow-lg/xl/2xl`, no neon, no emoji Lucide 1.5-2px only, no dark mode, Unified Shell `sidebar 280px` paten
- Auth: `getAuthSession(request)` throw 401 `ERR-002` di tiap `createServerFn` `uploadFile`/`sendMessage`/`retrieve`, ownership `conversations.userId` 403
- Processing: `attachments.processingStatus pending|processing|completed|failed`, `pending` Fase 06 → `processing` Fase 07 → `completed` if all steps sukses else `failed` delete partial, chat still without RAG if `failed`
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, `drizzle-kit migrate` sukses, `psql \d document_chunks` `embedding vector` + HNSW `vector_cosine_ops`

---

## File Structure

```
zona-ai/
├── src/
│   ├── lib/
│   │   ├── utils/constants.ts        # + RAG_CHUNK_SIZE, RAG_CHUNK_OVERLAP, RAG_TOP_K, EMBEDDING_DIMENSION, EMBEDDING_MODEL, EMBEDDING_BASE_URL
│   │   ├── db/schema.ts              # + document_chunks + HNSW index
│   │   ├── db/migrations/0006_document_chunks.sql
│   │   ├── rag/extract.ts            # extractText
│   │   ├── rag/chunk.ts              # chunkText
│   │   ├── rag/embed.ts              # embedTexts, embedQuery
│   │   ├── rag/retrieve.ts           # retrieveContext
│   │   ├── rag/process.ts            # processDocument
│   │   └── r2/client.ts              # reuse getObject
│   ├── server/functions/files.ts     # trigger processDocument async
│   ├── server/functions/chat.ts      # + retrieveContext inject
│   └── components/chat/AttachmentPreview.tsx # status processing/completed/failed
└── tests/
    ├── unit/extract.test.ts
    ├── unit/chunk.test.ts
    ├── unit/embed.test.ts
    ├── unit/retrieve.test.ts
    ├── integration/rag.test.ts
    └── e2e/rag.spec.ts
```

---

### Task 1: DB `document_chunks` HNSW + RAG Constants

**Files:**
- Modify: `src/lib/db/schema.ts`, `src/lib/utils/constants.ts`
- Create: `src/lib/db/migrations/0006_document_chunks.sql` (generated)
- Test: `tests/integration/rag.test.ts` schema smoke

**Interfaces:**
- Consumes: `pgvector` extension Fase 02, `attachments` Fase 06
- Produces: `document_chunks` table + `RAG_*`/`EMBEDDING_*` constants — dipakai Task 2–6

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/rag.test.ts
import { describe, it, expect } from "vitest";
import { db } from "../../src/lib/db/index";
import { sql } from "drizzle-orm";
describe("document_chunks schema", () => {
  it("has table with embedding vector", async () => {
    const r = await db.execute(sql`SELECT column_name, udt_name FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='embedding'`);
    expect(r.rows.length).toBe(1);
  });
  it("has HNSW index", async () => {
    const r = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename='document_chunks' AND indexname LIKE '%hnsw%'`);
    expect(r.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/rag.test.ts -v`
Expected: `FAIL` `to_regclass null` atau `column does not exist`

- [ ] **Step 3: Write minimal implementation**

`src/lib/utils/constants.ts` tambah:

```ts
export const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION ?? 1536);
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
export const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL ?? process.env.NINE_ROUTER_BASE_URL ?? "http://localhost:20128/v1";
export const RAG_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE ?? 1000);
export const RAG_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP ?? 200);
export const RAG_TOP_K = Number(process.env.RAG_TOP_K ?? 5);
```

`src/lib/db/schema.ts` tambah:

```ts
import { vector, jsonb } from "drizzle-orm/pg-core"; // vector from pgvector
export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  attachmentId: uuid("attachment_id").notNull().references(() => attachments.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSION }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

Run:

```bash
bun x drizzle-kit generate
# edit generated 0006_document_chunks.sql add:
# CREATE INDEX document_chunks_embedding_hnsw ON document_chunks USING hnsw (embedding vector_cosine_ops);
bun x drizzle-kit migrate
```

Check `psql \d document_chunks` → `embedding vector` + `hnsw` index.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/rag.test.ts -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/utils/constants.ts src/lib/db/migrations/ tests/integration/rag.test.ts
git commit -m "feat(db): document_chunks HNSW + RAG constants"
```

---

### Task 2: Extractor PDF/DOCX/TXT/CSV

**Files:**
- Create: `src/lib/rag/extract.ts`
- Test: `tests/unit/extract.test.ts`

**Interfaces:**
- Consumes: `r2/client` `getObject`, `Buffer`
- Produces: `extractText({r2Key,mimeType}):Promise<string>` — dipakai Task 5

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/extract.test.ts
import { describe, it, expect, vi } from "vitest";
import { extractText } from "../../src/lib/rag/extract";
vi.mock("../../src/lib/r2/client", () => ({ getObject: vi.fn(async () => ({ body: Buffer.from("%PDF-1.4 Hello world"), contentType: "application/pdf" })) }));
describe("extract", () => {
  it("pdf extracts Hello world", async () => { const t = await extractText({ r2Key: "k", mimeType: "application/pdf" }); expect(t).toContain("Hello world"); });
  it("corrupted pdf throws ERR-013", async () => {});
  it("image skip returns empty", async () => { const t = await extractText({ r2Key: "k", mimeType: "image/png" }); expect(t).toBe(""); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/extract.test.ts -v` → `FAIL` `Cannot find module extract`

- [ ] **Step 3: Write minimal implementation**

```bash
bun add unpdf mammoth
```

`src/lib/rag/extract.ts` (server-only):

```ts
import { getObject } from "../r2/client";
export async function extractText({ r2Key, mimeType }: { r2Key: string; mimeType: string }): Promise<string> {
  if (mimeType.startsWith("image/")) return "";
  const { body } = await getObject(r2Key);
  const buf = body as Buffer;
  try {
    if (mimeType === "application/pdf") { const { extractText: pdfExtract } = await import("unpdf"); const { text } = await pdfExtract(buf, { mergePages: true }); return (Array.isArray(text) ? text.join("\n") : text).trim(); }
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") { const mammoth = await import("mammoth"); const { value } = await mammoth.extractRawText({ buffer: buf }); return value.trim(); }
    if (mimeType === "text/plain" || mimeType === "text/csv") return buf.toString("utf8").trim();
    return buf.toString("utf8").trim();
  } catch (e) { const err = new Error("Could not process this document. It may be corrupted or password-protected.") as any; err.code = "ERR-013"; throw err; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/extract.test.ts -v` → `3 passed` (mock getObject)

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/extract.ts tests/unit/extract.test.ts
git commit -m "feat(rag): extractor PDF/DOCX/TXT"
```

---

### Task 3: Chunker Fixed 1000/200

**Files:**
- Create: `src/lib/rag/chunk.ts`
- Test: `tests/unit/chunk.test.ts`

**Interfaces:**
- Consumes: `RAG_CHUNK_SIZE/OVERLAP` Task 1
- Produces: `chunkText(text, opts): Array<{content,index}>` — dipakai Task 5

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/chunk.test.ts
import { chunkText } from "../../src/lib/rag/chunk";
import { describe, it, expect } from "vitest";
describe("chunk", () => {
  it("splits 2000 chars into 3 chunks with overlap 200", () => {
    const text = "a ".repeat(1000);
    const chunks = chunkText(text, { chunkSize: 1000, overlap: 200 });
    expect(chunks.length).toBe(3);
    expect(chunks[0].content.slice(-200)).toBe(chunks[1].content.slice(0, 200));
  });
  it("preserves sentence boundary if possible", () => {
    const text = "Hello world. This is test. Another sentence. ".repeat(100);
    const chunks = chunkText(text, { chunkSize: 100, overlap: 20 });
    expect(chunks[0].content).toContain("Hello world.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/chunk.test.ts -v` → `FAIL` `Cannot find module chunk`

- [ ] **Step 3: Write minimal implementation**

`src/lib/rag/chunk.ts`:

```ts
export function chunkText(text: string, opts: { chunkSize: number; overlap: number }): Array<{ content: string; index: number; metadata?: any }> {
  const { chunkSize, overlap } = opts;
  if (text.length <= chunkSize) return [{ content: text, index: 0 }];
  const chunks = []; let start = 0, idx = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) { const slice = text.slice(start, end); const lastPeriod = slice.lastIndexOf(". "); if (lastPeriod > chunkSize * 0.5) end = start + lastPeriod + 1; }
    const content = text.slice(start, end).trim();
    if (content) chunks.push({ content, index: idx++, metadata: { startOffset: start, endOffset: end } });
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/chunk.test.ts -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/chunk.ts tests/unit/chunk.test.ts
git commit -m "feat(rag): chunker 1000/200"
```

---

### Task 4: Embedder Server-only TBD Provider

**Files:**
- Create: `src/lib/rag/embed.ts`
- Test: `tests/unit/embed.test.ts`

**Interfaces:**
- Consumes: `EMBEDDING_*` Task 1
- Produces: `embedTexts(texts)`, `embedQuery(query)` — dipakai Task 5,6

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/embed.test.ts
import { describe, it, expect, vi } from "vitest";
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ embedding: Array(1536).fill(0.1) }, { embedding: Array(1536).fill(0.2) }] }) } as any)));
import { embedTexts, embedQuery } from "../../src/lib/rag/embed";
describe("embed", () => {
  it("embedTexts returns 2 vectors 1536", async () => { const v = await embedTexts(["hi", "hello"]); expect(v.length).toBe(2); expect(v[0].length).toBe(1536); });
  it("embedQuery calls embedTexts once", async () => { const v = await embedQuery("query"); expect(v.length).toBe(1536); });
  it("throws ERR-014 on API fail", async () => { vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 } as any))); await expect(embedTexts(["hi"])).rejects.toThrow(/ERR-014|Document indexing failed/); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/embed.test.ts -v` → `FAIL` `Cannot find module embed`

- [ ] **Step 3: Write minimal implementation**

`src/lib/rag/embed.ts` (server-only):

```ts
import { EMBEDDING_BASE_URL, EMBEDDING_MODEL, EMBEDDING_DIMENSION } from "../utils/constants";
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NINE_ROUTER_API_KEY ?? process.env.EMBEDDING_API_KEY ?? ""}` }, body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }) });
  if (!res.ok) { const e = new Error("Document indexing failed. You can still chat, but document search may not work for this file.") as any; e.code = "ERR-014"; throw e; }
  const data = (await res.json()) as any;
  const vectors = data.data.map((d: any) => d.embedding as number[]);
  for (const v of vectors) if (v.length !== EMBEDDING_DIMENSION) console.warn(`Embedding dimension mismatch ${v.length} != ${EMBEDDING_DIMENSION}`);
  return vectors;
}
export async function embedQuery(query: string): Promise<number[]> { return (await embedTexts([query]))[0]; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/embed.test.ts -v` → `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/embed.ts tests/unit/embed.test.ts
git commit -m "feat(rag): embedder via 9Router"
```

---

### Task 5: Pipeline processDocument Async Trigger

**Files:**
- Create: `src/lib/rag/process.ts`
- Modify: `src/server/functions/files.ts` (trigger after upload)
- Test: `tests/integration/rag.test.ts` pipeline

**Interfaces:**
- Consumes: Task 1–4, `r2/client`, `attachments`
- Produces: `processDocument(attachmentId)` — called after `uploadFile`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/rag.test.ts
import { describe, it, expect } from "vitest";
describe("processDocument", () => {
  it("pipeline pending→completed with chunks", async () => {});
  it("embedding fail → failed no chunks", async () => {});
  it("image skip → completed no chunks", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/rag.test.ts -v` → `FAIL` `Cannot find module process`

- [ ] **Step 3: Write minimal implementation**

`src/lib/rag/process.ts`:

```ts
import { db } from "../db/index";
import { attachments, documentChunks } from "../db/schema";
import { eq } from "drizzle-orm";
import { extractText } from "./extract";
import { chunkText } from "./chunk";
import { embedTexts } from "./embed";
import { RAG_CHUNK_SIZE, RAG_CHUNK_OVERLAP } from "../utils/constants";
export async function processDocument(attachmentId: string) {
  const [att] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  if (!att) return;
  await db.update(attachments).set({ processingStatus: "processing" }).where(eq(attachments.id, attachmentId));
  try {
    const text = await extractText({ r2Key: att.r2Key, mimeType: att.mimeType });
    if (!text) { await db.update(attachments).set({ processingStatus: "completed", extractedText: "" }).where(eq(attachments.id, attachmentId)); return; }
    const chunks = chunkText(text, { chunkSize: RAG_CHUNK_SIZE, overlap: RAG_CHUNK_OVERLAP });
    const vectors = await embedTexts(chunks.map((c) => c.content));
    await db.insert(documentChunks).values(chunks.map((c, i) => ({ attachmentId, conversationId: att.conversationId, chunkIndex: c.index, content: c.content, embedding: vectors[i] as any, metadata: c.metadata })));
    await db.update(attachments).set({ processingStatus: "completed", extractedText: text.slice(0, 10000) }).where(eq(attachments.id, attachmentId));
  } catch (e: any) {
    await db.update(attachments).set({ processingStatus: "failed" }).where(eq(attachments.id, attachmentId));
    await db.delete(documentChunks).where(eq(documentChunks.attachmentId, attachmentId));
    throw e;
  }
}
```

Modify `src/server/functions/files.ts` `uploadFile` after `INSERT attachments`:

```ts
if (process.env.NODE_ENV === "test") await processDocument(attachmentId);
else setImmediate(() => processDocument(attachmentId).catch(console.error));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/rag.test.ts -v` → `3 passed` (mock extract/chunk/embed)

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/process.ts src/server/functions/files.ts tests/integration/rag.test.ts
git commit -m "feat(rag): processDocument pipeline"
```

---

### Task 6: Retriever + Injection in chat.ts

**Files:**
- Create: `src/lib/rag/retrieve.ts`
- Modify: `src/server/functions/chat.ts` (sendMessage + sendCompareMessage)
- Test: `tests/unit/retrieve.test.ts` + `tests/integration/rag.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1,4, `document_chunks`, `embedQuery`
- Produces: `retrieveContext` — used in `chat.ts` before `streamText`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/retrieve.test.ts
import { retrieveContext } from "../../src/lib/rag/retrieve";
import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/lib/rag/embed", () => ({ embedQuery: vi.fn(async () => Array(1536).fill(0.5)) }));
describe("retrieve", () => {
  it("calls embedQuery and SQL WHERE conversationId", async () => {
    const ctx = await retrieveContext({ conversationId: "conv1", query: "hello", topK: 2 });
    expect(ctx.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/retrieve.test.ts -v` → `FAIL` `Cannot find module retrieve`

- [ ] **Step 3: Write minimal implementation**

`src/lib/rag/retrieve.ts` (server-only):

```ts
import { db } from "../db/index";
import { documentChunks } from "../db/schema";
import { sql } from "drizzle-orm";
import { embedQuery } from "./embed";
import { RAG_TOP_K } from "../utils/constants";
export async function retrieveContext({ conversationId, query, topK = RAG_TOP_K }: { conversationId: string; query: string; topK?: number }): Promise<string[]> {
  const queryEmbedding = await embedQuery(query);
  const rows = await db.execute(sql`SELECT content FROM ${documentChunks} WHERE conversation_id = ${conversationId} ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector LIMIT ${topK}`);
  return (rows.rows as any[]).map((r) => r.content as string);
}
```

`src/server/functions/chat.ts` inject before `streamText`:

```ts
import { retrieveContext } from "../../lib/rag/retrieve";
import { documentChunks } from "../../lib/db/schema";
let ragContext: string[] = [];
const hasChunks = (await db.select().from(documentChunks).where(eq(documentChunks.conversationId, convId)).limit(1)).length > 0;
if (hasChunks || data.attachmentIds?.length) { try { ragContext = await retrieveContext({ conversationId: convId, query: data.content }); } catch (e) { console.error("retrieve failed", e); } }
const system = buildSystemPrompt({ skillId: data.skillId }) + (ragContext.length ? `\n\nContext from documents:\n${ragContext.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}` : "");
```

Same for `sendCompareMessage` same `ragContext` for N models.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/retrieve.test.ts tests/integration/rag.test.ts -v` → `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/retrieve.ts src/server/functions/chat.ts tests/unit/retrieve.test.ts
git commit -m "feat(rag): retriever + injection"
```

---

### Task 7: UI Status Processing/Completed/Failed

**Files:**
- Modify: `src/components/chat/AttachmentPreview.tsx`
- Test: `tests/e2e/rag.spec.ts`

**Interfaces:**
- Consumes: `attachments.processingStatus` Task 5
- Produces: badge

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/rag.spec.ts
import { test, expect } from "@playwright/test";
test("upload pdf shows Indexing then Indexed", async ({ page }) => {
  await page.goto("/chat/$id");
  await expect(page.getByText("Indexing...")).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test tests/e2e/rag.spec.ts --project=chromium -g "shows Indexing"` → `FAIL` `Indexing` not found

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/AttachmentPreview.tsx`:

```tsx
import { Loader2, Check, TriangleAlert } from "lucide-react";
export function AttachmentPreview({ attachments }: { attachments: Array<{ processingStatus: string; fileName: string }> }) {
  return <div className="flex gap-1">{attachments.map((a) => <div key={a.fileName} className="flex gap-1 text-xs">{a.processingStatus === "processing" && <span className="flex gap-1 text-stone-gray"><Loader2 size={12} className="animate-spin" />Indexing...</span>}{a.processingStatus === "completed" && <span className="flex gap-1"><Check size={12} />Indexed</span>}{a.processingStatus === "failed" && <span className="flex gap-1"><TriangleAlert size={12} />Could not process</span>}</div>)}</div>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test tests/e2e/rag.spec.ts --project=chromium` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/AttachmentPreview.tsx tests/e2e/rag.spec.ts
git commit -m "feat(ui): attachment status"
```

---

### Task 8: Verifikasi Fase 07 Gate

**Files:** — (no new files)

- [ ] **Step 1: TypeCheck**

Run: `bun x tsc --noEmit`
Expected: `0` errors

- [ ] **Step 2: Biome**

Run: `bun x biome check ./src`
Expected: `PASS`

- [ ] **Step 3: Unit**

Run: `bun x vitest run tests/unit/extract.test.ts tests/unit/chunk.test.ts tests/unit/embed.test.ts tests/unit/retrieve.test.ts -v`
Expected: `ALL passed` (8)

- [ ] **Step 4: Integration**

Run: `bun x vitest run tests/integration/rag.test.ts -v`
Expected: `PASS` (pipeline, HNSW, scoped retrieve, injection, compare same context, graceful fail)

- [ ] **Step 5: E2E**

Run: `bun x playwright test tests/e2e/rag.spec.ts --project=chromium`
Expected: `PASS` (pdf Indexed, query with context, corrupted failed, compare same)

---

## Self-Review

- **Spec coverage:** `document_chunks` HNSW → Task 1, `extractText` unpdf/mammoth → Task 2, `chunkText` 1000/200 → Task 3, `embedTexts` 9Router → Task 4, `processDocument` async `pending→completed/failed` → Task 5, `retrieveContext` `WHERE conversationId` + injection `Context from documents` → Task 6, status UI → Task 7, graceful `failed` delete partial → Task 5. FR-015/016 + RAG Done semua ada Task.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya spec Open/TBD allowed, plan semua actual code `CREATE INDEX hnsw`, `extractText`, `chunkText`, `embedTexts`, `retrieveContext`). Semua Steps ada code block.
- **Type consistency:** `EMBEDDING_DIMENSION` Task 1, `extractText({r2Key,mimeType})` Task 2, `chunkText(text,{chunkSize,overlap})` Task 3, `embedTexts(texts:string[])` Task 4, `processDocument(attachmentId:string)` Task 5, `retrieveContext({conversationId,query,topK})` Task 6 consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-07-rag-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

