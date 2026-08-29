# PROMPT — Implementasi Fase 04 Conversation Persistence — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 04 (Conversation Persistence)** dari aplikasi **Zona.ai** — multi-model AI chat workspace.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket (termasuk disiplin skala font: jangan font raksasa, jangan kekecilan)
5. `.agents/rules/zona-ai-skills-mcp.md` — aturan wajib pakai skill / MCP / plugin Zona.ai, kapan invoke, contoh per fase (WAJIB patuhi)
6. `DESIGN.md` — **referensi token visual** (warna, font, radius, spacing). BUKAN template layout halaman — struktur halaman mengikuti PRD/UI-UX/spec, bukan menyalin struktur contoh di dalamnya.
7. `docs/superpowers/specs/2026-08-27-phase-04-persistence-spec.md` — spec Fase 04 (Tujuan, Scope, Stack Lock, Design Tokens, Env, Testing, DoD, Larangan Khusus)
8. `docs/superpowers/plans/2026-08-27-phase-04-persistence-plan.md` — PLAN PELAKSANAAN Fase 04 (7 Task, ikuti step-by-step)

**⚠️ HEMAT TOKEN:** JANGAN baca semua file `.md` di folder `docs/`. Cukup file di atas. Jika butuh referensi spesifik saat implementasi, baca hanya section yang relevan (misal `docs/ARCHITECTURE.md` atau `docs/ENVIRONMENT.md` saat ada konflik env), jangan baca utuh.

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — jangan baca ulang seluruhnya.

## Prasyarat (Fase 01, 02, 03 SUDAH selesai)

- `src/lib/db` (tabel users, sessions, accounts, conversations, messages, generation_runs, credit_transactions, usage_records sudah siap).
- `src/lib/auth` (`getAuthSession`, `authClient`), `src/server/functions/chat.ts` (`sendMessage`, `stopGeneration`, `regenerateMessage`), workspace UI dasar sudah ada.
- PostgreSQL 17 + pgvector + pgcrypto aktif. `.env` valid.

## Skill & MCP (WAJIB)

- Sebelum AKSI APA PUN (bahkan sebelum tanya klarifikasi), cek dan invoke skill yang relevan — patuhi `.agents/rules/zona-ai-skills-mcp.md`.
- Wajib invoke sebelum eksekusi:
  - **`superpowers:executing-plans`** (atau `superpowers:subagent-driven-development`) — untuk menjalankan plan Task 1-7 dengan alur TDD.
  - **`superpowers:test-driven-development`** — setiap Task: tulis check/test gagal dulu → jalankan buktikan gagal → implementasi minimal → jalankan buktikan pass → commit.
  - **`superpowers:verification-before-completion`** — sebelum klaim selesai: jalankan semua command verifikasi, buktikan output, cek bukti di repo.
  - **`superpowers:systematic-debugging`** — jika ada bug/test gagal, investigasi akar masalah dulu, jangan tambal sulam.
  - **`superpowers:dispatching-parallel-agents`** — jika ada task independen tanpa shared state (misal Task 1 Server Functions vs Task 2 Title helper) bisa parallel.
  - **`context7-mcp` (MCP context7)** — WAJIB setiap kali pakai library/framework: **TanStack Query** (useInfiniteQuery, invalidation), **TanStack Virtual** (`useVirtualizer`), Drizzle ORM (cursor pagination `lt`, `desc`, `ilike`), TanStack Router (loader). Kode yang ditulis HANYA dari sintaks aktual docs terbaru, bukan hafalan.
  - **`ui-design-system`** atau **`ui-ux-pro-max`** — saat membangun UI Sidebar (DropdownMenu, dialog konfirmasi hapus, skeleton loader, search debounced) sesuai spec.
- If skill relevant ada 1% kemungkinan → WAJIB invoke. Jangan skip dengan alasan "codebase kecil" / "butuh context dulu".

## Disiplin Git: ATOMIC COMMIT & PUSH (WAJIB)

1. **Atomic Commit per Task:**
   - Dilarang menumpuk semua perubahan dalam satu commit raksasa di akhir.
   - Setiap kali 1 Task selesai (test pass + verifikasi lolos), lakukan commit mandiri dengan pesan konvensional yang jelas:
     - Task 1: `feat(conv): CRUD + archive cursor pagination`
     - Task 2: `feat(persist): getMessages + generateTitle`
     - Task 3: `feat(ui): sidebar list + New Chat + search`
     - Task 4: `feat(ui): rename/delete/archive + search filter`
     - Task 5: `feat(chat): loader reload getConversation+getMessages`
     - Task 6: `feat(chat): virtual for long lists`
2. **Git Push setelah Selesai:**
   - Setelah Task 7 (Gate Verifikasi) lulus 100% tanpa error, jalankan:
     ```bash
     git status
     git diff
     git push origin <branch-name>
     ```
   - Pastikan working tree bersih (`clean`) dan semua commit ter-push ke remote.

## Tugas

Implementasikan **7 Task di `docs/superpowers/plans/2026-08-27-phase-04-persistence-plan.md` secara berurutan**, persis sesuai langkah di plan (1 Task selesai → TDD pass → atomic commit → lanjut Task berikutnya):

1. **Task 1** — Server Functions Conversations — CRUD + Archive (`src/server/functions/conversations.ts`, `src/lib/utils/constants.ts`, `validation.ts`)
2. **Task 2** — `getMessages` + `generateTitle` Helper (`src/server/functions/messages.ts`, `src/lib/utils/title.ts`, patch `chat.ts`)
3. **Task 3** — Sidebar List + New Chat + Empty + Skeleton + Search (`src/components/layout/Sidebar.tsx`)
4. **Task 4** — Sidebar Item Menu Rename/Delete/Archive + Search Filter (`Sidebar.tsx` DropdownMenu)
5. **Task 5** — Reload Loader `$conversationId` + Main Header (`src/routes/chat/$conversationId.tsx`, `src/routes/chat/index.tsx`)
6. **Task 6** — TanStack Virtual untuk MessageList (`src/components/chat/MessageList.tsx` conditional >50 messages)
7. **Task 7** — Verifikasi Fase 04 Gate + **Git Push**

Setiap Task wajib mengikuti pola TDD di plan: `Files` → `Interfaces` → tulis failing check → jalankan (harus FAIL) → implementasi minimal sesuai spec → jalankan (harus PASS) → **atomic commit**.

## Batasan Keras (WAJIB)

- **Stack LOCKED**: Bun + TanStack Start + React + Tailwind v4 + Drizzle + postgres.js + pgvector + Better Auth + TanStack Query + TanStack Virtual (`@tanstack/react-virtual`). JANGAN substitusi.
- **Database = Source of Truth**: Dilarang simpan history di `localStorage`/`sessionStorage` browser. Semua data percakapan harus persist di PostgreSQL.
- **Pagination**: Cursor pagination wajib berbasis `updatedAt DESC, id` (bukan OFFSET/LIMIT murni yang lambat) dengan default `limit: 20` dari `constants.ts`.
- **Search**: `ilike(conversations.title, '%...%')` server-side, di frontend di-debounce minimal 200ms agar tidak spam request.
- **Ownership & Auth**: `getAuthSession(request)` wajib di setiap `createServerFn`. Jika user mencoba akses/edit/hapus percakapan orang lain → throw `403 Forbidden`. Hapus percakapan cascade ke messages & generation_runs.
- **Unified Shell**: Sidebar lebar `280px` paten (White L1 surface), tidak boleh berubah posisi atau hilang saat berpindah percakapan.
- **Anti-AI-Slop**: cream `#f5f1e4`, no heavy drop shadow, no neon/glow, no emoji di UI (Lucide only 1.5-2px), no dark mode, font profesional.
- **Commit per Task (Atomic)**: Wajib commit di akhir setiap Task.
- **Push di Akhir**: Setelah gate verifikasi Task 7 lolos, wajib push ke remote repository.

## Verifikasi Fase 04 (Task 7 — wajib lolos sebelum selesai & push)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim):
- TypeCheck: `bunx tsc --noEmit` → 0 error
- Lint/Format: `bunx biome check ./src` → pass
- Unit: `bunx vitest run tests/unit/title.test.ts tests/unit/validation.test.ts -v` → ALL pass (5+)
- Integration: `bunx vitest run tests/integration/conversations.test.ts -v` → ALL pass (CRUD, 403 ownership, soft/hard delete, archive, getMessages ASC)
- E2E: `bunx playwright test tests/e2e/persistence.spec.ts --project=chromium` → ALL pass (empty state, create, rename, delete, search, archive, reload, virtual)
- Reload Persist: Test manual / e2e reload halaman `/chat/$id` pesan tetap utuh tidak hilang.
- **Git Push**: `git push origin <branch>` berhasil tanpa error.

Laporan akhir: daftar file dibuat/modif, daftar commit per task, status tiap Task, hasil semua command verifikasi, dan URL / konfirmasi `git push`. Jika ada blocker → stop dan tanya user, jangan asumsi.