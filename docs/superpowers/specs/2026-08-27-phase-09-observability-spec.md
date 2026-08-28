# Fase 09 — Observability + Usage Tracking — Spec

> Status: DRAFT — Menunggu review (brainstorming assume approved). DILARANG bikin plan/code sebelum approve plan.
> Referensi: `docs/MILESTONES.md` Milestone 9, `docs/ARCHITECTURE.md` §12 Observability, `docs/DATABASE.md` §5 usage_records + feedback, `docs/PRD.md` FR-018, `docs/AI-BEHAVIOR.md` §19 Token + §20 Latency, `docs/API.md` Streaming `UsageEvent`, `docs/ERROR-HANDLING.md` Logging, `docs/SECURITY.md` §18 Logging & Redaction, `docs/ENVIRONMENT.md` LANGFUSE_*, `DESIGN.md`, `.agents/rules/anti-ai-slop.md`

## 1. Tujuan (Brainstorming Architectural — assume approved)

Menutup loop observability: setiap `generation` catat `promptTokens/completionTokens/totalTokens` + `latencyMs` + `timeToFirstTokenMs` ke `generation_runs` + `usage_records` untuk analytics, tracing Langfuse OTel `streamText`/`embed`, serta UI `UsageStats` `tokens · TTFT · total` Body-sm Stone Gray + `FeedbackButtons` thumbs `positive|negative` `feedback` table. Tanpa fase ini cost/latency tidak transparan.

## 2. Scope & Dependensi

- **Dependensi:** Fase 03 Done (`generation_runs` `promptTokens` `latencyMs` placeholder + `streamText` via 9Router), Fase 05 Done (`comparison_runs` per-model generation `usage_records` minimal sudah Fase 03). Fase 02 `vector` extension tidak dibutuhkan Fase 09.
- **Deliverable Fase 09:**
  1. `usage_records` lengkap (jika belum Fase 03) + `feedback` (migration `0008`)
  2. `src/lib/langfuse/tracing.ts` server-only `Langfuse` `sk-lf-...` `pk-lf-...` `baseUrl cloud.langfuse.com` via `@langfuse/vercel-ai-sdk` + `@langfuse/otel` `withLangfuse(streamText)` graceful null if env missing (MVP dev optional)
  3. Latency `startedAt` + `firstTokenAt` via `onChunk text-delta` → `latencyMs = completed-started` `TTFT = first-started`
  4. Usage `onFinish {usage}` → `UPDATE generation_runs` + `INSERT usage_records` per `generationId`
  5. `UsageStats.tsx` Body-sm Stone Gray `Timer` per message (single) & per `ModelColumn` (compare)
  6. `FeedbackButtons.tsx` `ThumbsUp/ThumbsDown` Lucide 16 pill 10px active `bg-sandstone` + `submitFeedback` upsert `feedback` `generationRunId` ownership 403
- **Out of scope:** Rate limit (Fase 10), `web_sources` per-web tracing lanjutan, `credit_transactions` display `CreditWidget` sudah Fase 03, `consensus` Fase 11.

## 3. Data Model

### 3.1 `usage_records` (sudah Fase 03 minimal, Fase 09 pastikan lengkap)

- `id uuid PK`, `userId text FK CASCADE`, `generationRunId uuid FK generation_runs.id CASCADE`, `modelId text not null`, `promptTokens integer not null`, `completionTokens integer not null`, `totalTokens integer not null`, `createdAt timestamptz`, Indexes `userId+createdAt`, `modelId`

### 3.2 `feedback` (baru Fase 09)

- `id uuid PK`, `userId FK CASCADE`, `generationRunId FK CASCADE not null`, `rating text nullable` `positive|negative` Zod `enum`, `comment text nullable` future, `createdAt`, Indexes `generationRunId`, `userId`, Unique `userId+generationRunId` upsert (satu feedback per generation per user, `UPDATE` jika exists)

### 3.3 `generation_runs` fields sudah Fase 03 (Fase 09 isi)

- `promptTokens`, `completionTokens`, `totalTokens`, `latencyMs`, `timeToFirstTokenMs`, `startedAt`, `completedAt` — Fase 09 isi via `onChunk` + `onFinish`.

## 4. Observability (ARCHITECTURE §12)

### 4.1 Langfuse `src/lib/langfuse/tracing.ts` server-only

- **Deps:** `bun add @langfuse/vercel-ai-sdk @langfuse/otel langfuse` (check Bun compat, fallback null).
- **Init:**
  ```ts
  let langfuse:any=null;
  if(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY){
    try{ const {Langfuse}=await import("langfuse"); langfuse=new Langfuse({secretKey:process.env.LANGFUSE_SECRET_KEY!, publicKey:process.env.LANGFUSE_PUBLIC_KEY!, baseUrl:process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com"});}catch(e){ langfuse=null; }
  }
  export {langfuse};
  export function withLangfuse(r:any){ if(!langfuse) return r; try{ return r; }catch{ return r; } }
  ```
  Jika `LANGFUSE_SECRET_KEY` missing (dev MVP optional) → `null` no throw.
- **Trace:** `withLangfuse(streamText({model:nineRouter(routerModelId), ...}))` → `traceId=conversationId`, `generationId=generationRuns.id`, `model=routerModelId`, `pricing` from `ModelRegistry metadata.pricing` optional future.

### 4.2 Logging

- **Langfuse trace:** `generation-error` `ERR-001` → `level error` `userId anonymized hash` `modelId` `error.code`.
- **Console:** `DB failures`, `Tavily fail`, `R2 fail` log `modelId` `error.code` not `content` full.
- **Redaction:** `generationRuns.content` not sent to Langfuse by default unless `LANGFUSE_ENABLE_CONTENT=true` env, `password`/`apiKey` substring redact.

## 5. Latency (AI-BEHAVIOR §20)

**Measure `chat.ts` `sendMessage`/`sendCompareMessage` before `streamText`:**

```ts
const startedAtMs=Date.now();
let firstTokenAtMs:number|null=null;
// onChunk: ({chunk})=>{ if(chunk.type==="text-delta" && firstTokenAtMs===null) firstTokenAtMs=Date.now(); }
const completedAtMs=Date.now();
const latencyMs=completedAtMs-startedAtMs;
const timeToFirstTokenMs=firstTokenAtMs? firstTokenAtMs-startedAtMs : null;
await db.update(generationRuns).set({latencyMs,timeToFirstTokenMs,completedAt:new Date(completedAtMs)}).where(eq(generationRuns.id,genId));
```

**Display `UsageStats` Body-sm Stone Gray `Timer` per message & per ModelColumn:** `120 tokens · 340ms TTFT · 1.2s total` — `tokens totalTokens`, `TTFT timeToFirstTokenMs`, `total latencyMs/1000`, `"-"` if null.

## 6. Token Usage (AI-BEHAVIOR §19 + API `UsageEvent`)

**Capture `onFinish {usage:{promptTokens,completionTokens,totalTokens}}` or `UsageEvent` `type:'usage'`:**

```ts
await db.update(generationRuns).set({promptTokens:usage.promptTokens, completionTokens:usage.completionTokens, totalTokens:usage.totalTokens}).where(eq(generationRuns.id,genId));
await db.insert(usageRecords).values({userId:session.user.id, generationRunId:genId, modelId:data.modelId, promptTokens:usage.promptTokens, completionTokens:usage.completionTokens, totalTokens:usage.totalTokens});
```

Compare per `genId` same `Promise.allSettled` per-model.

## 7. Feedback

**Server `src/server/functions/feedback.ts`:** `createServerFn` `submitFeedback` `POST` Zod `{generationRunId uuid, rating enum positive|negative, comment max500 optional}` → `getAuthSession` 401 → `SELECT generationRuns WHERE id` → `conversations.userId===session.user.id` else 403 → `SELECT feedback WHERE generationRunId+userId` exists → `UPDATE rating` else `INSERT` → return row. `getFeedback` `GET` `{generationRunId}` → `SELECT` owner else null.

**UI `FeedbackButtons.tsx`:** below `assistant` message after `UsageStats`, `ThumbsUp 16` + `ThumbsDown 16` pill `10px` `bg-pure-white border hairline-mist` active `bg-sandstone border-ink-black` `aria-pressed`, `onClick positive → submitFeedback({generationRunId, rating:"positive"})` optimistic `active` + toast `Terima kasih`, `getFeedback` initial `null` → `rating` state.

## 8. UI Spec

**`UsageStats.tsx`:** `<div data-testid="usage-stats" className="text-xs text-stone-gray flex items-center gap-2" title={`Prompt ${promptTokens} / Completion ${completionTokens}`}>` `<Timer size={12}/> {totalTokens ?? "-"} tokens · {timeToFirstTokenMs ? `${timeToFirstTokenMs}ms TTFT` : "- TTFT"} · {latencyMs ? `${(latencyMs/1000).toFixed(1)}s total` : "- total"}` `</div>`

**Integration:** `MessageList.tsx` single → after `assistant` bubble `<UsageStats generation={generationRuns[0]} />` + `<FeedbackButtons generationId={generationRuns[0].id} />`, `ModelColumn.tsx` compare → footer `<UsageStats generation={gen} />` + `<FeedbackButtons generationId={gen.id} />` inside column scroll.

## 9. Security

- Never log `prompt content` full, `file content`, `apiKey`, `session token` to Langfuse if `LANGFUSE_*` without opt-in, redaction PII.
- Safe log `userId anonymized hash`, `conversationId`, `generationId`, `modelId`, `finishReason`.
- `feedback` `generationRunId` ownership check prevents user B feedback on A generation.

## 10. Testing

- **Unit `usage.test.ts`:** `onFinish` `usage 10/20/30` → `UPDATE generation_runs` + `INSERT usage_records` 10/20/30, `latency 1200` `TTFT 340`.
- **Unit `latency.test.ts`:** `started 1000 first 1340 completed 2200` → `TTFT 340 total 1200`.
- **Unit `feedback.test.ts`:** `submitFeedback` insert positive → update negative → 403 other user → 401 no session.
- **Unit `tracing.test.ts`:** `langfuse null` when env missing no throw, `withLangfuse` wrap without error.
- **Integration `usage.test.ts` real PG mock 9Router streaming + mock Langfuse:** `sendMessage` mock `streamText` `usage` → `SELECT generation_runs promptTokens 10 latencyMs not null TTFT not null`, `SELECT usage_records 1 row totalTokens 30`, `sendCompare 2 models` → 2 `usage_records` rows each `latency` distinct, `feedback` insert per gen.
- **E2E `usage.spec.ts` Playwright mock 9Router streaming with usage real DB:** login → `/chat/$id` → Send `halo` → `UsageStats` visible `tokens` + `ms TTFT` + `s total` after stream finish, Compare 2 models → each `ModelColumn` footer `usage-stats` different tokens 30 vs 40, Feedback after stream click `ThumbsUp` → `aria-pressed true` + toast → click `ThumbsDown` → `Down` active `Up` inactive → reload → still `Down` active (persisted).

## 11. Definition of Done

- Setiap `sendMessage`/`sendCompareMessage` → `generation_runs` `promptTokens/completionTokens/totalTokens/latencyMs/timeToFirstTokenMs` + `usage_records` row per generation
- `UsageStats` per message (single) & per column (compare) Body-sm Stone Gray `tokens · TTFT · total` `Timer` per message & per ModelColumn, tooltip breakdown
- `FeedbackButtons` ThumbsUp/Down 16 pill 10px active `bg-sandstone` + `submitFeedback` upsert `feedback` `generationRunId` ownership 403 persist after reload
- Langfuse `withLangfuse(streamText)` trace if env set, no crash if env missing null graceful, no PII leak
- `tsc 0` `biome pass` unit+integration+E2E pass `grep LANGFUSE_SECRET` in client 0 no `shadow-xl`

## 12. File yang Akan Dibuat/Dimodifikasi

- **Create:** `src/lib/langfuse/tracing.ts`, `src/server/functions/feedback.ts`, `src/components/chat/UsageStats.tsx`, `FeedbackButtons.tsx`
- **Modify:** `src/lib/db/schema.ts` (+`feedback` if not exists, `usage_records` ensure), `src/server/functions/chat.ts` (`onChunk` `firstTokenAt` + `usage_records` insert `withLangfuse` wrap), `src/components/chat/MessageList.tsx` (`UsageStats`+`FeedbackButtons` below assistant), `src/components/chat/ModelColumn.tsx` (footer stats+feedback), `src/lib/env.server.ts` (`LANGFUSE_*` optional)
- **Test:** `tests/unit/usage.test.ts` `latency.test.ts` `feedback.test.ts` `tracing.test.ts`, `tests/integration/usage.test.ts`, `tests/e2e/usage.spec.ts`

## 13. Larangan Khusus (jangan halu)

- DILARANG invent `LANGFUSE_*` values — `ENVIRONMENT.md` `sk-lf-...`/`pk-lf-...` optional MVP dev required prod, `pricing` cost estimation future `inputPerMillion` not Fase 09
- DILARANG hardcode `latencyMs` — `Date.now()` real not fake
- DILARANG expose `LANGFUSE_SECRET_KEY` di client — server-only `tracing.ts`
- DILARANG emoji di stats/feedback — Lucide `Timer`, `ThumbsUp`, `ThumbsDown`
- DILARANG `shadow-xl` di stats/feedback buttons — border `hairline` White 10px

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD`/`TODO` kecuali Open/TBD section allowed configurable `LANGFUSE_BASE_URL` default `https://cloud.langfuse.com` explicit, `feedback comment` nullable future explicit, tidak ada `TODO` `implement later`.
- **Internal consistency:** `usage_records` `generationRunId FK CASCADE` konsisten `chat.ts` `INSERT usageRecords` per `genId`, `feedback` `userId+generationRunId` unique upsert konsisten `feedback.ts` `SELECT` exists → `UPDATE` else `INSERT`, `withLangfuse` graceful null konsisten `LANGFUSE_*` optional.
- **Scope check:** Fase 09 hanya observability + usage + feedback, tidak melebar ke `web_sources` (Fase 08) — isolated.
- **Ambiguity check:** `feedback rating positive|negative` explicit enum, `LANGFUSE_SECRET_KEY` optional MVP dev required prod explicit.

Spec siap untuk user review sebelum `writing-plans`.

