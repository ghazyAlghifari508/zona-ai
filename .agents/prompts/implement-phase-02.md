# PROMPT — Implementasi Fase 02 Authentication + Database — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 02 (Authentication + Database)** dari aplikasi **Zona.ai** — multi-model AI chat workspace.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket (termasuk disiplin skala font: jangan font raksasa, jangan kekecilan)
5. `.agents/rules/zona-ai-skills-mcp.md` — aturan wajib pakai skill / MCP / plugin Zona.ai, kapan invoke, contoh per fase (WAJIB patuhi)
6. `DESIGN.md` — **referensi token visual** (warna, font, radius, spacing). BUKAN template layout halaman — struktur halaman mengikuti PRD/UI-UX/spec, bukan menyalin struktur contoh di dalamnya.
7. `docs/superpowers/specs/2026-08-27-phase-02-auth-database-spec.md` — spec Fase 02 (Tujuan, Scope, Stack Lock, Design Tokens, Env, Testing, DoD, Larangan Khusus)
8. `docs/superpowers/plans/2026-08-27-phase-02-auth-database-plan.md` — PLAN PELAKSANAAN Fase 02 (7 Task, ikuti step-by-step)

**⚠️ HEMAT TOKEN:** JANGAN baca semua file `.md` di folder `docs/`. Cukup file di atas. Jika butuh referensi spesifik saat implementasi, baca hanya section yang relevan (misal `docs/ARCHITECTURE.md` atau `docs/ENVIRONMENT.md` saat ada konflik env), jangan baca utuh.

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — jangan baca ulang seluruhnya.

## Skill & MCP (WAJIB)

- Sebelum AKSI APA PUN (bahkan sebelum tanya klarifikasi), cek dan invoke skill yang relevan — patuhi `.agents/rules/zona-ai-skills-mcp.md`.
- Wajib invoke sebelum eksekusi:
  - **`superpowers:executing-plans`** (atau `superpowers:subagent-driven-development`) — untuk menjalankan plan Task 1-7 dengan alur TDD.
  - **`superpowers:test-driven-development`** — setiap Task: tulis check/test gagal dulu → jalankan buktikan gagal → implementasi minimal → jalankan buktikan pass → commit.
  - **`superpowers:verification-before-completion`** — sebelum klaim selesai: jalankan semua command verifikasi, buktikan output, cek bukti di repo.
  - **`superpowers:systematic-debugging`** — jika ada bug/test gagal, investigasi akar masalah dulu, jangan tambal sulam.
  - **`superpowers:dispatching-parallel-agents`** — jika ada task independen tanpa shared state (misal Task 1 Drizzle vs Task 3 auth instance config) bisa parallel.
  - **`better-auth-authentication`** — WAJIB saat mengimplementasikan Better Auth (Task 3-5): sign-up/sign-in Google flow, tanstackStartCookies, session.
  - **`better-auth-security-best-practices`** — WAJIB saat config auth: rate limiting, secret, trusted origins, cookie security (SameSite/Lax, HttpOnly, Secure, CSRF).
  - **`context7-mcp` (MCP context7)** — setiap kali akan pakai library/framework: Better Auth, Drizzle ORM, postgres.js, drizzle-kit, TanStack Start ServerRoute, AI SDK 7 — fetch docs terbaru sebelum menulis kode, jangan andal hafalan.
  - **`ui-design-system`** atau **`ui-ux-pro-max`** — saat membangun halaman auth sesuai spec.
- If skill relevant ada 1% kemungkinan → WAJIB invoke. Jangan skip dengan alasan "codebase kecil" / "butuh context dulu".

## Tugas

Implementasikan **7 Task di `docs/superpowers/plans/2026-08-27-phase-02-auth-database-plan.md` secara berurutan**, persis sesuai langkah di plan (1 Task selesai → verifikasi → lanjut Task berikutnya):

1. **Task 1** — Drizzle DB Connection + Config (`src/lib/db/index.ts`, `drizzle.config.ts`)
2. **Task 2** — Schema 5 Tabel + pgvector Extension + Migration (`schema.ts`, `0001_init.sql`, integration test)
3. **Task 3** — Better Auth Instance Google OAuth Only + Errors (`auth.ts`, `errors.ts`)
4. **Task 4** — Auth Client + Catch-all Route `api/auth/$` + `getAuthSession` Helper
5. **Task 5** — Auth Pages Google Button Only (`/auth/sign-in`, `/auth/sign-up`)
6. **Task 6** — Protected `/chat` Placeholder + Seed (ownership test)
7. **Task 7** — Verifikasi Fase 02 Gate

Setiap Task wajib mengikuti pola TDD di plan: `Files` → `Interfaces` → tulis failing check → jalankan (harus FAIL) → implementasi minimal sesuai spec → jalankan (harus PASS) → commit.

## Infrastruktur Lokal (SUDAH SIAP — JANGAN install ulang)

- **PostgreSQL 17.10** berjalan (service `postgresql-x64-17`). `DATABASE_URL` di `.env` valid: DB `zona_ai` owner role `zona`, koneksi `zona@localhost:5432/zona_ai` SUDAH teruji.
- **pgvector v0.8.2** SUDAH aktif: extension `vector` v0.8.2 + `pgcrypto` v1.3 sudah ada di DB. Migration `CREATE EXTENSION IF NOT EXISTS vector` akan NOTICE-skip, TIDAK perlu install/unduh apa pun.
- **`.env` sudah terisi penuh & valid** (BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET, NINE_ROUTER, R2, TAVILY, LANGFUSE). JANGAN tulis ulang / jangan generate ulang.
- Jika blend terjadi (server DB mati, port sibuk, dst): jalankan `net start postgresql-x64-17`, jangan asumsi rusak.

## Batasan Keras (WAJIB)

- **Stack LOCKED**: Bun + TanStack Start + React + Tailwind v4 + shadcn/ui + Drizzle + postgres.js + pgvector + Better Auth. JANGAN substitusi (no Next.js, no Node/npm, no Prisma, no Supabase, no Clerk, no MongoDB, no Qdrant).
- **Anti-AI-Slop**: cream `#f5f1e4`, no heavy drop shadow, no neon/glow, no emoji di UI (Lucide icons only), no dark mode, font JANGAN ekstrem (body 15-18px, heading proporsional — jangan default 140px "gede = keren"). Token persis dari `DESIGN.md` sebagai referensi warna/font/radius.
- **Auth**: Google OAuth ONLY — `emailAndPassword.enabled===false`, TIDAK ADA `<input type="password">`, tidak ada form email/password.
- **Security**: secret server-only, `getAuthSession` = hard gate (bukan hanya `beforeLoad`), ownership check FK `userId` di setiap query, `notes ON DELETE CASCADE`.
- **No Assumptions**: jangan invent model ID, API key, URL env, nilai timeouts. Yang belum diputus = TBD/configurable.
- **No Hardcode**: tidak ada credentials hardcoded di komponen — pakai env validation `src/lib/env.server.ts` + constants. `GOOGLE_CLIENT_SECRET` TIDAK BOLEH bocor ke client bundle (grep `.vinxi/build/client`: 0).
- **Dependency discipline**: `bun add better-auth` dan dependency yang BENAR-BENAR dipakai plan. Jangan tambah dependency lain tanpa justifikasi.
- **Server/Client boundaries**: DB, auth server, env = server-only via `createServerFn`/`ServerRoute`. Frontend tidak pernah import module server.
- **Commit per Task** sesuai plan. Jangan ubah arsitektur tanpa persetujuan.

## Verifikasi Fase 02 (Task 7 — wajib lolos sebelum selesai)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim):
- TypeCheck: `bunx tsc --noEmit` → 0 error
- Lint/Format: `bunx biome check ./src` → pass, `grep -r "shadow-xl" src/components/layout` → 0
- Unit + Integration: `bunx vitest run tests/unit/auth.test.ts tests/unit/env.test.ts tests/integration/db.test.ts -v` → ALL pass (auth 4, env 1, db 3)
- E2E: `bunx playwright test tests/e2e/auth.spec.ts --project=chromium` → 3 pass (Google button, card 50px, chat redirect)
- Manual DB: `bunx drizzle-kit migrate` → applied; `\d users` punya `credits default 100`; `\dx` → `vector`; `curl -i http://localhost:3000/api/auth/session` tanpa cookie → 401
- Client leak: `grep -r "GOOGLE_CLIENT_SECRET" .vinxi/build/client 2>/dev/null | wc -l` → 0

Laporan akhir: daftar file dibuat/modif, status tiap Task, hasil semua command, dan bukti DoD Fase 02. Jika ada blocker/decisi ambigu → stop dan tanya user, jangan asumsi.