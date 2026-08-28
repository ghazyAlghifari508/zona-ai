# Fase 11 — Post-MVP (Future) — Spec

> Status: DRAFT — Future, tidak block MVP. Menunggu review (brainstorming assume approved). DILARANG ngoding sub-fitur sebelum approve sub-spec.
> Referensi: `docs/MILESTONES.md` Milestone 11, `docs/PRD.md` §8 Post-MVP Scope + §9 Non-Goals, `docs/ARCHITECTURE.md` §16 Scalability Path + §15 ADR, `docs/DATABASE.md` Core Entities, `AGENTS.md` Architecture Lock, `.agents/rules/anti-ai-slop.md`

## 1. Tujuan (Brainstorming Architectural — assume approved)

Mendefinisikan backlog Post-MVP sebagai **index** — 7 fitur bernilai tambah yang tidak termasuk gate MVP Fase 01-10. Setiap fitur di Fase 11 dieksekusi **independen** setelah Fase 10 Hardening Done, tidak memblok launch, tidak mengubah architecture lock monolith `Bun` `TanStack Start` `PostgreSQL + pgvector` `Better Auth` `R2` `Tavily`. Index ini hanya outline; tiap fitur nanti buat `specs/phase-11-<feature>-spec.md` + `plans/phase-11-<feature>-plan.md` terpisah dengan `brainstorming` → `writing-plans` per fitur.

## 2. Scope & Dependensi

- **Dependensi:** Fase 10 Done (Hardening 18 DoD, 12 E2E critical paths, security 20 sections, perf TTFT <150ms, a11y AA, responsive 3 viewports, docs review).
- **In Scope Post-MVP (PRD §8 + MILESTONES 11):**
  1. Consensus Answer (Large)
  2. Blind Comparison (Medium)
  3. Model Leaderboard (Medium)
  4. Personal Model Ranking (Medium)
  5. Debate Mode (Large)
  6. Deep Research (Large) — multi-step agentic Tavily + Exa + RAG loop
  7. BYOK Bring Your Own Key (Medium)
- **Non-Goals tetap (PRD §9):** MCP, shared workspaces/team collaboration, public sharing links, voice I/O, image generation, mobile native — tetap non-goal di Fase 11, kecuali Deep Research yang mungkin dianggap agent tapi dibatasi 3 steps.
- **Out of scope Fase 11 index:** Implementasi detail DB/migration/UI per fitur — hanya outline, detail di sub-spec per fitur.

## 3. Prioritas (MILESTONES §11 prioritas by value)

| Rank | Fitur | Effort | Value | Dependensi tambahan |
|---|---|---|---|---|
| 1 | BYOK | Medium | High (unblock enterprise) | `user_api_keys` vault `providerId` `apiKeyEncrypted` `Better Auth` `R2` `Model Registry` per-user override |
| 2 | Consensus Answer | Large | High (synthesize N outputs) | `comparison_runs` + `generation_runs` `type:consensus` `consensus_runs` table |
| 3 | Blind Comparison | Medium | Medium (remove bias) | `comparison_runs.isBlind` bool `ModelColumn` anonym `Model A/B` |
| 4 | Model Leaderboard | Medium | Medium (aggregate stats) | `feedback` + `usage_records` aggregation `winRate` |
| 5 | Personal Model Ranking | Medium | Medium (user-specific) | `feedback` per `userId` + `users.defaultModelId` TBD |
| 6 | Debate Mode | Large | Medium (models critique) | `debate_runs` `round` `generationRunIds[]` loop `streamText` critique |
| 7 | Deep Research | Large | High (agentic) | `research_runs` `steps jsonb` `tavily` + `exa` `EXA_API_KEY` `document_chunks` loop 3x |

## 4. Fitur Outline (tanpa halu — hanya dari PRD + MILESTONES)

### 4.1 Consensus Answer (Large)

- **Goal:** Sintesis N model outputs di Compare menjadi satu jawaban unified.
- **DB:** `consensus_runs` `{id, comparisonRunId FK CASCADE, content, modelId: 'consensus', createdAt}` + `generation_runs` `type:consensus` or `consensus_runs` link.
- **Flow:** User Compare `generation_runs` N completed → click `Consensus` pill 50px Fresh Grass below `CompareGrid` → server `fetch N content` → `streamText` consensusModel `ag/gemini-3.7-flash-high` 4 credits `system: Synthesize these N answers...` → stream `consensus` card White 50px markdown + citations merge.
- **Cost:** `CONSENSUS_MODEL` env TBD `ag/gemini-3.7-flash-high` 4 credits configurable.
- **UI:** Button `Consensus` pill 50px Fresh Grass + card `Consensus Answer` White 50px `p-6` `border hairline-mist` markdown.

### 4.2 Blind Comparison (Medium)

- **Goal:** Hide model names during Compare untuk remove bias.
- **DB:** `comparison_runs.isBlind boolean default false`.
- **Flow:** Toggle `Blind` pill 10px `EyeOff` Lucide before send → `comparison_runs.isBlind=true` → `ModelColumn` header `Model A/B/C` anonim `EyeOff` sampai `Reveal` button fetch real `modelId`.
- **UI:** Toggle `Blind` in `CompareToggles` + `Reveal` button in header `ModelColumn`.

### 4.3 Model Leaderboard (Medium)

- **Goal:** Aggregated stats which models users prefer (global).
- **DB:** No new table, view `leaderboard` query `feedback` + `usage_records`: `SELECT modelId, count(*) as uses, avg(latencyMs) as avgLatency, sum(totalTokens), count(positive)/count(*) as winRate GROUP BY modelId`.
- **UI:** Route `/leaderboard` `PublicShell` table `Model | Uses | Avg latency | Win rate | Feedback` White 10px sortable `winRate` desc.

### 4.4 Personal Model Ranking (Medium)

- **Goal:** User-specific stats/preferences.
- **DB:** Same aggregation filtered `WHERE userId = session.user.id` + `users.defaultModelId` column if not exists.
- **UI:** `/settings` tab `My Ranking` list `Model | My uses | My feedback` + `Set default model` `UPDATE users.defaultModelId`.

### 4.5 Debate Mode (Large)

- **Goal:** Models saling kritik / interact.
- **Flow:** After Compare N completed → `Debate` button → server loop `for r in 1..rounds` `for each model` `streamText` `system: Critique other models' answers...` + context `other generations content` → new `generation_runs` type `debate` → threaded `DebateGrid`.
- **DB:** `debate_runs` `{id, comparisonRunId FK CASCADE, round integer, generationRunIds uuid[]}`.

### 4.6 Deep Research (Large) — Multi-step Agentic

- **Goal:** Autonomous research workflow Tavily + Exa + RAG loop 3x.
- **Flow:** User prompt → agent loop `search Tavily → retrieve → synthesize → search Exa → chunk → loop 3x` → final `streamText` with `web_sources` aggregated `research_runs.steps jsonb`.
- **DB:** `research_runs` `{id, conversationId FK CASCADE, query text, status text, steps jsonb, createdAt}` + `web_sources` reuse.
- **UI:** Timeline `Research steps` collapsible + final answer card.
- **Deps:** `EXA_API_KEY` optional `ENVIRONMENT.md` `EXA_API_KEY` `EXA_API_KEY` not MVP, only when `research` enabled.

### 4.7 BYOK Bring Your Own Key (Medium)

- **Goal:** User pakai `apiKey` provider sendiri (OpenAI, Anthropic, Google).
- **DB:** `user_api_keys` `{id uuid PK, userId FK CASCADE, providerId text, apiKeyEncrypted text, createdAt}` `apiKeyEncrypted` AES with `BETTER_AUTH_SECRET`.
- **Flow:** `/settings` BYOK section input `apiKey` per provider `OpenAI` `Anthropic` `Google` masked `••••` + `Save` `encrypt(apiKey)` → `INSERT` + `getUserApiKey({userId, providerId})` server-only `decrypt` never to client + `deleteUserApiKey`, `sendMessage` with `modelId providerId` → `getUserApiKey` if exists use user key else `NINE_ROUTER_API_KEY` fallback, `Model Registry` per-user override `routerModelId` `provider:byok`.
- **Security:** `apiKeyEncrypted` never `SELECT *` to client, `validate` not log `apiKey`, `getUserApiKey` server-only `decrypt`.

## 5. Architecture Constraints (tetap LOCKED)

- Monolith `TanStack Start + Bun`, `PostgreSQL + pgvector` `Better Auth` `Drizzle` `R2` `Tavily`, `Langfuse` — BYOK hanya tambah `user_api_keys` vault, tidak microservices, tidak `Next.js`/`Supabase`/`Prisma`/`Redis`/`Qdrant`.
- RAG `pgvector` tetap `vector_cosine_ops` HNSW, Deep Research reuse `document_chunks` HNSW.
- `createServerFn` untuk semua data, frontend never call `9Router` direct — BYOK tetap via Zona server → 9Router or direct provider.

## 6. Non-Requirements (PRD §9 tetap)

- Tetap **tidak** di Fase 11 Post-MVP index: MCP, shared workspaces, public sharing links, voice I/O, image generation, mobile native — kecuali Deep Research yang mungkin dianggap agent tapi dibatasi 3 steps.

## 7. Open/TBD (jangan invent)

- Pricing post-BYOK: `creditCost` vs `byok` free `BYOK_CREDIT_COST=0` configurable `constants.ts` `Number(process.env.BYOK_CREDIT_COST ?? 0)`.
- Consensus model: `CONSENSUS_MODEL` env TBD `ag/gemini-3.7-flash-high`.
- Leaderboard refresh: realtime `SELECT` vs cron `materialized view` TBD `LEADERBOARD_REFRESH` env.
- Debate rounds: `1-3` TBD `DEBATE_ROUNDS` env.

## 8. File yang Akan Dibuat (saat per-fitur diprioritaskan via brainstorming → writing-plans per fitur)

- Per fitur (saat diprioritaskan 1 per cycle):
  - `docs/superpowers/specs/2026-08-27-phase-11-<feature>-spec.md` — via `superpowers:brainstorming` (architectural, assume approve per fitur)
  - `docs/superpowers/plans/2026-08-27-phase-11-<feature>-plan.md` — via `superpowers:writing-plans` (bite-sized, `Files/Interfaces/Steps`)
- Index ini: `docs/superpowers/specs/2026-08-27-phase-11-post-mvp-spec.md` (ini file) + `docs/superpowers/plans/2026-08-27-phase-11-post-mvp-plan.md` (index plan).

## 9. Next Step

Setelah spec index ini (assume approved) + plan index `phase-11-post-mvp-plan.md` via `writing-plans`, pilih 1 fitur pertama per `prioritas` (Recommended: **BYOK** Medium) → `superpowers:brainstorming` untuk `byok-spec.md` → review → `writing-plans` untuk `byok-plan.md` → review → execute per `superpowers:subagent-driven-development`/`executing-plans`, ulang per fitur 1 cycle. DILARANG ngoding sub-fitur sebelum sub-spec approve.

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD`/`TODO` kecuali Open/TBD section allowed configurable `CONSENSUS_MODEL` `BYOK_CREDIT_COST` etc. explicit `Number(process.env.* ?? default)`, tidak ada `TODO` `implement later`.
- **Internal consistency:** 7 fitur outline `consensus` `blind` `leaderboard` `personal` `debate` `deep research` `BYOK` konsisten `PRD §8` + `MILESTONES` 11, `BYOK` `user_api_keys` `apiKeyEncrypted` konsisten `SECURITY.md` server-only, `RAG` `pgvector` tetap konsisten `ARCHITECTURE` §10.
- **Scope check:** Fase 11 hanya index backlog, tidak melebar ke `MILESTONES` Fase 01-10 Hardening — isolated future, tidak `createServerFn` untuk 7 fitur di index (hanya sub-spec).
- **Ambiguity check:** `BYOK` `apiKeyEncrypted` never to client explicit, `consensus` `CONSENSUS_MODEL` explicit, `blind` `isBlind` explicit.

Spec siap untuk user review sebelum `writing-plans` index plan.

