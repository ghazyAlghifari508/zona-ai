# P1 model catalog — impact inventory

Snapshot: `main` at `b59758f`, 26 legacy entries (25 physical + virtual `auto`) in
`src/lib/models/registry.ts`.

## Runtime producers

| Surface | Current source | P1 change |
| --- | --- | --- |
| `src/lib/models/registry.ts` | static array + `getAvailableModels`, `getModelById` (suffix match), `getModelCatalog`, `isVisionCapable` | legacy snapshot only; one-time migration input and synthetic test fixtures |
| `src/lib/models/filter.ts` | hardcoded `MODEL_SEARCH_ALIASES` | aliases move to `model_catalog.search_aliases`; filter reads DTO |
| `src/lib/models/router.ts` | hardcoded candidate IDs + static fallback | pure catalog-driven policy; no static ID fallback |
| `src/lib/models/preference.ts` | suffix match on stored model ID | exact alias-aware reconciliation against DTO |
| `src/lib/chat/title.ts` | `modelRegistry.find(id==='auto').routingRules.lightweight` | repository: lightweight eligible model, else no model call |
| `src/lib/chat/conversation-model.ts` | returns historical ID unchanged | unchanged; label lookup must tolerate retired ID |
| `src/server/core/models.ts`, `src/server/functions/models.ts` | static catalog + `model_settings` merge | server-only repository DTO, zod-validated |
| `src/server/core/admin-models.ts` | `isModelAvailable` defaults to true, suffix override match | fail-closed exact lookup; status from `model_settings` |
| `src/server/core/chat.ts` | `getModelById` sync, compare guard, retry, cancel refund via current catalog | async eligible lookup before credit debit; ledger snapshot refund |
| `src/server/core/artifacts.ts`, `artifact-generation.ts` | same static pattern | same fail-closed contract |
| `src/server/core/compare.ts` | admin override only | rejects `auto`, retired, inactive, unknown |
| `src/components/chat/useModelCatalog.ts` | module-level permanent promise, suffix merge/find | keyed Query contract, exact DTO identity, invalidation on success/failure |
| `src/components/chat/ModelSelector.tsx`, `ModelColumn.tsx`, `Sidebar.tsx` | static registry + suffix find | DTO lookup only; historical label map for retired IDs |
| `src/routes/admin/models.tsx` | direct static registry import | loader uses server catalog DTO including retired |
| `src/server/core/admin-dashboard.ts` | counts `is_active=false` | counts `status='inactive'`; retired not an outage |

## Data migration

1. New `model_catalog` (canonical `id`, unique `router_model_id`, metadata,
   evaluation/vision status, routing profile, provenance) and `model_aliases`
   (explicit identity map).
2. Extend `model_settings` with authoritative `status`, `retired_at`,
   `last_checked_at`; backfill from existing `is_active` without touching
   `disabled_reason`/`updated_by`. `is_active` is kept only as a mirrored
   legacy read column.
3. Idempotent seed of 25 physical models + Auto from the legacy snapshot with
   `evaluation_status='legacy'`. Aliases proven from registry:
   `gpt-5.6-sol -> cx/gpt-5.6-sol`, `qwen3.8-flash -> bai/qwen3.8-flash`.
4. Migration must be rerunnable; `ON CONFLICT DO NOTHING` never overwrites
   admin state. Verification on an isolated DB: row counts, alias identity,
   disabled-state preservation, same-basename distinct routes.

## Fail-closed contract

New inference resolves an eligible row by exact canonical ID, unique route or
explicit alias. Unknown, retired, inactive, pending evaluation or catalog
unavailable rejects before credit debit and provider call. Auto resolves only
against eligible catalog candidates; no static fallback. Cost comes from the
selected catalog row at request time; cancellation refund comes from the
credit ledger snapshot for that run.
