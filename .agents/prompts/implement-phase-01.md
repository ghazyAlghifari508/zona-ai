# PROMPT — Implementasi Fase 01 Foundation — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 01 (Foundation)** dari aplikasi **Zona.ai** — multi-model AI chat workspace.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket
5. `.agents/rules/zona-ai-skills-mcp.md` — aturan wajib pakai skill / MCP / plugin Zona.ai, kapan invoke, contoh per fase (WAJIB patuhi)
6. `DESIGN.md` — JSON design tokens + spec layout (source of truth visual)
7. `docs/superpowers/specs/2026-08-27-phase-01-foundation-spec.md` — spec Fase 01 (Tujuan, Scope, Stack Lock, Design Tokens, Env, Testing, DoD, Larangan Khusus)
8. `docs/superpowers/plans/2026-08-27-phase-01-foundation-plan.md` — PLAN PELAKSANAAN Fase 01 (8 Task, ikuti step-by-step)

**⚠️ HEMAT TOKEN:** JANGAN baca semua file `.md` di folder `docs/`. Cukup file di atas. Jika butuh referensi spesifik saat implementasi, baca hanya section yang relevan (misal `docs/ARCHITECTURE.md` atau `docs/ENVIRONMENT.md` saat ada konflik env), jangan baca utuh.

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — jangan baca ulang seluruhnya.

## Skill & MCP (WAJIB)

- Sebelum AKSI APA PUN (bahkan sebelum tanya klarifikasi), cek dan invoke skill yang relevan — patuhi `.agents/rules/zona-ai-skills-mcp.md`.
- Wajib invoke sebelum eksekusi:
  - **`superpowers:executing-plans`** (atau `superpowers:subagent-driven-development`) — untauk menjalankan plan Task 1-8 dengan alur TDD.
  - **`superpowers:test-driven-development`** — setiap Task: tulis check/test gagal dulu → jalankan buktikan gagal → implementasi minimal → jalankan buktikan pass → commit.
  - **`superpowers:verification-before-completion`** — sebelum klaim selesai: jalankan semua command verifikasi, buktikan output, cek bukti di repo.
  - **`superpowers:systematic-debugging`** — jika ada bug/test gagal, investigasi akar masalah dulu, jangan tambal sulam.
  - **`superpowers:dispatching-parallel-agents`** — jika ada task independen tanpa shared state (misal inisialisasi Tooling vs Turbolens) bisa parallel.
  - **`context7-mcp` (MCP context7)** — setiap kali akan pakai library/framework: TanStack Start, Tailwind v4, Biome, Vitest, Playwright, shadcn/ui, Drizzle, AI SDK 7 — fetch docs terbaru sebelum menulis kode, jangan andal hafalan.
  - **`ui-design-system`** atau **`ui-ux-pro-max`** — saat membangun komponen UI sesuai spec.
- If skill relevant ada 1% kemungkinan → WAJIB invoke. Jangan skip dengan alasan "codebase kecil" / "butuh context dulu".

## Tugas

Implementasikan **8 Task di `docs/superpowers/plans/2026-08-27-phase-01-foundation-plan.md` secara berurutan**, persis sesuai langkah di plan (1 Task selesai → verifikasi → lanjut Task berikutnya):

1. **Task 1** — Init TanStack Start + Bun + TS Config
2. **Task 2** — Biome Lint/Format
3. **Task 3** — Vitest Config + Smoke Test
4. **Task 4** — Playwright Config + Landing Smoke E2E
5. **Task 5** — Tailwind v4 `@theme` Tokens DESIGN.md
6. **Task 6** — shadcn/ui Baseline + Env Validation + Drizzle Placeholder
7. **Task 7** — Directory Structure + PublicShell + WorkspaceShell + `__root` + Landing
8. **Task 8** — Verifikasi Fase 01 Gate

Setiap Task wajib mengikuti pola TDD di plan: `Files` → `Interfaces` → tulis failing check → jalankan (harus FAIL) → implementasi minimal sesuai spec → jalankan (harus PASS) → commit.

## Batasan Keras (WAJIB)

- **Stack LOCKED**: TanStack Start + Bun + React + Tailwind v4 + shadcn/ui + Drizzle + PostgreSQL/pgvector + Better Auth. JANGAN substitusi (no Next.js, no Node/npm, no Prisma, no Supabase, no MongoDB).
- **Anti-AI-Slop**: cream `#f5f1e4`, no heavy drop shadow, no neon/glow, no emoji di UI (Lucide icons only), no dark mode. Token persis dari `DESIGN.md`.
- **No Assumptions**: jangan invent model ID, API key, URL env, nilai timeouts. Yang belum diputus = TBD/configurable.
- **No Hardcode**: tidak ada model list/endpoint/credentials hardcoded di komponen — pakai env validation `src/lib/env.server.ts` + constants.
- **Dependency discipline**: jangan `bun add` dependency baru tanpa justifikasi; cek kalau stack sudah menyediakan.
- **Server/Client boundaries**: DB & env server-only via `createServerFn`.
- **Commit per Task** sesuai plan. Jangan ubah arsitektur tanpa persetujuan.

## Verifikasi Fase 01 (Task 8 — wajib lolos sebelum selesai)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim):
- TypeCheck: `bunx tsc --noEmit` → 0 error
- Lint/Format: `bunx biome check` → pass
- Unit: `bunx vitest run` → pass (smoke + token/registry test)
- E2E: `bunx playwright test` → pass (Landing smoke)
- `grep` cek: tidak ada `shadow-xl`/`shadow-2xl` di komponen, tidak ada emoji di UI chrome
- Env validation: `src/lib/env.server.ts` memvalidasi `.env` (18 var, format Zod sesuai spec)

Laporan akhir: daftar file dibuat/modif, status tiap Task, hasil semua command, dan bukti DoD Fase 01. Jika ada blocker/decisi ambigu → stop dan tanya user, jangan asumsi.