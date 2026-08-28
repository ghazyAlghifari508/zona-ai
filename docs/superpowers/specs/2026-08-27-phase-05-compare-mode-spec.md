# Fase 05 — Compare Mode (Multi-Model Parallel) — Spec

> Status: DRAFT — Menunggu review. DILARANG bikin plan/code sebelum approve.
> Referensi: `docs/MILESTONES.md` Milestone 5, `docs/PRD.md` FR-009..011/018/020/023 + Acceptance Compare Done, `docs/ARCHITECTURE.md` §6 Compare Mode Architecture, `docs/DATABASE.md` §3 comparison_runs + generation_runs, `docs/API.md` §2 Compare Chat API + Streaming Protocol Multiplexed, `docs/AI-BEHAVIOR.md` §2 Compare Mode + §13-16 Partial Failure/Fair Compare, `docs/MODEL-REGISTRY.md` §10 Credit Tier, `docs/UI-UX.md` Model Selector Compare + Compare Mode Layout + Mobile + Composer, `DESIGN.md`, `docs/ERROR-HANDLING.md` ERR-005/006/019, `docs/SECURITY.md`, `.agents/rules/anti-ai-slop.md`

## 1. Tujuan

Membangun fitur pembeda Zona.ai: user pilih 2-4 model eksplisit (Auto disabled) → satu prompt → server dispatch parallel `streamText` ke 9Router → multiplex satu SSE Tagged `generationId+modelId` → client demux render kolom side-by-side independen (2-4 cols) dengan error/retry/cancel per-model, metrics token/latency per kolom, kredit kumulatif `total=sum(cost)` + refund `+cost` untuk failed saja, mobile tabs swipe. Prasyarat Compare Done.

## 2. Scope & Dependensi

- **Dependensi:** Fase 03 Done (Registry 3 model `auto` 1/4/15, `9router.ts` `createOpenAICompatible`, `credits.ts` atomic, `generation_runs` + `credit_transactions`, `sendMessage` streaming SSE `generationId`, `WorkspaceShell` 280px) + Fase 04 Done (PG `conversations/messages` `getConversations` cursor `updatedAt DESC`, `getMessages` batch `generationRuns`, `generateTitle` 60, `Sidebar` CRUD search, `MessageList` `useVirtualizer` >50). Fase 01-02 Done.
- **Deliverable Fase 05:**
  1. DB `comparison_runs` + `generation_runs.comparisonRunId` FK update (migration `0004`)
  2. `deductCompareCredits` atomic cumulative + `refundCredits` per failed + `compareSchema` Zod 2-4 no auto no dup
  3. `src/lib/ai/multiplex.ts` `StreamEvent` discriminator + `createMultiplexStream` + `toTaggedStream`
  4. `sendCompareMessage` `Promise.allSettled` parallel `streamText` same history/skill, `comparison_runs.status` `running→completed/partial_failure/failed`, `Promise.allSettled` refund per failed
  5. `CompareSelector` multi 2-4 Auto disabled + cumulative `Total: 19 Kredit` realtime
  6. `CompareGrid` + `ModelColumn` side-by-side 2=50/50 3=33% 4=25%+scroll 2x2 tablet + header sticky + body scroll independen + footer metrics, validasi `modelIds 2-4`
  7. `CompareToggles` Standard|Compare pill 50px + `MobileCompareTabs` swipeable
  8. `Composer` cumulative banner + `Switch` `ModelSelector` ↔ `CompareSelector`, `Send` disable if insufficient
  9. Per-model error panel + `retryGeneration` + `stopGeneration` per-model + `stopAll` + `AbortController Map`
  10. Token/latency per-model `generation_runs` + `usage_records` per generation
- **Out of scope:** `attachments`/`document_chunks`/`web_sources`/`feedback` (Fase 06-09), `web_sources` Fair Compare `searchWeb` sekali baru Fase 08 (Fase 05 siap tapi belum fetch web), `LANGFUSE` per-model tracing Fase 09, `consensus`/`blind` Fase 11 Post-MVP.

## 3. Data Model

### 3.1 `comparison_runs`

- `id uuid PK default gen_random_uuid()`
- `conversationId uuid FK conversations.id ON DELETE CASCADE`
- `userMessageId uuid FK messages.id ON DELETE CASCADE` — user message trigger compare
- `status text` `running|completed|partial_failure|failed`
- `modelIds text[] not null` length 2-4 (e.g. `["gemini-3.7-flash-high","gpt-5.6-sol"]`)
- `createdAt timestamptz default now()`, `completedAt timestamptz nullable`
- Indexes: `conversationId`

### 3.2 Patch `generation_runs`

- `comparisonRunId uuid FK comparison_runs.id ON DELETE SET NULL nullable` — sudah placeholder nullable Fase 03, Fase 05 aktifkan FK + Index `comparisonRunId`, null untuk `sendMessage` single, terisi untuk `sendCompareMessage` N rows per compare.

### 3.3 Relasi

- `conversations ||--o{ comparison_runs`, `comparison_runs ||--o{ generation_runs`, `messages ||--o{ comparison_runs` via `userMessageId`, delete `conversations` → cascade `comparison_runs` → `generation_runs` via `conversationId` cascade, `SET NULL` untuk manual delete `comparison_runs`.

### 3.4 Migration

- `0004_comparison_runs.sql` `CREATE TABLE comparison_runs ...`, `ALTER TABLE generation_runs ADD COLUMN comparison_run_id uuid REFERENCES comparison_runs(id) ON DELETE SET NULL`, `CREATE INDEX`.

## 4. Credits + API Contracts

### 4.1 Cost Tier

- `auto` tidak di Compare, `ag/gemini-3.7-flash-high` `4` `balanced`, `cx/gpt-5.6-sol` `15` `premium`, `total=sum(costs)` contoh `4+15=19`, `constants.ts` `COMPARE_MAX_MODELS 4`, `COMPARE_MIN_MODELS 2`, `ALLOWED_MIME` tidak relevan Fase 05.

### 4.2 `deductCompareCredits({userId,generationRunIds,modelIds,costs})`

- `UPDATE users SET credits=credits-total WHERE id=? AND credits>=total RETURNING credits` → 0 rows → `ERR-019` 402 `Kredit tidak mencukupi... Butuh 19 (Sisa 8)` sebelum 9Router, else `INSERT credit_transactions` N rows `amount:-cost type:usage modelId balanceAfter` `balanceAfter` final sama untuk N. Refund per failed: `refundCredits` `UPDATE +cost` + `INSERT +cost type:refund` hanya untuk `failed` (bukan `cancelled` user abort).

### 4.3 `sendCompareMessage` `POST` Zod `conversationId? uuid, modelIds array 2-4 string min1, skillId enum default none, content min1 max20000, attachmentIds? uuid[], enableWebSearch? bool` + refine `!modelIds.includes("auto")` + `new Set size===length` (no dup)

Flow `getAuthSession` 401 → `getModelById` per `modelId` 400 ERR-003 if disabled → `total` check `credits>=total` else 402 → get/create `conversations` mode `compare` verify `userId` 403 → insert `userMsg` → `deductCompareCredits` → insert `comparison_runs running` → loop N: insert `assistant` `messages` + `generation_runs streaming startedAt` → `history` same context `SELECT messages ORDER BY createdAt ASC` → `Promise.allSettled` per model `streamText({model:nineRouter(routerModelId), system:buildSystemPrompt(skillId), messages:history, abortSignal})` → `onFinish` `UPDATE generation_runs content/usage/latency status:completed/cancelled/failed` + `INSERT usage_records`, `onError` `failed` + `refundCredits`, final `UPDATE comparison_runs status` `completed` all fulfilled else `partial_failure` some else `failed` none + `completedAt`.

### 4.4 `retryGeneration({generationId uuid})`

- `getAuthSession` → `SELECT generationRuns` → `conversations.userId` 403 → check `status failed` → deduct `cost` single again → new `generation_runs` same `messageId` + `comparisonRunId` → `streamText` single.

### 4.5 `stopGeneration({generationId})` per-model + `stopAll({comparisonRunId})`

- `controllers Map generationId→AbortController` `abort()` → `UPDATE status cancelled` preserve partial, `partial_failure` if other completed. `stopAll` → `Promise.all` per `genId` in `comparisonRunId`.

### 4.6 `getComparisonRuns({conversationId})` `GET`

- `getAuthSession` + ownership → `SELECT comparison_runs WHERE conversationId ORDER BY createdAt DESC` + join `generation_runs` for reload `getMessages` batch.

## 5. Streaming Multiplex

### 5.1 Types `src/lib/ai/multiplex.ts` tagged `BaseEvent {generationId,modelId}`

`StreamEvent = generation-start {timestamp, resolvedModelId?, routingReason?} | text-delta {text} | reasoning-start | reasoning-delta {text} | tool-call {toolName,args} | source {sources:[{title,url}]} | usage {promptTokens,completionTokens,totalTokens} | generation-finish {finishReason} | generation-error {error,code}` — sesuai `API.md` §Streaming `StreamEvent` discriminator.

### 5.2 Server `toTaggedStream({generationId,modelId,stream})`

Wrap `streamText` `textStream` + `reasoningStream` + `usage` promise → `ReadableStream<StreamEvent>` enqueue `generation-start` at start, `text-delta` per `chunk`, `reasoning-delta` jika ada, `usage` at finish, `generation-finish`/`generation-error` catch → throw `ERR-001` 502 etc. Tagged `generationId+modelId` setiap chunk.

### 5.3 Merger `createMultiplexStream(streams: ReadableStream<StreamEvent>[]): ReadableStream<StreamEvent>`

`new ReadableStream { async start(controller){ const readers=streams.map(s=>s.getReader()); let doneCount=0; const pump=async(idx)=>{while(true){const {done,value}=await readers[idx].read(); if(done){doneCount++; if(doneCount===readers.length) controller.close(); break;} else controller.enqueue(value);}}; await Promise.all(readers.map((_,i)=>pump(i)));}}` — single HTTP SSE `Response(new ReadableStream, headers {"Content-Type":"text/event-stream"})` interleaved, no `setInterval` fake.

### 5.4 Client Demux

`event.generationId → column index` `Map generationId→ModelColumn` update `content` append `text-delta`, `reasoningContent`, `usage`, `finish`. `generation-start` `resolvedModelId` tidak perlu Compare (no auto) tapi tetap kirim `modelId`.

### 5.5 No Fake

Stream dari `streamText` real 9Router, mock hanya di test `msw`/`vi.mock("ai")`.

## 6. UI Compare

### 6.1 CompareSelector Multi 2-4 (Auto disabled)

White dropdown/modal `10px` `border hairline-mist` header `Pilih 2-4 Model` Stone Gray 11px uppercase, list `getModels()` filter `enabled` exclude `auto` (disabled tooltip `Auto tidak tersedia di Compare`), checkbox/pill `Gemini 3.7 Flash [4 ⚡]` `GPT 5.6 Sol [15 ⚡ Premium]` provider icon + capability dots, selected chips di atas `Gemini ×` Sandstone 10px, footer `Total: 19 Kredit` `Sisa: 85` `Butuh 19 (Sisa 8)` warning Stone Gray if insufficient, button `Bandingkan` disabled jika `<2`/`>4`/insufficient, validation inline `<2` `Pilih minimal 2`, `auto` checked → disabled.

### 6.2 CompareGrid + ModelColumn Side-by-side 2=50/50 3=33% 4=25%+scroll 2x2 tablet + header sticky + body scroll independen + footer metrics

User prompt anchor full-width Cream `You: ...` 15px Stone, grid `display:grid gap-4` `N=2 grid-cols-2 50/50`, `N=3 grid-cols-3`, `N=4 grid-cols-4 overflow-x-auto` + tablet `max-[1024px]:grid-cols-2` `2x2` 12px gap, hidden mobile `max-[768px]:hidden`, tiap `ModelColumn` White `#ffffff` `rounded-[50px]` `border hairline-mist` `min-h 400px` `flex flex-col`, header `sticky top-0 bg-pure-white rounded-t-[50px] p-3 flex justify-between border-b hairline` left `Bot 16 + displayName 15px 500 + status dot 8px Fresh Grass streaming Stone completed Ink failed`, right `Retry RotateCw` if failed, `Stop Square` if streaming, `Copy` if completed, body `flex-1 overflow-y-auto p-4` `MessageList` per column `content` markdown `reasoning` collapsible, `queued` skeleton `bg-sandstone pulse`, `failed` White center `Model gagal` 15px Stone + `Coba lagi` pill 10px, footer `tokens · TTFT · total` 12px Stone `Timer` per column.

### 6.3 Toggle Standard|Compare

`CompareToggles.tsx` Standard|Compare pill 50px `flex rounded-full border hairline-mist bg-pure-white p-1` buttons `Standard MessageSquare` vs `Compare Columns2` active `bg-sandstone border ink-black` `13px`, switch `mode` `UPDATE conversations SET mode='compare'`.

### 6.4 Mobile Tabs Swipeable

`MobileCompareTabs.tsx` `Tabs` `TabsList rounded-full bg-pure-white border p-1` `TabsTrigger` per model `Gemini`, `TabsContent` single `ModelColumn` visible, swipe `touch`, dot indicator, hidden desktop `hidden max-[768px]:block`.

### 6.5 Composer Cumulative Banner + Switch

`Composer.tsx` `mode` prop → if `compare` `ModelSelector` hidden → `CompareSelector` shown + `total` + insufficient disable `Send`, `onSend` → if `compare` `sendCompareMessage({modelIds,content,skillId,enableWebSearch})` else `sendMessage`, `attachmentIds` same file parts ke semua model (Fase 06, fair).

## 7. Security

- `getAuthSession` di `sendCompareMessage`/`retry`/`stop`/`getComparisonRuns` → 401, ownership `conversationId` `conversations.userId===session.user.id` else 403, `modelIds` no ownership tapi `enabled` check 400 ERR-003 + no dup + no `auto` 400, no secret `NINE_ROUTER_API_KEY` in client (grep 0), `RAG` `WHERE conversationId` scoped (Fase 07 belum), `Content max 20000` Zod.

## 8. Testing

- **Unit `multiplex.test.ts`:** parse `StreamEvent` discriminator + `generationId` demux + `createMultiplexStream` merge 2, `credits-compare.test.ts` `total 19` + insufficient 402 + refund `+15`, `validation-compare.test.ts` `modelIds 2-4` no auto no dup.
- **Integration `compare.test.ts` real PG + mock 9Router SSE:** `sendCompare 4+15` → `comparison_runs` `modelIds 2` `running→completed` + `generation_runs 2 completed` + `credit_transactions 2 rows -4 -15` + `usage_records 2`, partial 1 refund `+15` → `partial_failure`, all fail → `failed` +2 refunds, insufficient `credits 10 total 19` 402 0 `comparison_runs`, ownership 403, `retryGeneration` new run + deduct again, `stopGeneration` `cancelled` partial.
- **E2E `compare.spec.ts` Playwright mock 9Router SSE:** login → toggle Compare → select `Gemini+GPT Sol` `Total 19` → Send `jelaskan AI` → 2 cols `grid` side-by-side streaming both `Completed` footer tokens, partial mock `GPT 500` → left completed right `Model gagal` + `Retry` → click Retry → right stream success, insufficient `credits 5` → `19` → `402 toast`, mobile `375x667` tabs swipe, reload `/chat/$id` → `comparison_runs` restored 2 cols + metrics, cancel per-model `Stop` col0 `cancelled` col1 continues.

## 9. Definition of Done

- 2-4 `auto` disabled + duplicate reject + total realtime, N parallel `Promise.allSettled` no block, one gagal `partial_failure` refund, all gagal `failed`, per-model cancel `AbortController` preserve partial, insufficient 402 before deduct, token/latency per-model footer, `comparison_runs`+`generation_runs` persist reload, mobile tabs, `tsc 0` `biome pass` no `shadow-xl`.

## 10. File yang Akan Dibuat/Dimodifikasi

- **Create:** `src/lib/db/schema.ts` (+`comparison_runs` + `generation_runs.comparisonRunId` FK update) → migration `0004`, `src/lib/ai/multiplex.ts` (`StreamEvent`+`createMultiplexStream`+`toTaggedStream`), `src/server/functions/chat.ts` (+`sendCompareMessage`/`retry`/`stop` extend), `src/lib/ai/credits.ts` (+`deductCompareCredits`), `src/components/chat/CompareSelector.tsx`, `CompareGrid.tsx`, `ModelColumn.tsx`, `CompareToggles.tsx`, `MobileCompareTabs.tsx`, plus `src/lib/utils/validation.ts` (`compareSchema`).
- **Modify:** `src/components/layout/WorkspaceShell.tsx` (toggle), `src/routes/chat/$conversationId.tsx` (compare mode + demux), `src/components/chat/Composer.tsx` (cumulative banner + Switch), `src/components/layout/Sidebar.tsx` (compare chip), plus tests `unit/multiplex` `validation-compare` `credits-compare`, `integration/compare`, `e2e/compare`.
- **Test:** `tests/unit/multiplex.test.ts` + `validation-compare.test.ts` + `credits-compare.test.ts`, `tests/integration/compare.test.ts`, `tests/e2e/compare.spec.ts`.

## 11. Larangan Khusus

- DILARANG `auto` di `modelIds` — reviewer akan test `modelIds:["auto","gemini"]` harus 400, DILARANG sequential `for await` per model — wajib `Promise.allSettled` parallel, DILARANG hardcode `modelIds` di `CompareGrid` — dari `comparison_runs.modelIds` + `generation_runs`, DILARANG `shadow-xl` di kolom card, DILARANG `auto` di `modelIds`, DILARANG deduct sebelum check `credits>=total` — atomic check dulu, DILARANG refund `cancelled` (user abort) — hanya `failed`, DILARANG hardcode `cost` di komponen — dari `getModels` registry.

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD`/`TODO` kecuali Open/TBD section allowed configurable ( `COMPARE_MAX_MODELS 4` explicit). Semua Steps ada code block `comparison_runs` `createMultiplexStream`.
- **Internal consistency:** `comparison_runs` `modelIds text[]` konsisten `deductCompareCredits` `total=sum(cost)` 19, `generation_runs.comparisonRunId SET NULL` konsisten `comparison_runs.id`, `StreamEvent` tagged `generationId` konsisten `createMultiplexStream` + client demux.
- **Scope check:** Fase 05 hanya Compare 2-4 parallel multiplex, tidak melebar ke `attachments` (Fase 06) — isolated.
- **Ambiguity check:** `N messages` vs single message explicit N `assistant` messages + N `generation_runs`, `refund` only `failed` not `cancelled` explicit, `auto` disabled explicit.

Spec siap untuk user review sebelum `writing-plans`.

