# PROMPT — Implementasi Fase 03 Single-Model Chat — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 03 (Single-Model Chat)** dari aplikasi **Zona.ai** — multi-model AI chat workspace.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket (termasuk disiplin skala font: jangan font raksasa, jangan kekecilan)
5. `.agents/rules/zona-ai-skills-mcp.md` — aturan wajib pakai skill / MCP / plugin Zona.ai, kapan invoke, contoh per fase (WAJIB patuhi)
6. `DESIGN.md` — **referensi token visual** (warna, font, radius, spacing). BUKAN template layout halaman — struktur halaman mengikuti PRD/UI-UX/spec, bukan menyalin struktur contoh di dalamnya.
7. `docs/superpowers/specs/2026-08-27-phase-03-single-model-chat-spec.md` — spec Fase 03 (Tujuan, Scope, Stack Lock, Design Tokens, Env, Testing, DoD, Larangan Khusus)
8. `docs/superpowers/plans/2026-08-27-phase-03-single-model-chat-plan.md` — PLAN PELAKSANAAN Fase 03 (9 Task, ikuti step-by-step)

**⚠️ HEMAT TOKEN:** JANGAN baca semua file `.md` di folder `docs/`. Cukup file di atas. Jika butuh referensi spesifik saat implementasi, baca hanya section yang relevan (misal `docs/ARCHITECTURE.md` atau `docs/ENVIRONMENT.md` saat ada konflik env), jangan baca utuh.

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — jangan baca ulang seluruhnya.

## Prasyarat (Fase 01 + 02 SUDAH selesai)

- `src/lib/env.server.ts` (Zod 18 var), `src/lib/db` (drizzle + postgres.js + schema users/sessions/accounts/conversations/messages), `src/lib/auth` (Better Auth Google OAuth + `getAuthSession` + `authClient`), `PublicShell`/`WorkspaceShell`, `/auth/sign-in` + `/chat` placeholder ada.
- PostgreSQL 17 + pgvector v0.8.2 + pgcrypto SUDAH aktif. `.env` lengkap & teruji; 9Router live di `http://localhost:20128/v1` (616 model, `ag/gemini-3.7-flash-high` & `cx/gpt-5.6-sol` ada, chat completion OK).
- JANGAN install ulang infra / generate ulang secret.

## Skill & MCP (WAJIB)

- Sebelum AKSI APA PUN (bahkan sebelum tanya klarifikasi), cek dan invoke skill yang relevan — patuhi `.agents/rules/zona-ai-skills-mcp.md`.
- Wajib invoke sebelum eksekusi:
  - **`superpowers:executing-plans`** (atau `superpowers:subagent-driven-development`) — untuk menjalankan plan Task 1-9 dengan alur TDD.
  - **`superpowers:test-driven-development`** — setiap Task: tulis check/test gagal dulu → jalankan buktikan gagal → implementasi minimal → jalankan buktikan pass → commit.
  - **`superpowers:verification-before-completion`** — sebelum klaim selesai: jalankan semua command verifikasi, buktikan output, cek bukti di repo.
  - **`superpowers:systematic-debugging`** — jika ada bug/test gagal, investigasi akar masalah dulu, jangan tambal sulam.
  - **`superpowers:dispatching-parallel-agents`** — jika ada task independen tanpa shared state (misal Task 1 Registry vs Task 3 DB schema) bisa parallel.
  - **`context7-mcp` (MCP context7)** — WAJIB setiap kali pakai library/framework: **AI SDK 7** (`streamText`, `toDataStreamResponse`, data stream events), **`@ai-sdk/openai-compatible`**, `react-markdown` + `rehype-sanitize` + `rehype-highlight`, Drizzle, TanStack Start `createServerFn` validator, msw. Kode yang ditulis HANYA dari sintaks aktual docs terbaru, bukan hafalan.
  - **`ui-design-system`** atau **`ui-ux-pro-max`** — saat membangun UI workspace (Sidebar, Composer, Selector, MessageList) sesuai spec.
  - **`better-auth-authentication`** — saat integrasi `getAuthSession` ke server function.
- If skill relevant ada 1% kemungkinan → WAJIB invoke. Jangan skip dengan alasan "codebase kecil" / "butuh context dulu".

## Tugas

Implementasikan **9 Task di `docs/superpowers/plans/2026-08-27-phase-03-single-model-chat-plan.md` secara berurutan**, persis sesuai langkah di plan (1 Task selesai → verifikasi → lanjut Task berikutnya):

1. **Task 1** — Model Types + Registry Single Source (`models/types.ts`, `models/registry.ts`)
2. **Task 2** — Auto Router Heuristic 3-tier (`models/router.ts`)
3. **Task 3** — DB `generation_runs` + `credit_transactions` (+`usage_records`) — schema + migration
4. **Task 4** — 9Router + System Prompt + Credits Helper (`ai/9router.ts`, `ai/system-prompt.ts`, `ai/credits.ts`)
5. **Task 5** — Server Functions `getModels` + validation `chatSchema` + `resetDevCreditsFn`
6. **Task 6** — Server Function `sendMessage` Streaming Core (`server/functions/chat.ts`)
7. **Task 7** — `stopGeneration` + `regenerateMessage`
8. **Task 8** — Workspace UI (Sidebar, CreditWidget, MessageList, Composer, ModelSelector, SkillSelector, CodeBlock + route `/chat/$conversationId`)
9. **Task 9** — Streaming Client Demux + Verification Gate

Setiap Task wajib mengikuti pola TDD di plan: `Files` → `Interfaces` → tulis failing check → jalankan (harus FAIL) → implementasi minimal sesuai spec → jalankan (harus PASS) → commit.

## Batasan Keras (WAJIB)

- **Stack LOCKED**: Bun + TanStack Start + React + Tailwind v4 + Drizzle + postgres.js + pgvector + Better Auth + **AI SDK 7 (`ai` + `@ai-sdk/openai-compatible`)**. JANGAN substitusi (no Next.js, no Node/npm, no Prisma, no Supabase, no fetch direct ke 9Router, no hardcode token).
- **No hardcode model list**: `ModelSelector` WAJIB ambil dari `getModels()` registry — DILARANG array `["auto","gemini"]` inline di komponen.
- **No fake streaming**: streaming WAJIB `streamText` real ke 9Router; mock hanya via `msw`/`vi.mock` DI TEST, bukan di kode produksi. Dilarang simulasi progres palsu.
- **Credits atomic**: `UPDATE users SET credits = credits - amount WHERE credits >= amount RETURNING` — cek `402` `ERR-019` SEBELUM panggil 9Router (tanpa deduct saat gagal). `credit_transactions` mencatat `-cost` + `balanceAfter`.
- **Auth & Ownership**: `getAuthSession(request)` throw 401 `ERR-002` di SETIAP `createServerFn` (`getModels`/`sendMessage`/`regenerate`/`stop`/`resetDevCredits`). Query data user lain → 403.
- **Anti-AI-Slop**: cream `#f5f1e4`, no heavy drop shadow, no neon/glow, no emoji di UI (Lucide only 1.5-2px), no dark mode, font JANGAN ekstrem. Token warna/font/radius dari `DESIGN.md` sebagai referensi.
- **XSS**: assistant content wajib lewat `rehype-sanitize` (strip `<script>`, `<iframe>`, `onclick`); DILARANG `dangerouslySetInnerHTML` untuk konten user/assistant.
- **Server/Client boundaries**: 9Router, DB, env, credits = server-only; `NINE_ROUTER_API_KEY`/`NINE_ROUTER_BASE_URL`/`DATABASE_URL`/`BETTER_AUTH_SECRET` TIDAK boleh muncul di client bundle (grep `.vinxi/build/client`: 0). Frontend tidak import module server.
- **No Assumptions**: jangan invent model ID, API key, URL env, nilai timeouts, harga. Nilai di registry persis dari spec (auto {1,4}, gemini 4, gpt 15).
- **Dependency discipline**: `bun add` hanya `ai`, `@ai-sdk/openai-compatible`, `react-markdown`, `rehype-sanitize`, `rehype-highlight`, `lucide-react`, `msw` (dev). Jangan tambah lain tanpa justifikasi.
- **Commit per Task** sesuai plan. Jangan ubah arsitektur tanpa persetujuan.

## Verifikasi Fase 03 (Task 9 — wajib lolos sebelum selesai)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim):
- TypeCheck: `bunx tsc --noEmit` → 0 error
- Lint/Format: `bunx biome check ./src` → pass
- Unit: `bunx vitest run tests/unit/registry.test.ts tests/unit/router.test.ts tests/unit/credits.test.ts tests/unit/validation.test.ts tests/unit/system-prompt.test.ts tests/unit/markdown.test.ts -v` → ALL pass (10+)
- Integration: `bunx vitest run tests/integration/chat.test.ts -v` → 4 pass (deduct atomic, 402, ownership 403)
- E2E: `bunx playwright test tests/e2e/chat-single.spec.ts tests/e2e/chat-credits.spec.ts --project=chromium` → ALL pass (streaming, Routed badge, stop, regenerate, insufficient 402)
- Client leak: `grep -r "NINE_ROUTER_API_KEY" .vinxi/build/client 2>/dev/null | wc -l` → 0
- Manual: data tetap ada setelah reload (persist), tidak ada console error.

Laporan akhir: daftar file dibuat/modif, status tiap Task, hasil semua command, dan bukti DoD Fase 03. Jika ada blocker/decisi ambigu (terutama API `ai` v7 streaming yang berubah-ubah) → stop dan tanya user / rujuk docs aktual, jangan asumsi.