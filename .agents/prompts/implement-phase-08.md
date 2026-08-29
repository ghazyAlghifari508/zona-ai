# PROMPT — Implementasi Fase 08 Web Search — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 08 (Web Search via Tavily)** dari aplikasi **Zona.ai** — multi-model AI chat workspace.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/zona-ai-no-type-bypass.md` — **LARANGAN** `as any`/`as never`/`as unknown as`/`@ts-ignore` untuk membungkam `tsc`; wajib model type yang benar
5. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket (termasuk disiplin skala font: jangan font raksasa, jangan kekecilan)
6. `.agents/rules/zona-ai-skills-mcp.md` — **satu-satunya sumber kebenaran** skill / MCP / plugin. Kombinasi khusus fase ini di rules Section 6 "Fase 08 Web Search". Patuhi tabel "Kapan Wajib" + "Larangan".
7. `docs/superpowers/specs/2026-08-27-phase-08-web-search-spec.md` — spec Fase 08 (Tujuan, Scope, Design Tokens, Env, Testing, DoD, Larangan Khusus)
8. `docs/superpowers/plans/2026-08-27-phase-08-web-search-plan.md` — PLAN PELAKSANAAN Fase 08 (8 Task, ikuti step-by-step). Global Constraints & "Batasan Keras" fase ini ada di plan — ikuti langsung, jangan modifikasi.

### ⛔ Bagian WAJIB-PATUH (tidak bisa dilewati)

Kode yang kamu tulis **WAJIB menaati isi file-file di atas** — diukur dari hasil kode, bukan dari laporan baca. Setiap aturan harus terlihat di implementasi dan diperiksa di Gate Verifikasi (Task 8): no-hardcode lewat `constants.ts` (`TAVILY_MAX_RESULTS`, `TAVILY_TIMEOUT_MS`), server-only (`tavily/client.ts` tidak di `components/*`, `grep tvly-` client 0), **anti type-bypass** (`as never`/`as any`/`as unknown as`/`@ts-ignore` = 0), Fair Compare single Tavily fetch, graceful `ERR-015`.

**⚠️ HEMAT TOKEN:** JANGAN baca seluruh `docs/` — cukup 8 file di atas. Jika butuh referensi spesifik, baca hanya section relevan (misal `docs/ENVIRONMENT.md` untuk `TAVILY_*`, `docs/API.md` untuk `searchWeb`).

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — jangan baca ulang seluruhnya.

## Prasyarat (Fase 01-07 SUDAH selesai)

- `src/lib/db` lengkap + `src/server/functions/` (`chat.ts` `sendMessage` + `sendCompareMessage` SSE tagged multiplex, `search.ts` belum ada, `getMessages` dll) + UI workspace lengkap (Composer, MessageList markdown, ModelColumn compare, route `/chat/$conversationId`).
- `.env` sudah punya `TAVILY_API_KEY` (`tvly-...`) — dan `env.server.ts` Fase 01 sudah validate `TAVILY_API_KEY` (`tvly-`). Gunakan yang ada, jangan bikin baru.
- PostgreSQL + pgvector + pgcrypto aktif.
- Belum ada: `src/lib/tavily/`, tabel `web_sources`, `src/server/functions/search.ts`, `CitationDrawer.tsx`.
- ⚠️ **Kode dari fase sebelumnya SAAT INI kotor**: banyak `as unknown as never`, `as any`/'unknown as', `: any`, `as never` di `src/server/functions/chat.ts`, `src/lib/rag/*`, `src/lib/r2/*`, `src/routes/*`, `src/server/functions/files.ts` — dihasilkan agent sebelumnya demi membungkam `tsc`. Ini wajib diperbaiki di **Task 0** sebelum mengerjakan fase.

## Tugas

### 🔧 TASK 0 — Bersihkan Type Bypass dari Fase Sebelumnya (TAMBAHAN, WAJIB)

Sebelum Task 1 fase ini, perbaiki semua pelanggaran type safety yang ditinggalkan agent fase-fase sebelumnya. Ini BUKAN opsional — kode lama yang kotor jadi fondasi `chat.ts` yang akan kamu modifikasi di Task 3-4.

1. **Scan seluruh repo** (kecuali file generated/infra):
   ```bash
   rg -n "as never|as any|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts' -g '!*.d.ts'
   ```
   Juga cek `src/routes/chat/$conversationId.tsx`, `src/routes/auth/*`, `src/server/functions/*`, `src/lib/rag/*`, `src/lib/r2/*`, `src/lib/db/seed.ts`, `src/lib/auth/session.ts`.
2. **Perbaiki tiap temuan** sesuai `.agents/rules/zona-ai-no-type-bypass.md`:
   - Drizzle insert/select → `$inferInsert`/`$inferSelect` atau `$type()` di schema (`jsonb('metadata').$type<...>()`, `vector(...)`); hilangkan casting `values({...} as never)`.
   - `streamText` messages → `CoreMessage[]` dari `import type { CoreMessage } from 'ai'`; jangan `messages: aiMessages as never` / `aiMessages as unknown as string` untuk `content` parts.
   - Error `status`/`code` → class `AppError` (kira-kira: `constructor(message, status = 500, code = 'ERR-000')`) atau tipe error proyek; hilangkan `(e as unknown as Record<string, unknown>).status` dan `as unknown as { status... }`.
   - `getAuthSession(request)` hasil → tipe session yang benar dari Better Auth (jangan `as unknown as {...}`).
   - Library boundary (`unpdf` `mergePages`, `mammoth`, S3 `Body`, `Response(body as unknown as BodyInit)`) → verifikasi API aktual via `context7`; gunakan cast paling sempit single-level dengan komentar `// cast boundary:` bila SDK memang tak punya typings; DILARANG `as never`.
3. **Pastikan konsisten**: `usage` dijadikan tipe lokal `UsageLike` (bukan `as unknown as {...}`), `r.role` pakai type yang benar dari Drizzle, dsb. Setiap file yang kamu sentuh harus jelas benar secara type.
4. **Bukti**: setelah Task 0, `rg ... as never|as any|as unknown as|: any|@ts-ignore|@ts-expect-error` di `src` (minus generated/infra) → **0 matches**. `bun x tsc --noEmit` → 0 (karena types benar, bukan karena dibungkam). Semua test yang ada masih pass.
5. **Commit mandiri**:
   ```bash
   git add src/
   git commit -m "refactor(types): remove ts type-safety bypasses from prior phases"
   ```
   Jika temuan sangat banyak atau ada file yang tidak bisa dibersihkan tanpa mengubah perilaku → stop dan lapor ke user dengan daftar per file + usulan, jangan lanjut diam-diam.

### Task 1-8 — Web Search sesuai plan

Setelah Task 0 bersih, implementasikan **8 Task di `docs/superpowers/plans/2026-08-27-phase-08-web-search-plan.md` secara berurutan**, persis sesuai langkah di plan — tiap Task TDD: `Files` → `Interfaces` → tulis failing test → jalankan (harus FAIL) → implementasi minimal → jalankan (harus PASS) → **atomic commit**:

1. **Task 1** — `web_sources` table + `TAVILY_MAX_RESULTS`/`TAVILY_TIMEOUT_MS` + `src/lib/tavily/client.ts` (`SearchProvider` + `TavilyProvider` + `searchProvider`)
2. **Task 2** — `src/server/functions/search.ts` `searchWeb` standalone graceful (`ERR-015` → hasil kosong, jangan throw 500)
3. **Task 3** — `sendMessage` `enableWebSearch` → search sekali → insert `web_sources` per genId (`position`/`score`/`snippet 500`) → inject `Web context [1][2]`
4. **Task 4** — `sendCompareMessage` **Fair Compare**: `searchProvider.search` sekali untuk N model, `web_sources` N× hasil sama, `system` sama — jangan fetch per-model
5. **Task 5** — Composer Globe toggle (`data-testid="web-toggle"`, `aria-pressed`, aktif = sandstone + ink-black border)
6. **Task 6** — `CitationDrawer` White 10px (chips `[n]` + drawer title/url/snippet) + wire ke `MessageList` & `ModelColumn` per `generationId`
7. **Task 7** — E2E Fair Compare + Graceful toast + persistence reload (`getMessages` join `web_sources`)
8. **Task 8** — **Verification Gate Fase 08**

## Disiplin Git: ATOMIC COMMIT & PUSH (WAJIB)

1. **Atomic Commit per Task:**
   - Dilarang menumpuk perubahan dalam satu commit raksasa di akhir.
   - Commit mandiri untuk:
     - Task 0: `refactor(types): remove ts type-safety bypasses from prior phases`
     - Task 1: `feat(web): tavily provider + web_sources + constants`
     - Task 2: `feat(web): searchWeb standalone graceful`
     - Task 3: `feat(chat): sendMessage web inject + web_sources`
     - Task 4: `feat(compare): Fair Compare single Tavily fetch`
     - Task 5: `feat(ui): composer web toggle Globe`
     - Task 6: `feat(ui): citation chips + drawer`
     - Task 7: `feat(web): e2e fair graceful persistence`
     - Task 8: `chore(verify): fase 08 gate`
2. **Git Push setelah Selesai:**
   - Setelah Gate Verifikasi (Task 8) lulus 100% tanpa error, jalankan:
     ```bash
     git status
     git diff
     git push origin <branch-name>
     ```
   - Pastikan working tree bersih (`clean`) dan semua commit ter-push ke remote.

## Verifikasi Fase 08 (Task 8 Gate — wajib lolos sebelum selesai & push)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim):
- TypeCheck: `bun x tsc --noEmit` → 0 error
- Lint/Format: `bun x biome check ./src` → pass
- Unit: `bun x vitest run tests/unit/tavily.test.ts tests/unit/citation.test.ts -v` → ALL pass
- Integration: `bun x vitest run tests/integration/search.test.ts -v` → ALL pass (standalone, inject, Tavily fail graceful, Fair Compare once, ownership)
- E2E: `bun x playwright test tests/e2e/websearch.spec.ts --project=chromium` → ALL pass (toggle, chips+drawer, compare fair, graceful, persistence)
- Manual DB: `bun x drizzle-kit migrate` sukses; `psql \d web_sources` → `generation_run_id not null`, `position`; `grep -r "TAVILY_API_KEY\|tvly-" .vinxi/build/client 2>/dev/null | wc -l` → 0
- **No type-bypass roadmap (WAJIB)** → `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts'` → **0 matches**; `streamText` messages `CoreMessage[]`; insert Drizzle bertipe terhadap schema.
- **Git Push**: `git push origin <branch>` berhasil tanpa error.

Laporan akhir: hasil Task 0 (daftar file dibersihkan + jumlah temuan sebelum/sesudah scan), daftar file dibuat/modif Task 1-8, daftar commit per task, status tiap Task, hasil semua command verifikasi, dan konfirmasi `git push`. Jika ada blocker/keputusan ambigu (terutama `@tavily/core` vs fetch, Tavily response shape, Fair Compare implementation) → stop dan tanya user / rujuk docs aktual via `context7`, jangan asumsi.