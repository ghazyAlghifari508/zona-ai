# PROMPT — Implementasi Fase 09 Observability + Usage Tracking — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 09 (Observability + Usage Tracking via Langfuse & Drizzle)** dari aplikasi **Zona.ai** — multi-model AI chat workspace.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/zona-ai-no-type-bypass.md` — **LARANGAN** `as any`/`as never`/`as unknown as`/`@ts-ignore` untuk membungkam `tsc`; wajib model type yang benar
5. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket (termasuk disiplin skala font: jangan font raksasa, jangan kekecilan)
6. `.agents/rules/zona-ai-skills-mcp.md` — **satu-satunya sumber kebenaran** skill / MCP / plugin. Kombinasi khusus fase ini di rules Section 6 "Fase 09 Observability". Patuhi tabel "Kapan Wajib" + "Larangan".
7. `docs/superpowers/specs/2026-08-27-phase-09-observability-spec.md` — spec Fase 09 (Tujuan, Scope, Design Tokens, Env, Testing, DoD, Larangan Khusus)
8. `docs/superpowers/plans/2026-08-27-phase-09-observability-plan.md` — PLAN PELAKSANAAN Fase 09 (6 Task, ikuti step-by-step). Global Constraints & "Batasan Keras" fase ini ada di plan — ikuti langsung, jangan modifikasi.

### ⛔ Bagian WAJIB-PATUH (tidak bisa dilewati)

Kode yang kamu tulis **WAJIB menaati isi file-file di atas** — diukur dari hasil kode, bukan dari laporan baca. Setiap aturan harus terlihat di implementasi dan diperiksa di Gate Verifikasi (Task 6):
- **Server-only secret**: `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASE_URL` tidak boleh bocor ke client (`grep -r "LANGFUSE_SECRET" .vinxi/build/client` → 0). `src/lib/langfuse/*` tidak boleh diimport di `src/components/*`.
- **No fake latency / usage**: Latency dan TTFT wajib dihitung dari timestamp nyata (`Date.now()` pada `startedAt`, `onChunk text-delta` untuk `firstTokenAt`, dan `onFinish` untuk `completedAt`), bukan mock `setTimeout`.
- **No PII ke Langfuse**: Jangan kirim isi pesan lengkap atau data sensitif (password, API keys, session tokens) ke Langfuse kecuali diizinkan env flag eksplisit.
- **No type bypass (WAJIB)**: `as never`, `as any`, `as unknown as`, `@ts-ignore` = 0 di seluruh kode baru maupun modifikasi.
- **Design MindMarket**: `UsageStats` dan `FeedbackButtons` wajib patuh palette (`bg-pure-white`, `border-hairline-mist`, active `bg-sandstone border-ink-black`), Lucide icons (`Timer`, `ThumbsUp`, `ThumbsDown`), no `shadow-xl`, no neon, no emoji.

**⚠️ HEMAT TOKEN:** JANGAN baca seluruh `docs/` — cukup 8 file di atas. Jika butuh referensi spesifik, baca hanya section relevan.

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — jangan baca ulang seluruhnya.

## Prasyarat (Fase 01-08 SUDAH selesai)

- `src/lib/db` lengkap + `src/server/functions/` (`chat.ts` single & compare streaming, `search.ts`, `files.ts`, `getMessages`, dll) + UI workspace lengkap.
- `.env` sudah punya `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASE_URL` (atau opsional graceful no-op jika env kosong).
- Tabel `generation_runs` sudah punya kolom token/latency atau siap dimigrasikan.
- PostgreSQL + Drizzle siap untuk tabel `feedback` dan `usage_records`.

## Tugas (6 Task sesuai plan)

Implementasikan **6 Task di `docs/superpowers/plans/2026-08-27-phase-09-observability-plan.md` secara berurutan**, persis sesuai langkah di plan — tiap Task TDD: `Files` → `Interfaces` → tulis failing test → jalankan (harus FAIL) → implementasi minimal → jalankan (harus PASS) → **atomic commit**:

1. **Task 1** — DB `feedback` table + pastikan `usage_records` + validasi optional `LANGFUSE_*` di `src/lib/env.server.ts` + migrasi Drizzle.
2. **Task 2** — `src/lib/langfuse/tracing.ts` server-only tracing wrapper (`withLangfuse`) yang graceful no-op saat env Langfuse tidak tersedia (tidak boleh throw / block chat).
3. **Task 3** — Latency (`startedAtMs`, `firstTokenAtMs` via `onChunk text-delta`, `completedAtMs`) + Usage (`onFinish` `usage.promptTokens`, `completionTokens`, `totalTokens`) di `src/server/functions/chat.ts` (`sendMessage` & `sendCompareMessage`) → UPDATE `generation_runs` + INSERT `usage_records`.
4. **Task 4** — Server functions `src/server/functions/feedback.ts` (`submitFeedback` dengan upsert rating `positive`/`negative` + comment & ownership check 403, `getFeedback`).
5. **Task 5** — Komponen UI:
   - `src/components/chat/UsageStats.tsx` (`Timer` icon, formatted tokens · TTFT · total latency).
   - `src/components/chat/FeedbackButtons.tsx` (`ThumbsUp`/`ThumbsDown` toggle buttons, persistent rating).
   - Integrasi ke `MessageList.tsx` (di bawah assistant message) dan `ModelColumn.tsx` (footer compare column).
6. **Task 6** — **Verification Gate Fase 09**.

## Disiplin Git: ATOMIC COMMIT & PUSH (WAJIB)

1. **Atomic Commit per Task:**
   - Dilarang menumpuk perubahan dalam satu commit raksasa di akhir.
   - Commit mandiri untuk:
     - Task 1: `feat(db): feedback table + langfuse env`
     - Task 2: `feat(obs): langfuse tracing graceful no-op`
     - Task 3: `feat(obs): latency TTFT + usage capture`
     - Task 4: `feat(feedback): submit/get with ownership upsert`
     - Task 5: `feat(ui): usage stats + feedback thumbs`
     - Task 6: `chore(verify): fase 09 gate`
2. **Git Push setelah Selesai:**
   - Setelah Gate Verifikasi (Task 6) lulus 100% tanpa error, jalankan:
     ```bash
     git status
     git diff
     git push origin <branch-name>
     ```
   - Pastikan working tree bersih (`clean`) dan semua commit ter-push ke remote.

## Verifikasi Fase 09 (Task 6 Gate — wajib lolos sebelum selesai & push)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim):
- TypeCheck: `bun x tsc --noEmit` → 0 error
- Lint/Format: `bun x biome check ./src` → pass
- Unit: `bun x vitest run tests/unit/usage.test.ts tests/unit/latency.test.ts tests/unit/feedback.test.ts tests/unit/tracing.test.ts -v` → ALL pass
- Integration: `bun x vitest run tests/integration/usage.test.ts -v` → ALL pass (usage_records insert, latency/TTFT update, feedback upsert, ownership 403)
- E2E: `bun x playwright test tests/e2e/usage.spec.ts --project=chromium` → ALL pass (stats visible tokens/TTFT/total, compare 2 cols stats, feedback toggle & persist)
- Manual DB: `bun x drizzle-kit migrate` sukses; `psql \d feedback` → kolom `rating`, `generation_run_id`, `user_id`; `SELECT prompt_tokens, latency_ms, time_to_first_token_ms FROM generation_runs LIMIT 3`; `SELECT * FROM usage_records LIMIT 3`
- Secret leak: `grep -r "LANGFUSE_SECRET" .vinxi/build/client 2>/dev/null | wc -l` → 0
- **No type-bypass (WAJIB)** → `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts'` → **0 matches**
- **Git Push**: `git push origin <branch>` berhasil tanpa error.

Laporan akhir: daftar file dibuat/dimodifikasi Task 1-5, daftar commit per task, status tiap Task, hasil semua command verifikasi, dan konfirmasi `git push`. Jika ada blocker/keputusan ambigu (terutama Langfuse SDK v3 vs `@langfuse/vercel-ai-sdk` wrapper API) → stop dan tanya user / rujuk docs aktual via `context7` dan skill `langfuse`, jangan berasumsi.