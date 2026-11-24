# P6 — Audit Activity Redesign: acceptance and handoff

Scope executed: P6 only, following `docs/prompts/p6.md`. No browser QA, Playwright, screenshots, app opening, push, merge, or deployment. Branch `main`; baseline `08b2fea`; final HEAD `9c5682c`.

## Acceptance status

| Prompt item | Status | Evidence |
|---|---|---|
| 1. Shared typed action dictionary, stable internal codes, `user.delete`, unknown label | PASS | `src/lib/admin/audit-activity.ts`; unit tests in `tests/unit/admin-audit-activity.test.ts`; filter options and table/detail/Ringkasan all call the same presenter. Unknown events render `Aktivitas lainnya`; raw code stays in technical info. |
| 2. Typed backwards-compatible metadata, real snapshots, atomic audit writes | PASS | `src/lib/admin/audit-metadata.ts`; producer updates in `admin-models.ts`, `admin-users.ts`, `credits.ts`, `feedback.ts`; `tests/integration/admin-audit-producers.test.ts` and `tests/integration/admin-audit-transactions.test.ts`. Legacy/null metadata does not erase the event. No fabricated before/after values. |
| 3. Server-side search, filter composition, safe pagination, race handling | PASS | `src/server/core/admin-audit.ts`, `src/server/functions/admin-audit.ts`; isolated PostgreSQL proof in `tests/integration/admin-audit-search.test.ts`: 8 tests including wildcard escaping, snapshot/deleted-name search, page clamp, tie-break, unreadable metadata, and admin-only rejection. |
| 4. UI/detail presentation with ready-made primitives | PASS (non-browser) | `src/routes/admin/audit-log.tsx` uses shadcn Table, existing Dialog, Base UI Accordion, P5 NativeSelect, existing UserAvatar; component tests in `tests/unit/admin-audit-log-view.test.tsx`. Visual/light-dark/responsive review deferred to P9 by prompt. |
| Authorization preserved | PASS | `requireAdminSession` remains the first call in `listAuditLogsCore`; isolated DB test proves non-admin search is rejected. |
| PII/secret redaction | PASS | `safeTechnicalMetadata` redacts emails, tokens, headers, notes, prompts, chat/document text; component test proves `adminNotes` never reaches technical JSON or clipboard. |
| Recent activity presentation; metrics unchanged | PASS | `src/routes/admin/index.tsx` uses `presentAuditActivity`; `Lihat semua` still targets `/admin/audit-log`; dashboard metrics in `src/server/core/admin-dashboard.ts` unchanged apart from `metadataUnreadable`. |
| Append-only history, no fake rows, no real-DB mutation | PASS | No migration or seed against the app DB; isolated schema harness only; public user IDs are read-only FK anchors. |
| Type safety bypass scan | PASS | No `as never`, `as any`, `: any`, `@ts-ignore`, `@ts-expect-error`, or `as unknown as` in P6-changed files. Pre-existing generated `routeTree.gen.ts` and unrelated legacy tests still contain such patterns and were not touched. |
| Full `vitest run` with DB isolation env | BLOCKED (environment) | Full suite exit 1: 35 failed / 1157 passed / 28 skipped in 92.55s. Failures are unrelated model-registry availability (`Model tidak ditemukan`) plus cross-file PostgreSQL lock contention on shared public tables. The two isolated audit DB tests pass when run as their own sequential command (11/11, 4.04s). No P6 assertion was weakened or skipped. |
| Browser QA | DEFERRED → P9 | Explicitly excluded from P6. |

## Verification commands

| Command | Result |
|---|---|
| `bun x tsc --noEmit` | exit 0, no diagnostics |
| `bun x biome check ./src` | `Checked 216 files`, no fixes applied |
| `bun x vitest run --maxWorkers=1` on the eight non-DB P6 files (`admin-audit-metadata`, `admin-audit-activity`, `admin-audit-log-view`, `admin-audit-producers`, `admin-users`, `admin-credits`, `feedback`, `admin-dashboard`) | 8 files, 96 tests passed, 159.03s, exit 0 |
| `bun x vitest run tests/integration/admin-audit-search.test.ts tests/integration/admin-audit-transactions.test.ts` with `ZONA_P6_TEST_DATABASE_URL="$DATABASE_URL"` | 2 files, 11 tests passed, 4.04s, exit 0 |
| `bun x vitest run tests/unit/admin-audit-log-view.test.tsx` | 1 file, 8 tests passed, 12.87s, exit 0 |
| `bun run build` | exit 0, 17.72s wall, `✓ built in 4.25s` |
| `rg` bypass scan on P6 files | exit 0, no matches |

All finite commands used explicit timeouts. No dev server or background process was left running.

## Files changed

- Domain: `src/lib/admin/audit-metadata.ts`, `src/lib/admin/audit-activity.ts`
- Server: `src/server/core/admin-audit.ts`, `src/server/core/admin-dashboard.ts`, `src/server/core/admin-models.ts`, `src/server/core/admin-users.ts`, `src/server/core/credits.ts`, `src/server/core/feedback.ts`, `src/server/functions/admin-audit.ts`, `src/lib/ai/credits.ts`
- UI: `src/routes/admin/audit-log.tsx`, `src/routes/admin/index.tsx`, `src/components/admin/AdminSidebar.tsx`, `src/components/ui/table.tsx`
- Tests: `tests/unit/admin-audit-metadata.test.ts`, `tests/unit/admin-audit-activity.test.ts`, `tests/unit/admin-audit-log-view.test.tsx`, `tests/integration/admin-audit-producers.test.ts`, `tests/integration/admin-audit-search.test.ts`, `tests/integration/admin-audit-transactions.test.ts`, plus contract updates in `admin-users.test.ts`, `admin-credits.test.ts`, `feedback.test.ts`, `admin-dashboard.test.ts`
- Docs: `docs/p6-component-discovery.md`, this file

No SQL migration: `audit_logs` stays `jsonb`; schema, indexes, table name, and route `/admin/audit-log` are unchanged.

## Commits

- `c75e7fb` `docs(p6): record activity log component discovery`
- `8468fc1` `feat(admin): add shared activity presentation and audit metadata contracts`
- `6eb0e12` `feat(admin): add shared activity presenter and redacted technical metadata`
- `f496e87` `feat(admin): sanitize audit text and align activity labels`
- `e8ab940` `fix(admin): write atomic audit snapshots for admin mutations`
- `ee645fa` `feat(admin): add server-side activity log search and stable paging`
- `00d9813` `feat(admin): redesign activity log as readable audit trail`
- `b4a1a00` `test(admin): cover activity log view interactions`
- `2e04401` `fix(credits): make dev reset share the audit transaction`
- `9c5682c` `test(admin): keep FK constraints in isolated transaction proof`

## Root cause fixed beyond presentation

`resetDevCreditsCore` opened an outer transaction, then called `resetDevCredits`, which opened a second top-level `db.transaction`. Drizzle's postgres-js driver does not route that second call through the outer transaction, so `SELECT ... FOR UPDATE` on the same row deadlocked. `resetDevCredits` now accepts an optional `DatabaseTransaction` and the core passes its active `tx`; credit rows and the audit row commit or roll back together. The isolated test proved RED (timeout/deadlock) before the fix and GREEN after.

## P7 handoff

- `listAuditLogsFn` data: `{ action, adminId, targetType, targetId, search, page, limit }`; `search` trims and caps at 120 chars, `limit` 1–100, default 20.
- Response: `{ items: AuditLogItem[], pagination: { total, page, limit, totalPages } }`; `AuditLogItem` includes `adminName`, `adminImage`, `metadata`, and `metadataUnreadable`.
- Filter values are stable internal codes from `AUDIT_ACTION_CODES`; the human labels come only from `AUDIT_ACTION_FILTER_OPTIONS` / `getAuditActionLabel`.
- Shared renderer: `presentAuditActivity` in `src/lib/admin/audit-activity.ts`; use it for every surface instead of reading `action` or raw metadata directly.
- Ordering: `createdAt DESC`, `id DESC`; pagination is clamped after count. P7 may replace the local pagination controls with the shared component without changing this contract.
- P9 E2E to run: desktop/mobile, light/dark, long names/IDs, detail open, technical disclosure, copy, search, filter, error/retry, empty, pagination, keyboard focus and Escape.
