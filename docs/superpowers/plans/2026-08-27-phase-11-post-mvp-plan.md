# Fase 11 — Post-MVP — Implementation Plan (Index)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index plan untuk 7 Post-MVP fitur (Consensus, Blind, Leaderboard, Personal, Debate, Deep Research, BYOK) — tiap fitur akan punya spec+plan terpisah via `brainstorming`+`writing-plans` per fitur setelah Fase 10.

**Architecture:** Tetap monolith `Bun` `TanStack Start` `PostgreSQL + pgvector` `Better Auth` `R2` `Tavily` `Langfuse` — Fase 11 tidak mengubah lock, tiap sub-fitur reuse `conversations`/`messages`/`generation_runs`/`comparison_runs`/`document_chunks`/`web_sources`/`feedback` + `Model Registry`. BYOK tambah `user_api_keys` vault `apiKeyEncrypted` AES `BETTER_AUTH_SECRET`, Consensus `consensus_runs` `CONSENSUS_MODEL`, Deep Research `research_runs` `steps jsonb` `EXA_API_KEY` optional.

**Tech Stack:** Sama Fase 10 + `langfuse` + `tavily` + `exa` (future optional) — tidak tambah stack baru tanpa ADR

**Spec:** `docs/superpowers/specs/2026-08-27-phase-11-post-mvp-spec.md`

## Global Constraints

- Stack LOCKED tetap monolith `TanStack Start + Bun` `React + Tailwind + shadcn/ui` `Drizzle` `pgvector` `Better Auth` `R2` `Tavily` `Langfuse` — tidak `Next.js`/`Supabase`/`Prisma`/`Redis`/`Qdrant`/`microservices` tanpa ADR
- Per-fitur spec+plan terpisah — jangan batch 7 fitur dalam 1 PR, 1 fitur = 1 PR = 1 cycle `brainstorming` → `writing-plans` → `subagent-driven-development`
- `createServerFn` + `getAuthSession` throw 401 `ERR-002` + ownership `where userId=session.user.id` `where conversationId` scoped `feedback` `userId+generationRunId` 403 else, `ON DELETE CASCADE` untuk `user_api_keys`/`consensus_runs`
- No shadow-xl, no emoji Lucide only `EyeOff`, `Trophy`, `User`, `MessageSquare`, `Search`, `Key`, `Lock`
- Design cream `#f5f1e4` L0 White `#ffffff` L1 radius 50px nav/cards/dialog + 10px small Inter 400/500, Unified Shell `sidebar 280px` paten
- No fake AI — consensus synthesis dari N `generation_runs.content` real via `streamText` `CONSENSUS_MODEL`, blind hide `modelId` real via `isBlind`, leaderboard aggregation real `feedback`+`usage_records` `winRate`, BYOK `apiKeyEncrypted` never to client
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, `grep` secret in client 0, `spec` per fitur approve sebelum `plan`

---

## File Structure (Index + Future per Fitur)

```
zona-ai/
├── docs/superpowers/specs/
│   ├── 2026-08-27-phase-11-post-mvp-spec.md (index, ini file)
│   ├── 2026-08-27-phase-11-consensus-spec.md (future per fitur)
│   ├── 2026-08-27-phase-11-blind-spec.md
│   ├── 2026-08-27-phase-11-leaderboard-spec.md
│   ├── 2026-08-27-phase-11-personal-spec.md
│   ├── 2026-08-27-phase-11-debate-spec.md
│   ├── 2026-08-27-phase-11-research-spec.md
│   └── 2026-08-27-phase-11-byok-spec.md
└── docs/superpowers/plans/
    ├── 2026-08-27-phase-11-post-mvp-plan.md (index, ini file)
    ├── 2026-08-27-phase-11-consensus-plan.md
    └── ... (7 future)
```

---

### Task 1: Index Setup — Prioritisasi 1 Fitur Pertama

**Files:**
- Modify: `docs/MILESTONES.md` ensure Milestone 11 list 7 fitur (already)
- Create: `docs/superpowers/plans/README.md` optional index

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-08-27-phase-11-post-mvp-spec.md` priority rank `BYOK > Consensus > Blind > Leaderboard > Personal > Debate > Deep Research`
- Produces: Decision `firstFeature = "byok"` — dipakai Task 2

- [ ] **Step 1: Write the failing check (no README yet)**

```bash
test -f docs/superpowers/plans/README.md || echo "missing README"
```

- [ ] **Step 2: Run to verify it fails**

Run: `test -f docs/superpowers/plans/README.md; echo $?`
Expected: `1`

- [ ] **Step 3: Write minimal implementation**

Tanya user via chat (sudah): `Prioritas BYOK dulu?` — asumsikan `firstFeature = "byok"` per spec rank 1 `BYOK Medium High`.

`docs/superpowers/plans/README.md` (optional):

```md
# Zona.ai Superpowers Plans Index
- Phase 01 Foundation spec+plan done via brainstorming+writing-plans
- Phase 11 Post-MVP index done, next sub-fitur: byok (via brainstorming)
```

- [ ] **Step 4: Run to verify it passes**

Run: `test -f docs/superpowers/plans/README.md; echo $?` → `0`

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/README.md
git commit -m "docs: plans index"
```

---

### Task 2: Template Sub-Spec+Plan Per Fitur (1 per Cycle, Jangan Batch 7)

**Files:**
- Create (future per fitur, 1 cycle example BYOK): `docs/superpowers/specs/2026-08-27-phase-11-byok-spec.md`, `docs/superpowers/plans/2026-08-27-phase-11-byok-plan.md`
- Test: `spec` review `plan` review

**Interfaces:**
- Consumes: `phase-11-post-mvp-spec.md` outline BYOK `user_api_keys`
- Produces: `byok-spec.md` + `byok-plan.md` — template untuk 7 fitur

- [ ] **Step 1: Write the failing check (byok spec not yet)**

```bash
test -f docs/superpowers/specs/2026-08-27-phase-11-byok-spec.md || echo "missing byok spec"
```

- [ ] **Step 2: Run to verify it fails**

Run: `test -f docs/superpowers/specs/2026-08-27-phase-11-byok-spec.md; echo $?` → `1`

- [ ] **Step 3: Write minimal implementation (template, 1 per cycle)**

Jika `firstFeature = byok`, buat 2 file via `superpowers:brainstorming` → `byok-spec.md` (tulis `user_api_keys` `providerId` `apiKeyEncrypted` AES `BETTER_AUTH_SECRET` `server-only` `getUserApiKey` never to client, `validate` `apiKey min10` Zod, `/settings` BYOK masked `••••` `Save` `Delete`, `sendMessage` fallback user key vs `NINE_ROUTER_API_KEY`), lalu `superpowers:writing-plans` → `byok-plan.md` (Task G1 DB vault + G2 encrypt + G3 server fns + G4 UI settings + G5 chat fallback + G6 E2E `byok.spec.ts`).

Jangan buat 7 `byok+consensus+blind` sekaligus — 1 fitur per PR per cycle.

- [ ] **Step 4: Run to verify it passes**

Run: `test -f docs/superpowers/specs/2026-08-27-phase-11-byok-spec.md; echo $?` → `0` (after `brainstorming` done)

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-27-phase-11-byok-spec.md docs/superpowers/plans/2026-08-27-phase-11-byok-plan.md
git commit -m "feat(byok): spec+plan via brainstorming+writing-plans"
```

---

### Task 3: Proses Eksekusi Per Fitur SOP (1 PR per Cycle)

**Files:** — (no new files for index, SOP only)

- [ ] **Step 1: Pilih 1 fitur, buat sub-spec+plan, minta approve**

Jangan 7 fitur sekaligus — 1 fitur = 1 PR = 1 cycle `brainstorming` → review `spec` → `writing-plans` → review `plan` → `subagent-driven-development`.

Prioritas default: `BYOK → Consensus → Blind → Leaderboard → Personal → Debate → Deep Research` (tanya user tiap cycle).

- [ ] **Step 2: Subagent-driven per sub-plan**

Dispatch `task` `subagent_type general` per Task di `byok-plan.md` (G1 Vault, G2 encrypt, G3 server fns, G4 UI, G5 chat fallback, G6 E2E `byok.spec.ts`).

- [ ] **Step 3: Gate per fitur**

`bun x tsc --noEmit` 0, `biome check` pass, `vitest` unit+integration `byok` pass, `playwright` `byok.spec.ts` pass `grep apiKeyEncrypted` in client 0 `shadow-xl` 0.

- [ ] **Step 4: Ulangi untuk fitur berikutnya sesuai prioritas**

After `byok` done → `consensus` → `blind` → `leaderboard` → `personal` → `debate` → `research`.

---

### Task 4: Final Index Gate (Assume Approved Fast)

**Files:** — (index only, no code)

- [ ] **Step 1: Verifikasi index tidak ada code & 2 files exist**

Run: `test -f docs/superpowers/specs/2026-08-27-phase-11-post-mvp-spec.md && test -f docs/superpowers/plans/2026-08-27-phase-11-post-mvp-plan.md && echo "index ok"` → `index ok`
Run: `ls docs/superpowers/specs/2026-08-27-phase-11-*.md | wc -l` → `1` (only index, 7 future belum, expected)
Run: `ls docs/superpowers/plans/2026-08-27-phase-11-*.md | wc -l` → `1`

- [ ] **Step 2: Konfirmasi prioritas pertama dengan user (assume BYOK)**

Kamu sudah `assume approve` → next sub-fitur `byok` via `brainstorming` directly, tidak tunggu per-section approve lagi, tapi tetap `spec` → review → `plan` → review per fitur.

---

## Self-Review

- **Spec coverage:** Index `7 fitur` outline → Task 1 prioritisasi `BYOK` rank 1, Task 2 template `byok-spec`+`byok-plan` `brainstorming`+`writing-plans`, Task 3 SOP 1 PR per cycle `subagent-driven-development`, Task 4 gate `2 files` exist. `PRD §8` Post-MVP + `MILESTONES` 11 prioritas semua ada Task.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya spec Open/TBD allowed `CONSENSUS_MODEL` etc., plan semua actual `byok-spec.md` `user_api_keys` `apiKeyEncrypted` `getUserApiKey`).
- **Type consistency:** `byok-spec.md` `providerId` `apiKeyEncrypted` Task 2, `byok-plan.md` `Task G1 Vault` Task 2, `phase-11-post-mvp-spec.md` `prioritas BYOK` Task 1 consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-11-post-mvp-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

