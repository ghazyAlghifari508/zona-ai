# Fase 07 — RAG (Document Processing) — Spec

> Status: DRAFT — Menunggu review. DILARANG bikin plan/code sebelum approve.
> Referensi: `docs/MILESTONES.md` Milestone 7, `docs/ARCHITECTURE.md` §10 RAG Architecture + §7 pgvector, `docs/DATABASE.md` §4 document_chunks + attachments, `docs/PRD.md` FR-015/016 + Acceptance RAG Done, `docs/AI-BEHAVIOR.md` §15 RAG, `docs/SECURITY.md` §6 Prompt Isolation + RAG Scoping, `docs/ERROR-HANDLING.md` ERR-013/014, `docs/UI-UX.md` Attachment UI, `docs/TESTING.md`

## 1. Tujuan

Membuat pipeline RAG end-to-end: file `attachments` R2 `processingStatus pending` (Fase 06) → extract text (PDF `unpdf`, DOCX `mammoth`, TXT/CSV utf8) → chunk fixed 1000/200 sentence-aware → embed via `EMBEDDING_BASE_URL` `9Router /v1/embeddings` `vector(EMBEDDING_DIMENSION)` default 1536 → simpan `document_chunks` HNSW `vector_cosine_ops` → retrieve `embedding <=> query LIMIT topK 5` scoped `conversationId` → inject `Context from documents:\n[1] ...` sama ke semua model di `sendMessage`/`sendCompareMessage` Fair. E2E `sample-report.pdf` → `apa isi laporan?` → jawaban dari dokumen, `processingStatus` visible, graceful `failed` tanpa RAG.

## 2. Scope & Dependensi

- **Dependensi:** Fase 06 Done (R2 `attachments` `r2Key users/{userId}/attachments/{uuid}/{sanitized}` `processingStatus pending` `extractedText nullable`, `Composer` `attachmentIds` `Paperclip` drag preview 40x40, `sendMessage` `attachmentIds` vision file parts), Fase 03 Done (`generation_runs` status, `Resolver` 3-tier, `buildSystemPrompt`), Fase 04 Done (`conversations` `userId` ownership, `getMessages` batch, `generateTitle`), Fase 02 `vector` extension sudah `CREATE EXTENSION vector`.
- **Deliverable Fase 07:**
  1. `document_chunks` HNSW + `constants.ts` `RAG_CHUNK_SIZE 1000` `RAG_CHUNK_OVERLAP 200` `RAG_TOP_K 5` `EMBEDDING_DIMENSION 1536` `EMBEDDING_MODEL text-embedding-3-small` `EMBEDDING_BASE_URL` (9Router `NINE_ROUTER_BASE_URL` fallback) — all `Number(process.env.* ?? default)` single source
  2. `src/lib/rag/extract.ts` server-only `extractText({r2Key,mimeType})` `unpdf`/`mammoth`/utf8, image `""` skip, throw `ERR-013` if corrupted
  3. `src/lib/rag/chunk.ts` `chunkText(text,{chunkSize,overlap})` fixed 1000/200 sentence-aware `last ". "` if >0.5*chunkSize
  4. `src/lib/rag/embed.ts` server-only `embedTexts(texts:string[]):Promise<number[][]>` `POST EMBEDDING_BASE_URL/embeddings {model:EMBEDDING_MODEL, input:texts} Bearer NINE_ROUTER_API_KEY` → `data[].embedding`, `embedQuery(query)` single, throw `ERR-014` on 500, mock fixed `Array(1536).fill(0.1)` di test
  5. `src/lib/rag/process.ts` `processDocument(attachmentId)` async after `uploadFile` `setImmediate` (await in test) `pending→processing→completed/failed`, `extract→chunk→embed→INSERT document_chunks` batch, `extractedText` 10k, delete partial on embedding fail, image skip 0 chunks `completed`
  6. `src/lib/rag/retrieve.ts` `retrieveContext({conversationId, query, topK=RAG_TOP_K})` `queryEmbedding=await embedQuery(query)` → `SELECT content WHERE conversation_id=$2 ORDER BY embedding <=> $1::vector LIMIT topK` param, return `string[]`, `WHERE conversationId` mandatory (ownership via `conversations.userId` verified di `chat.ts`)
  7. `src/server/functions/chat.ts` inject before `streamText`: `hasChunks = SELECT limit1 WHERE conversationId` or `attachmentIds?.length` → `ragContext=await retrieveContext({conversationId, query:content})` → `system=buildSystemPrompt(skillId)+"\n\nContext from documents:\n"+ragContext.map((c,i)=>`[${i+1}] ${c}`).join("\n\n")` same untuk Compare Fair, truncate `<4000` chars, graceful catch `retrieve` fail → no `ragContext` log
  8. `src/components/chat/AttachmentPreview.tsx` badge `processing Loader2 Indexing...` `completed Check Indexed` `failed TriangleAlert Could not process` + `Retry` `reprocessAttachment`
- **Out of scope:** `web_sources`/`Tavily` (Fase 08), `web_sources` Fair Compare `searchWeb` sekali baru Fase 08 (Fase 07 siap tapi belum fetch web), `LANGFUSE` per-model tracing Fase 09, `consensus`/`blind` Fase 11 Post-MVP.

## 3. Data Model

**`document_chunks`**

- `id uuid PK default gen_random_uuid()`
- `attachmentId uuid FK attachments.id ON DELETE CASCADE`
- `conversationId uuid FK conversations.id ON DELETE CASCADE` scoping, index
- `chunkIndex integer not null` 0..N-1
- `content text not null` trimmed `replace \x00`
- `embedding vector(EMBEDDING_DIMENSION) nullable` `vector_cosine_ops` HNSW `CREATE INDEX document_chunks_embedding_hnsw ON document_chunks USING hnsw (embedding vector_cosine_ops)` — dimension `EMBEDDING_DIMENSION` 1536 default configurable `constants.ts` single source, not hardcode `vector(1536)` di banyak file
- `metadata jsonb nullable` `{page?:number, startOffset?:number, endOffset?:number}`
- `createdAt timestamptz default now()`
- Indexes `attachmentId`, `conversationId`, `embedding HNSW`

**`attachments` update Fase 07:** `processingStatus pending|processing|completed|failed` Fase 06 `pending` → Fase 07 `processing` → `completed` if all steps sukses else `failed` delete partial, `extractedText` 10k truncated for debug.

**Migration:** `0006_document_chunks.sql` `CREATE TABLE document_chunks ...` + `CREATE INDEX ... USING hnsw`.

## 4. Pipeline `processDocument` (ARCHITECTURE §10)

**Trigger `src/server/functions/files.ts` `uploadFile` after `INSERT pending`:**

```ts
if(process.env.NODE_ENV==="test") await processDocument(attachmentId);
else setImmediate(()=> processDocument(attachmentId).catch(console.error));
```

**`src/lib/rag/process.ts` `processDocument(attachmentId)`:**

```ts
const [att]=await db.select().from(attachments).where(eq(attachments.id,attachmentId));
await db.update(attachments).set({processingStatus:"processing"}).where(eq(attachments.id,attachmentId));
try{
  const text=await extractText({r2Key:att.r2Key, mimeType:att.mimeType});
  if(!text){ await db.update(attachments).set({processingStatus:"completed", extractedText:""}).where(eq(attachments.id,attachmentId)); return; }
  const chunks=chunkText(text, {chunkSize:RAG_CHUNK_SIZE, overlap:RAG_CHUNK_OVERLAP});
  const vectors=await embedTexts(chunks.map(c=>c.content));
  await db.insert(documentChunks).values(chunks.map((c,i)=>({attachmentId, conversationId:att.conversationId, chunkIndex:c.index, content:c.content, embedding:vectors[i] as any, metadata:c.metadata})));
  await db.update(attachments).set({processingStatus:"completed", extractedText:text.slice(0,10000)}).where(eq(attachments.id,attachmentId));
}catch(e:any){
  await db.update(attachments).set({processingStatus:"failed"}).where(eq(attachments.id,attachmentId));
  await db.delete(documentChunks).where(eq(documentChunks.attachmentId,attachmentId));
  throw e;
}
```

## 5. Extraction

**`src/lib/rag/extract.ts` server-only:**

- `mimeType.startsWith("image/")` → `""` skip (image only vision Fase 06, not RAG)
- `application/pdf` → `unpdf` `extractText(buffer,{mergePages:true})` `Array.isArray(text)?text.join("\n"):text` trim, if `encrypted/corrupted` catch → throw `ERR-013` `Could not process this document. It may be corrupted or password-protected.`
- `application/vnd.openxmlformats...` → `mammoth.extractRawText({buffer})` `value` trim
- `text/plain` `text/csv` → `buffer.toString("utf8")` trim
- Else `buffer.toString("utf8")`
- Deps `bun add unpdf mammoth` (check Bun compat, fallback `pdf-parse` if `unpdf` fails).

## 6. Chunking

**`src/lib/rag/chunk.ts` `chunkText(text, opts:{chunkSize,overlap})`:**

```ts
export function chunkText(text:string, opts:{chunkSize:number, overlap:number}){
  if(text.length<=opts.chunkSize) return [{content:text, index:0}];
  const chunks=[]; let start=0, idx=0;
  while(start<text.length){
    let end=Math.min(start+opts.chunkSize, text.length);
    if(end<text.length){ const slice=text.slice(start,end); const lastPeriod=slice.lastIndexOf(". "); if(lastPeriod>opts.chunkSize*0.5) end=start+lastPeriod+1; }
    const content=text.slice(start,end).trim();
    if(content) chunks.push({content, index:idx++, metadata:{startOffset:start, endOffset:end}});
    if(end>=text.length) break;
    start=end-opts.overlap;
  }
  return chunks;
}
```

`RAG_CHUNK_SIZE 1000` `RAG_CHUNK_OVERLAP 200` `constants.ts` `Number(process.env.* ?? default)`, test overlap `chunks[0].slice(-200)===chunks[1].slice(0,200)`.

## 7. Embedding

**`src/lib/rag/embed.ts` server-only:**

```ts
import { EMBEDDING_BASE_URL, EMBEDDING_MODEL, EMBEDDING_DIMENSION } from "../utils/constants";
export async function embedTexts(texts:string[]):Promise<number[][]>{
  const res=await fetch(`${EMBEDDING_BASE_URL}/embeddings`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.NINE_ROUTER_API_KEY ?? process.env.EMBEDDING_API_KEY ?? ""}`}, body:JSON.stringify({model:EMBEDDING_MODEL, input:texts})});
  if(!res.ok){ const e=new Error("Document indexing failed. You can still chat, but document search may not work for this file.") as any; e.code="ERR-014"; throw e; }
  const data=await res.json() as any;
  const vectors=data.data.map((d:any)=>d.embedding as number[]);
  for(const v of vectors) if(v.length!==EMBEDDING_DIMENSION) console.warn(`Embedding dimension mismatch ${v.length} != ${EMBEDDING_DIMENSION}`);
  return vectors;
}
export async function embedQuery(query:string){ return (await embedTexts([query]))[0]; }
```

`EMBEDDING_BASE_URL` `process.env.EMBEDDING_BASE_URL ?? process.env.NINE_ROUTER_BASE_URL ?? "http://localhost:20128/v1"`, `EMBEDDING_MODEL` `text-embedding-3-small` TBD via `GET /v1/models` check, mock `Array(1536).fill(0.1)` deterministic.

## 8. Retrieval + Injection

**`src/lib/rag/retrieve.ts` server-only:**

```ts
import { db } from "../db/index";
import { documentChunks } from "../db/schema";
import { sql, eq } from "drizzle-orm";
import { embedQuery } from "./embed";
import { RAG_TOP_K } from "../utils/constants";
export async function retrieveContext({conversationId, query, topK=RAG_TOP_K}:{conversationId:string, query:string, topK?:number}):Promise<string[]>{
  const queryEmbedding=await embedQuery(query);
  const rows=await db.execute(sql`SELECT content FROM ${documentChunks} WHERE conversation_id = ${conversationId} ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector LIMIT ${topK}`);
  return (rows.rows as any[]).map(r=>r.content as string);
}
```

`WHERE conversationId` mandatory (ownership via `conversations.userId` verified di `chat.ts` before call), `topK` `RAG_TOP_K 5` `constants.ts`, param `$1,$2` no injection.

**`src/server/functions/chat.ts` inject before `streamText`:**

```ts
import { retrieveContext } from "../../lib/rag/retrieve";
import { documentChunks } from "../../lib/db/schema";
let ragContext:string[]=[];
const hasChunks=(await db.select().from(documentChunks).where(eq(documentChunks.conversationId, convId)).limit(1)).length>0;
if(hasChunks || data.attachmentIds?.length){
  try{ ragContext=await retrieveContext({conversationId:convId, query:data.content}); }catch(e){ console.error("retrieve failed",e); }
}
const system=buildSystemPrompt({skillId:data.skillId}) + (ragContext.length ? `\n\nContext from documents:\n${ragContext.map((c,i)=>`[${i+1}] ${c}`).join("\n\n")}` : "");
```

Same untuk `sendCompareMessage` Fair: `retrieveContext` sekali `same ragContext` ke `N` `streamText` calls, truncate `join` `<4000` chars.

## 9. UI Status

**`src/components/chat/AttachmentPreview.tsx` badge:**

- `pending` → `Loader2` spinner `Uploading...` Stone Gray (Fase 06)
- `processing` → `Loader2 animate-spin` `Indexing...` Stone Gray
- `completed` → `Check 12` green `Indexed` + `fileName`
- `failed` → `TriangleAlert 12` `Could not process` + `Retry` `reprocessAttachment({id})` `POST` `processDocument` again
- Poll `getAttachments({conversationId})` every 2s if any `processing`.

## 10. Security

- `retrieveContext` `WHERE conversationId` scoped, `conversationId` verified `conversations.userId===session.user.id` else 403 `chat.ts` before call, no cross-leak `SELECT * ORDER BY embedding LIMIT 5` tanpa where.
- `extractText` `getObject(r2Key)` server-only, `RAG_*` constants server-only, `EMBEDDING_API_KEY` server-only.

## 11. Testing

- **Unit `extract.test.ts`:** mock `getObject` PDF buffer `%PDF` → `Hello world`, DOCX `mammoth` → text, corrupted `throw ERR-013`, image `""`.
- **Unit `chunk.test.ts`:** `chunkText("a ".repeat(1000),1000,200)` → 3 chunks `overlap 200` `chunks[0].slice(-200)===chunks[1].slice(0,200)`, sentence `Hello world. This is test.` preserved.
- **Unit `embed.test.ts`:** mock `fetch` `embedTexts(["hi"])` → `number[1536]`, `embedQuery` single, `fetch 500` → throw `ERR-014`.
- **Unit `retrieve.test.ts`:** mock `embedQuery` `Array(1536).fill(0.5)` → `retrieveContext` `WHERE conversationId` `topK 2` → 2.
- **Integration `rag.test.ts` real PG HNSW mock embed fixed:** `processDocument` PDF `Hello world. `.repeat(500) `pending→completed` 8 chunks `embedding 1536` HNSW query `SELECT ... LIMIT 5` works, embedding fail `failed` 0 chunks, image skip 0 chunks `completed`, retrieval scoped `convA` vs `convB` only A, injection `sendMessage` with chunks → `system` contains `Context from documents` + compare same context to all models.
- **E2E `rag.spec.ts` Playwright mock embed + mock 9Router:** login → `/chat/$id` → chooser `sample-report.pdf` `Indexing`→`Indexed` Check → `apa isi laporan?` (answer only in PDF) → `streamText` mock return `Context: [1] ...` → both cols same context (compare), corrupted `failed` → `Could not process` → chat without context still works.

## 12. Definition of Done

- Upload PDF/DOCX/TXT/CSV → `pending→processing→completed` `document_chunks` `embedding vector(1536)` HNSW `vector_cosine_ops` `SELECT` scoped `conversationId` `LIMIT 5` works, `processingStatus` visible `Indexing/Indexed/failed` + `Retry`.
- Query `apa isi laporan?` → `retrieveContext` topK 5 → inject `Context from documents` → `streamText` mock return `correct answer` referencing doc, compare same `ragContext` to N models.
- Works PDF, DOCX, TXT, CSV (image skip), extraction `ERR-013` `failed` delete partial, embedding `ERR-014` `failed` no chunks, chat still without RAG.
- `tsc 0` `biome pass` unit+integration+E2E pass, no secret in client, no `shadow-xl`.

## 13. File yang Akan Dibuat/Dimodifikasi

- **Create:** `src/lib/rag/extract.ts`, `chunk.ts`, `embed.ts`, `retrieve.ts`, `process.ts` (or `files.ts` trigger), `src/lib/db/schema.ts` (+`document_chunks` HNSW) + `src/lib/utils/constants.ts` (+`RAG_*`+`EMBEDDING_*`), `src/lib/db/migrations/0006_*.sql`
- **Modify:** `src/server/functions/files.ts` (trigger `processDocument` async), `src/server/functions/chat.ts` (`retrieveContext` inject), `src/components/chat/AttachmentPreview.tsx` (status), `src/lib/r2/client.ts` (reuse `getObject`), `src/lib/env.server.ts` (`EMBEDDING_*` optional)
- **Test:** `tests/unit/extract.test.ts`, `chunk.test.ts`, `embed.test.ts`, `retrieve.test.ts`, `tests/integration/rag.test.ts`, `tests/e2e/rag.spec.ts`

## 14. Larangan Khusus (jangan halu)

- DILARANG invent `EMBEDDING_MODEL` string — `ENVIRONMENT.md` TBD `text-embedding-3-small` example, via `GET /v1/models` check, `EMBEDDING_BASE_URL` TBD `http://localhost:20128/v1` or dedicated, env decides.
- DILARANG hardcode `vector(1536)` di banyak file — single `EMBEDDING_DIMENSION` constant.
- DILARANG hardcode `chunkSize 1000/overlap 200` — `RAG_CHUNK_SIZE/OVERLAP` constant.
- DILARANG hardcode `topK 5` — `RAG_TOP_K` constant.
- DILARANG embedding di client — server-only.
- DILARANG `SELECT` tanpa `WHERE conversationId` — leak vector.
- DILARANG `Qdrant` — `pgvector` HNSW `vector_cosine_ops`.
- DILARANG `shadow-xl` di preview badge.

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD`/`TODO` kecuali Open/TBD section allowed configurable. `RAG_CHUNK_SIZE 1000` `EMBEDDING_DIMENSION 1536` explicit.
- **Internal consistency:** `document_chunks` `vector(EMBEDDING_DIMENSION)` konsisten `constants.ts` `EMBEDDING_DIMENSION` 1536, `chunkText` `RAG_CHUNK_SIZE` 1000 `RAG_CHUNK_OVERLAP` 200 konsisten `processDocument` batch `vectorcks`, `retrieveContext` `WHERE conversationId` konsisten `chat.ts` ownership check.
- **Scope check:** Fase 07 hanya RAG pipeline, tidak melebar ke `web_sources` (Fase 08) — isolated, `processingStatus pending→completed` di Fase 07 benar.
- **Ambiguity check:** `conversationId required` explicit, `EMBEDDING_BASE_URL` fallback `NINE_ROUTER_BASE_URL` explicit, `topK 5` explicit.

Spec siap untuk user review sebelum `writing-plans`.

