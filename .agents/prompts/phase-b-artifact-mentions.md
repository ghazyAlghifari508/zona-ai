/goal Lanjutkan dan tuntaskan seluruh implementasi Phase B (Structured @artifact Mentions — Task 1 sampai 8) di worktree zona-ai branch `feat/artifact-canvas-mentions` sampai selesai 100%: (1) Eksekusi seluruh 8 task sesuai rencana resmi `docs/superpowers/plans/2026-09-07-artifact-mentions.md` dan spesifikasi `docs/superpowers/specs/2026-09-07-artifact-canvas-mentions-design.md`; (2) Setiap task wajib melalui siklus TDD (RED -> GREEN), review task-scoped, dan atomic Conventional Commits; (3) Lakukan broad whole-branch review setelah Task 8; (4) Jalankan final verification fresh: bun install --frozen-lockfile, bun x tsc --noEmit, bun x biome check ./src, full Vitest (unit + integration via silent env injection), full Playwright E2E, forbidden type-bypass scan (0 matches); (5) Push branch `feat/artifact-canvas-mentions` ke remote hanya setelah seluruh gate lulus.

Halo agent, kamu bertugas melanjutkan proyek Zona.ai ke **Phase B: Structured `@artifact` Mentions**.
Phase A (Artifact Workspace & Canvas, Task 1–12) sudah selesai 100%, terverifikasi green, dan ter-push di commit `aea7bba`.

### 1. BACA FILE-FILE INI TERLEBIH DAHULU (MANDATORY CONTEXT)
1. `docs/superpowers/handoffs/2026-09-08-phase-b-artifact-mentions-handoff.md` (Catatan serah terima lengkap, quirk mesin, dan arsitektur Phase A).
2. `docs/superpowers/specs/2026-09-07-artifact-canvas-mentions-design.md` (Spesifikasi desain resmi; kebenaran arsitektur tertinggi).
3. `docs/superpowers/plans/2026-09-07-artifact-mentions.md` (Rencana eksekusi 8 task Phase B).
4. `AGENTS.md` dan `.agents/rules/*` (Aturan god-tier repo: no assumptions, no hardcode, no type bypass, anti-ai-slop, bounded processes).

---

### 2. CORE RULES & CONSTRAINTS (JANGAN DILANGGAR)
- **Struktur Mention:** Mention adalah objek terstruktur `{ artifactId, versionId, mode }` di tabel DB terpisah `message_artifact_mentions`, BUKAN hasil parsing string `@filename` di backend. Textarea Composer tetap plain text, chip mention hidup di tray terpisah.
- **Mode Eksplisit:** Hanya `'context'` (read-only R2 bytes ke prompt sistem) atau `'revise'` (target revisi via `planArtifactOperations`). Jangan menebak intensi dari kata-kata prompt.
- **Batasan Mention:** Maksimal 4 mention per pesan. Picker hanya menampilkan artifact dari percakapan saat ini (`conversationId`).
- **Server Authority:** Server yang memverifikasi kepemilikan dan membaca byte kanonikal dari R2; metadata dari client tidak dipercaya mentah-mentah.
- **Zero Type Bypass:** DILARANG KERAS memakai `as any`, `as never`, `as unknown as`, `@ts-ignore`, atau `@ts-expect-error`. Gunakan type narrowing, Zod parsing, atau `$inferInsert`.
- **The Unbreakable Bar:** JANGAN PERNAH menurunkan standar assertion (jangan ganti kesetaraan eksak dengan `.toBeDefined()`). DILARANG menguji teks AI prose, classname Tailwind eksak, atau snapshot styling. Uji invarian mekanis deterministik.
- **Jangan Rusak Solusi Phase A:**
  - Tetap pertahankan boundary server-only di `src/server/core/artifact-reads.server.ts` (jangan biarkan `postgres` bocor ke bundle client).
  - Gunakan helper `gotoChatAndWaitForArtifactHydration` di E2E untuk mencegah hydration race.
  - Pertahankan perbaikan header margin di `ArtifactCanvas.tsx` dan pengecekan `!generation.artifact` di `ModelColumn.tsx`.
- **Atomic Commits:** Commit setiap task segera setelah diverifikasi (`feat:`, `fix:`, `test:`, `docs:`).

---

### 3. QUIRK MESIN & BOUNDED PROCESS (WINDOWS POWERSHELL + BUN)
- **Injeksi Env:** Jangan gunakan `bun --env-file="..."` karena sering menginjeksi 0 variabel di mesin ini. Selalu gunakan pola silent PowerShell:
  ```powershell
  $parentEnv = 'C:\Coding\Web Development\Tanstack-start\zona-ai\.env'; Get-Content -LiteralPath $parentEnv | ForEach-Object { if ($_ -match '^\s*([^#][^=]*)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('"'), 'Process') } }; <command>
  ```
- **Rahasia:** JANGAN PERNAH mencetak atau membocorkan isi secret/API keys ke console atau file laporan.
- **Bounded Lifecycle:** Setiap perintah wajib memiliki timeout. Jangan pernah menggunakan `Start-Process` dengan output redirect. Pastikan port 3000 dan proses bersih (`PORT_3000_CLEAN`).
- **Supabase:** Dilarang menyentuh remote Supabase. Semua pengujian database menggunakan PostgreSQL lokal.

---

### 4. URUTAN TUGAS PHASE B (8 TASKS)
Kerjakan berurutan dari `docs/superpowers/plans/2026-09-07-artifact-mentions.md`:
- **Task 1:** Add Persisted Mention Schema and Request Contracts (`schema.ts`, migration Drizzle, Zod contracts, unit & integration tests).
- **Task 2:** Implement Authorized Mention Resolution and Storage Reads (`artifact-mentions.ts`, R2 read validation).
- **Task 3:** Inject Exact Mention Context into Single and Compare Chat Streams (`chat.ts`, `artifact-generation.ts`).
- **Task 4:** Route Multi-Target Revisions to Artifact Core (`artifact-operations.ts`, Compare fork branching).
- **Task 5:** Build Accessible Mention Picker Component (`ArtifactMentionPicker.tsx`).
- **Task 6:** Build Mention Chip Tray Component (`ArtifactMentionChips.tsx`).
- **Task 7:** Build Historical Mention Token Component (`ArtifactMentionTokens.tsx`).
- **Task 8:** Integrate Mentions with Composer, Route, and Canvas (E2E Playwright coverage).

---

### 5. FINAL VERIFICATION GATE (SEBELUM PUSH)
Setelah Task 8 selesai dan broad review tuntas, jalankan verifikasi fresh:
1. `bun install --frozen-lockfile`
2. `bun x tsc --noEmit` (0 errors)
3. `bun x biome check ./src` (0 errors)
4. `bun x vitest run --maxWorkers=1` (seluruh suite unit + integration)
5. `bun x playwright test` (seluruh suite E2E)
6. Bypass scan: `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"` (0 matches)
7. `git push origin feat/artifact-canvas-mentions`

Mulai sekarang dari **Phase B Task 1**.
