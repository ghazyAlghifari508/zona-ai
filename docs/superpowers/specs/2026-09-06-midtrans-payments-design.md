# Midtrans One-Time Purchase Payments — Design Spec

> **Status:** Draft for user review
> **Date:** 2026-09-06
> **Scope:** Make the pricing page functional: buy Pro/Ultra via Midtrans Snap sandbox, settle credits idempotently, show active plan badge. No webhook, no subscription, no refund UI, no feature gating.

---

## 1. Goal & Decisions

Pricing page (`/pricing`) currently renders cards from `src/lib/pricing/plans.ts` with dead buttons (`PricingSection.tsx` `<button type="button">` has no handler). This spec replaces the dummy purchase flow with a real Midtrans Snap one-time purchase that grants credits and records the active plan.

Decisions locked with the product owner:

| Decision | Value |
|---|---|
| Purchase model | One-time purchase (no auto-renew). Monthly buys `plan.credits` credits once; yearly buys `plan.credits * 12` credits once. |
| Provider | Midtrans Snap (sandbox first; production is an env switch) |
| Settle mechanism | Polling Get Status API only (no webhook in this phase) |
| Post-purchase effect | Credits added + active plan badge (derived from payments); no feature gating |
| Credentials | Already provisioned in `.env` (sandbox) |

Explicit non-goals: webhook/notification handler, subscription/recurring, refunds, admin dashboard, invoice emails, proration, coupon codes.

## 2. Verified External Contract (Midtrans, docs Nov 2025)

Facts verified from docs.midtrans.com (snap-snap-integration-guide.md, get-status-api-requests.md). Do not rely on memory for these — re-check when the plan is executed.

- Snap token: `POST {snap-base}/snap/v1/transactions`, header `Authorization: Basic Base64(serverKey + ":")`, body `transaction_details.order_id` (unique, alphanumeric plus `- _ ~ .`, max 50 chars) and `transaction_details.gross_amount` (integer IDR). Success 201 → `{ token, redirect_url }`.
- Frontend: include `https://app.sandbox.midtrans.com/snap/snap.js` with `data-client-key` (production: `https://app.midtrans.com/snap/snap.js`), then `window.snap.pay(token, { onSuccess, onPending, onError, onClose })`. Frontend callbacks are UX signals only, never proof of payment.
- Get Status: `GET {api-base}/v2/{order_id}/status`, same Basic Auth. Response includes `transaction_status`, `fraud_status`, `gross_amount` (string, e.g. `"49000.00"`), `status_code`, `order_id`, `signature_key`, `transaction_id`, `payment_type`, `settlement_time`. Field presence varies by payment method — parse tolerantly.
- Status mapping: `capture`/`settlement` → paid (fraud_status must be `accept`); `pending` → pending; `deny` → failed; `cancel` → cancelled; `expire` → expired; `refund`/`partial_refund` → out of scope (log only, never grant credits).
- Signature verification: SHA512(`order_id` + `status_code` + `gross_amount` + serverKey), where `gross_amount` is the raw provider string, NOT the integer we sent. Comparing against a reformatted amount is the classic Snap signature bug — the schema must keep the raw string.

## 3. Architecture

```
PricingSection (client)
  | createPayment({planId, billingPeriod})     server fn, auth required
  |   1. Zod-validate input
  |   2. Resolve price/credits from plans.ts server-side (client value ignored)
  |   3. INSERT payments (status 'creating')   ← state persisted BEFORE provider call
  |   4. midtrans client: createSnapTransaction()
  |   5. UPDATE payments → 'pending', snapToken stored
  v
window.snap.pay(snapToken)  ← snap.js loaded on-demand, client key from response
  | user pays in Midtrans popup
  v
snap callbacks (onSuccess/onPending/onError/onClose) → trigger getPaymentStatus
  | getPaymentStatus({orderId})               server fn, auth + ownership check
  |   1. Load payments row, assert userId === session user
  |   2. midtrans client: getTransactionStatus(orderId)
  |   3. Zod-parse response; verify SHA512 signature
  |   4. Map transaction_status → internal status
  |   5. If paid: idempotent settle (see §5)
  v
UI updates via TanStack Query invalidation (credit widget + plan badge)
```

Reconciliation path: pricing page loader calls `reconcilePendingPayments` which runs `getPaymentStatus`'s settle logic for every `pending` payment owned by the session user. This closes the "paid a VA then closed the browser" case without a webhook.

Provider swap safety: all Midtrans specifics (URLs, auth header, payload, response parsing) live in one server-only adapter. Replacing or adding a gateway later means writing a new adapter, not touching orchestration/UI.

## 4. Data Model

New Drizzle table `payments` in `src/lib/db/schema.ts` (+ migration via `drizzle-kit generate`):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk defaultRandom | |
| `userId` | text, fk → users.id, onDelete cascade | ownership anchor |
| `planId` | text notNull | `'pro' \| 'ultra'` (free is not purchasable) |
| `billingPeriod` | text notNull | `'monthly' \| 'yearly'` |
| `amountIdr` | integer notNull | price snapshot at purchase time |
| `creditsGranted` | integer notNull | credit snapshot (monthly = plan.credits, yearly = ×12) |
| `status` | text notNull, default `'creating'` | `creating → pending → paid \| failed \| expired \| cancelled` |
| `orderId` | text notNull unique | `zona-{planId}-{uuid}` truncated to ≤ 50 chars |
| `snapToken` | text | nullable until Snap responds |
| `midtransTransactionId` | text | from status response |
| `paymentType` | text | qris / bank_transfer / credit_card / … |
| `settledAt` | timestamp withTimezone | from `settlement_time` |
| `createdAt` | timestamp withTimezone defaultNow | |

Indexes: `payments_user_id_idx`, unique on `orderId` (dedupe/idempotency anchor), `payments_status_idx`.

No `users` table change. Active plan is derived: the `planId` of the user's most recent `paid` payment. The Free card's hardcoded `current: true` in `plans.ts` stops being treated as user state; `PricingSection` receives the derived active plan instead.

`creditTransactions.type` gains a new value `'purchase'` (column is free-form text today; `generationRunId`/`modelId` are already nullable).

## 5. Idempotent Settlement (the money-safety invariant)

Settlement MUST be safe against duplicate triggers: polling retries, multiple snap callbacks, reconciliation racing an interactive poll, two browser tabs.

```
UPDATE payments
SET status='paid', settledAt=?, midtransTransactionId=?, paymentType=?
WHERE orderId=? AND status IN ('creating','pending')
RETURNING *
```

- 0 rows returned → already settled (or terminal) → do NOT touch credits. Return current state.
- 1 row returned → `UPDATE users SET credits = credits + creditsGranted WHERE id=?` then INSERT `credit_transactions` `{amount: +creditsGranted, type: 'purchase', balanceAfter, description}`.

The status guard on the UPDATE is the idempotency mechanism — no separate lock table, no upsert tricks. Late `pending`/`deny`/`expire` results arriving after settlement must never downgrade a `paid` row or subtract credits (monotonic transition guard in the same function).

Fraud rule: `transaction_status in (capture, settlement)` grants credits ONLY when `fraud_status` is `accept` or absent.

## 6. Server Adapter & Env

`src/lib/midtrans/client.ts` — server-only (runtime window guard, pattern from `src/lib/ai/credits.ts`):

- `createSnapTransaction(params): Promise<{ token: string }>`
- `getTransactionStatus(orderId): Promise<MidtransStatus>`

Thin `fetch` wrapper like `src/lib/tavily/client.ts`. No npm SDK (avoids a new dependency; the API is two endpoints). Base URLs derived from `MIDTRANS_IS_PRODUCTION`: sandbox `app.sandbox.midtrans.com` / `api.sandbox.midtrans.com`, production `app.midtrans.com` / `api.midtrans.com`. Timeout + one retry on 5xx/network for status GET (idempotent), no retry on 4xx.

`src/lib/midtrans/status-schema.ts` — Zod schema for the status response: required core fields (`order_id`, `status_code`, `gross_amount: string`, `transaction_status`, `signature_key`), optional everything else (`transaction_id`, `payment_type`, `fraud_status`, `settlement_time`, `status_message`). Unknown extra fields tolerated.

`src/lib/midtrans/signature.ts` — `verifyStatusSignature({orderId, statusCode, grossAmountRaw, serverKey, signatureKey}): boolean` using Web Crypto SHA-512 over `orderId + statusCode + grossAmountRaw + serverKey`.

Env additions to `src/lib/env.server.ts` + `.env.example` (values already present in local `.env`):

| Variable | Constraint |
|---|---|
| `MIDTRANS_SERVER_KEY` | min 1; server-only, never sent to browser |
| `MIDTRANS_CLIENT_KEY` | min 1; public by design, returned by `createPayment` |
| `MIDTRANS_IS_PRODUCTION` | z.coerce.boolean()-style parse of `'true'/'false'` |

Constants added to `src/lib/utils/constants.ts`: `PAYMENT_ORDER_ID_PREFIX = 'zona-'`, `PAYMENT_POLL_INTERVAL_MS`, `PAYMENT_POLL_MAX_ATTEMPTS`, `PAYMENT_RATE_LIMIT_PER_MINUTE`. Prices and credits stay sourced exclusively from `src/lib/pricing/plans.ts` — never duplicated.

## 7. Server Functions (`src/server/functions/payments.ts`)

All three: `createServerFn`, session check via existing `getCurrentSession` pattern, Zod validators, rate limiting via `src/lib/security` where noted, structured logging without secrets or user PII.

1. `createPayment({planId, billingPeriod})` — input Zod `{planId: enum, billingPeriod: enum}`. Rejects `planId: 'free'`. Rate limited. Resolves `{amountIdr, credits}` from plans.ts (yearly credits = ×12). Inserts `creating` row, calls adapter, updates to `pending` on success. Provider failure → row updated to `failed`, `ZonaError` surfaced with clear code; never leaves the row unidentified.
2. `getPaymentStatus({orderId})` — ownership check first. Calls adapter, Zod-parses, verifies signature (invalid signature → log + hard fail, never settle), maps status, runs idempotent settle when paid. Returns safe view: `{status, creditsGranted?, balanceAfter?, paymentType?}` — never raw provider payload.
3. `reconcilePendingPayments()` — session user's `pending` payments (bounded by `PAYMENT_RECONCILE_MAX_ROWS = 10`, newest first, constant in constants.ts), runs the same status/settle path per row, returns summary. Invoked by the pricing page loader; failures per row are isolated (one bad row does not fail the rest).

Error taxonomy: reuse `ZonaError` codes (new codes for `PAYMENT_PROVIDER_ERROR`, `PAYMENT_SIGNATURE_INVALID` following existing `ERR-0xx` convention).

## 8. Frontend

- `PricingSection.tsx`: purchase mutation on "Pilih Pro/Ultra" buttons. States (all real, none fabricated): idle → creating (button spinner) → snap popup open → awaiting_status (polling) → success / failed / pending. Success invalidates credit widget + plan queries. `onClose` ALSO triggers a status check (QRIS user may pay then close immediately).
- Snap script loaded on demand: inject `<script src=…snap.js data-client-key=…>` once per session on first purchase, gated on `clientKey` returned by `createPayment`. Typed `window.snap` declaration lives in the payment domain module (no `any`).
- Pricing page loader: fetches session + credit balance + derived active plan + runs reconciliation.
- Badge behavior: derived active plan marks the matching card "Paket saat ini"; card for purchasable plans shows "Pilih …". Yearly switch unchanged. Free card's `current` flag in plans.ts is no longer the source of user state.
- UI discipline: MindMarket tokens only — hairline borders, no shadow-xl, Lucide/Hugeicons monochrome icons, no emoji; loading/processing states use existing spinner patterns.

## 9. Testing (deterministic invariants only — IRON LAW compliant)

Never assert AI/model prose, Indonesian copy wording, classNames, markup strings, palette hues, or layout structure. Tests assert:

Unit (`tests/unit/`):
- Zod status schema: accepts the documented response shape, tolerates missing optional fields, rejects missing core fields, keeps `gross_amount` as raw string.
- Signature: known-vector determinism (`orderId + statusCode + grossAmountRaw + serverKey` → expected SHA512 hex), mismatch → false; proves raw-string handling (e.g. `"49000.00"` input, not `49000`).
- OrderId generator: prefix + plan segment + uniqueness + length ≤ 50 + allowed charset.
- Yearly credit resolution: ×12 from plans.ts values; monthly passthrough; `free` rejected.
- Status mapping table: every documented `transaction_status` maps to the internal status; unknown status → explicit error, no silent fallback.
- Monotonic guard: settled row never transitions to pending/failed/expired; deny/expire never subtract credits.

Integration (`tests/integration/`, real PG):
- Idempotent double settle: settle twice → credits added exactly once; single `purchase` credit transaction row.
- Ownership: user B cannot poll user A's orderId (404/403 semantics per existing error conventions).
- `creating → failed` on provider error (adapter mocked to throw); `creating → pending` on success with token persisted.

E2E (`tests/e2e/`, Playwright):
- Mock Snap API via `page.route` + stub `window.snap.pay` invoking a fake callback: journey buy → credit widget increments; failed provider → recoverable error state. No copy/style assertions.

## 10. Verification Gates & Rollout

Per task: `bun x tsc --noEmit` (0 errors) + `bun x biome check ./src` + affected vitest; type-bypass scan (`as never|as any|@ts-ignore` = 0 in src, excluding generated files). Migration: `bun x drizzle-kit generate` then `migrate` against local PG. Live sandbox smoke (manual): buy Pro monthly in the browser with sandbox QRIS simulator → credit widget +2000 → `payments` row `paid` → credit_transactions row `purchase`; retry-open pricing page → no double credit; buy Ultra yearly → +120000 credits. Sandbox→production cutover later is env-only (`MIDTRANS_IS_PRODUCTION=true` + production keys) — no code change.

## 11. Risks / Notes

- Polling-only settle latency: acceptable for one-time purchase; reconciliation on page load covers closed-browser cases. Webhook can be added later behind the same adapter with zero orchestration changes.
- `window.snap` typing: declare a minimal interface (pay/hide + callbacks); no `any`, no `as never`.
- Sandbox card test credentials (docs): `4811 1111 1111 1114`, CVV `123`, OTP `112233` — for manual smoke only, never embedded in code or fixtures.
- User PII (email) is NOT sent to Midtrans `customer_details` in this phase (minimization); can be added later deliberately.
