# P6 — Audit Activity Redesign: acceptance and handoff

Scope executed: P6 only, following `docs/prompts/p6.md`. No browser QA, Playwright, screenshots, app opening, push, merge, or deployment. Branch `main`; baseline `08b2fea`; code commit under final verification `1c49ce33d7`; this handoff is committed separately.

## Acceptance status

| Prompt item | Status | Evidence |
|---|---|---|
| 1. Shared typed action dictionary, stable internal codes, `user.delete`, unknown label | PASS | `src/lib/admin/audit-activity.ts`; unit tests in `tests/unit/admin-audit-activity.test.ts`; filter options and table/detail/Ringkasan all call the same presenter. Unknown events render `Aktivitas lainnya`; raw code stays in technical info. |
| 2. Typed backwards-compatible metadata, real snapshots, atomic audit writes | PASS | `src/lib/admin/audit-metadata.ts`; producer updates in `admin-models.ts`, `admin-users.ts`, `credits.ts`, `feedback.ts`; `tests/integration/admin-audit-producers.test.ts` and `tests/integration/admin-audit-transactions.test.ts` (7 tests) prove preserved snapshots after real isolated delete/retire and rollback when audit metadata fails. New `user.delete` rows omit `deletedEmail`; legacy `deletedEmail` is read and redacted only. Legacy/null metadata does not erase the event. No fabricated before/after values. |
| 3. Server-side search, filter composition, safe pagination, race handling | PASS | `src/server/core/admin-audit.ts`, `src/server/functions/admin-audit.ts`; isolated PostgreSQL proof in `tests/integration/admin-audit-search.test.ts`: 9 tests including current-target lookup/search, wildcard escaping, snapshot/deleted-name search, page clamp, tie-break, unreadable metadata, and admin-only rejection. Component test proves a stale filter response cannot overwrite a newer empty result. |
| 4. UI/detail presentation with ready-made primitives | PASS (non-browser) | `src/routes/admin/audit-log.tsx` uses shadcn Table, existing Dialog, Base UI Accordion, P5 NativeSelect, existing UserAvatar; component tests in `tests/unit/admin-audit-log-view.test.tsx` cover `Lihat detail` accessible name and hidden raw IDs on first sight. Visual/light-dark/responsive review deferred to P9 by prompt. |
| Authorization preserved | PASS | `requireAdminSession` remains the first call in `listAuditLogsCore`; isolated DB test proves non-admin search is rejected. |
| PII/secret redaction | PASS | `safeTechnicalMetadata` redacts emails, tokens, headers, notes, prompts, chat/document text; component test proves `adminNotes` never reaches technical JSON or clipboard. |
| Recent activity presentation; metrics unchanged | PASS | `src/routes/admin/index.tsx` uses `presentAuditActivity` with joined `currentTargetName`; the recent section heading is `Log Aktivitas`; `Lihat semua` still targets `/admin/audit-log`; dashboard metrics in `src/server/core/admin-dashboard.ts` remain unchanged apart from presentation, `metadataUnreadable`, and the joined `currentTargetName`. |
| Append-only history, no fake rows, no real-DB mutation | PASS | No migration or seed against the app DB; isolated schema harness only; public user IDs are read-only FK anchors. |
| Type safety bypass scan | PASS (production) | No `as never`, `as any`, `: any`, `@ts-ignore`, `@ts-expect-error`, or non-null assertion in P6 production files. Pre-existing `as unknown as ReturnType<typeof db.select>` remains only inside drizzle mock chains in `tests/integration/admin-dashboard.test.ts`; it is a test-harness cast, not a production type bypass. Generated route tree and unrelated legacy files were not touched. |
| Full `vitest run` with DB isolation env | BLOCKED (environment) | Earlier full-suite run exited 1: 35 failed / 1157 passed / 28 skipped in 92.55s. Failures were unrelated model-registry availability (`Model tidak ditemukan`) plus cross-file PostgreSQL lock contention on shared public tables. P6-specific failures were fixed and all affected P6 gates now pass, but the full suite was not rerun after the final code commit; no claim of full-suite pass is made. No P6 assertion was weakened or skipped. |
| Browser QA | DEFERRED → P9 | Explicitly excluded from P6. |

## Verification commands

| Command | Result |
|---|---|
| `bun x tsc --noEmit` | exit 0, no diagnostics |
| `bun x biome check ./src` | exit 0, no fixes applied |
| `bun x vitest run --maxWorkers=1` on the eight non-DB P6 files (`admin-audit-metadata`, `admin-audit-activity`, `admin-audit-log-view`, `admin-audit-producers`, `admin-users`, `admin-credits`, `feedback`, `admin-dashboard`) | 8 files, 99 tests passed, 72.92s, exit 0 |
| `bun x vitest run --maxWorkers=1` on `admin-audit-search`, `admin-audit-transactions` with `ZONA_P6_TEST_DATABASE_URL="$DATABASE_URL"` | 2 files, 16 tests passed, 21.70s, exit 0 |
| `bun x vitest run --maxWorkers=1` on `admin-audit-search`, `admin-dashboard`, `admin-audit-log-view` with `ZONA_P6_TEST_DATABASE_URL="$DATABASE_URL"` | 3 files, 32 tests passed, 15.77s, exit 0 |
| `bun run build` | exit 0, 35.73s wall, `✓ built in 6.92s` |
| `rg` bypass scan on P6 production files | no matches; test-only drizzle mock casts documented above |

All finite commands used explicit timeouts. No dev server or background process was left running.

## Files changed

- Domain: `src/lib/admin/audit-metadata.ts`, `src/lib/admin/audit-activity.ts`
- Server: `src/server/core/admin-audit.ts`, `src/server/core/admin-dashboard.ts`, `src/server/core/admin-models.ts`, `src/server/core/admin-users.ts`, `src/server/core/credits.ts`, `src/server/core/feedback.ts`, `src/server/functions/admin-audit.ts`, `src/lib/ai/credits.ts`
- UI: `src/routes/admin/audit-log.tsx`, `src/routes/admin/index.tsx`, `src/components/admin/AdminSidebar.tsx`, `src/components/ui/table.tsx`
- Tests: `tests/unit/admin-audit-metadata.test.ts`, `tests/unit/admin-audit-activity.test.ts`, `tests/unit/admin-audit-log-view.test.tsx`, `tests/integration/admin-audit-producers.test.ts`, `tests/integration/admin-audit-search.test.ts`, `tests/integration/admin-audit-transactions.test.ts`, plus contract updates in `admin-users.test.ts`, `admin-credits.test.ts`, `feedback.test.ts`, `admin-dashboard.test.ts`
- Docs: `docs/p6-component-discovery.md`, this file

No SQL migration: `audit_logs` stays `jsonb`; schema, indexes, table name, and route `/admin/audit-log` are unchanged.

## Migration and backward compatibility

No SQL migration is required: `audit_logs.metadata` remains `jsonb`; table name, indexes, route `/admin/audit-log`, and internal event codes are unchanged. Existing rows are not rewritten, deleted, or backfilled. `parseAuditLogMetadataValue` returns `null` for legacy/null/invalid metadata; `metadataUnreadable` marks invalid shapes, and `presentAuditActivity` still renders the event with `Aktivitas lainnya`, `Nama tidak tersedia`, and `Tidak tercatat` where values are absent. Legacy `deletedEmail` in old rows is parsed only through the redacted technical view and is no longer written by `user.delete`. Current user/model names are joined read-only as a fallback after stored snapshots; a removed target still uses its stored name and does not fail the query.

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
- `850b5d74fe` `fix(admin): keep technical IDs out of the activity list`
- `ca220943d2` `test(admin): assert an accessible activity detail trigger`
- `39f364b368` `fix(admin): omit deleted email from new audit metadata`
- `a98928d370` `style(test): format audit producer test`
- `94f81ae300` `test(admin): prove delete and retire audit rollback on real transactions`
- `5a255b17fe` `feat(admin): resolve current audit target names in one query`
- `3b1804521a` `docs(p6): record current-target lookup and acceptance evidence`
- `5f87c454f7` `fix(admin): align Ringkasan activity copy and target fallback`
- `1c49ce33d7` `test(admin): prove stale activity responses are ignored`

## Root cause fixed beyond presentation

`resetDevCreditsCore` opened an outer transaction, then called `resetDevCredits`, which opened a second top-level `db.transaction`. Drizzle's postgres-js driver does not route that second call through the outer transaction, so `SELECT ... FOR UPDATE` on the same row deadlocked. `resetDevCredits` now accepts an optional `DatabaseTransaction` and the core passes its active `tx`; credit rows and the audit row commit or roll back together. The isolated test proved RED (timeout/deadlock) before the fix and GREEN after.

## P7 handoff

- `listAuditLogsFn` data: `{ action, adminId, targetType, targetId, search, page, limit }`; `search` trims and caps at 120 chars, `limit` 1–100, default 20.
- Response: `{ items: AuditLogItem[], pagination: { total, page, limit, totalPages } }`; `AuditLogItem` includes `adminName`, `adminImage`, `currentTargetName`, `metadata`, and `metadataUnreadable`. Current target names are joined in the same list/dashboard query; they are a fallback after stored snapshots, never a per-row lookup.
- Filter values are stable internal codes from `AUDIT_ACTION_CODES`; the human labels come only from `AUDIT_ACTION_FILTER_OPTIONS` / `getAuditActionLabel`.
- Shared renderer: `presentAuditActivity` in `src/lib/admin/audit-activity.ts`; use it for every surface instead of reading `action` or raw metadata directly.
- Ordering: `createdAt DESC`, `id DESC`; pagination is clamped after count. P7 may replace the local pagination controls with the shared component without changing this contract.
- Per-event details from `presentAuditActivity`: `credit.adjust`/`credit.reset` show `Saldo sebelumnya`, `Saldo sesudah`, optional `Perubahan`, and `Alasan`; `user.ban` shows status before/after, `Alasan`, and `Berlaku sampai`; `user.unban` and `model.enable`/`model.disable`/`model.update` show status before/after and `Alasan`; `user.delete` shows `Status sebelumnya` and `Hasil: Akun dihapus`; `model.connection_test` shows `Hasil` and `Kode respons`; `feedback.status_update` shows status before/after. `model.create`, `model.delete`, and unknown codes have no generic detail rows to avoid irrelevant fields. Missing values render `Tidak tercatat`. Actor falls back snapshot → current name → email → ID → `Administrator tidak tersedia`; target falls back snapshot → legacy deleted name → current name → `Nama tidak tersedia`.
- P9 E2E to run: desktop/mobile, light/dark, long names/IDs, detail open, technical disclosure, copy, search, filter, error/retry, empty, pagination, keyboard focus and Escape.
