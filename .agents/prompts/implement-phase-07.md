# PROMPT — Implementasi Fase 07 RAG — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 07 (RAG — Retrieval Augmented Generation)** dari aplikasi **Zona.ai** — multi-model AI chat workspace.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati, JANGAN SKIP BACAAN)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/zona-ai-no-type-bypass.md` — **LARANGAN** `as any`/`as never`/`as unknown as`/`@ts-ignore` untuk membungkam `tsc`; wajib model type yang benar
5. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket (termasuk disiplin skala font: jangan font raksasa, jangan kekecilan)
6. `.agents/rules/zona-ai-skills-mcp.md` — **satu-satunya sumber kebenaran** skill / MCP / plugin. Kombinasi khusus fase ini di rules Section 6 "Fase 07 RAG". Patuhi tabel "Kapan Wajib" + "Larangan".
7. `docs/superpowers/specs/2026-08-27-phase-07-rag-spec.md` — spec Fase 07 (Tujuan, Scope, Design Tokens, Env, Testing, DoD, Larangan Khusus)
8. `docs/superpowers/plans/2026-08-27-phase-07-rag-plan.md` — PLAN PELAKSANAAN Fase 07 (8 Task, ikuti step-by-step). Global Constraints & "Batasan Keras" fase ini ada di plan — ikuti langsung, jangan modifikasi.

### ⛔ Bagian WAJIB-PATUH (tidak bisa dilewati)

Kode yang kamu tulis **WAJIB menaati isi file-file di atas** — bukan sekadar membaca lalu melapor. Setiap aturan yang kamu temui di file tersebut **harus terlihat dalam implementasi**, dan pada Gate Verifikasi (Task 8) akan diperiksa dengan command konkret. Aturan yang wajib diaplikasikan, misalnya (dari file di atas — kalau ada ketentuan lebih detail, itu yang berlaku):

- **zona-ai-no-hardcode**: `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_TOP_K`, `EMBEDDING_DIMENSION`, `EMBEDDING_MODEL`, `EMBEDDING_BASE_URL` diambil dari `constants.ts` (`Number(process.env.* ?? default)`) — dilarang angka literal berserakan di `rag/*`.
- **zona-ai-context + spec**: embedding, `document_chunks`, R2 `getObject`, db = server-only — tidak ada import `src/lib/rag/*` atau `src/lib/r2/*` di komponen client.
- **anti-ai-slop**: UI status attachment memakai `.agents/rules/anti-ai-slop.md` token (cream/white, radius, Lucide, font profesional) — tidak ada `shadow-xl`/neon/emoji.
- **zona-ai-skills-mcp**: skill/MCP dipakai sesuai kombinasi Fase 07 di rules Section 6, bukan skill fase lain.
- **spec/plan**: TDD per task (failing → pass), commit per task, tombol/teks yang muncul sesuai plan.

Jangan ada langkah implementation yang sengaja menghindari aturan ini. Kalau dua file bertentangan, **spec/plan fase menang** untuk detail teknis fase; rules menang untuk hal global (no-hardcode, anti-slop, server-only, skill gate).

**⚠️ HEMAT TOKEN:** JANGAN baca seluruh `docs/` yang lain — cukup 7 file di atas. Jika butuh referensi spesifik saat implementasi, baca hanya section relevan (misal `docs/ARCHITECTURE.md` untuk embedding/vector, `docs/DATABASE.md` untuk `document_chunks`, `docs/ENVIRONMENT.md` untuk `EMBEDDING_*`).

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — tidak perlu dibaca ulang seluruhnya, tapi kutip bagian yang kamu pakai kalau ada.

## Prasyarat (Fase 01-06 SUDAH selesai)

- `src/lib/db` lengkap + `src/server/functions/` (`chat.ts` `sendMessage` + `sendCompareMessage` SSE tagged dengan multiplex, `files.ts` `uploadFile/getAttachment/deleteAttachment`, `getMessages` dll).
- `src/lib/r2/client.ts` (getObject) SUDAH ada dari Fase 06 — dipakai ulang, jangan duplikat.
- `attachments` table + `processingStatus` (`pending`) SUDAH ada dari Fase 06.
- `src/lib/env.server.ts` validator SUDAH ada — tambahkan `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION` ke `constants.ts` (bukan env wajib baru) sesuai plan Task 1; kalau di spec env wajib dizod, ikuti spec/plan.
- 9Router live (bisa dipakai untuk `/embeddings`). PostgreSQL + pgvector (`CREATE EXTENSION vector`) aktif.
- Belum ada: `unpdf`, `mammoth` (install di Task 2), `src/lib/rag/`, tabel `document_chunks`.
- Skill yang SUDAH terinstall tapi TIDAK dipakai fase ini: `langfuse` (Fase 09), `tavily-*` (Fase 08), `better-auth-*` (Fase 02/10). JANGAN dipakai — kombinasi fase ini sudah di rules.

## Tugas

Implementasikan **8 Task di `docs/superpowers/plans/2026-08-27-phase-07-rag-plan.md` secara berurutan**, persis sesuai langkah di plan — tiap Task TDD: `Files` → `Interfaces` → tulis failing test → jalankan (harus FAIL) → implementasi minimal → jalankan (harus PASS) → **atomic commit**:

1. **Task 1** — `document_chunks` table + `embedding vector(1536)` + HNSW index `vector_cosine_ops` + RAG/EMBEDDING constants
2. **Task 2** — `src/lib/rag/extract.ts` `extractText` (unpdf/mammoth/utf8)
3. **Task 3** — `src/lib/rag/chunk.ts` `chunkText` fixed 1000/200 sentence-aware
4. **Task 4** — `src/lib/rag/embed.ts` `embedTexts`/`embedQuery` via `POST {EMBEDDING_BASE_URL}/embeddings`
5. **Task 5** — `src/lib/rag/process.ts` `processDocument` pipeline `pending→processing→completed/failed` + trigger dari `uploadFile`
6. **Task 6** — `src/lib/rag/retrieve.ts` `retrieveContext` (scoped `WHERE conversationId`, `<=>` cosine, topK) + injeksi `Context from documents` di `chat.ts` (sendMessage + sendCompareMessage, konteks sama ke semua model)
7. **Task 7** — UI status `Indexing...`/`Indexed`/`Could not process` di `AttachmentPreview`
8. **Task 8** — **Verification Gate Fase 07**

## Disiplin Git: ATOMIC COMMIT & PUSH (WAJIB)

1. **Atomic Commit per Task:**
   - Dilarang menumpuk semua perubahan dalam satu commit raksasa di akhir.
   - Setiap 1 Task selesai (test pass + verifikasi lolos), commit mandiri dengan pesan konvensional:
     - Task 1: `feat(db): document_chunks HNSW + RAG constants`
     - Task 2: `feat(rag): extractor PDF/DOCX/TXT`
     - Task 3: `feat(rag): chunker 1000/200`
     - Task 4: `feat(rag): embedder via 9Router`
     - Task 5: `feat(rag): processDocument pipeline`
     - Task 6: `feat(rag): retriever + injection`
     - Task 7: `feat(ui): attachment status`
     - Task 8: `chore(verify): fase 07 gate`
2. **Git Push setelah Selesai:**
   - Setelah Gate Verifikasi (Task 8) lulus 100% tanpa error, jalankan:
     ```bash
     git status
     git diff
     git push origin <branch-name>
     ```
   - Pastikan working tree bersih (`clean`) dan semua commit ter-push ke remote.

## Verifikasi Fase 07 (Task 8 Gate — wajib lolos sebelum selesai & push)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim). Perintah persis di plan Task 8:
- TypeCheck: `bun x tsc --noEmit` → 0 error
- Lint/Format: `bun x biome check ./src` → pass
- Unit: `bun x vitest run tests/unit/extract.test.ts tests/unit/chunk.test.ts tests/unit/embed.test.ts tests/unit/retrieve.test.ts -v` → ALL pass
- Integration: `bun x vitest run tests/integration/rag.test.ts -v` → PASS (pipeline, HNSW index, scoped retrieve, injection)
- E2E: `bun x playwright test tests/e2e/rag.spec.ts --project=chromium` → PASS
- Manual DB: `bun x drizzle-kit migrate` sukses; `psql \d document_chunks` → `embedding vector` + index `hnsw vector_cosine_ops`
- Client leak: `grep -r "EMBEDDING_BASE_URL\|EMBEDDING_API_KEY\|NINE_ROUTER_API_KEY" .vinxi/build/client 2>/dev/null | wc -l` → 0
- **No type bypass (WAJIB):** `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts'` → **0 matches**. Semua `messages` ke `streamText` bertipe `CoreMessage[]`, insert Drizzle bertipe terhadap `schema.ts` (`$inferInsert`/`$type`), tanpa `as never`/`as unknown as X`.
- No cross-leak: verifikasi query retrieve SELALU punya `WHERE conversation_id` (bukan `SELECT ... LIMIT 5` global) — tunjukkan kodenya.
- **Git Push**: `git push origin <branch>` berhasil tanpa error.

### Cek Kepatuhan Aturan (lakukan di akhir, CEKLIS untuk tiap aturan)

Pastikan aturan dari file-wajib BENAR-BENAR teraplikasi di kode, bukan cuma dibaca. Ceklis ini wajib diisi (✓/✗) bersama bukti (file:kode):
- [ ] `constants.ts` memuat `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_TOP_K`, `EMBEDDING_DIMENSION`, `EMBEDDING_MODEL`, `EMBEDDING_BASE_URL` + dipakai (bukan hardcode) di `rag/*` — cek `grep -rn "1000\|200\|1536\|topK\|top_k" src/lib/rag` tidak ada literal yang tak lewat constants
- [ ] `getObject` R2 dipakai dari `src/lib/r2/client.ts` (Fase 06), tidak duplikat client baru
- [ ] Tidak ada import `src/lib/rag/*` / `src/lib/r2/*` di `src/components/*` (server-only)
- [ ] Query `retrieveContext` berscope `WHERE conversation_id` (aman cross-conversation leak)
- [ ] Embedding tidak pernah dipanggil di client/bundle
- [ ] `processDocument` memakai status `pending→processing→completed/failed`, chunk dihapus saat `failed`
- [ ] Anti-slop: tidak ada `shadow-xl`/`shadow-2xl`, tidak ada emoji, Lucide only, token cream/white dipakai — `rg "shadow-xl|shadow-2xl" src/components/chat` → 0
- [ ] Skill/MCP sesuai kombinasi Fase 07 (tiada `document-pdf` dipakai di fase lain, tidak ada tavily/langfuse)

Saat melaporkan, kalau ada aturan yang TIDAK bisa dipatuhi/bertentangan → tunjukkan konfliknya dan tanya user, jangan diamkan.

Laporan akhir: daftar file dibuat/modif, daftar commit per task, status tiap Task, hasil semua command verifikasi, ceklis kepatuhan di atas, dan konfirmasi `git push`. Jika ada blocker/keputusan ambigu (terutama `unpdf`/`mammoth` API, `vector` drizzle syntax, HNSW dimension) → stop dan tanya user / rujuk docs aktual via `context7`, jangan asumsi.
