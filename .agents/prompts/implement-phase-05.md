# PROMPT — Implementasi Fase 05 Compare Mode — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 05 (Compare Mode)** dari aplikasi **Zona.ai** — multi-model AI chat workspace.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/zona-ai-no-type-bypass.md` — **LARANGAN** `as any`/`as never`/`as unknown as`/`@ts-ignore` untuk membungkam `tsc`; wajib model type yang benar
5. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket (termasuk disiplin skala font: jangan font raksasa, jangan kekecilan)
6. `.agents/rules/zona-ai-skills-mcp.md` — aturan wajib pakai skill / MCP / plugin Zona.ai, kapan invoke, contoh per fase (WAJIB patuhi)
7. `DESIGN.md` — **referensi token visual** (warna, font, radius, spacing). BUKAN template layout halaman — struktur halaman mengikuti PRD/UI-UX/spec, bukan menyalin struktur contoh di dalamnya.
8. `docs/superpowers/specs/2026-08-27-phase-05-compare-mode-spec.md` — spec Fase 05 (Tujuan, Scope, Stack Lock, Design Tokens, Env, Testing, DoD, Larangan Khusus)
9. `docs/superpowers/plans/2026-08-27-phase-05-compare-mode-plan.md` — PLAN PELAKSANAAN Fase 05 (8 Task, ikuti step-by-step)

**⚠️ HEMAT TOKEN:** JANGAN baca semua file `.md` di folder `docs/`. Cukup file di atas. Jika butuh referensi spesifik saat implementasi, baca hanya section yang relevan (misal `docs/ARCHITECTURE.md` atau `docs/ENVIRONMENT.md` saat ada konflik env), jangan baca utuh.

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — jangan baca ulang seluruhnya.

## Prasyarat (Fase 01-04 SUDAH selesai)

- `src/lib/db` lengkap (users, sessions, accounts, conversations, messages, generation_runs, credit_transactions, usage_records).
- `src/server/functions/` ada: `getModels`, `sendMessage` (streaming SSE tagged), `stopGeneration`, `regenerateMessage`, `resetDevCreditsFn`, getConversations CRUD, `getMessages`.
- UI workspace lengkap (Sidebar CRUD + search, Composer, ModelSelector, SkillSelector, MessageList markdown, virtual, route `/chat/$conversationId`).
- 9Router live. PostgreSQL + pgvector + pgcrypto aktif. `.env` valid.
- **Bonus skill yang SUDAH terinstall**: `langfuse` (belum dipakai Fase 5 — dipakai nanti Fase 09), `tavily-*` (dipakai nanti Fase 08). JANGAN pakai sekarang.

## Skill & MCP (Sumber Kebenaran = Rules — JANGAN Enumerate Ulang)

Skill/MCP/plugin yang wajib dipakai **sepenuhnya ditentukan oleh `.agents/rules/zona-ai-skills-mcp.md`** (baca urutan #5). Prompt ini BUKAN sumber kebenaran skill — jika ada perbedaan, rules yang menang. Kombinasi khusus fase ini sudah dicontohkan di rules Section 6 "Fase 05 Compare" — patuhi itu, plus tabel "Kapan Wajib" dan "Larangan".

Sorotan khusus Fase 05 (sudah tertulis di rules, ditegaskan ulang):
- **`shadcn-component-discovery`** dulu sebelum membangun `Popover` (CompareSelector) / `Tabs` (MobileCompareTabs) custom.
- **`superpowers:subagent-driven-development`** (recommended): Task 1, 2, 3 independen → bisa `dispatching-parallel-agents`; Task 4-8 dependen → berurutan dengan review per task.
- **`superpowers:systematic-debugging`** jika refund model `failed` tidak jalan — trace `sendCompareMessage → deductCompareCredits → onFinish failed → refundCredits`.
- Fase ini TIDAK pakai: `better-auth-authentication`, `document-pdf`, `tavily-*`, `langfuse` (itu untuk fase lain). Supabase MCP tetap dilarang.

## Disiplin Git: ATOMIC COMMIT & PUSH (WAJIB)

1. **Atomic Commit per Task:**
   - Dilarang menumpuk semua perubahan dalam satu commit raksasa di akhir.
   - Setiap kali 1 Task selesai (test pass + verifikasi lolos), lakukan commit mandiri dengan pesan konvensional yang jelas:
     - Task 1: `feat(db): comparison_runs + generation_runs.comparisonRunId`
     - Task 2: `feat(credits): cumulative deduct + compare validation`
     - Task 3: `feat(stream): multiplex types + merger`
     - Task 4: `feat(chat): sendCompareMessage parallel multiplex`
     - Task 5: `feat(ui): CompareSelector multi 2-4`
     - Task 6: `feat(ui): CompareGrid 2-4 cols + ModelColumn`
     - Task 7: `feat(ui): toggle + mobile tabs + composer compare`
     - Task 8: `feat(compare): retry/cancel per-model + reload`
2. **Git Push setelah Selesai:**
   - Setelah Gate Verifikasi (Task 8 bagian akhir) lulus 100% tanpa error, jalankan:
     ```bash
     git status
     git diff
     git push origin <branch-name>
     ```
   - Pastikan working tree bersih (`clean`) dan semua commit ter-push ke remote.

## Tugas

Implementasikan **8 Task di `docs/superpowers/plans/2026-08-27-phase-05-compare-mode-plan.md` secara berurutan**, persis sesuai langkah di plan (1 Task selesai → TDD pass → atomic commit → lanjut Task berikutnya):

1. **Task 1** — DB `comparison_runs` + `generation_runs.comparisonRunId` FK (migration `0004_comparison_runs.sql`)
2. **Task 2** — Credits Kolektif (`deductCompareCredits` total sum) + Validasi Compare 2-4, no auto, no duplikat
3. **Task 3** — Multiplex Streaming Protocol `StreamEvent` + `createMultiplexStream` + `parseStreamEvent`
4. **Task 4** — Server `sendCompareMessage` Paralel (`Promise.allSettled`) + `retryGeneration` + `stopGeneration` per-model
5. **Task 5** — CompareSelector Multi Pilih 2-4 (Auto disabled, total kredit kumulatif)
6. **Task 6** — CompareGrid 2-4 kolom + ModelColumn (header, scroll, footer metrics, error panel)
7. **Task 7** — CompareToggles (Standard|Compare) + MobileCompareTabs (swipeable) + Composer integration
8. **Task 8** — Retry/Cancel per-model + Persistence Reload + **Verification Gate + Git Push**

Setiap Task wajib mengikuti pola TDD di plan: `Files` → `Interfaces` → tulis failing check → jalankan (harus FAIL) → implementasi minimal sesuai spec → jalankan (harus PASS) → **atomic commit**.

## Batasan Keras (WAJIB)

- **Stack LOCKED**: Bun + TanStack Start + React + Tailwind v4 + Drizzle + postgres.js + pgvector + Better Auth + AI SDK 7. JANGAN substitusi (no Next.js, no Node/npm, no Prisma, no Supabase, no Clerk, no MongoDB, no fetch direct ke 9Router).
- **No hardcode model list**: `CompareSelector` WAJIB ambil dari `getModels()` registry — DILARANG array inline `["gemini","gpt"]`.
- **No fake streaming**: Wajib `Promise.allSettled` paralel `streamText` real ke 9Router. Mock hanya di test via `vi.mock("ai")`/`msw`. Dilarang simulasi progres palsu.
- **Credits Komparatif**: Deduksi ATOMIC `total` = sum(cost) SEMUA model dulu (`UPDATE ... WHERE credits >= total`), **SEBELUM** panggil 9Router. Refund `+cost` HANYA untuk model `failed` (bukan `cancelled`). Tidak da deduct untuk model yang gagal.
- **Credits Validation**: modelIds WAJIB 2-4, TIDAK boleh include `auto`, TIDAK boleh duplikat (di-refine `compareSchema`). Gagal validasi → 400 `ERR-003`.
- **Auth & Ownership**: `getAuthSession(request)` wajib di setiap `createServerFn`. User akses conversation orang lain → throw `403 Forbidden`.
- **Streaming Protocol**: Setiap StreamEvent wajib dilabeli `generationId + modelId` (tagged), agar client bisa mem-demux ke kolom yang benar. Satu SSE tunggal `text/event-stream` untuk semua model.
- **Responsive**: Desktop/tablet pakai grid side-by-side; mobile (max-768px) TIDAK boleh pakai kolom — wajib gunakan MobileCompareTabs yang bisa di-swipe.
- **Anti-AI-Slop**: cream `#f5f1e4` L0, no heavy drop shadow, no neon/glow, no emoji di UI (Lucide only), no dark mode, font profesional. Unified Shell `sidebar 280px` paten.
- **Commit per Task (Atomic)**: wajib commit di akhir setiap Task.
- **Push di Akhir**: setelah gate verifikasi lolos, wajib push.

## Verifikasi Fase 05 (Task 8 Gate — wajib lolos sebelum selesai & push)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim):
- TypeCheck: `bunx tsc --noEmit` → 0 error
- Lint/Format: `bunx biome check ./src` → pass
- Unit: `bunx vitest run tests/unit/multiplex.test.ts tests/unit/validation-compare.test.ts tests/unit/credits-compare.test.ts -v` → ALL pass
- Integration: `bunx vitest run tests/integration/compare.test.ts -v` → ALL pass (deduct total 19, partial failure refund, 402 insufficient, retry, cancel)
- E2E: `bunx playwright test tests/e2e/compare.spec.ts --project=chromium` → ALL pass (selector, grid 2/4, toggle, mobile tabs, stream both cols, partial retry, insufficient 402, persistence reload, cancel per-model)
- Persist & Reload: Refresh halaman `/chat/$id` kedua kolom tetap utuh (tidak hilang).
- Client leak: `grep -r "NINE_ROUTER_API_KEY" .vinxi/build/client 2>/dev/null | wc -l` → 0
- **No type bypass (WAJIB):** `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts'` → **0 matches**. Semua `messages` ke `streamText` bertipe `CoreMessage[]`, insert Drizzle bertipe terhadap `schema.ts`, tanpa `as never`/`as unknown as X`.
- **Git Push**: `git push origin <branch>` berhasil tanpa error.

Laporan akhir: daftar file dibuat/modif, daftar commit per task, status tiap Task, hasil semua command verifikasi, dan konfirmasi `git push`. Jika ada blocker/decisi ambigu (terutama API `ai` v7 multiplex/paralel yang berubah-ubah) → stop dan tanya user / rujuk docs aktual, jangan asumsi.