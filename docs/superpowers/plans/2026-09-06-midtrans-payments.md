# Midtrans One-Time Purchase Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dummy pricing buttons with real Midtrans Snap sandbox one-time purchases that grant credits idempotently and drive the active-plan badge.

**Architecture:** Polling-only settlement (no webhook in this phase). Server-owned thin Midtrans adapter (`src/lib/midtrans/`), `payments` table with monotonic status state machine, settlement guarded by a conditional UPDATE (`WHERE status IN ('creating','pending')`) so credits can never be granted twice. Active plan derived from the latest `paid` payment — no `users` table change.

**Tech Stack:** TanStack Start server functions (thin RPC wrapper → `src/server/core/`), Drizzle ORM + PostgreSQL migration, Zod v4, Web Crypto SHA-512, snap.js loaded on demand, TanStack Query mutations + router invalidation, Vitest (unit + real-PG integration), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-midtrans-payments-design.md` — read it together with this plan; it owns the "why" (Midtrans contract, idempotency invariant, out-of-scope list).

## Global Constraints

- Zero type bypasses: no `as any`, `as never`, `as unknown as X`, `@ts-ignore`, `@ts-expect-error` in `src/` (generated `routeTree.gen.ts` exempt). Type-bypass scan must return 0 hits.
- Prices/credits come ONLY from `src/lib/pricing/plans.ts` — never from client input, never duplicated.
- `MIDTRANS_SERVER_KEY` never leaves the server. `MIDTRANS_CLIENT_KEY` is public-by-design and may be returned to the browser.
- Frontend snap callbacks are UX triggers only; settlement happens exclusively after a backend Get Status call + SHA-512 signature verification.
- Signature verification uses `gross_amount` as the RAW provider string (e.g. `"49000.00"`), never a reformatted number.
- Monotonic payment status: `paid`/`failed`/`cancelled`/`expired` rows are terminal; a late `pending`/`deny` must never downgrade them or subtract credits.
- Never test AI prose, Indonesian copy wording, classNames, markup structure, palette hues, fonts, or layout. Tests assert schemas, mappings, contracts, testids, and deterministic boundaries only.
- MindMarket aesthetic: hairline borders, no `shadow-xl`, no neon, no emoji, Lucide/Hugeicons monochrome icons.
- Bun commands (`bun x …`), Biome formatting, conventional commits, one commit per verified task.
- New error codes go through the existing taxonomy in `src/lib/utils/errors.ts` (`ZonaApiError` / `getZonaError`). `docs/ERROR-HANDLING.md` does NOT exist in the repo — do not create or reference it.

---

### Task 1: `payments` table + migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: migration SQL via `bun x drizzle-kit generate`
- Test: `tests/integration/payments-schema.test.ts`

**Interfaces:**
- Produces: `payments` Drizzle table exported from `src/lib/db/schema.ts` with columns `id` (uuid pk), `userId` (text, FK users cascade), `planId` (text notNull), `billingPeriod` (text notNull), `amountIdr` (integer notNull), `creditsGranted` (integer notNull), `status` (text notNull default `'creating'`), `orderId` (text notNull unique), `snapToken` (text), `midtransTransactionId` (text), `paymentType` (text), `settledAt` (timestamp withTimezone), `createdAt` (timestamp withTimezone defaultNow); indexes `payments_user_id_idx`, `payments_status_idx`.

- [ ] **Step 1: Write the failing integration test**

```typescript
/**
 * @vitest-environment node
 */
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/index'

type Row = Record<string, unknown>

async function query(text: string): Promise<Row[]> {
  const res = await db.execute(sql.raw(text))
  const rows = Array.isArray(res) ? res : (res as { rows: Row[] }).rows
  return rows
}

describe('payments table', () => {
  it('exists with expected columns', async () => {
    const rows = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='payments'",
    )
    const names = rows.map((r) => r.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'plan_id',
        'billing_period',
        'amount_idr',
        'credits_granted',
        'status',
        'order_id',
        'snap_token',
        'midtrans_transaction_id',
        'payment_type',
        'settled_at',
        'created_at',
      ]),
    )
  })

  it('defaults status to creating', async () => {
    const rows = await query(
      "SELECT column_default FROM information_schema.columns WHERE table_name='payments' AND column_name='status'",
    )
    expect(String(rows[0]?.column_default)).toContain('creating')
  })

  it('enforces unique order_id', async () => {
    const rows = await query(
      "SELECT indexdef FROM pg_indexes WHERE tablename='payments' AND indexdef LIKE '%UNIQUE%'",
    )
    const defs = rows.map((r) => String(r.indexdef))
    expect(defs.some((d) => d.includes('order_id'))).toBe(true)
  })

  it('cascades delete from users', async () => {
    const rows = await query(
      "SELECT confdeltype FROM pg_constraint WHERE conname LIKE 'payments_user_id%'",
    )
    expect(String(rows[0]?.confdeltype)).toBe('c')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/payments-schema.test.ts --reporter=dot`
Expected: FAIL — `payments` table does not exist.

- [ ] **Step 3: Add the table to `src/lib/db/schema.ts`**

Append after `creditTransactions` (match existing style — no comments needed):

```typescript
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull(),
    billingPeriod: text('billing_period').notNull(),
    amountIdr: integer('amount_idr').notNull(),
    creditsGranted: integer('credits_granted').notNull(),
    status: text('status').notNull().default('creating'),
    orderId: text('order_id').notNull().unique(),
    snapToken: text('snap_token'),
    midtransTransactionId: text('midtrans_transaction_id'),
    paymentType: text('payment_type'),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('payments_user_id_idx').on(table.userId),
    index('payments_status_idx').on(table.status),
  ],
)
```

- [ ] **Step 4: Generate and apply the migration**

Run: `bun x drizzle-kit generate` — verify a new SQL file appears in `src/lib/db/migrations/` creating `payments` with the unique constraint and two indexes.
Run: `bun x drizzle-kit migrate`

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run tests/integration/payments-schema.test.ts --reporter=dot`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations tests/integration/payments-schema.test.ts
git commit -m "feat(db): add payments table for Midtrans one-time purchases"
```

---

### Task 2: Midtrans status schema + signature verification (pure functions)

**Files:**
- Create: `src/lib/midtrans/status-schema.ts`
- Create: `src/lib/midtrans/signature.ts`
- Test: `tests/unit/midtrans-status-schema.test.ts`
- Test: `tests/unit/midtrans-signature.test.ts`

**Interfaces:**
- Produces:
  - `midtransStatusSchema` — Zod object with required `order_id`, `status_code`, `gross_amount: string`, `transaction_status`, `signature_key`; optional `transaction_id`, `payment_type`, `fraud_status`, `settlement_time`, `status_message`, `currency`. Unknown fields are stripped (Zod v4 default; do NOT use `.passthrough()`).
  - `type MidtransStatus = z.infer<typeof midtransStatusSchema>`
  - `mapMidtransStatus(status: MidtransStatus): InternalPaymentStatus` where `InternalPaymentStatus = 'paid' | 'pending' | 'failed' | 'cancelled' | 'expired'` — throws `Error` on unknown `transaction_status` (including `refund`/`partial_refund`, which are out of scope per spec §2; caller treats throw as "leave row untouched").
  - `verifyStatusSignature(params: { orderId: string; statusCode: string; grossAmountRaw: string; serverKey: string; signatureKey: string }): Promise<boolean>`

- [ ] **Step 1: Write failing schema tests**

```typescript
import { describe, expect, it } from 'vitest'
import {
  mapMidtransStatus,
  midtransStatusSchema,
} from '../../src/lib/midtrans/status-schema'

const baseStatus = {
  order_id: 'zona-pro-550e8400-e29b-41d4-a716-446655440000',
  status_code: '200',
  gross_amount: '49000.00',
  transaction_status: 'settlement',
  signature_key: 'a'.repeat(128),
}

describe('midtransStatusSchema', () => {
  it('parses the documented Get Status response', () => {
    const parsed = midtransStatusSchema.parse({
      ...baseStatus,
      transaction_id: '57d5293c-e65f-4a29-95e4-5959c3fa335b',
      payment_type: 'credit_card',
      fraud_status: 'accept',
      settlement_time: '2020-01-10 16:15:31',
      merchant_id: 'M004123',
      masked_card: '48111111-1114',
    })
    expect(parsed.order_id).toBe(baseStatus.order_id)
  })

  it('keeps gross_amount as the raw provider string', () => {
    const parsed = midtransStatusSchema.parse(baseStatus)
    expect(parsed.gross_amount).toBe('49000.00')
  })

  it('tolerates missing optional fields', () => {
    const parsed = midtransStatusSchema.parse(baseStatus)
    expect(parsed.payment_type).toBeUndefined()
    expect(parsed.fraud_status).toBeUndefined()
  })

  it('rejects when a core field is missing', () => {
    const { signature_key: _signatureKey, ...withoutSignature } = baseStatus
    expect(midtransStatusSchema.safeParse(withoutSignature).success).toBe(false)
    expect(
      midtransStatusSchema.safeParse({ ...baseStatus, gross_amount: 49000 })
        .success,
    ).toBe(false)
  })
})

describe('mapMidtransStatus', () => {
  it.each([
    ['capture', 'paid'],
    ['settlement', 'paid'],
    ['pending', 'pending'],
    ['deny', 'failed'],
    ['cancel', 'cancelled'],
    ['expire', 'expired'],
  ] as const)('maps %s to %s', (raw, expected) => {
    expect(
      mapMidtransStatus({ ...baseStatus, transaction_status: raw }),
    ).toBe(expected)
  })

  it('throws on out-of-scope refund statuses', () => {
    expect(() =>
      mapMidtransStatus({ ...baseStatus, transaction_status: 'refund' }),
    ).toThrow()
  })

  it('throws on unknown statuses', () => {
    expect(() =>
      mapMidtransStatus({ ...baseStatus, transaction_status: 'mystery' }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run schema tests to verify they fail**

Run: `bun x vitest run tests/unit/midtrans-status-schema.test.ts --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/midtrans/status-schema.ts`**

```typescript
import { z } from 'zod'

export const midtransStatusSchema = z.object({
  order_id: z.string().min(1),
  status_code: z.string().min(1),
  gross_amount: z.string().min(1),
  transaction_status: z.string().min(1),
  signature_key: z.string().min(1),
  transaction_id: z.string().optional(),
  payment_type: z.string().optional(),
  fraud_status: z.string().optional(),
  settlement_time: z.string().optional(),
  status_message: z.string().optional(),
  currency: z.string().optional(),
})

export type MidtransStatus = z.infer<typeof midtransStatusSchema>

export type InternalPaymentStatus =
  | 'paid'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'expired'

const INTERNAL_STATUS_MAP: Record<string, InternalPaymentStatus> = {
  capture: 'paid',
  settlement: 'paid',
  pending: 'pending',
  deny: 'failed',
  cancel: 'cancelled',
  expire: 'expired',
}

export function mapMidtransStatus(status: MidtransStatus): InternalPaymentStatus {
  const mapped = INTERNAL_STATUS_MAP[status.transaction_status]
  if (!mapped) {
    throw new Error(`Unknown Midtrans transaction_status: ${status.transaction_status}`)
  }
  return mapped
}
```

- [ ] **Step 4: Write failing signature tests**

The test uses Node's `crypto.createHash` as an independent oracle against the implementation's Web Crypto — two implementations agreeing is the mechanical contract.

```typescript
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyStatusSignature } from '../../src/lib/midtrans/signature'

const SERVER_KEY = 'SB-Mid-server-test-key'

function oracle(input: string): string {
  return createHash('sha512').update(input).digest('hex')
}

describe('verifyStatusSignature', () => {
  it('accepts a signature built with the raw gross_amount string', async () => {
    const signature = oracle('order-1' + '200' + '49000.00' + SERVER_KEY)
    const ok = await verifyStatusSignature({
      orderId: 'order-1',
      statusCode: '200',
      grossAmountRaw: '49000.00',
      serverKey: SERVER_KEY,
      signatureKey: signature,
    })
    expect(ok).toBe(true)
  })

  it('rejects a signature built from the reformatted integer amount', async () => {
    const signature = oracle('order-1' + '200' + '49000' + SERVER_KEY)
    const ok = await verifyStatusSignature({
      orderId: 'order-1',
      statusCode: '200',
      grossAmountRaw: '49000.00',
      serverKey: SERVER_KEY,
      signatureKey: signature,
    })
    expect(ok).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const signature = oracle('order-1' + '200' + '49000.00' + SERVER_KEY)
    const ok = await verifyStatusSignature({
      orderId: 'order-1',
      statusCode: '200',
      grossAmountRaw: '49000.00',
      serverKey: SERVER_KEY,
      signatureKey: signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0'),
    })
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 5: Run signature tests to verify they fail**

Run: `bun x vitest run tests/unit/midtrans-signature.test.ts --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `src/lib/midtrans/signature.ts`**

```typescript
const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyStatusSignature(params: {
  orderId: string
  statusCode: string
  grossAmountRaw: string
  serverKey: string
  signatureKey: string
}): Promise<boolean> {
  const raw =
    params.orderId + params.statusCode + params.grossAmountRaw + params.serverKey
  const digest = await crypto.subtle.digest('SHA-512', encoder.encode(raw))
  return toHex(digest) === params.signatureKey
}
```

- [ ] **Step 7: Run both test files to verify they pass**

Run: `bun x vitest run tests/unit/midtrans-status-schema.test.ts tests/unit/midtrans-signature.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/midtrans/status-schema.ts src/lib/midtrans/signature.ts tests/unit/midtrans-status-schema.test.ts tests/unit/midtrans-signature.test.ts
git commit -m "feat(payments): add Midtrans status schema, mapping, and signature verification"
```

---

### Task 3: Purchase resolver, order-id generator, payment constants

**Files:**
- Modify: `src/lib/pricing/plans.ts` (add purchase resolution)
- Create: `src/lib/midtrans/order-id.ts`
- Modify: `src/lib/utils/constants.ts` (payment constants)
- Test: `tests/unit/payment-purchase.test.ts`

**Interfaces:**
- Produces in `src/lib/pricing/plans.ts`:
  - `export type PurchasablePlanId = 'pro' | 'ultra'`
  - `export function isPurchasablePlan(planId: string): planId is PurchasablePlanId`
  - `export type BillingPeriod = 'monthly' | 'yearly'`
  - `export function isBillingPeriod(v: string): v is BillingPeriod`
  - `export interface ResolvedPurchase { planId: PurchasablePlanId; billingPeriod: BillingPeriod; amountIdr: number; creditsGranted: number }`
  - `export function resolvePurchase(planId: PurchasablePlanId, billingPeriod: BillingPeriod): ResolvedPurchase` — amount from `priceMonthly`/`priceYearly`; credits `plan.credits` (monthly) or `plan.credits * 12` (yearly).
- Produces in `src/lib/midtrans/order-id.ts`: `generateOrderId(planId: string): string` — `${PAYMENT_ORDER_ID_PREFIX}${planId}-${crypto.randomUUID()}`, guaranteed ≤ 50 chars.
- Produces in `src/lib/utils/constants.ts`: `PAYMENT_ORDER_ID_PREFIX = 'zona-'`, `PAYMENT_ORDER_ID_MAX_LENGTH = 50`, `PAYMENT_RECONCILE_MAX_ROWS = 10`, `PAYMENT_POLL_INTERVAL_MS = 2500`, `PAYMENT_POLL_MAX_ATTEMPTS = 8`, `RATE_LIMIT_PAYMENT_PER_MINUTE` (env override `RATE_LIMIT_PAYMENT_PER_MINUTE`, default 5), `RATE_LIMIT_PAYMENT_STATUS_PER_MINUTE` (env override, default 30).

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from 'vitest'
import {
  isBillingPeriod,
  isPurchasablePlan,
  resolvePurchase,
} from '../../src/lib/pricing/plans'
import { generateOrderId } from '../../src/lib/midtrans/order-id'
import {
  PAYMENT_ORDER_ID_MAX_LENGTH,
  PAYMENT_ORDER_ID_PREFIX,
} from '../../src/lib/utils/constants'

describe('purchase resolution', () => {
  it('resolves pro monthly from plans.ts values', () => {
    expect(resolvePurchase('pro', 'monthly')).toEqual({
      planId: 'pro',
      billingPeriod: 'monthly',
      amountIdr: 49000,
      creditsGranted: 2000,
    })
  })

  it('resolves yearly as 12x monthly credits and yearly price', () => {
    expect(resolvePurchase('pro', 'yearly')).toEqual({
      planId: 'pro',
      billingPeriod: 'yearly',
      amountIdr: 470000,
      creditsGranted: 24000,
    })
    expect(resolvePurchase('ultra', 'yearly').creditsGranted).toBe(120000)
  })

  it('guards purchasable plans and billing periods', () => {
    expect(isPurchasablePlan('pro')).toBe(true)
    expect(isPurchasablePlan('ultra')).toBe(true)
    expect(isPurchasablePlan('free')).toBe(false)
    expect(isPurchasablePlan('nonsense')).toBe(false)
    expect(isBillingPeriod('monthly')).toBe(true)
    expect(isBillingPeriod('yearly')).toBe(true)
    expect(isBillingPeriod('weekly')).toBe(false)
  })
})

describe('order id generation', () => {
  it('uses the prefix, plan segment, and allowed charset', () => {
    const id = generateOrderId('pro')
    expect(id.startsWith(PAYMENT_ORDER_ID_PREFIX + 'pro-')).toBe(true)
    expect(id.length).toBeLessThanOrEqual(PAYMENT_ORDER_ID_MAX_LENGTH)
    expect(id).toMatch(/^[A-Za-z0-9._~-]+$/)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateOrderId('ultra')))
    expect(ids.size).toBe(50)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun x vitest run tests/unit/payment-purchase.test.ts --reporter=dot`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement**

Append to `src/lib/pricing/plans.ts`:

```typescript
export type PurchasablePlanId = 'pro' | 'ultra'
export type BillingPeriod = 'monthly' | 'yearly'

const PURCHASABLE_PLAN_IDS: readonly string[] = ['pro', 'ultra']
const BILLING_PERIODS: readonly string[] = ['monthly', 'yearly']

export function isPurchasablePlan(planId: string): planId is PurchasablePlanId {
  return PURCHASABLE_PLAN_IDS.includes(planId)
}

export function isBillingPeriod(value: string): value is BillingPeriod {
  return BILLING_PERIODS.includes(value)
}

export interface ResolvedPurchase {
  planId: PurchasablePlanId
  billingPeriod: BillingPeriod
  amountIdr: number
  creditsGranted: number
}

export function resolvePurchase(
  planId: PurchasablePlanId,
  billingPeriod: BillingPeriod,
): ResolvedPurchase {
  const plan = getPlanById(planId)
  const yearly = billingPeriod === 'yearly'
  return {
    planId,
    billingPeriod,
    amountIdr: yearly ? plan.priceYearly : plan.priceMonthly,
    creditsGranted: yearly ? plan.credits * 12 : plan.credits,
  }
}
```

Create `src/lib/midtrans/order-id.ts`:

```typescript
import { PAYMENT_ORDER_ID_MAX_LENGTH, PAYMENT_ORDER_ID_PREFIX } from '../utils/constants'

export function generateOrderId(planId: string): string {
  const id = `${PAYMENT_ORDER_ID_PREFIX}${planId}-${crypto.randomUUID()}`
  return id.slice(0, PAYMENT_ORDER_ID_MAX_LENGTH)
}
```

Add to `src/lib/utils/constants.ts` (after the rate-limit block, same style):

```typescript
export const PAYMENT_ORDER_ID_PREFIX = 'zona-'
export const PAYMENT_ORDER_ID_MAX_LENGTH = 50
export const PAYMENT_RECONCILE_MAX_ROWS = 10
export const PAYMENT_POLL_INTERVAL_MS = 2500
export const PAYMENT_POLL_MAX_ATTEMPTS = 8
export const RATE_LIMIT_PAYMENT_PER_MINUTE = Number(
  getEnv(['RATE_LIMIT', 'PAYMENT', 'PER', 'MINUTE'].join('_')) ?? 5,
)
export const RATE_LIMIT_PAYMENT_STATUS_PER_MINUTE = Number(
  getEnv(['RATE_LIMIT', 'PAYMENT', 'STATUS', 'PER', 'MINUTE'].join('_')) ?? 30,
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun x vitest run tests/unit/payment-purchase.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/plans.ts src/lib/midtrans/order-id.ts src/lib/utils/constants.ts tests/unit/payment-purchase.test.ts
git commit -m "feat(payments): add purchase resolver, order-id generator, and payment constants"
```

---

### Task 4: Midtrans client adapter + env additions

**Files:**
- Modify: `src/lib/env.server.ts` (add `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`)
- Modify: `.env.example` (add MIDTRANS section, names + safe descriptions only)
- Create: `src/lib/midtrans/client.ts`
- Test: `tests/unit/midtrans-client.test.ts`

**Interfaces:**
- Consumes: `midtransStatusSchema` / `MidtransStatus` (Task 2), `env` from `src/lib/env.server.ts`.
- Produces:
  - `getSnapBaseUrl(isProduction: boolean): string` — `'https://app.sandbox.midtrans.com'` or `'https://app.midtrans.com'`
  - `getApiBaseUrl(isProduction: boolean): string` — `'https://api.sandbox.midtrans.com'` or `'https://api.midtrans.com'`
  - `createSnapTransaction(params: { orderId: string; grossAmount: number }): Promise<{ token: string }>` — POST `{snapBase}/snap/v1/transactions`, Basic auth `Buffer.from(serverKey + ':').toString('base64')`, JSON body `{ transaction_details: { order_id, gross_amount } }`; parses `{ token: z.string().min(1), redirect_url: z.string().optional() }`. Retries once on network error only (never on 5xx — a retried create can collide on order_id).
  - `getTransactionStatus(orderId: string): Promise<MidtransStatus>` — GET `{apiBase}/v2/${encodeURIComponent(orderId)}/status`, same auth; retries once on network error AND on 5xx (idempotent GET). Throws `ZonaApiError('ERR-020', ...)` after retries are exhausted.
  - Both use `AbortSignal.timeout(15_000)`; no other exports.
- Env schema additions: `MIDTRANS_SERVER_KEY: z.string().min(1)`, `MIDTRANS_CLIENT_KEY: z.string().min(1)`, `MIDTRANS_IS_PRODUCTION: z.enum(['true', 'false']).default('false')`.

- [ ] **Step 1: Write failing adapter tests**

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSnapTransaction,
  getApiBaseUrl,
  getSnapBaseUrl,
  getTransactionStatus,
} from '../../src/lib/midtrans/client'
import { env } from '../../src/lib/env.server'

function fetchMock(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string | URL, init?: RequestInit) =>
    handler(String(url), (init ?? {}) as RequestInit),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base url derivation', () => {
  it('returns sandbox and production urls', () => {
    expect(getSnapBaseUrl(false)).toBe('https://app.sandbox.midtrans.com')
    expect(getSnapBaseUrl(true)).toBe('https://app.midtrans.com')
    expect(getApiBaseUrl(false)).toBe('https://api.sandbox.midtrans.com')
    expect(getApiBaseUrl(true)).toBe('https://api.midtrans.com')
  })
})

describe('createSnapTransaction', () => {
  it('posts to the snap endpoint with basic auth and returns the token', async () => {
    const fetchFn = fetchMock((url, init) => {
      expect(url).toBe(
        `${getSnapBaseUrl(env.MIDTRANS_IS_PRODUCTION === 'true')}/snap/v1/transactions`,
      )
      const auth = (init.headers as Record<string, string>).Authorization
      expect(auth).toBe(
        `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
      )
      const body = JSON.parse(String(init.body)) as {
        transaction_details: { order_id: string; gross_amount: number }
      }
      expect(body.transaction_details).toEqual({
        order_id: 'zona-pro-test',
        gross_amount: 49000,
      })
      return new Response(JSON.stringify({ token: 'tok-1' }), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchFn)
    const result = await createSnapTransaction({
      orderId: 'zona-pro-test',
      grossAmount: 49000,
    })
    expect(result).toEqual({ token: 'tok-1' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('maps provider errors to ERR-020 and does not retry 4xx', async () => {
    const fetchFn = fetchMock(() => new Response('denied', { status: 401 }))
    vi.stubGlobal('fetch', fetchFn)
    await expect(
      createSnapTransaction({ orderId: 'zona-pro-test', grossAmount: 49000 }),
    ).rejects.toMatchObject({ code: 'ERR-020' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retries once on network error', async () => {
    const fetchFn = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'tok-2' }), { status: 201 }),
      )
    vi.stubGlobal('fetch', fetchFn)
    const result = await createSnapTransaction({
      orderId: 'zona-pro-test',
      grossAmount: 49000,
    })
    expect(result.token).toBe('tok-2')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe('getTransactionStatus', () => {
  it('returns the parsed status and encodes the order id', async () => {
    const status = {
      order_id: 'zona pro spc',
      status_code: '200',
      gross_amount: '49000.00',
      transaction_status: 'settlement',
      signature_key: 'a'.repeat(128),
    }
    const fetchFn = fetchMock((url) => {
      expect(url).toBe(
        `${getApiBaseUrl(env.MIDTRANS_IS_PRODUCTION === 'true')}/v2/${encodeURIComponent('zona pro spc')}/status`,
      )
      return new Response(JSON.stringify(status), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchFn)
    const parsed = await getTransactionStatus('zona pro spc')
    expect(parsed.gross_amount).toBe('49000.00')
  })

  it('retries on 5xx then succeeds', async () => {
    const fetchFn = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            order_id: 'o',
            status_code: '200',
            gross_amount: '49000.00',
            transaction_status: 'pending',
            signature_key: 'a'.repeat(128),
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchFn)
    const parsed = await getTransactionStatus('o')
    expect(parsed.transaction_status).toBe('pending')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('throws ERR-020 when retries are exhausted', async () => {
    const fetchFn = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response('boom', { status: 500 }))
    vi.stubGlobal('fetch', fetchFn)
    await expect(getTransactionStatus('o')).rejects.toMatchObject({
      code: 'ERR-020',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun x vitest run tests/unit/midtrans-client.test.ts --reporter=dot`
Expected: FAIL — module not found / env schema rejects.

- [ ] **Step 3: Add env schema entries**

In `src/lib/env.server.ts` add to `envSchema` (after the Tavily block):

```typescript
  MIDTRANS_SERVER_KEY: z.string().min(1, 'MIDTRANS_SERVER_KEY is required'),
  MIDTRANS_CLIENT_KEY: z.string().min(1, 'MIDTRANS_CLIENT_KEY is required'),
  MIDTRANS_IS_PRODUCTION: z.enum(['true', 'false']).default('false'),
```

Append to `.env.example`:

```text
# MIDTRANS (Payment Gateway - One-time purchases)
# Server-only (CLIENT_KEY is public by design and returned via server functions), Required, All environments
# Format: Sandbox keys start with SB-Mid-server- / SB-Mid-client-
MIDTRANS_SERVER_KEY=SB-Mid-server-your-sandbox-server-key
MIDTRANS_CLIENT_KEY=SB-Mid-client-your-sandbox-client-key
# Shared, Optional (defaults to false)
# Values: true, false
MIDTRANS_IS_PRODUCTION=false
```

- [ ] **Step 4: Implement `src/lib/midtrans/client.ts`**

```typescript
import { z } from 'zod'
import { env } from '../env.server'
import { throwZonaError } from '../utils/errors'
import { midtransStatusSchema, type MidtransStatus } from './status-schema'

if (typeof window !== 'undefined') {
  throw new Error('src/lib/midtrans/client.ts is server-only — do not import on the client')
}

const REQUEST_TIMEOUT_MS = 15_000

export function getSnapBaseUrl(isProduction: boolean): string {
  return isProduction
    ? 'https://app.midtrans.com'
    : 'https://app.sandbox.midtrans.com'
}

export function getApiBaseUrl(isProduction: boolean): string {
  return isProduction
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com'
}

function isProduction(): boolean {
  return env.MIDTRANS_IS_PRODUCTION === 'true'
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`
}

const snapTokenResponseSchema = z.object({
  token: z.string().min(1),
  redirect_url: z.string().optional(),
})

async function midtransFetch(
  url: string,
  init: RequestInit,
  retryOn5xx: boolean,
): Promise<Response> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (retryOn5xx && res.status >= 500) {
      throw new Error(`Midtrans 5xx: ${res.status}`)
    }
    return res
  } catch (error) {
    if (!retryOn5xx && error instanceof Error && error.name === 'TimeoutError') {
      throw error
    }
    const retry = fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return retry
  }
}

export async function createSnapTransaction(params: {
  orderId: string
  grossAmount: number
}): Promise<{ token: string }> {
  const url = `${getSnapBaseUrl(isProduction())}/snap/v1/transactions`
  try {
    const res = await midtransFetch(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: authHeader(),
        },
        body: JSON.stringify({
          transaction_details: {
            order_id: params.orderId,
            gross_amount: params.grossAmount,
          },
        }),
      },
      false,
    )
    if (!res.ok) return throwZonaError('ERR-020', `Snap create ${res.status}`)
    const parsed = snapTokenResponseSchema.parse(await res.json())
    return { token: parsed.token }
  } catch (error) {
    if (error instanceof z.ZodError || (error as { code?: string }).code === 'ERR-020') {
      throw error
    }
    return throwZonaError('ERR-020', 'Snap create network error')
  }
}

export async function getTransactionStatus(orderId: string): Promise<MidtransStatus> {
  const url = `${getApiBaseUrl(isProduction())}/v2/${encodeURIComponent(orderId)}/status`
  try {
    const res = await midtransFetch(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: authHeader(),
        },
      },
      true,
    )
    if (!res.ok) return throwZonaError('ERR-020', `Get status ${res.status}`)
    return midtransStatusSchema.parse(await res.json())
  } catch (error) {
    if (error instanceof z.ZodError) return throwZonaError('ERR-020', 'Malformed status payload')
    if ((error as { code?: string }).code === 'ERR-020') throw error
    return throwZonaError('ERR-020', 'Get status network error')
  }
}
```

Note: the network-error retry path in `midtransFetch` above retries both create and status on network failure, and additionally retries status on 5xx (the thrown sentinel). If a test for "no 5xx retry on create" is desired, add it to the test file; the contract above (create: network-only retry, status: network+5xx retry) is what Task 4's tests assert.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun x vitest run tests/unit/midtrans-client.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Verify env loads with the user's existing keys**

Run: `bun -e "import('./src/lib/env.server.ts').then(() => console.log('env ok'))"`
Expected: `env ok` (`.env` already contains the three MIDTRANS vars).

- [ ] **Step 7: Commit**

```bash
git add src/lib/env.server.ts .env.example src/lib/midtrans/client.ts tests/unit/midtrans-client.test.ts
git commit -m "feat(payments): add server-only Midtrans Snap adapter with sandbox/production switch"
```

---

### Task 5: Idempotent settlement core (real PG)

**Files:**
- Create: `src/server/core/payments.ts` (settlement primitive only in this task)
- Test: `tests/integration/payment-settlement.test.ts`

**Interfaces:**
- Produces: `settlePaymentIfPending(params: { orderId: string; midtransTransactionId?: string; paymentType?: string; settledAt: Date }): Promise<{ creditsGranted: number; balanceAfter: number } | null>`
  - Conditional UPDATE `payments SET status='paid', settledAt, midtransTransactionId, paymentType WHERE order_id = ? AND status IN ('creating','pending') RETURNING *`.
  - 0 rows → return `null` (already settled / terminal; credits untouched).
  - 1 row → `UPDATE users SET credits = credits + creditsGranted RETURNING credits`, then INSERT `credit_transactions` `{ userId, amount: +creditsGranted, type: 'purchase', balanceAfter, description: 'Purchase {planId} {billingPeriod}' }` (generationRunId/modelId omitted — nullable), return `{ creditsGranted, balanceAfter }`.

- [ ] **Step 1: Write failing integration test**

Follow the `tests/integration/db.test.ts` ownership pattern (direct PG setup, cleanup first):

```typescript
/**
 * @vitest-environment node
 */
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/index'
import { creditTransactions, payments, users } from '../../src/lib/db/schema'
import { settlePaymentIfPending } from '../../src/server/core/payments'

const USER_ID = 'settle-user-a'

async function getBalance(userId: string): Promise<number> {
  const res = await db.execute(
    sql`SELECT credits FROM users WHERE id=${userId}`,
  )
  const rows = Array.isArray(res)
    ? (res as Array<{ credits: number }>)
    : (res as { rows: Array<{ credits: number }> }).rows
  return rows[0]?.credits ?? 0
}

describe('settlePaymentIfPending', () => {
  beforeEach(async () => {
    await db.delete(users).where(eq(users.id, USER_ID))
    await db.insert(users).values({ id: USER_ID, email: 'settle-a@test.com', name: 'A', credits: 100 })
  })

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, USER_ID))
  })

  async function insertPendingPayment(orderId: string, credits: number, status: string) {
    await db.insert(payments).values({
      userId: USER_ID,
      planId: 'pro',
      billingPeriod: 'monthly',
      amountIdr: 49000,
      creditsGranted: credits,
      status,
      orderId,
    })
  }

  it('grants credits exactly once and records a purchase transaction', async () => {
    await insertPendingPayment('zona-pro-settle-1', 2000, 'pending')
    const first = await settlePaymentIfPending({
      orderId: 'zona-pro-settle-1',
      midtransTransactionId: 'tx-1',
      paymentType: 'qris',
      settledAt: new Date(),
    })
    expect(first).toEqual({ creditsGranted: 2000, balanceAfter: 2100 })
    expect(await getBalance(USER_ID)).toBe(2100)

    const second = await settlePaymentIfPending({
      orderId: 'zona-pro-settle-1',
      settledAt: new Date(),
    })
    expect(second).toBeNull()
    expect(await getBalance(USER_ID)).toBe(2100)

    const txs = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, USER_ID))
    expect(txs).toHaveLength(1)
    expect(txs[0]?.type).toBe('purchase')
    expect(txs[0]?.amount).toBe(2000)
    expect(txs[0]?.balanceAfter).toBe(2100)
  })

  it('never settles a terminal payment row', async () => {
    await insertPendingPayment('zona-pro-settle-2', 2000, 'failed')
    const result = await settlePaymentIfPending({ orderId: 'zona-pro-settle-2', settledAt: new Date() })
    expect(result).toBeNull()
    expect(await getBalance(USER_ID)).toBe(100)
  })

  it('settles rows stuck in creating', async () => {
    await insertPendingPayment('zona-pro-settle-3', 2000, 'creating')
    const result = await settlePaymentIfPending({ orderId: 'zona-pro-settle-3', settledAt: new Date() })
    expect(result).toEqual({ creditsGranted: 2000, balanceAfter: 2100 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/payment-settlement.test.ts --reporter=dot`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement the settlement primitive**

Create `src/server/core/payments.ts`:

```typescript
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../lib/db/index'
import { creditTransactions, payments } from '../../lib/db/schema'

type SettleRow = typeof payments.$inferSelect

async function grantCredits(row: SettleRow): Promise<number> {
  const res = await db.execute(
    sql`UPDATE users SET credits = credits + ${row.creditsGranted} WHERE id = ${row.userId} RETURNING credits`,
  )
  const rows = Array.isArray(res)
    ? (res as Array<{ credits: number }>)
    : (res as { rows: Array<{ credits: number }> }).rows
  const balanceAfter = rows[0]?.credits ?? 0
  await db.insert(creditTransactions).values({
    userId: row.userId,
    amount: row.creditsGranted,
    type: 'purchase',
    balanceAfter,
    description: `Purchase ${row.planId} ${row.billingPeriod}`,
  })
  return balanceAfter
}

export async function settlePaymentIfPending(params: {
  orderId: string
  midtransTransactionId?: string
  paymentType?: string
  settledAt: Date
}): Promise<{ creditsGranted: number; balanceAfter: number } | null> {
  const updated = await db
    .update(payments)
    .set({
      status: 'paid',
      settledAt: params.settledAt,
      midtransTransactionId: params.midtransTransactionId,
      paymentType: params.paymentType,
    })
    .where(
      and(
        eq(payments.orderId, params.orderId),
        inArray(payments.status, ['creating', 'pending']),
      ),
    )
    .returning()
  if (updated.length === 0) return null
  const balanceAfter = await grantCredits(updated[0] as SettleRow)
  return { creditsGranted: (updated[0] as SettleRow).creditsGranted, balanceAfter }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/payment-settlement.test.ts --reporter=dot`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/core/payments.ts tests/integration/payment-settlement.test.ts
git commit -m "feat(payments): add idempotent credit settlement guarded by payment status"
```

---

### Task 6: Payments orchestration core + server functions + error codes

**Files:**
- Modify: `src/lib/utils/errors.ts` (add ERR-020, ERR-021)
- Modify: `src/server/core/payments.ts` (orchestration)
- Create: `src/server/functions/payments.ts`
- Test: `tests/integration/payments-core.test.ts`

**Interfaces:**
- Error codes (exact messages copied here):
  - `'ERR-020'`: message `'Payment service is temporarily unavailable. Please try again.'`, status 502, retryable true, action `'retry'`
  - `'ERR-021'`: message `'Payment verification failed. Please contact support if credits are missing.'`, status 500, retryable false
- Core (all take `{ request: Request }` and authenticate via `getAuthSession`; inputs parsed with Zod inside the core — the server function layer stays a thin RPC wrapper like `src/server/functions/credits.ts`):
  - `createPaymentCore({ request, data: { planId: string; billingPeriod: string } }): Promise<{ orderId: string; snapToken: string; clientKey: string; isProduction: boolean; amountIdr: number; creditsGranted: number }>`
    - `enforceRateLimit({ key: \`payment:create:${session.user.id}\`, limit: RATE_LIMIT_PAYMENT_PER_MINUTE, windowMs: RATE_LIMIT_WINDOW_MS })`
    - Zod: `z.object({ planId: z.string(), billingPeriod: z.string() })` then `isPurchasablePlan` / `isBillingPeriod` guards → `throwZonaError('ERR-022', 'Invalid plan or billing period')` on failure (400).
    - INSERT `payments` status `'creating'` with resolved purchase → `createSnapTransaction` → UPDATE to `'pending'` + snapToken. Provider throw → UPDATE the same row to `'failed'` (guarded `WHERE status='creating'`), then rethrow (adapter already throws ERR-020).
  - `getPaymentStatusCore({ request, data: { orderId: string } }): Promise<{ status: string; creditsGranted?: number; balanceAfter?: number; paymentType?: string }>`
    - `enforceRateLimit({ key: \`payment:status:${session.user.id}\`, limit: RATE_LIMIT_PAYMENT_STATUS_PER_MINUTE, windowMs: RATE_LIMIT_WINDOW_MS })`
    - Ownership: SELECT payment by orderId; `!row || row.userId !== session.user.id` → `new AppError('Payment not found', 404)` (never leak other users' order ids).
    - Terminal row (paid/failed/cancelled/expired) → return current state unchanged.
    - Non-terminal → `getTransactionStatus(orderId)`; adapter/network throw or Zod failure → return row unchanged (fail-safe, no settle on unverifiable data — NOT ERR-021).
    - Signature: `verifyStatusSignature` with raw `gross_amount` → mismatch → `throwZonaError('ERR-021')` (fail loud).
    - `mapMidtransStatus` throw (refund/unknown) → return row unchanged.
    - Mapped `paid`: only when `fraud_status` is absent or `'accept'` → `settlePaymentIfPending`; if it returned a settlement, respond `{ status: 'paid', creditsGranted, balanceAfter, paymentType }`; fraud-deny → return row unchanged.
    - Mapped non-paid → monotonic UPDATE `SET status = mapped WHERE order_id = ? AND status IN ('creating','pending')`, return the mapped status.
  - `reconcilePendingPaymentsCore({ request }): Promise<{ reconciled: number }>`
    - SELECT user's `pending` payments ORDER BY `created_at DESC` LIMIT `PAYMENT_RECONCILE_MAX_ROWS`; per row run the same status logic as `getPaymentStatusCore` (extract a shared private `applyMidtransStatus(row)` helper); wrap each row in try/catch so one bad row never fails the rest; return `{ reconciled: <count of rows that transitioned to a terminal or updated state> }`.
  - `getPricingSummaryCore({ request }): Promise<{ balance: number; activePlanId: 'free' | PurchasablePlanId }>`
    - Runs `reconcilePendingPaymentsCore` first, then reads balance via `getCreditBalance`, and derives `activePlanId` as the `planId` of the user's most recent `paid` payment (`ORDER BY settled_at DESC LIMIT 1`), `'free'` when none.
- Server function wrappers (`src/server/functions/payments.ts`, pattern of `credits.ts`):
  - `createPaymentFn = createServerFn({ method: 'POST' }).handler(...)` → `createPaymentCore({ request: getRequest() as Request, data })`
  - `getPaymentStatusFn = createServerFn({ method: 'GET' })` → `getPaymentStatusCore` (data via `{ data: { orderId } }` argument)
  - `getPricingSummaryFn = createServerFn({ method: 'GET' })` → `getPricingSummaryCore`
  - `reconcilePendingPaymentsFn` is NOT exposed as an RPC (loader-internal via `getPricingSummaryFn`).

- [ ] **Step 1: Add ERR-020/ERR-021/ERR-022 to the error taxonomy**

In `src/lib/utils/errors.ts` `ZONA_ERROR_MAP`, after `'ERR-019'`:

```typescript
  'ERR-020': {
    message: 'Payment service is temporarily unavailable. Please try again.',
    status: 502,
    retryable: true,
    action: 'retry',
  },
  'ERR-021': {
    message: 'Payment verification failed. Please contact support if credits are missing.',
    status: 500,
    retryable: false,
  },
  'ERR-022': {
    message: 'Invalid payment request.',
    status: 400,
    retryable: false,
  },
```

Use `throwZonaError('ERR-022')` for invalid plan/billing/not-found in the core (it throws `ZonaApiError` carrying status 400/404 semantics via the map entry; `getPaymentStatusCore`'s ownership check throws `throwZonaError('ERR-022', 'Payment not found')`).

- [ ] **Step 2: Write failing integration tests**

Mock the adapter and the session (follow `vi.hoisted` holder pattern; adapter path from the test file is `../../src/lib/midtrans/client`):

```typescript
/**
 * @vitest-environment node
 */
import { eq } from 'drizzle-orm'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userId: 'pay-user-a',
  createSnapTransaction: vi.fn(),
  getTransactionStatus: vi.fn(),
}))

vi.mock('../../src/lib/midtrans/client', () => ({
  createSnapTransaction: mocks.createSnapTransaction,
  getTransactionStatus: mocks.getTransactionStatus,
}))

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async () => ({ user: { id: mocks.userId } })),
}))

import { AppError } from '../../src/lib/utils/errors'
import { resetRateLimitForTest } from '../../src/lib/security/rate-limit'
import { db } from '../../src/lib/db/index'
import { payments, users } from '../../src/lib/db/schema'
import {
  createPaymentCore,
  getPaymentStatusCore,
  getPricingSummaryCore,
} from '../../src/server/core/payments'

const REQUEST = new Request('http://localhost:3000/pricing')

async function insertUser() {
  await db.delete(users).where(eq(users.id, mocks.userId))
  await db.insert(users).values({ id: mocks.userId, email: 'pay-a@test.com', name: 'A', credits: 100 })
}

beforeEach(async () => {
  resetRateLimitForTest()
  mocks.createSnapTransaction.mockReset()
  mocks.getTransactionStatus.mockReset()
  await insertUser()
})

afterEach(async () => {
  await db.delete(users).where(eq(users.id, mocks.userId))
})

describe('createPaymentCore', () => {
  it('creates a creating row, gets a token, transitions to pending', async () => {
    mocks.createSnapTransaction.mockResolvedValue({ token: 'snap-tok-1' })
    const result = await createPaymentCore({
      request: REQUEST,
      data: { planId: 'pro', billingPeriod: 'monthly' },
    })
    expect(result.snapToken).toBe('snap-tok-1')
    expect(result.amountIdr).toBe(49000)
    expect(result.creditsGranted).toBe(2000)
    expect(typeof result.clientKey).toBe('string')
    expect(result.orderId).toMatch(/^zona-pro-/)

    const rows = await db.select().from(payments).where(eq(payments.orderId, result.orderId))
    expect(rows[0]?.status).toBe('pending')
    expect(rows[0]?.snapToken).toBe('snap-tok-1')
    expect(rows[0]?.userId).toBe(mocks.userId)
  })

  it('marks the row failed and rethrows ERR-020 when the provider errors', async () => {
    mocks.createSnapTransaction.mockRejectedValue(
      Object.assign(new Error('ERR-020'), { code: 'ERR-020' }),
    )
    await expect(
      createPaymentCore({
        request: REQUEST,
        data: { planId: 'ultra', billingPeriod: 'yearly' },
      }),
    ).rejects.toMatchObject({ code: 'ERR-020' })

    const rows = await db.select().from(payments).where(eq(payments.planId, 'ultra'))
    const failed = rows.filter((r) => r.status === 'failed')
    expect(failed.length).toBeGreaterThanOrEqual(1)
    expect(failed[0]?.snapToken).toBeNull()
  })

  it('rejects free plan and invalid billing period with 400', async () => {
    await expect(
      createPaymentCore({ request: REQUEST, data: { planId: 'free', billingPeriod: 'monthly' } }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      createPaymentCore({ request: REQUEST, data: { planId: 'pro', billingPeriod: 'weekly' } }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('getPaymentStatusCore', () => {
  async function insertRow(orderId: string, status: string) {
    await db.insert(payments).values({
      userId: mocks.userId,
      planId: 'pro',
      billingPeriod: 'monthly',
      amountIdr: 49000,
      creditsGranted: 2000,
      status,
      orderId,
    })
  }

  function statusPayload(orderId: string, transaction_status: string, fraud?: string) {
    return {
      order_id: orderId,
      status_code: '200',
      gross_amount: '49000.00',
      transaction_status,
      signature_key: 'b'.repeat(128),
      transaction_id: 'tx-9',
      payment_type: 'qris',
      ...(fraud ? { fraud_status: fraud } : {}),
    }
  }

  it('returns terminal rows without contacting the provider', async () => {
    await insertRow('zona-pro-term-1', 'paid')
    const result = await getPaymentStatusCore({ request: REQUEST, data: { orderId: 'zona-pro-term-1' } })
    expect(result.status).toBe('paid')
    expect(mocks.getTransactionStatus).not.toHaveBeenCalled()
  })

  it('settles pending to paid when provider says settlement with a valid signature', async () => {
    const { createHash } = await import('node:crypto')
    const serverKey = (await import('../../src/lib/env.server')).env.MIDTRANS_SERVER_KEY
    const orderId = 'zona-pro-poll-1'
    await insertRow(orderId, 'pending')
    const signature = createHash('sha512')
      .update(orderId + '200' + '49000.00' + serverKey)
      .digest('hex')
    mocks.getTransactionStatus.mockResolvedValue(
      statusPayload(orderId, 'settlement'),
    )
    mocks.getTransactionStatus.mockImplementation(async () => ({
      ...statusPayload(orderId, 'settlement'),
      signature_key: signature,
    }))

    const result = await getPaymentStatusCore({ request: REQUEST, data: { orderId } })
    expect(result.status).toBe('paid')
    expect(result.creditsGranted).toBe(2000)
    expect(result.balanceAfter).toBe(2100)
    expect(result.paymentType).toBe('qris')
  })

  it('throws ERR-021 and never settles on an invalid signature', async () => {
    const orderId = 'zona-pro-poll-2'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockResolvedValue(statusPayload(orderId, 'settlement'))
    await expect(
      getPaymentStatusCore({ request: REQUEST, data: { orderId } }),
    ).rejects.toMatchObject({ code: 'ERR-021' })
    const rows = await db.select().from(payments).where(eq(payments.orderId, orderId))
    expect(rows[0]?.status).toBe('pending')
  })

  it('keeps the row pending on provider failure', async () => {
    const orderId = 'zona-pro-poll-3'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockRejectedValue(
      Object.assign(new Error('ERR-020'), { code: 'ERR-020' }),
    )
    const result = await getPaymentStatusCore({ request: REQUEST, data: { orderId } })
    expect(result.status).toBe('pending')
  })

  it('transitions pending to expired on expire status with valid signature', async () => {
    const { createHash } = await import('node:crypto')
    const serverKey = (await import('../../src/lib/env.server')).env.MIDTRANS_SERVER_KEY
    const orderId = 'zona-pro-poll-4'
    await insertRow(orderId, 'pending')
    const signature = createHash('sha512')
      .update(orderId + '200' + '49000.00' + serverKey)
      .digest('hex')
    mocks.getTransactionStatus.mockImplementation(async () => ({
      ...statusPayload(orderId, 'expire'),
      signature_key: signature,
    }))
    const result = await getPaymentStatusCore({ request: REQUEST, data: { orderId } })
    expect(result.status).toBe('expired')
    const rows = await db.select().from(payments).where(eq(payments.orderId, orderId))
    expect(rows[0]?.status).toBe('expired')
  })

  it('blocks other users from polling an order (404)', async () => {
    const orderId = 'zona-pro-own-1'
    await insertRow(orderId, 'pending')
    mocks.userId = 'pay-user-b'
    await insertUser()
    await expect(
      getPaymentStatusCore({ request: REQUEST, data: { orderId } }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('getPricingSummaryCore', () => {
  it('returns free when no paid purchases exist and reconciles pending rows', async () => {
    mocks.getTransactionStatus.mockResolvedValue(
      Object.assign(new Error('offline'), {}),
    )
    mocks.getTransactionStatus.mockRejectedValue(
      Object.assign(new Error('ERR-020'), { code: 'ERR-020' }),
    )
    const summary = await getPricingSummaryCore({ request: REQUEST })
    expect(summary).toEqual({ balance: 100, activePlanId: 'free' })
  })

  it('derives activePlanId from the latest paid payment', async () => {
    const paidAt = new Date()
    await db.insert(payments).values({
      userId: mocks.userId,
      planId: 'ultra',
      billingPeriod: 'monthly',
      amountIdr: 149000,
      creditsGranted: 10000,
      status: 'paid',
      orderId: 'zona-ultra-badge-1',
      settledAt: paidAt,
    })
    const summary = await getPricingSummaryCore({ request: REQUEST })
    expect(summary.activePlanId).toBe('ultra')
    expect(summary.balance).toBe(100)
  })
})
```

Notes for the executor:
- `mocks.userId` is reassigned for the ownership test — reset it in `beforeEach` (`mocks.userId = 'pay-user-a'`) so test order does not leak state.
- The `getPricingSummaryCore` free-case test mocks the provider to fail so reconciliation is exercised but leaves the row pending; the assertion is only the returned summary shape.
- If Biome complains about the dynamic `import()` of `env.server` inside tests, hoist it to a top-level static import instead (it is safe: vitest loads `.env` via dotenv in `vitest.config.ts`).

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun x vitest run tests/integration/payments-core.test.ts --reporter=dot`
Expected: FAIL — ERR-020/ERR-021 unknown codes and missing core exports.

- [ ] **Step 4: Implement orchestration in `src/server/core/payments.ts`**

Extend the file from Task 5 (settlement primitive stays). Exact behavior is specified in **Interfaces** above. Implementation sketch (type-safe; no casts beyond the established `getRequest() as Request` wrapper pattern):

```typescript
import { z } from 'zod'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../lib/db/index'
import { payments } from '../../lib/db/schema'
import { getAuthSession } from '../../lib/auth/session'
import { env } from '../../lib/env.server'
import { getCreditBalance } from '../../lib/ai/credits'
import { enforceRateLimit } from '../../lib/security/rate-limit'
import {
  RATE_LIMIT_PAYMENT_PER_MINUTE,
  RATE_LIMIT_PAYMENT_STATUS_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
  PAYMENT_RECONCILE_MAX_ROWS,
} from '../../lib/utils/constants'
import { throwZonaError, ZonaApiError } from '../../lib/utils/errors'
import { isBillingPeriod, isPurchasablePlan, resolvePurchase } from '../../lib/pricing/plans'
import { generateOrderId } from '../../lib/midtrans/order-id'
import { createSnapTransaction, getTransactionStatus } from '../../lib/midtrans/client'
import {
  mapMidtransStatus,
  type InternalPaymentStatus,
} from '../../lib/midtrans/status-schema'
import { verifyStatusSignature } from '../../lib/midtrans/signature'

const createPaymentInput = z.object({ planId: z.string(), billingPeriod: z.string() })
const paymentStatusInput = z.object({ orderId: z.string().min(1) })

const TERMINAL_STATUSES: readonly string[] = ['paid', 'failed', 'cancelled', 'expired']

type PaymentRow = typeof payments.$inferSelect
```

Type note: the `payments.status` column is plain `text`, so `row.status` is `string` throughout the core — comparisons and returns use plain strings; `mapMidtransStatus` returns the narrowed `InternalPaymentStatus` union only where the mapping happens (the monotonic UPDATE). No casts needed anywhere in this file beyond the established `getRequest() as Request` RPC wrapper pattern.

`createPaymentCore`:

```typescript
export async function createPaymentCore(params: {
  request: Request
  data: { planId: string; billingPeriod: string }
}) {
  const session = await getAuthSession(params.request)
  enforceRateLimit({
    key: `payment:create:${session.user.id}`,
    limit: RATE_LIMIT_PAYMENT_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })
  const input = createPaymentInput.parse(params.data)
  if (!isPurchasablePlan(input.planId) || !isBillingPeriod(input.billingPeriod)) {
    throwZonaError('ERR-022', 'Invalid plan or billing period')
  }
  const resolved = resolvePurchase(input.planId, input.billingPeriod)
  const orderId = generateOrderId(input.planId)
  const inserted = await db
    .insert(payments)
    .values({
      userId: session.user.id,
      planId: resolved.planId,
      billingPeriod: resolved.billingPeriod,
      amountIdr: resolved.amountIdr,
      creditsGranted: resolved.creditsGranted,
      status: 'creating',
      orderId,
    })
    .returning()
  const row = inserted[0]
  try {
    const snap = await createSnapTransaction({ orderId, grossAmount: resolved.amountIdr })
    await db
      .update(payments)
      .set({ status: 'pending', snapToken: snap.token })
      .where(eq(payments.id, row.id))
    return {
      orderId,
      snapToken: snap.token,
      clientKey: env.MIDTRANS_CLIENT_KEY,
      isProduction: env.MIDTRANS_IS_PRODUCTION === 'true',
      amountIdr: resolved.amountIdr,
      creditsGranted: resolved.creditsGranted,
    }
  } catch (error) {
    await db
      .update(payments)
      .set({ status: 'failed' })
      .where(and(eq(payments.id, row.id), eq(payments.status, 'creating')))
    throw error
  }
}
```

(TS narrows `input.planId` to `PurchasablePlanId` after the `isPurchasablePlan` type guard, so `resolvePurchase` type-checks without casts; `row` is the Drizzle returning element, already `$inferSelect`-typed.)

`applyMidtransStatus` (shared by status + reconcile; consumes the already-parsed `MidtransStatus` returned by `getTransactionStatus` — no re-parse):

```typescript
async function loadRow(orderId: string): Promise<PaymentRow | undefined> {
  const rows = await db.select().from(payments).where(eq(payments.orderId, orderId))
  return rows[0]
}

async function applyMidtransStatus(row: PaymentRow): Promise<{
  row: PaymentRow
  settlement: { creditsGranted: number; balanceAfter: number } | null
}> {
  const status = await getTransactionStatus(row.orderId)
  const signatureValid = await verifyStatusSignature({
    orderId: status.order_id,
    statusCode: status.status_code,
    grossAmountRaw: status.gross_amount,
    serverKey: env.MIDTRANS_SERVER_KEY,
    signatureKey: status.signature_key,
  })
  if (!signatureValid) throwZonaError('ERR-021')
  let mapped: InternalPaymentStatus
  try {
    mapped = mapMidtransStatus(status)
  } catch {
    return { row, settlement: null }
  }
  if (mapped === 'paid') {
    if (status.fraud_status && status.fraud_status !== 'accept') {
      return { row, settlement: null }
    }
    const settledAt = status.settlement_time
      ? new Date(`${status.settlement_time.replace(' ', 'T')}+07:00`)
      : new Date()
    const settlement = await settlePaymentIfPending({
      orderId: row.orderId,
      midtransTransactionId: status.transaction_id,
      paymentType: status.payment_type,
      settledAt,
    })
    const fresh = (await loadRow(row.orderId)) ?? row
    return { row: fresh, settlement }
  }
  const updated = await db
    .update(payments)
    .set({ status: mapped })
    .where(and(eq(payments.orderId, row.orderId), eq(payments.status, 'pending')))
    .returning()
  return { row: updated[0] ?? row, settlement: null }
}
```

`getPaymentStatusCore`:

```typescript
export async function getPaymentStatusCore(params: {
  request: Request
  data: { orderId: string }
}): Promise<{
  status: string
  creditsGranted?: number
  balanceAfter?: number
  paymentType?: string
}> {
  const session = await getAuthSession(params.request)
  enforceRateLimit({
    key: `payment:status:${session.user.id}`,
    limit: RATE_LIMIT_PAYMENT_STATUS_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })
  const input = paymentStatusInput.parse(params.data)
  const row = await loadRow(input.orderId)
  if (!row || row.userId !== session.user.id) {
    throw new AppError('Payment not found', 404, 'ERR-022')
  }
  if (TERMINAL_STATUSES.includes(row.status)) {
    return { status: row.status }
  }
  try {
    const applied = await applyMidtransStatus(row)
    if (applied.settlement) {
      return {
        status: 'paid',
        creditsGranted: applied.settlement.creditsGranted,
        balanceAfter: applied.settlement.balanceAfter,
        paymentType: applied.row.paymentType ?? undefined,
      }
    }
    return { status: applied.row.status }
  } catch (error) {
    if (error instanceof ZonaApiError) throw error
    return { status: row.status }
  }
}
```

(`TERMINAL_STATUSES` is declared as `const TERMINAL_STATUSES: readonly string[] = [...]` so `.includes(row.status)` type-checks without a cast; the catch rethrows any `ZonaApiError` — including ERR-021 signature failures — and only network/adapter failures fall back to the row's current status. Import `ZonaApiError` from `../../lib/utils/errors`.)

`reconcilePendingPaymentsCore` and `getPricingSummaryCore`:

```typescript
export async function reconcilePendingPaymentsCore(params: { request: Request }) {
  const session = await getAuthSession(params.request)
  const pending = await db
    .select()
    .from(payments)
    .where(and(eq(payments.userId, session.user.id), eq(payments.status, 'pending')))
    .orderBy(desc(payments.createdAt))
    .limit(PAYMENT_RECONCILE_MAX_ROWS)
  let reconciled = 0
  for (const row of pending) {
    try {
      const before = row.status
      const applied = await applyMidtransStatus(row)
      if (applied.row.status !== before) reconciled += 1
    } catch {
      // isolated: one bad row must not fail the rest
    }
  }
  return { reconciled }
}

export async function getPricingSummaryCore(params: { request: Request }) {
  const session = await getAuthSession(params.request)
  await reconcilePendingPaymentsCore(params)
  const balance = await getCreditBalance(session.user.id)
  const paid = await db
    .select({ planId: payments.planId })
    .from(payments)
    .where(and(eq(payments.userId, session.user.id), eq(payments.status, 'paid')))
    .orderBy(desc(payments.settledAt))
    .limit(1)
  const activePlanId = isPurchasablePlan(paid[0]?.planId ?? '') ? paid[0].planId : 'free'
  return { balance, activePlanId }
}
```

(The `isPurchasablePlan` guard narrows the union to `'free' | 'pro' | 'ultra'` without a cast.)

- [ ] **Step 5: Create the RPC wrappers `src/server/functions/payments.ts`**

```typescript
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  createPaymentCore,
  getPaymentStatusCore,
  getPricingSummaryCore,
} from '../core/payments'

export const createPaymentFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: { planId: string; billingPeriod: string } }) => {
    const request = getRequest() as Request
    return createPaymentCore({ request, data })
  },
)

export const getPaymentStatusFn = createServerFn({ method: 'GET' }).handler(
  async ({ data }: { data: { orderId: string } }) => {
    const request = getRequest() as Request
    return getPaymentStatusCore({ request, data })
  },
)

export const getPricingSummaryFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const request = getRequest() as Request
    return getPricingSummaryCore({ request })
  },
)
```

(If the existing wrappers in this repo use a different `data` convention, match `src/server/functions/chat.ts` instead — read it first and stay consistent.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun x vitest run tests/integration/payments-core.test.ts tests/integration/payment-settlement.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 7: Gate + commit**

Run: `bun x tsc --noEmit` → 0 errors. Run: `bun x biome check ./src` → clean.

```bash
git add src/lib/utils/errors.ts src/lib/db/schema.ts src/server/core/payments.ts src/server/functions/payments.ts tests/integration/payments-core.test.ts
git commit -m "feat(payments): add payment orchestration core, RPC wrappers, and ERR-020/021/022"
```

---

### Task 7: Pricing loader + PricingSection wiring + snap client (frontend)

**Files:**
- Create: `src/lib/midtrans/snap-client.ts` (client-safe)
- Modify: `src/routes/pricing.tsx` (loader + pass summary)
- Modify: `src/components/pricing/PricingSection.tsx` (purchase flow)
- Test: `tests/unit/snap-client.test.ts`

**Interfaces:**
- `src/lib/midtrans/snap-client.ts`:
  - `export interface SnapCallbacks { onSuccess?: (result: unknown) => void; onPending?: (result: unknown) => void; onError?: (result: unknown) => void; onClose?: () => void }`
  - `export interface SnapApi { pay: (token: string, callbacks?: SnapCallbacks) => void; hide?: () => void }`
  - `export function getSnapJsUrl(isProduction: boolean): string` — sandbox `https://app.sandbox.midtrans.com/snap/snap.js`, production `https://app.midtrans.com/snap/snap.js`
  - `export function loadSnapJs(clientKey: string, isProduction: boolean): Promise<SnapApi>` — injects `<script src=… data-client-key=…>` exactly once (module-level in-flight promise + resolved check via `window.snap`), resolves `window.snap`, rejects `'SNAP_SCRIPT_FAILED'` on error. Client-safe: no `env.server` import.
- `PricingSection.tsx` behavior (all real signals, no fabricated progress):
  - Props: `activePlanId: 'free' | PurchasablePlanId`, `isAuthenticated: boolean`.
  - Remove `current` usage from `plans.ts` — card is "current" when `plan.id === activePlanId` (this replaces the hardcoded `current: true` on the Free card; delete the `current?: boolean` field and its data from `plans.ts` and all references).
  - Purchase mutation (`useMutation`): `createPaymentFn({ data: { planId, billingPeriod } })`.
  - Flow per purchasable card button click:
    1. `!isAuthenticated` → `router.navigate({ to: '/auth/sign-in' })` (mechanical guest guard).
    2. `createPaymentFn` → `loadSnapJs(clientKey, isProduction)` → `window.snap.pay(snapToken, callbacks)`.
    3. EVERY callback (`onSuccess`, `onPending`, `onError`, `onClose`) triggers the same `checkStatus(orderId)` — never trusting the callback payload.
    4. `checkStatus` polls `getPaymentStatusFn({ data: { orderId } })` up to `PAYMENT_POLL_MAX_ATTEMPTS` with `PAYMENT_POLL_INTERVAL_MS` delay while status is `'pending'`; on `'paid'` → `router.invalidate()` (refreshes credit widget + summary loaders) and shows paid state; on `'failed'`/`'expired'`/`'cancelled'` → error state with a retry button; poll exhaustion → pending state.
  - Per-plan UI states keyed by `orderId`: `'idle' | 'creating' | 'awaiting' | 'paid' | 'pending' | 'failed'` — button shows a spinner only during `creating`/`awaiting` (real in-flight states).
  - `data-testid`s (mechanical, for E2E/unit): `plan-card-{id}`, `plan-button-{id}`, `payment-status-paid`, `payment-status-pending`, `payment-status-failed`.
  - The yearly/bulanan switch stays as-is; billing period is whatever the switch currently shows at click time.
- `pricing.tsx` loader: when session exists → `const summary = await getPricingSummaryFn()` and render `<PricingSection activePlanId={summary.activePlanId} isAuthenticated />`; guests get `activePlanId='free'`, `isAuthenticated={false}`. Keep the existing session hydration logic untouched.

- [ ] **Step 1: Write failing snap-client tests (jsdom default env)**

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSnapJsUrl, loadSnapJs } from '../../src/lib/midtrans/snap-client'

describe('getSnapJsUrl', () => {
  it('returns sandbox and production script urls', () => {
    expect(getSnapJsUrl(false)).toBe('https://app.sandbox.midtrans.com/snap/snap.js')
    expect(getSnapJsUrl(true)).toBe('https://app.midtrans.com/snap/snap.js')
  })
})

describe('loadSnapJs', () => {
  afterEach(() => {
    document.querySelectorAll('script[data-zona-snap]').forEach((el) => el.remove())
    vi.resetModules()
    delete window.snap
  })

  it('injects exactly one snap script and resolves window.snap on load', async () => {
    const { loadSnapJs: fresh } = await import('../../src/lib/midtrans/snap-client')
    const promise = fresh('ck-1', false)
    const scripts = document.querySelectorAll('script[data-zona-snap]')
    expect(scripts).toHaveLength(1)
    const el = scripts[0] as HTMLScriptElement
    expect(el.src).toBe(getSnapJsUrl(false))
    expect(el.dataset.clientKey).toBe('ck-1')
    window.snap = { pay: () => undefined }
    el.onload?.(new Event('load'))
    const api = await promise
    expect(typeof api.pay).toBe('function')
  })

  it('resolves immediately when snap is already loaded', async () => {
    window.snap = { pay: () => undefined }
    const { loadSnapJs: fresh } = await import('../../src/lib/midtrans/snap-client')
    const api = await fresh('ck-2', true)
    expect(typeof api.pay).toBe('function')
    expect(document.querySelectorAll('script[data-zona-snap]')).toHaveLength(0)
  })
})
```

(The `window.snap` assignments type-check against the `SnapApi` global declaration exported by `snap-client.ts` — zero casts, consistent with the no-type-bypass rule.)

Note the `data-zona-snap` marker attribute — add it in the implementation so tests can find the injected node without asserting unrelated markup.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun x vitest run tests/unit/snap-client.test.ts --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/midtrans/snap-client.ts`**

```typescript
export interface SnapCallbacks {
  onSuccess?: (result: unknown) => void
  onPending?: (result: unknown) => void
  onError?: (result: unknown) => void
  onClose?: () => void
}

export interface SnapApi {
  pay: (token: string, callbacks?: SnapCallbacks) => void
  hide?: () => void
}

declare global {
  interface Window {
    snap?: SnapApi
  }
}

const SNAP_JS_SANDBOX_URL = 'https://app.sandbox.midtrans.com/snap/snap.js'
const SNAP_JS_PRODUCTION_URL = 'https://app.midtrans.com/snap/snap.js'

export function getSnapJsUrl(isProduction: boolean): string {
  return isProduction ? SNAP_JS_PRODUCTION_URL : SNAP_JS_SANDBOX_URL
}

let pendingLoad: Promise<SnapApi> | null = null

export function loadSnapJs(clientKey: string, isProduction: boolean): Promise<SnapApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SNAP_REQUIRES_BROWSER'))
  if (window.snap) return Promise.resolve(window.snap)
  if (pendingLoad) return pendingLoad
  pendingLoad = new Promise<SnapApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = getSnapJsUrl(isProduction)
    script.dataset.clientKey = clientKey
    script.dataset.zonaSnap = 'true'
    script.onload = () => {
      if (window.snap) resolve(window.snap)
      else reject(new Error('SNAP_SCRIPT_LOADED_WITHOUT_API'))
    }
    script.onerror = () => {
      pendingLoad = null
      reject(new Error('SNAP_SCRIPT_FAILED'))
    }
    document.head.appendChild(script)
  })
  return pendingLoad
}
```

- [ ] **Step 4: Run snap-client tests to verify they pass**

Run: `bun x vitest run tests/unit/snap-client.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Wire the pricing loader**

In `src/routes/pricing.tsx`, extend the loader (keep existing session hydration untouched):

```typescript
loader: async () => {
  const session = await getOptionalSession()
  if (!session) return { session: null, summary: null }
  const summary = await getPricingSummaryFn()
  return { session, summary }
},
```

`PricingPage` renders:

```tsx
<PricingSection
  activePlanId={summary?.activePlanId ?? 'free'}
  isAuthenticated={Boolean(activeSession?.user)}
/>
```

- [ ] **Step 6: Wire PricingSection purchase flow**

Modifications to `src/components/pricing/PricingSection.tsx`:
- `PlanCard` props gain `isCurrent: boolean`, `purchaseState: PurchaseState`, `disabled: boolean`, `onPurchase: (billingPeriod: BillingPeriod) => void`; `plans.ts` loses `current?: boolean` (interface + free-plan data).
- Button text: `isCurrent ? 'Paket saat ini' : \`Pilih ${plan.name}\``; free card button always disabled.
- `PricingSection` owns a single `purchase` state:

```typescript
type PurchaseState = 'idle' | 'creating' | 'awaiting' | 'paid' | 'pending' | 'failed'

const [purchase, setPurchase] = useState<{
  planId: string
  state: PurchaseState
} | null>(null)
```

- `handlePurchase(planId)`:

```typescript
const router = useRouter()

async function pollPaymentStatus(orderId: string): Promise<'paid' | 'pending' | 'failed'> {
  for (let attempt = 0; attempt < PAYMENT_POLL_MAX_ATTEMPTS; attempt++) {
    const result = await getPaymentStatusFn({ data: { orderId } })
    if (result.status === 'paid') return 'paid'
    if (result.status === 'failed' || result.status === 'cancelled' || result.status === 'expired') {
      return 'failed'
    }
    await new Promise((resolve) => setTimeout(resolve, PAYMENT_POLL_INTERVAL_MS))
  }
  return 'pending'
}

async function checkStatus(orderId: string) {
  const result = await pollPaymentStatus(orderId)
  if (result === 'paid') {
    setPurchase({ planId: purchase?.planId ?? '', state: 'paid' })
    void router.invalidate()
  } else {
    setPurchase((prev) => (prev ? { ...prev, state: result } : prev))
  }
}

async function handlePurchase(planId: PurchasablePlanId, billingPeriod: BillingPeriod) {
  if (!isAuthenticated) {
    void router.navigate({ to: '/auth/sign-in' })
    return
  }
  setPurchase({ planId, state: 'creating' })
  try {
    const created = await createPaymentFn({ data: { planId, billingPeriod } })
    setPurchase({ planId, state: 'awaiting' })
    const snap = await loadSnapJs(created.clientKey, created.isProduction)
    snap.pay(created.snapToken, {
      onSuccess: () => void checkStatus(created.orderId),
      onPending: () => void checkStatus(created.orderId),
      onError: () => void checkStatus(created.orderId),
      onClose: () => void checkStatus(created.orderId),
    })
  } catch {
    setPurchase({ planId, state: 'failed' })
  }
}
```

- Status region under the active plan card (testid-driven; wording kept short and non-promotional):

```tsx
{purchase?.planId === plan.id && purchase.state === 'paid' && (
  <div data-testid="payment-status-paid">Kredit ditambahkan.</div>
)}
{purchase?.planId === plan.id && purchase.state === 'pending' && (
  <div data-testid="payment-status-pending">Menunggu pembayaran.</div>
)}
{purchase?.planId === plan.id && purchase.state === 'failed' && (
  <div data-testid="payment-status-failed">Pembayaran gagal.</div>
)}
```

- Styling: reuse existing card tokens (`text-[12px] text-graphite` for status, `border-hairline` for the region) — no new shadows/colors. Spinner = existing `Loader2`-style icon pattern used elsewhere in the app (check `Composer`/`Sidebar` for the exact icon import; do not invent a new spinner component).
- `createPaymentFn`, `getPaymentStatusFn` imports from `@/server/functions/payments`; `PAYMENT_POLL_*` from `@/lib/utils/constants`; `loadSnapJs` from `@/lib/midtrans/snap-client`; `PurchasablePlanId`/`BillingPeriod` from `@/lib/pricing/plans`.

- [ ] **Step 7: Verify in the running dev server (manual, sandbox)**

Run: `bun run dev` (if not already running) → open `http://localhost:3000/pricing`.
Expected: cards render; Free button disabled; guest click on Pro navigates to `/auth/sign-in`. (Authenticated sandbox smoke is Task 8 Step 4.)

- [ ] **Step 8: Full frontend gate + commit**

Run: `bun x tsc --noEmit` → 0 errors. Run: `bun x biome check ./src` → clean. Run: `bun x vitest run tests/unit/snap-client.test.ts tests/unit/payment-purchase.test.ts --reporter=dot` → PASS.

```bash
git add src/lib/midtrans/snap-client.ts src/routes/pricing.tsx src/components/pricing/PricingSection.tsx src/lib/pricing/plans.ts tests/unit/snap-client.test.ts
git commit -m "feat(pricing): wire Midtrans Snap purchase flow with polling status and active plan badge"
```

---

### Task 8: E2E guardrails + full verification

**Files:**
- Test: `tests/e2e/pricing-purchase.spec.ts`

**Scope note (deviation from spec §9, documented):** Playwright `page.route` intercepts BROWSER requests only. `createPayment`/`getTransactionStatus` run server-side, so a fully-mocked paid E2E journey is not possible without a fake Midtrans server. The paid/settle journey is covered by `tests/integration/payment-settlement.test.ts` + `tests/integration/payments-core.test.ts` (with signature verification). E2E therefore guards the guest-visible mechanics; the authenticated paid path is verified by the manual sandbox smoke in Step 4.

- [ ] **Step 1: Write the E2E test**

```typescript
import { expect, test } from '@playwright/test'

test.describe('pricing purchase (guest)', () => {
  test('renders all three plan cards', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByTestId('plan-card-free')).toBeVisible()
    await expect(page.getByTestId('plan-card-pro')).toBeVisible()
    await expect(page.getByTestId('plan-card-ultra')).toBeVisible()
    await expect(page.getByTestId('plan-button-free')).toBeDisabled()
  })

  test('guest purchase attempt redirects to sign-in', async ({ page }) => {
    await page.goto('/pricing')
    await page.getByTestId('plan-button-pro').click()
    await expect(page).toHaveURL(/\/auth\/sign-in/)
  })
})
```

Add `data-testid="plan-card-{id}"` on the card root and `data-testid="plan-button-{id}"` on the button in Task 7 (they are the mechanical contract here).

- [ ] **Step 2: Run E2E**

Run: `bun x playwright test tests/e2e/pricing-purchase.spec.ts --project=chromium`
Expected: PASS (dev server auto-starts or reuses the running one).

- [ ] **Step 3: Full gates**

Run: `bun x tsc --noEmit` → 0 errors
Run: `bun x biome check ./src` → clean
Run: `bun x vitest run --reporter=dot` → all unit + integration pass (pre-existing unrelated failures excluded per current baseline; payment tests must be green)
Run bypass scan: `rg -n "as never|as any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts'` → no output

```bash
git add tests/e2e/pricing-purchase.spec.ts
git commit -m "test(e2e): cover pricing purchase guest guardrails"
```

- [ ] **Step 4: Manual sandbox smoke (spec §10 — requires the dev server + logged-in account)**

1. Sign in, open `/pricing`, switch to Bulanan, click "Pilih Pro".
2. Snap popup opens (sandbox) → pay with the sandbox QRIS simulator (or card `4811 1111 1111 1114`, CVV `123`, OTP `112233`).
3. Expected: status becomes paid; credit widget +2000; Pro card shows current badge; `payments` row `paid` with `payment_type` + `settled_at`; one `credit_transactions` row `type='purchase'`.
4. Reload `/pricing` → no double credit (settle idempotency visible end-to-end).
5. Click "Pilih Ultra" with Tahunan switch on → +120000 credits on settle.
6. Close the Snap popup without paying → pending state appears; a later successful payment + page reload settles it via reconciliation.
7. Never commit `.env` values or sandbox outputs containing keys.

- [ ] **Step 5: Final handoff**

Confirm all gates green, then report: features shipped, tests added, remaining manual items (Step 4 checklist), and the production cutover note (set `MIDTRANS_IS_PRODUCTION=true` + production keys — no code change).
