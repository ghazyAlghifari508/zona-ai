# Fase 03 — Single-Model Chat (Core AI Loop) — Spec

> Status: DRAFT — Menunggu review. DILARANG bikin plan/code sebelum approve.
> Referensi: `docs/MILESTONES.md` Milestone 3, `docs/PRD.md` FR-003..008/012/018/019/021-024 + NFR-001, `docs/ARCHITECTURE.md` §5/8/13, `docs/DATABASE.md` §3 generation_runs + credit_transactions, `docs/API.md` §1 Chat API + Streaming Protocol, `docs/AI-BEHAVIOR.md` §1/3/5/7-9/19-20, `docs/MODEL-REGISTRY.md`, `docs/UI-UX.md` Main Chat/Composer/Model Selector, `DESIGN.md`, `docs/ERROR-HANDLING.md` ERR-001..004/007-008/016-019, `docs/SECURITY.md`, `.agents/rules/anti-ai-slop.md`, `.agents/rules/zona-ai-context.md`

## 1. Tujuan

Membangun loop chat single-model end-to-end sebagai inti produk: user pilih satu model (default `Auto (Smart Router)`) → kirim prompt → server stream token real-time via 9Router + AI SDK 7 → client render markdown + code block copy → bisa stop mid-stream & regenerate → tracking `generation_runs` + `credit_transactions` + `usage_records` minimal, serta UI workspace (sidebar + chat area + composer) patuh DESIGN.md. Prasyarat Fase 04 persistence (CRUD) dan Fase 05 Compare.

## 2. Scope & Dependensi

- **Dependensi:** Fase 01 Done (scaffold, Tailwind `@theme` cream `#f5f1e4` radius 50px, Inter, `env.server.ts` Zod 18 vars, `PublicShell`/`WorkspaceShell` skeleton) + Fase 02 Done (PG Drizzle + `vector` extension, Better Auth Google only, helper `getAuthSession` throw 401, 5 tabel `users/sessions/accounts/conversations/messages`, auth pages pill 50px).
- **Deliverable Fase 03:**
  1. Model Registry config-based `src/lib/models/*` + `getModels` server fn single source of truth
  2. Auto Router heuristic `resolveAutoModel` 3-tier lightweight/reasoning/coding
  3. 9Router client `createOpenAICompatible` server-only
  4. System prompt `buildSystemPrompt` + skill injection `none` full + `checklist/prd-plan/agent-skill` placeholder
  5. Credit atomic `deductCredits`/`refundCredits` + `resetDevCredits` dev-only + `credit_transactions`
  6. DB `generation_runs` + `credit_transactions` + `usage_records` minimal
  7. Server `sendMessage`/`regenerateMessage`/`stopGeneration` + `getModels` + `resetDevCredits`
  8. Workspace UI: `WorkspaceShell` + `Sidebar` + `CreditWidget` + `MessageList` markdown + `Composer` pill 50px + `ModelSelector` + `SkillSelector` + `CodeBlock` + `$conversationId` route
  9. Streaming display tagged `generationId` + `Routed to ...` badge jika auto
  10. Stop mid-stream & regenerate preserve partial
- **Out of scope:** `comparison_runs`/`attachments`/`document_chunks`/`web_sources`/`feedback` (Fase 05-09), `comparison_runs` multiplex (Fase 05), RAG/Tavily (Fase 07-08), `usage_records` lengkap + Langfuse (Fase 09), rate limiting (Fase 10).

## 3. Data Model

### 3.1 `generation_runs`

- `id uuid PK default gen_random_uuid()`
- `messageId uuid FK messages.id ON DELETE CASCADE` — assistant message owner
- `comparisonRunId uuid FK comparison_runs.id ON DELETE SET NULL nullable` placeholder Fase 05, null di Fase 03
- `conversationId uuid FK conversations.id ON DELETE CASCADE`
- `modelId text` — Zona ID (`auto` atau `gpt-5.6-sol`)
- `routerModelId text` — 9Router ID (`auto` resolved `ag/gemini-3.7-flash-high`)
- `skillId text nullable` — `none|checklist|prd-plan|agent-skill`
- `status text` — `queued|streaming|completed|cancelled|failed`
- `content text nullable`, `reasoningContent text nullable`, `error jsonb nullable`
- `promptTokens integer nullable`, `completionTokens`, `totalTokens`, `latencyMs integer nullable`, `timeToFirstTokenMs integer nullable`, `startedAt timestamptz nullable`, `completedAt timestamptz nullable`, `createdAt timestamptz default now()`
- Indexes: `conversationId`, `comparisonRunId`, `messageId`, `status`

### 3.2 `credit_transactions`

- `id uuid PK`, `userId text FK users.id CASCADE`, `generationRunId uuid FK generation_runs.id ON DELETE SET NULL nullable`, `amount integer` (`-15` deduct, `+100` refill), `type text` (`usage|refill|refund|initial_grant`), `modelId text nullable`, `balanceAfter integer not null`, `description text nullable`, `createdAt timestamptz default now()`, Indexes `userId`, `generationRunId`, `createdAt DESC`

### 3.3 `usage_records` minimal

- `id uuid PK`, `userId FK CASCADE`, `generationRunId FK CASCADE`, `modelId text`, `promptTokens`, `completionTokens`, `totalTokens`, `createdAt`, Indexes `userId+createdAt`

**Migration:** `0002_generation_runs` + `0003_credit_transactions` via `drizzle-kit generate`, `vector` extension sudah Fase 02, atomic `UPDATE users SET credits=credits-amount WHERE id=? AND credits>=amount RETURNING credits`.

## 4. Model Registry + Auto Router

### 4.1 Interface `ModelRegistryEntry` `src/lib/models/types.ts`

- `id`, `routerModelId`, `displayName`, `provider`, `description`, `enabled boolean`, `creditCost number|{min,max}`, `creditTier economy|balanced|premium|adaptive`, `isDefault? boolean`, `capabilities {text,vision,files,tools,reasoning}`, `metadata {contextWindow, maxOutput, pricing:{inputPerMillion,outputPerMillion}|null, category, speedClass}`, `routingRules` hanya `auto`.

### 4.2 Registry `src/lib/models/registry.ts` config 3 model

- `auto` `routerModelId:auto` provider `zona-router` display `Auto (Smart Router)` enabled `isDefault:true` `creditCost {min:1,max:4}` `adaptive` all capabilities true `contextWindow 1048576` `routingRules` lihat §4.3
- `gemini-3.7-flash-high` `ag/gemini-3.7-flash-high` `antigravity` `balanced` `4` `reasoning true` `1048576`
- `gpt-5.6-sol` `cx/gpt-5.6-sol` `codex` `premium` `15` `372000`
- Helpers `getAvailableModels()` filter `enabled`, `getModelById(id)` throw `ERR-003` 400, `isVisionCapable`.

### 4.3 Auto Router `src/lib/models/router.ts` `resolveAutoModel(prompt, opts?:{credits})`

- Lightweight ` <100w greeting factual QA` → `ag/gemini-3.7-flash-low` 1 `lightweight`
- Heavy reasoning `math/logic/RAG multi-step` → `ag/gemini-3.7-flash-high` 4 `heavy-reasoning`
- Coding ` ```/refactor/debug/SQL` → `cx/gpt-5.6-sol` 15 `coding-architecture`, fallback low-credit `credits<15` → `ag/gemini-3.7-flash-high` 4, UI `Routed to ...` badge `generation-start` `resolvedModelId+routingReason`.

## 5. AI Streaming + Credits + Server Functions

### 5.1 9Router `src/lib/ai/9router.ts` server-only

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
export const nineRouter = createOpenAICompatible({ baseURL: process.env.NINE_ROUTER_BASE_URL!, apiKey: process.env.NINE_ROUTER_API_KEY!, name: "9Router" });
```

### 5.2 System Prompt `src/lib/ai/system-prompt.ts`

`buildSystemPrompt({skillId, hasWebSources})` — `none` natural, `checklist` `Deconstruct ... - [ ] checkboxes Preparation/Implementation/Review`, `prd-plan` Objective/Problem/Architecture/Milestones/DoD, `agent-skill` `SKILL.md` YAML metadata; Fase 03 `none` full, 3 placeholder string.

### 5.3 Credits `src/lib/ai/credits.ts` atomic

`deductCredits({userId,generationRunId,modelId,amount})` → `UPDATE users SET credits=credits-amount WHERE id=? AND credits>=amount RETURNING credits` + `INSERT credit_transactions amount:-cost type:usage balanceAfter`, throw `ERR-019` 402 jika insufficient; `refundCredits` `UPDATE +amount` + `INSERT refund`; `resetDevCredits` `UPDATE credits=100` if `NODE_ENV!=="production"`.

### 5.4 Server `getModels` `GET`

`getAuthSession` → 401, `getAvailableModels()`.

### 5.5 Server `sendMessage` `POST` Zod `conversationId? uuid, modelId string, skillId enum default none, content min1 max20000, attachmentIds? uuid[], enableWebSearch? bool`

Flow `getAuthSession` 401 → `getModelById` 400 ERR-003 → `cost` (auto→`resolveAutoModel`) → check `credits>=cost` else 402 ERR-019 → get/create `conversations` verify `userId` 403 → insert `messages` user → deduct → insert `assistant` + `generation_runs queued` → `streamText({model:nineRouter(routerModelId), system, messages:history, abortSignal})` → `toDataStreamResponse` tagged `generationId` → `onFinish` `UPDATE generation_runs content/usage/latency status:completed`; `stopGeneration` `AbortController.abort()` → `cancelled` partial preserved; `regenerateMessage` new `generation_runs` same context.

### 5.6 Streaming Protocol tagged `generationId+modelId`

`generation-start` (`resolvedModelId+routingReason` jika auto), `text-delta`, `reasoning-start/delta`, `tool-call`, `source`, `usage`, `generation-finish`, `generation-error`.

## 6. UI Workspace

- **WorkspaceShell:** `flex min-h-screen bg-cream-paper`, `aside w-[280px] bg-pure-white border-r hairline-mist h-screen sticky` (logo 15px 500, `+ New Chat` pill 50px grass, search placeholder, list empty, `CreditWidget` bottom), `main flex-1 p-6 max-width 800px mx-auto` Cream.
- **Sidebar+CreditWidget:** White L1, `CreditWidget` `Gem 85 Kredit` Lucide 15px Stone Gray + progress Fresh Grass/Coral + dev `[Reset 100]` Zap call `resetDevCredits`, profile `LogOut`.
- **MessageList:** `role="log" aria-live="polite"`, user bubble `bg-sandstone rounded-[10px] px-3 py-2` `Body-lg 18px` right 70%, assistant `transparent` + avatar `Bot` + `displayName` + `cost badge` + `Routed to ...` Stone Gray if auto, `react-markdown` + `rehype-sanitize` + `rehype-highlight`, `CodeBlock` Sandstone 10px `Copy` Lucide, streaming `text-delta` + blinking `▌`, virtual belum Fase 03 (Fase 04 >50).
- **Composer:** `fixed bottom` White pill `50px` `border hairline-mist` `p-2` `max-width 800px` centered, `textarea` auto-resize `min-h 24 max-h 160` placeholder `Tanyakan apa saja ke Zona.ai...` `15px Stone Gray`, toolbar left `ModelSelector` pill `Auto pinned {1,4} ⚡` + cost badges `15 ⚡ Premium` dim `0.5` tooltip `Butuh 15 (Sisa 8)` if insufficient, `SkillSelector` `Wrench` 4 opsi `Tanpa skill` default + Checklist/Prd/Agent `FileText/Bot` + checkmark, `Attachment` disabled Paperclip, `Web` disabled Globe, right `Send ArrowUp Fresh Grass` ↔ `Stop Square` saat streaming, hint below `GPT-5.6 Sol memakai kredit lebih cepat — pakai Auto →` 13px if premium.

## 7. Security & Error

- **Server-only:** `NINE_ROUTER_*` `DATABASE_URL` tidak di `components`, `getAuthSession` tiap server fn 401, ownership `conversations.userId===session.user.id` else 403, Zod `content min1 max20000` + `modelId enabled` + `skillId enum`, `rehype-sanitize` strip `<script><iframe> onclick`, no `dangerouslySetInnerHTML`, never log `content` ke Langfuse tanpa redaction.
- **Error:** ERR-001 502 inline retry, ERR-002 401 redirect, ERR-003 400 invalid model, ERR-004 504 timeout, ERR-007 stream interrupted partial preserved, ERR-008 cancel `cancelled`, ERR-016 malformed 500, ERR-019 402 insufficient reject sebelum 9Router.

## 8. Testing

- **Unit:** `registry.test.ts` filter enabled + ERR-003, `router.test.ts` 6 cases lightweight/reasoning/coding fallback, `credits.test.ts` atomic deduct 402/refund, `validation` Zod, `system-prompt` `checklist` contains `- [ ]`, `stream` parse `StreamEvent`.
- **Integration `chat.test.ts`:** real PG test DB mock 9Router SSE `sendMessage auto→ag/gemini 4` deduct `credit_transactions -4 balanceAfter`, insufficient premium 402, ownership 403, `getModels` 3.
- **E2E `chat-single.spec.ts`:** login mock → Auto → `halo` → streaming `Hello` + `Routed to` badge → Stop → partial `cancelled` → Regenerate → new stream, `chat-credits.spec.ts` credits 0 → `gpt-5.6-sol` 402 toast.

## 9. Definition of Done

- `getModels` 3 registry no hardcode, Auto default heuristic 3-tier + badge `Routed to`
- Send prompt → streaming markdown + code copy, TTFT <150ms mock internal, latency/tokens stored `generation_runs`, stop `cancelled` partial, regenerate new run, `credit_transactions` atomic 402 block, dev reset 100, ownership 403, virtual belum Fase 03, inline retry, `tsc 0` `biome pass` no secret in client no `shadow-xl`.

## 10. File yang Akan Dibuat/Dimodifikasi

- **Create:** `src/lib/models/types.ts`, `registry.ts`, `router.ts`, `src/lib/ai/9router.ts`, `system-prompt.ts`, `credits.ts`, `src/lib/db/schema.ts` (+generation_runs+credit_transactions+usage_records), `src/server/functions/models.ts`, `chat.ts`, `credits.ts` (reset), `src/components/layout/WorkspaceShell.tsx` extend + `Sidebar.tsx` `CreditWidget.tsx`, `src/components/chat/MessageList.tsx`, `Composer.tsx`, `ModelSelector.tsx`, `SkillSelector.tsx`, `CodeBlock.tsx`, `src/routes/chat/$conversationId.tsx`, `tests` unit/integration/e2e
- **Modify:** `src/lib/env.server.ts` `NINE_ROUTER_*`, `src/routes/chat/index.tsx`

## 11. Larangan Khusus

- DILARANG frontend import `src/lib/ai/9router.ts`/`src/lib/db/*` — via `createServerFn` saja, DILARANG hardcode `["auto","gemini"]` di `ModelSelector`, DILARANG fake streaming `setTimeout`, DILARANG `shadow-xl`/`emoji` Lucide only, DILARANG expose `NINE_ROUTER_API_KEY` di client.

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD`/`TODO` kecuali Open/TBD section allowed (tidak ada, semua explicit).
- **Internal consistency:** `generation_runs` `comparisonRunId nullable` konsisten Fase 05 placeholder, `credit_transactions` `balanceAfter` konsisten `deductCredits`, `ModelRegistryEntry` `creditCost {1,4}` konsisten `router.ts` 1/4/15, `StreamEvent` tagged `generationId` konsisten `sendMessage`.
- **Scope check:** Fase 03 hanya single-model loop, tidak melebar ke `comparison_runs` (Fase 05) — isolated.
- **Ambiguity check:** `resolveAutoModel` fallback low-credit explicit `credits<15 → ag/gemini 4`, `timeToFirstTokenMs` null jika failed before first token — explicit.

Spec siap untuk user review sebelum `writing-plans`.

