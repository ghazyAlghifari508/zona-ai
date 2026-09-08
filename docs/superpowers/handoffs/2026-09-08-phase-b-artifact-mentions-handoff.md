# Phase B Handoff: Structured `@artifact` Mentions

**Tanggal:** 8 September 2026  
**Worktree:** `C:\Coding\Web Development\Tanstack-start\zona-ai\.worktrees\artifact-canvas-mentions`  
**Branch:** `feat/artifact-canvas-mentions`  
**Latest Pushed Commit:** `a705b7f` (`fix(compare): render artifact file card for completed compare generation without text content`)  
**Status Phase A:** **100% COMPLETE & VERIFIED** (Pushed to GitHub)  
**Next Step:** Mulai **Phase B Task 1** pada sesi baru.

---

## 1. Status Terkini & Pembuktian Phase A

Semua 12 task dari Phase A (`docs/superpowers/plans/2026-09-07-artifact-core-canvas.md`) telah diimplementasikan, diverifikasi, dan review-clean.

### Hasil Gate Verifikasi Terakhir (Semua GREEN):
- **TypeScript:** `bun x tsc --noEmit` → **0 errors** (bersih).
- **Biome Linter:** `bun x biome check ./src` → **164 files checked, 0 errors** (bersih).
  *(Catatan ruling: Gate Biome proyek sesuai AGENTS.md mengikat `./src`. Hutang format/unused imports lama di `tests/` ditunda/deferred).*
- **Integrasi Vitest:** 21 file, 171 test → **171/171 passed** (termasuk static security audit yang diperkuat dengan AST/token-level check).
- **Playwright E2E Targets:**
  - `tests/e2e/compare.spec.ts` (chromium): **3/3 passed** (durasi ~22s).
  - `tests/e2e/artifact-canvas.spec.ts` (chromium): **6 passed, 1 skipped** (mobile-only).
  - `tests/e2e/artifact-canvas.spec.ts` (mobile): **1 passed, 6 skipped** (desktop-only).
  - `tests/e2e/agent-skill.spec.ts` (chromium): **3/3 passed**.
- **Build:** `bun run build` exit 0, peringatan eksternalisasi `postgres`/driver browser sudah **hilang total**.
- **Bypass Scan:** Bebas dari `as any`, `as never`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`.
- **Git Tree:** Bersih, semua commit atomik sudah ter-push ke `origin/feat/artifact-canvas-mentions`.

---

## 2. Solusi Arsitektural Penting dari Phase A (JANGAN DI-REGRESS)

Agent sesi baru **WAJIB** memahami solusi-solusi kunci ini agar tidak menimbulkan regresi:

1. **Pemisahan Server-Only Boundary (`artifact-reads.server.ts`):**
   - File RPC wrapper client: `src/server/functions/artifacts.ts`.
   - File core server-only: `src/server/core/artifact-reads.server.ts` dengan marker `@tanstack/react-start/server-only`.
   - **Alasan:** Menghindari driver Postgres (`postgres`/`drizzle-orm/postgres-js`) masuk ke bundle browser yang menyebabkan crash runtime `ReferenceError: Buffer is not defined`.

2. **Hydration Gate di E2E (`tests/e2e/artifact-hydration.ts`):**
   - Fungsi: `gotoChatAndWaitForArtifactHydration(page, url)` dan `reloadAndWaitForArtifactHydration(page)`.
   - **Mekanisme:** Memasang listener `page.waitForResponse` **sebelum** `page.goto`/`reload` untuk menangkap RPC `listConversationArtifacts` yang statusnya OK (200).
   - **Alasan:** Mencegah race condition di mana Playwright mengklik elemen DOM yang dirender SSR sebelum React selesai melakukan hidrasi event handler di client. Jangan gunakan `waitForTimeout` / sleep sembarangan.

3. **Rendering Kartu Artifact di Compare (`src/components/chat/ModelColumn.tsx`):**
   - Syarat: `isFailedOrEmptyCompleted = generation.status === 'failed' || (generation.status === 'completed' && !hasVisibleContent && !generation.artifact)`.
   - **Alasan:** Pada generasi artifact mode compare, teks `content` memang kosong/redacted (karena konten berupa file di R2). Jika tidak memeriksa `!generation.artifact`, kolom akan salah menampilkan pesan error `ERR-001`.

4. **Kompensasi Upload R2 & Durable Deletion Fence:**
   - Sesuai Task 11 (`2f38b65`), penghapusan percakapan menggunakan kolom `deletion_started_at`. Finalisasi artifact membersihkan locator `{ bucket, key }` eksak jika terjadi kegagalan upload.

---

## 3. Protokol & Tata Cara Eksekusi di Mesin Ini (Windows PowerShell)

Lingkungan lokal memiliki beberapa karakteristik penting:

1. **Injeksi Environment:**
   - `bun --env-file="..."` **TIDAK DAPAT DIANDALKAN** di mesin ini (sering menginjeksi 0 variabel ke subproses `bun x`).
   - **Gunakan pola PowerShell yang terbukti:**
     ```powershell
     $parentEnv = 'C:\Coding\Web Development\Tanstack-start\zona-ai\.env'; Get-Content -LiteralPath $parentEnv | ForEach-Object { if ($_ -match '^\s*([^#][^=]*)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('"'), 'Process') } }; <command di sini>
     ```
   - **PENTING:** Jangan pernah mencetak atau membocorkan isi secret/kunci API ke console/log/laporan.

2. **Bounded Processes & Lifecycle:**
   - Semua perintah berat harus memiliki timeout eksplisit.
   - Dev server di-manage Playwright secara otomatis (lihat `playwright.config.ts`).
   - Jangan pernah menjalankan dev server via PowerShell `Start-Process` dengan redirected stdout/stderr.
   - Sebelum dan sesudah run browser/server, verifikasi port 3000 bebas (`Get-NetTCPConnection -LocalPort 3000`) dan tidak ada process tree `bun.exe`/`node.exe` yang tertinggal. Jika perlu kill, gunakan tree kill terverifikasi: `taskkill /PID <pid> /T /F`.

3. **Aturan Uji (Zero Assumption & The Unbreakable Bar):**
   - Dilarang menurunkan standar assertion (jangan ganti kesetaraan eksak dengan `.toBeDefined()`).
   - Dilarang menguji copy/prose teks AI, classname Tailwind eksak, atau snapshot markup fleksibel. Uji invarian mekanis deterministik (skema Zod, struktur data, tipe, boundary RPC).

---

## 4. Panduan Eksekusi Phase B (Structured `@artifact` Mentions)

**Dokumen Rencana:** `docs/superpowers/plans/2026-09-07-artifact-mentions.md`  
**Dokumen Spesifikasi:** `docs/superpowers/specs/2026-09-07-artifact-canvas-mentions-design.md`  
**Metodologi:** Subagent-Driven Development (SDD) dengan siklus TDD RED → GREEN, implementer → reviewer (maks 5 round fix), dan atomic Conventional Commits.

### Ringkasan 8 Task Phase B:

1. **Task 1: Add Persisted Mention Schema and Request Contracts**
   - Skema tabel `messageArtifactMentions` (`src/lib/db/schema.ts`), migrasi Drizzle.
   - Skema input: `artifactMentionInputSchema`, `artifactMentionDraft`, `safeArtifactMention`.
   - Modus eksplisit: `'context' | 'revise'` (maksimal 4 mention per pesan).
   - Validasi partisi operasi di `src/lib/utils/validation.ts`.
   - Unit & integration tests (`tests/unit/artifact-mentions.test.ts`, `tests/integration/artifact-mentions.test.ts`).

2. **Task 2: Implement Authorized Mention Resolution and Storage Reads**
   - Resolver server-side di `src/server/core/artifact-mentions.ts`.
   - Mengambil metadata resmi dan byte kanonikal dari R2 (`getObject`).
   - Validasi kepemilikan percakapan/user.
   - Modus `revise` harus merujuk pada versi terkini (`currentVersionId`).

3. **Task 3: Inject Exact Mention Context into Single and Compare Chat Streams**
   - Injeksi prompt sistem untuk mention berkategori `context` di `src/server/core/chat.ts` dan `src/server/core/artifact-generation.ts`.
   - Format penandaan blok konten jelas, terisolasi, dan aman.

4. **Task 4: Route Multi-Target Revisions to Artifact Core**
   - Routing otomatis saat user menyertakan mention `revise` ke alur revisi artifact `planArtifactOperations`.
   - Dukungan Compare: N target × M model dengan pembuatan fork independen.

5. **Task 5: Build Accessible Mention Picker Component**
   - Komponen UI: `src/components/artifacts/ArtifactMentionPicker.tsx`.
   - Trigger via `@` di Composer, pencarian real-time berdasarkan title/filename dalam percakapan saat ini.
   - Aksesibilitas keyboard lengkap (Arrow up/down, Enter, Escape).

6. **Task 6: Build Mention Chip Tray Component**
   - Komponen UI: `src/components/artifacts/ArtifactMentionChips.tsx`.
   - Menampilkan chip mention di atas/dalam Composer dengan toggle mode (`Context` vs `Revise`) dan tombol hapus chip.
   - Textarea tetap berupa plain text (mention dikelola via structured tray terpisah).

7. **Task 7: Build Historical Mention Token Component**
   - Komponen UI: `src/components/artifacts/ArtifactMentionTokens.tsx`.
   - Menampilkan badge/token pada pesan riwayat yang jika diklik akan membuka versi exact tersebut di Canvas.

8. **Task 8: Integrate Mentions with Composer, Route, and Canvas**
   - Integrasi end-to-end di `src/components/chat/Composer.tsx` dan `src/routes/chat/$conversationId.tsx`.
   - Pengujian journey Playwright E2E untuk mention picker, submit chip, dan pembukaan historical mention di Canvas.

---

## 5. Checklist Verifikasi Akhir (Broad Final Gates)

Setelah 8 Task Phase B selesai:
1. `bun install --frozen-lockfile`
2. `bun x tsc --noEmit` (harus 0 errors)
3. `bun x biome check ./src` (harus 0 errors)
4. Full Vitest: `bun x vitest run --maxWorkers=1` (semua unit + integration)
5. Full Playwright E2E suite
6. Forbidden Type-Bypass Scan:
   ```bash
   rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
   ```
   (Harus 0 matches)
7. `git diff --check`
8. Push akhir ke branch `feat/artifact-canvas-mentions` dan buat PR.
