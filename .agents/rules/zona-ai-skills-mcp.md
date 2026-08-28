# Zona.ai — Skills, MCP & Plugins Rules (WAJIB DIPATUHI)

> **Sumber kebenaran:** `AGENTS.md` + `docs/ARCHITECTURE.md` (locked stack) + `.agents/rules/*`
> Aturan ini mendefinisikan **skill / MCP / plugin apa yang wajib dipakai** untuk Zona.ai, kapan invoke, dan contoh penggunaan Zona.ai. Tidak boleh hardcode model, tidak boleh bypass skill gate.

---

## 1. Prinsip Wajib Skill

1. **Invoke skill SEBELUM aksi apa pun** — termasuk tanya klarifikasi, explore codebase, baca file. Jika skill relevan (ada 1% kemungkinan), WAJIB invoke. `superpowers:brainstorming` dan `systematic-debugging` adalah process skill prioritas tertinggi.
2. **Process skill dulu, implementation skill kemudian** — `brainstorming` → `writing-plans` → `dispatching-parallel-agents`/`executing-plans` → baru `frontend-design`/`ui-ux-pro-max`/`better-auth`.
3. **Jangan rationalize skip** — pikiran "ini simple", "butuh context dulu", "explore dulu" = STOP, cek skill dulu.
4. **Satu fase = satu spec + satu plan + satu review gate** — `spec` via `brainstorming` (architectural) → review user → `plan` via `writing-plans` → review user → `executing-plans`/`subagent-driven-development` → verify.

---

## 2. Skills Wajib untuk Zona.ai (Sudah Terinstall di Komputer Ini — WAJIB Dipakai)

| Skill | Kapan Wajib | Contoh Zona.ai |
|---|---|---|
| `superpowers:brainstorming` | **Sebelum spec apa pun** (Fase 01-11). Architectural path untuk subsystem baru (Foundation, Auth+DB, Single Chat, Persistence, Compare, File, RAG, Web Search, Observability, Hardening). | Fase 03 Single-Model Chat: classify architectural → propose 3 pendekatan (A: `streamText` + atomic credits) → Section 1-5 Data Model/Registry/Streaming/UI/Security minta approve → tulis `specs/phase-03-single-model-chat-spec.md` → self-review → minta review user. |
| `superpowers:writing-plans` | **Sebelum plan apa pun** setelah spec approve. Header `Goal/Architecture/Tech Stack/Spec/Global Constraints` + Task `Files/Interfaces/Steps` bite-sized (2-5 menit) + `Self-Review` + `Execution Handoff`. | Fase 02 Auth+DB: 7 tasks `Files:` `Create: src/lib/db/index.ts` `Test: tests/integration/db.test.ts` → Steps `Write failing test` → `Run fail` → `Implement` → `Run pass` → `Commit`. |
| `superpowers:executing-plans` | **Saat eksekusi plan batch** (inline, checkpoint per 2-3 tasks). | Eksekusi Fase 10 Hardening: `executing-plans` batch Task 1-3 (errors+rate-limit) → checkpoint review → Task 4-6. |
| `superpowers:subagent-driven-development` | **Saat eksekusi plan per task** (recommended, fresh subagent per Task + two-stage review). | Eksekusi Fase 05 Compare: dispatch subagent Task 1 `comparison_runs` → review → Task 2 `deductCompareCredits` → review. |
| `superpowers:systematic-debugging` | **Sebelum fix bug apa pun** (streaming putus, Compare satu model fail, RAG `vector` mismatch, `getAuthSession` 401). | Bug `Compare partial_failure refund tidak jalan`: trace `sendCompareMessage → deductCompareCredits → onFinish failed → refundCredits` + `generationId` → root cause → fix + test. |
| `superpowers:verification-before-completion` | **Sebelum claim Done** (18 pts DoD). | Fase 09: `bun x tsc --noEmit` 0 + `biome check` pass + `vitest run` unit+integration + `playwright` E2E `usage.spec.ts` + `grep LANGFUSE_SECRET` client 0 → baru claim Done. |
| `superpowers:dispatching-parallel-agents` | **Saat 2+ task independen tanpa shared state.** | Fase 01: `Biome` vs `Tailwind @theme` vs `Vitest` parallel setelah `app.config.ts` init. |
| `superpowers:using-git-worktrees` | **Sebelum eksekusi plan di isolated worktree.** | Fase 06 File Upload: `using-git-worktrees` → worktree `fase-06-file-upload` → `executing-plans`. |
| `superpowers:finishing-a-development-branch` | **Saat selesai branch, decide merge/PR.** | Fase 10 Hardening done: `finishing-a-development-branch` → cek `git status` → PR. |
| `superpowers:brainstorming` (visual companion) | **Saat pertanyaan visual** (Compare 2-4 cols vs tabs, Composer pill 50px). | Fase 05 Compare: "This next part might be easier if I show you — I can put together mockups..." → browser tab `CompareGrid` 50/50 vs 2x2 vs tabs swipe. |
| `test-driven-development` | **Saat implement feature/bugfix, sebelum code.** | Fase 06 `file-validation.test.ts`: `validateMagicBytes exe→pdf` fail → implement → pass. |
| `context7-mcp` | **Saat tanya library/framework** (React, Next.js, Prisma, TanStack Start, AI SDK 7, Better Auth, Drizzle, Tailwind). | Cek `AI SDK 7 streamText` signature sebelum `chat.ts` `streamText({model:nineRouter})` — jangan pakai API lama. |
| `better-auth-authentication` | **Saat auth flow** (Google OAuth only `FR-001`). | Fase 02: `betterAuth({database:drizzleAdapter(db,{provider:"pg"}), emailAndPassword:{enabled:false}, socialProviders:{google:{clientId,clientSecret}}, plugins:[tanstackStartCookies()]})` + `createAuthClient` + `api.auth.$` catch-all. |
| `better-auth-security-best-practices` | **Saat hardening auth** (rate limit, CSRF, session). | Fase 10: `RateLimit 20/min` `checkRateLimit({key:"chat:${userId}"})` + `SameSite=Lax` `HttpOnly Secure` + `getAuthSession` di tiap `createServerFn`. |
| `ui-ux-pro-max` + `ui-design-system` | **Saat UI** (DESIGN.md MindMarket cream `#f5f1e4` radius 50px, no shadow). | Fase 08 `CitationDrawer` White `10px` `border hairline-mist` `Body-sm` `ExternalLink` — bukan `shadow-xl` neon. |
| `document-pdf` | **Saat RAG extract** (PDF/DOCX). | Fase 07 `extract.ts` `unpdf` `mammoth` + `chunk.ts` `1000/200` + `HNSW` test. |
| `webapp-testing` | **Saat E2E `playwright` 12 critical paths.** | Fase 10 `critical.spec.ts` `Register→Logout` 12 paths `page.route` mock 9Router SSE `msw` + real PG `DATABASE_URL_TEST`. |

---

## 3. MCP Wajib (Sudah Terinstall — WAJIB Dipakai)

| MCP | Kapan | Contoh Zona.ai |
|---|---|---|
| `context7` | **Sebelum pakai library/framework** apa pun — fetch docs terbaru. | Sebelum `chat.ts` `createOpenAICompatible({baseURL,apiKey})` — fetch `AI SDK 7` docs `@ai-sdk/openai-compatible` biar tidak pakai signature lama `openai()` . |
| `chrome-devtools` | **Saat debug UI/streaming** — click/fill/hover/snapshot/screenshot. | Debug `Composer` pill 50px: `take_snapshot` → `click uid` Send → `evaluate_script` `() => document.body.style.backgroundColor` cek cream `rgb(245,241,228)`. |
| `supabase` | **Jangan untuk Zona.ai** — Zona.ai pakai `PostgreSQL + Drizzle` (bukan Supabase). MCP ini **dilarang** untuk DB Zona (sesuai `ARCHITECTURE.md` lock Supabase dilarang). Hanya boleh untuk referensi jika user eksplisit minta Supabase di project lain. | Jika user tanya `supabase` di Zona.ai → tolak, arahkan ke `Drizzle + Neon` local. |
| `supabase-extract-db-string`, `supabase-postgres-best-practices`, `supabase-nextjs` | **Dilarang untuk Zona.ai** — sama, lock Prisma/Supabase dilarang. Gunakan `drizzle` + `pgvector` `HNSW` `vector_cosine_ops`. | — |

---

## 4. Skills / MCP / Plugin BELUM Terinstall — Boleh Install Jika Dibutuhkan (Wajib Proposal Dulu)

| Skill / MCP / Plugin | Untuk Apa di Zona.ai | Contoh |
|---|---|---|
| `mcp: langfuse` (belum ada MCP, hanya `@langfuse/vercel-ai-sdk` lib) | Observability Fase 09 — jika ada MCP Langfuse, pakai untuk trace `streamText` `generationId`. | Install `langfuse` MCP → `trace` `generation_runs.id` `modelId` `latencyMs` `TTFT` — saat ini via lib `src/lib/langfuse/tracing.ts` `withLangfuse` manual. |
| `mcp: tavily` / `exa` | Web search Fase 08 — jika ada MCP Tavily, pakai untuk `searchWeb` `POST /search` `{query, max_results 5}`. | Saat ini via `src/lib/tavily/client.ts` `fetch https://api.tavily.com/search` `TAVILY_API_KEY tvly-` server-only — MCP bisa gantikan fetch. |
| `mcp: r2` / `cloudflare` | R2 Fase 06 — jika ada MCP Cloudflare R2, pakai untuk `putObject/getObject` `users/{userId}/attachments/{uuid}`. | Saat ini via `@aws-sdk/client-s3` `S3Client` — MCP bisa untuk `headObject` debug. |
| `skill: tanstack-start` (context7 cover) | TanStack Start file-based routing `createServerFn` `createServerFileRoute /api/auth/$`. | Sebelum `chat.ts` `sendMessage` — `context7` query `TanStack Start createServerFn validator Zod`. |
| `skill: drizzle-orm` (context7 cover) | Drizzle `drizzle(postgres)` `drizzle-kit generate` `CREATE EXTENSION vector` `HNSW`. | Fase 07 `document_chunks` `vector(1536)` `CREATE INDEX USING hnsw`. |
| `skill: ai-sdk-7` (context7 cover) | AI SDK 7 `streamText` `toDataStreamResponse` tagged `generationId` `reasoning` `usage`. | Fase 03 `streamText({model:nineRouter(routerModelId)})` + `multiplex.ts` `generation-start`. |
| `plugin: superpowers` (sudah) | Sudah terinstall — `brainstorming` `writing-plans` `executing-plans` `subagent-driven-development` `systematic-debugging` `verification-before-completion`. | Wajib untuk Fase 01-11. |
| `skill: shadcn-component-discovery` | Cari komponen shadcn sebelum bikin `Button` `Dialog` `Popover` `Tabs` custom. | Fase 05 `CompareSelector` `Popover` `Tabs` `MobileCompareTabs` — discovery dulu baru build. |
| `skill: vercel-react-best-practices` | Perf React 19 `useVirtualizer` `memo` `bundle size`. | Fase 04 `MessageList` `useVirtualizer` `estimateSize 80 overscan 5` + Fase 10 `vite build --report`. |

**Aturan install:** Jangan `bun add` MCP/skill baru tanpa **proposal + approve user**. Cek `AGENTS.md` lock dulu — tanya: "Mau install `mcp-tavily` untuk web search?"

---

## 5. Plugin

| Plugin | Status | Untuk |
|---|---|---|
| `superpowers` (`obra/superpowers`) | **Sudah, WAJIB** | `brainstorming` → `writing-plans` → `executing-plans`/`subagent-driven-development` per fase. |
| `find-skills` | Sudah | Jika butuh skill belum ada → `find-skills` "skill for RAG pgvector" → proposal install. |

---

## 6. Contoh Kombinasi Zona.ai per Fase

- **Fase 01 Foundation:** `brainstorming` (spec) → `writing-plans` (plan) → `dispatching-parallel-agents` (Biome vs Tailwind vs Vitest parallel) → `context7-mcp` (cek `Tailwind v4 @theme` syntax) → `executing-plans` + `verification-before-completion` (`tsc` `biome` `vitest` `playwright` `grep shadow-xl`).
- **Fase 02 Auth+DB:** `better-auth-authentication` (Google OAuth) + `context7` (Drizzle `pgvector` `CREATE EXTENSION vector`) + `brainstorming` + `writing-plans`.
- **Fase 03 Single Chat:** `context7` (AI SDK 7 `streamText` + `@ai-sdk/openai-compatible`) + `brainstorming` → `writing-plans` → `test-driven-development` (registry 3 model `auto` adaptive `{1,4}`).
- **Fase 05 Compare:** `brainstorming` (N messages) → `writing-plans` → `dispatching-parallel-agents` (backend multiplex + frontend Grid parallel) → `systematic-debugging` jika `partial_failure` refund tidak jalan.
- **Fase 06 File:** `agent-browser` (debug `drag overlay Sandstone` `preview 40x40`) + `context7` (`@aws-sdk/client-s3` `PutObjectCommand`) + `document-pdf` (validasi `file-type` magic).
- **Fase 07 RAG:** `context7` (`unpdf` `mammoth` `pgvector` `HNSW`), `document-pdf` (extract), `systematic-debugging` jika `embedding dimension 1536` mismatch.
- **Fase 08 Web Search:** `context7` (Tavily `POST /search` `max_results 5`), `agent-browser` (debug `CitationDrawer` White 10px chips `[1]`).
- **Fase 09 Observability:** `context7` (`@langfuse/vercel-ai-sdk` `withLangfuse`), `verification-before-completion` (TTFT <150ms `firstTokenAt`).
- **Fase 10 Hardening:** `better-auth-security-best-practices` (rate limit `Map` 20/min `SameSite` ) + `vercel-react-best-practices` (perf `useVirtualizer`) + `ui-ux-pro-max` (a11y `role=log aria-live=polite` + `prefers-reduced-motion`) + `webapp-testing` (12 critical paths `playwright` 3 viewports).

---

## 7. Larangan

- DILARANG invoke `supabase` MCP untuk Zona.ai DB (lock `Supabase` dilarang `ARCHITECTURE.md`).
- DILARANG hardcode `modelId`/`TAVILY_API_KEY`/`R2 bucket` di komponen — pakai `Model Registry` + `env.server.ts` + `constants.ts` (`TAVILY_MAX_RESULTS` `MAX_FILE_SIZE_BYTES`).
- DILARANG fake streaming/progress — UI dari signal nyata `text-delta` `generation-start` `upload` progress `Loader2` deterministic.
- DILARANG `shadow-xl`/`neon`/`emoji` — lucide 1.5-2px cream `#f5f1e4` radius 50px.

---

## 8. Cara Pakai Rules Ini

1. Sebelum kerja Fase XX → baca `AGENTS.md` order + `DESIGN.md` + `zona-ai-context.md` + `zona-ai-skills-mcp.md` (ini).
2. Klasifikasi `spike/bounded/architectural` via `brainstorming` → invoke skill SEBELUM tanya.
3. Tulis spec `docs/superpowers/specs/...` → review user → `writing-plans` → plan `docs/superpowers/plans/...` → review → `executing-plans`/`subagent-driven-development`.
4. Saat butuh library → `context7` dulu → baru code.

