# PROMPT — Implementasi Fase 10 Hardening — Zona.ai

Kamu adalah senior full-stack engineer yang akan mengimplementasikan **Fase 10 (Hardening & Production Readiness)** dari aplikasi **Zona.ai** — multi-model AI chat workspace. Fase ini menutup **18 poin Definition of Done (DoD)** global sebagai gate production.

## Urutan Membaca (WAJIB, ikuti urutan ini — JANGAN lewati)

1. `.agents/rules/zona-ai-context.md` — konteks produk + keputusan arsitektur + deployment
2. `.agents/rules/zona-ai-no-assumptions.md` — larangan asumsi, verifikasi faktual
3. `.agents/rules/zona-ai-no-hardcode.md` — larangan hardcode (Model Registry, env, constants)
4. `.agents/rules/zona-ai-no-type-bypass.md` — **LARANGAN** `as any`/`as never`/`as unknown as`/`@ts-ignore` untuk membungkam `tsc`; wajib model type yang benar
5. `.agents/rules/anti-ai-slop.md` — design constraints MindMarket (termasuk disiplin skala font: jangan font raksasa, jangan kekecilan)
6. `.agents/rules/zona-ai-skills-mcp.md` — **satu-satunya sumber kebenaran** skill / MCP / plugin. Kombinasi khusus fase ini di rules Section 6 "Fase 10 Hardening". Patuhi tabel "Kapan Wajib" + "Larangan".
7. `docs/superpowers/specs/2026-08-27-phase-10-hardening-spec.md` — spec Fase 10 (Tujuan, Scope, Design Tokens, Env, Testing, DoD, Larangan Khusus)
8. `docs/superpowers/plans/2026-08-27-phase-10-hardening-plan.md` — PLAN PELAKSANAAN Fase 10 (8 Task, ikuti step-by-step). Global Constraints & "Batasan Keras" fase ini ada di plan — ikuti langsung, jangan modifikasi.

### ⛔ Bagian WAJIB-PATUH (tidak bisa dilewati)

Kode yang kamu tulis **WAJIB menaati isi file-file di atas** — diukur dari hasil kode, bukan dari laporan baca. Setiap aturan harus terlihat di implementasi dan diperiksa di Gate Verifikasi (Task 8):
- **Error Taxonomy lengkap**: 19 kode error (`ERR-001` s/d `ERR-019`) terdefinisi di `errors.ts` dan ditangani sesuai konteks (inline, toast, per-model panel, atau full-page 500).
- **Rate Limiting**: in-memory per-user/IP (`RATE_LIMIT_CHAT_PER_MINUTE ?? 20`), response HTTP 429 `ERR-017` dengan header `Retry-After`.
- **Security & Ownership**: semua server functions wajib `await getAuthSession(request)` dan verifikasi `conversations.userId === session.user.id` (throw 403 `ERR-002`/`ERR-009`). XSS dilindungi via `rehype-sanitize` di `MessageList`. `dangerouslySetInnerHTML` = 0.
- **Accessibility AA**: lolos audit `@axe-core/playwright` (0 violation), `role="log"` `aria-live="polite"`, `aria-label` pada semua icon button, visible focus ring `#2c2e2a`, dan support `prefers-reduced-motion`.
- **Responsive 3 Viewports**: Desktop (>1024px, sidebar 280px terlihat), Tablet (768–1024px, hamburger menu), Mobile (<768px, swipeable tabs & Composer fixed bottom safe-area).
- **Anti Type-Bypass (WAJIB)**: `as never`, `as any`, `as unknown as`, `@ts-ignore` = 0 di seluruh `src/`.
- **Anti-AI-Slop**: `bg-cream-paper` (`#f5f1e4`), `bg-pure-white` (`#ffffff`), `border-hairline-mist` (`#d5d5d4`), no `shadow-xl`, no neon, no emoji di chrome/buttons.

**⚠️ HEMAT TOKEN:** JANGAN baca seluruh `docs/` — cukup 8 file di atas. Jika butuh referensi spesifik, baca hanya section relevan.

> `AGENTS.md` (root) sudah dimuat sebagai context sistem — jangan baca ulang seluruhnya.

## Prasyarat (Fase 01-09 SUDAH selesai)

- Seluruh fitur inti aktif: Auth Google, Single Chat streaming SSE, Model Registry adaptive, Persistence DB, Compare Mode (2-4 model parallel), File Upload R2, RAG HNSW Cosine, Web Search Tavily, dan Observability Langfuse.
- `.env` lengkap dan tervalidasi di `env.server.ts`.
- Database PostgreSQL berjalan normal beserta seluruh tabel migrasi 0001–0008.

## Tugas (8 Task sesuai plan)

Implementasikan **8 Task di `docs/superpowers/plans/2026-08-27-phase-10-hardening-plan.md` secara berurutan**, persis sesuai langkah di plan — tiap Task TDD: `Files` → `Interfaces` → tulis failing test → jalankan (harus FAIL) → implementasi minimal → jalankan (harus PASS) → **atomic commit**:

1. **Task 1** — Error Taxonomy `ZonaError` 19 Codes (`ERR-001..019`) di `src/lib/utils/errors.ts` + `src/components/chat/InlineError.tsx` (White 10px, `TriangleAlert` + Retry) + full-page `src/routes/error.tsx` (500 fallback).
2. **Task 2** — Rate Limiting In-Memory `src/lib/security/rate-limit.ts` (`Map` store) + pasang di server functions (`sendMessage`, `sendCompareMessage`, `uploadFile`, `searchWeb`) menghasilkan 429 `ERR-017` `Retry-After`.
3. **Task 3** — Security Audit: pastikan kepatuhan ownership `userId` di semua server functions + sanitasi XSS markdown via `rehype-sanitize` di `MessageList.tsx` + verifikasi zero client secret leak.
4. **Task 4** — Performance Audit: pastikan internal TTFT < 150ms pada mock environment + efisiensi rendering list virtual.
5. **Task 5** — Accessibility (WCAG 2.1 AA): `MessageList` `role="log"` `aria-live="polite"`, `aria-label` pada semua tombol icon, focus-visible outline di `app.css`, dan `prefers-reduced-motion`.
6. **Task 6** — Responsive 3 Viewports: `WorkspaceShell.tsx` responsive sidebar (hidden on <1024px + hamburger toggle `Menu`), `Composer.tsx` sticky mobile safe-area.
7. **Task 7** — E2E Suite 12 Critical Paths (`tests/e2e/critical.spec.ts` & full test runner).
8. **Task 8** — Documentation Review + Final Production Gate (sinkronkan `docs/API.md`, `docs/DATABASE.md`, `docs/ENVIRONMENT.md`, `README.md`, dan checklist `docs/MILESTONES.md`).

## Disiplin Git: ATOMIC COMMIT & PUSH (WAJIB)

1. **Atomic Commit per Task:**
   - Dilarang menumpuk perubahan dalam satu commit raksasa di akhir.
   - Commit mandiri untuk:
     - Task 1: `feat(errors): ERR-001..019 map + InlineError`
     - Task 2: `feat(security): in-memory rate limiting per-user`
     - Task 3: `fix(security): audit ownership + XSS + server-only`
     - Task 4: `test(perf): TTFT <150ms + virtual 500`
     - Task 5: `fix(a11y): aria-live, labels, focus ring, reduced-motion`
     - Task 6: `fix(responsive): 3 viewports + hamburger + mobile composer`
     - Task 7: `test(e2e): 12 critical paths suite`
     - Task 8: `docs: review + final gate Hardening`
2. **Git Push setelah Selesai:**
   - Setelah Gate Verifikasi (Task 8) lulus 100% tanpa error, jalankan:
     ```bash
     git status
     git diff
     git push origin <branch-name>
     ```
   - Pastikan working tree bersih (`clean`) dan semua commit ter-push ke remote.

## Verifikasi Fase 10 (Task 8 Gate — 18 Poin Definition of Done)

Jalankan dan TUNJUKKAN bukti output (jangan cuma klaim):
- **TypeCheck**: `bun x tsc --noEmit` → 0 error
- **Lint/Format**: `bun x biome check ./src` → pass
- **Unit & Integration**: `bun x vitest run` → ALL pass
- **E2E Suite**: `bun x playwright test --project=chromium` → ALL pass (12 critical paths + a11y 0 violations + responsive 3 viewports)
- **Zero Client Leak**: `grep -r "NINE_ROUTER_API_KEY\|TAVILY_API_KEY\|R2_SECRET\|LANGFUSE_SECRET\|BETTER_AUTH_SECRET" .vinxi/build/client 2>/dev/null | wc -l` → 0
- **Zero XSS Danger**: `grep -r "dangerouslySetInnerHTML" src/components | wc -l` → 0
- **Anti-AI-Slop Clean**: `grep -r "shadow-xl\|shadow-2xl" src/components | wc -l` → 0
- **Database Integrity**: `psql $DATABASE_URL -c "SELECT count(*) FROM conversations; SELECT count(*) FROM generation_runs; SELECT count(*) FROM web_sources; SELECT count(*) FROM feedback;"`
- **No Type-Bypass (WAJIB)**: `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts'` → **0 matches**
- **Git Push**: `git push origin <branch>` berhasil tanpa error.

Laporan akhir: daftar file dibuat/dimodifikasi Task 1-8, daftar commit per task, status tiap Task, hasil semua command verifikasi 18 pts DoD, dan konfirmasi `git push`. Jika ada blocker/keputusan ambigu → stop dan tanya user / rujuk docs aktual via `context7`, jangan berasumsi.
