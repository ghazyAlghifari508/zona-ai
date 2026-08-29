# PROMPT — Implementasi Fase 06 File Upload — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 06 (File Upload)** dari aplikasi **Zona.ai** — multi-model AI chat workspace.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/zona-ai-no-type-bypass.md` — **LARANGAN** `as any`/`as never`/`as unknown as`/`@ts-ignore` untuk membungkam `tsc`; wajib model type yang benar
5. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket (termasuk disiplin skala font: jangan font raksasa, jangan kekecilan)
6. `.agents/rules/zona-ai-skills-mcp.md` — **satu-satunya sumber kebenaran** skill / MCP / plugin. Kombinasi khusus fase ini di rules Section 6 "Fase 06 File". Patuhi tabel "Kapan Wajib" + "Larangan".
7. `docs/superpowers/specs/2026-08-27-phase-06-file-upload-spec.md` — spec Fase 06 (Tujuan, Scope, Design Tokens, Env, Testing, DoD, Larangan Khusus)
8. `docs/superpowers/plans/2026-08-27-phase-06-file-upload-plan.md` — PLAN PELAKSANAAN Fase 06 (6 Task, ikuti step-by-step). Global Constraints & "Batasan Keras" fase ini ada di plan — ikuti langsung, jangan modifikasi.

**⚠️ HEMAT TOKEN:** JANGAN baca semua file `.md` di folder `docs/`. Cukup file di atas. Jika butuh referensi spesifik saat implementasi, baca hanya section yang relevan (misal `docs/ARCHITECTURE.md` §9 Object Storage atau `docs/DATABASE.md` §4 attachments), jangan baca utuh.

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — jangan baca ulang seluruhnya.

## Prasyarat (Fase 01-05 SUDAH selesai)

- `src/lib/db` lengkap + `src/server/functions/` (`chat.ts` `sendMessage` SSE tagged, `getModels`, persisted conversations, Compare). UI workspace lengkap (Composer pill 50px, route `/chat/$conversationId`).
- `src/lib/env.server.ts` sudah validate `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (required) + `R2_PUBLIC_URL` (optional).
- 9Router live. PostgreSQL + pgvector + pgcrypto aktif. `.env` valid.
- Belum ada: `@aws-sdk/client-s3` (install di Task 2), `file-type`, tabel `attachments`, directory `src/lib/r2/`.
- Skill yang SUDAH terinstall tapi TIDAK dipakai fase ini: `langfuse` (Fase 09), `tavily-*` (Fase 08), `better-auth-*` (Fase 02/10). JANGAN dipakai — kombinasi fase ini sudah ada di rules.

## Tugas

Implementasikan **6 Task di `docs/superpowers/plans/2026-08-27-phase-06-file-upload-plan.md` secara berurutan**, persis sesuai langkah di plan — tiap Task TDD: `Files` → `Interfaces` → tulis failing test → jalankan (harus FAIL) → implementasi minimal → jalankan (harus PASS) → **atomic commit**:

1. **Task 1** — `attachments` table + `MAX_FILE_SIZE_BYTES` constant + `file-validation.ts` (`sanitizeFilename`, `validateMime/Size/MagicBytes`, `validateFile`) + migration `0005_attachments.sql`
2. **Task 2** — R2 client server-only `src/lib/r2/client.ts` (`putObject/getObject/deleteObject` via `@aws-sdk/client-s3`)
3. **Task 3** — Server functions `src/server/functions/files.ts` (`uploadFile` FormData, `getAttachment` proxy, `deleteAttachment`) + ownership 403
4. **Task 4** — Composer Paperclip + drag overlay + `AttachmentPreview` (preview 40x40 + badge + remove)
5. **Task 5** — Vision integration di `chat.ts`: `attachmentIds` verify ownership/conversation, `isVisionCapable` check (non-vision 400 `ERR-003`), inject `fileParts base64` ke `streamText` (single + compare loop)
6. **Task 6** — **Verification Gate Fase 06**

## Disiplin Git: ATOMIC COMMIT & PUSH (WAJIB)

1. **Atomic Commit per Task:**
   - Dilarang menumpuk semua perubahan dalam satu commit raksasa di akhir.
   - Setiap 1 Task selesai (test pass + verifikasi lolos), commit mandiri dengan pesan konvensional:
     - Task 1: `feat(upload): validation + constants + attachments table`
     - Task 2: `feat(r2): S3 client server-only`
     - Task 3: `feat(files): upload/get/delete server functions`
     - Task 4: `feat(ui): composer attachment drag + preview`
     - Task 5: `feat(chat): vision file parts + non-vision reject`
     - Task 6: `chore(verify): fase 06 gate`
2. **Git Push setelah Selesai:**
   - Setelah Gate Verifikasi (Task 6) lulus 100% tanpa error, jalankan:
     ```bash
     git status
     git diff
     git push origin <branch-name>
     ```
   - Pastikan working tree bersih (`clean`) dan semua commit ter-push ke remote.

## Verifikasi Fase 06 (Task 6 Gate — wajib lolos sebelum selesai & push)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim). Perintah persis di plan Task 6:
- TypeCheck: `bun x tsc --noEmit` → 0 error
- Lint/Format: `bun x biome check ./src` → pass, plus `grep -r "shadow-xl" src/components/chat` → 0
- Unit: `bun x vitest run tests/unit/file-validation.test.ts tests/unit/r2.test.ts -v` → 7 passed
- Integration: `bun x vitest run tests/integration/files.test.ts -v` → 9 passed
- E2E: `bun x playwright test tests/e2e/upload.spec.ts --project=chromium` → 7 passed
- Manual DB + R2: `bun x drizzle-kit migrate` sukses; `psql \d attachments` → `r2_key unique`, `user_id`, `conversation_id`; `SELECT file_name, processing_status FROM attachments LIMIT 5`; `grep -r "R2_SECRET" .vinxi/build/client 2>/dev/null | wc -l` → 0
- **No type bypass (WAJIB):** `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts'` → **0 matches**. Semua insert Drizzle bertipe terhadap `schema.ts`, S3 Body/Response tidak dipaksa lewat `as never`/`as unknown as`.
- **Git Push**: `git push origin <branch>` berhasil tanpa error.

Laporan akhir: daftar file dibuat/modif, daftar commit per task, status tiap Task, hasil semua command verifikasi, dan konfirmasi `git push`. Jika ada blocker/keputusan ambigu (terutama perilaku S3 SDK / FormData di server function yang beda-beda) → stop dan tanya user / rujuk docs aktual via `context7`, jangan asumsi.