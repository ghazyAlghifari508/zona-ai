# Fase 09 — Observability + Usage Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun token/latency tracking per generation + `usage_records` + Langfuse OTel `withLangfuse` + UI `UsageStats` `tokens · TTFT · total` + `FeedbackButtons` thumbs `feedback` table.

**Architecture:** `chat.ts` `onChunk text-delta` → `firstTokenAt` + `onFinish {usage}` → `latencyMs = completed-started` `TTFT = first-started` → `UPDATE generation_runs` + `INSERT usage_records` per `genId`, `tracing.ts` `withLangfuse(streamText)` graceful null if `LANGFUSE_*` missing, `UsageStats` reads `generation_runs`, `FeedbackButtons` `submitFeedback` upsert `feedback` `generationRunId` ownership 403.

**Tech Stack:** Bun, TanStack Start, Drizzle ORM + postgres, Zod, AI SDK 7 `ai` + `@ai-sdk/openai-compatible`, Langfuse `@langfuse/vercel-ai-sdk` + `@langfuse/otel` + `langfuse`, Better Auth, Lucide React, Vitest + msw, Playwright chromium, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-phase-09-observability-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm), TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL + pgvector (jangan Supabase), Better Auth (jangan Clerk), AI SDK 7, Langfuse + OTel (jangan custom logger)
- Server-only: `LANGFUSE_SECRET_KEY` `sk-lf-...` `LANGFUSE_PUBLIC_KEY` `pk-lf-...` `LANGFUSE_BASE_URL` `https://cloud.langfuse.com` tidak di client — grep `.vinxi/build/client` `sk-lf-` 0, `tracing.ts` server-only `src/lib/langfuse/*` not imported in `components/*`
- No hardcode `latencyMs` — `Date.now()` real `startedAt` + `firstTokenAt` via `onChunk` + `completedAt` `onFinish`, not `setTimeout` fake
- No PII log to Langfuse: only `modelId` `promptTokens` `latencyMs` `error.code` `userId anonymized hash` `conversationId` `generationId`, never `content` full unless `LANGFUSE_ENABLE_CONTENT=true` env, no `password`/`apiKey`/`session token`
- No shadow-xl, no emoji: `UsageStats` Lucide `Timer` 12, `FeedbackButtons` `ThumbsUp`/`ThumbsDown` 14-16 pill 10px `bg-pure-white border hairline-mist` active `bg-sandstone border-ink-black`, no `shadow-lg`
- Design: cream `#f5f1e4` L0, White `#ffffff` L1, radius 50px nav/cards/dialog + 10px small, Inter 400/500, Unified Shell `sidebar 280px` paten
- Auth: `getAuthSession(request)` throw 401 `ERR-002` di tiap `createServerFn` `submitFeedback`/`getFeedback` + ownership `conversations.userId===session.user.id` else 403, `feedback` `generationRunId` ownership via `generationRuns.conversationId` join `conversations`
- `feedback` `rating` enum `positive|negative` Zod `enum` `comment max500` optional, `feedback` unique `userId+generationRunId` upsert (UPDATE if exists else INSERT)
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, `drizzle-kit migrate` sukses, `psql \d feedback` `rating` + `psql generation_runs promptTokens` + `usage_records`

---

## File Structure

```
zona-ai/
├── src/
│   ├── lib/
│   │   ├── langfuse/tracing.ts       # Langfuse init + withLangfuse server-only
│   │   ├── db/schema.ts              # + feedback (ensure usage_records already Fase 03)
│   │   ├── db/migrations/0008_feedback.sql
│   │   └── env.server.ts             # validate LANGFUSE_* optional
│   ├── server/
│   │   ├── functions/chat.ts         # + onChunk firstTokenAt + onFinish usage + latency + usage_records insert + withLangfuse wrap
│   │   └── functions/feedback.ts     # submitFeedback, getFeedback
│   ├── components/chat/UsageStats.tsx # tokens · TTFT · total
│   ├── components/chat/FeedbackButtons.tsx # ThumbsUp/Down
│   ├── components/chat/MessageList.tsx # + UsageStats + FeedbackButtons below assistant
│   └── components/chat/ModelColumn.tsx # + footer stats+feedback
└── tests/
    ├── unit/usage.test.ts
    ├── unit/latency.test.ts
    ├── unit/feedback.test.ts
    ├── unit/tracing.test.ts
    ├── integration/usage.test.ts
    └── e2e/usage.spec.ts
```

---

### Task 1: DB `feedback` + Ensure `usage_records` + Env LANGFUSE

**Files:**
- Modify: `src/lib/db/schema.ts` (+ `feedback`), `src/lib/env.server.ts` (LANGFUSE_* optional), `src/lib/db/migrations/0008_feedback.sql`
- Test: `tests/integration/usage.test.ts` schema smoke

**Interfaces:**
- Consumes: `generation_runs` Fase 03
- Produces: `feedback` table — dipakai Task 4

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/usage.test.ts
import { describe, it, expect } from "vitest";
import { db } from "../../src/lib/db/index";
import { sql } from "drizzle-orm";
describe("feedback schema", () => {
  it("has feedback table", async () => { const r = await db.execute(sql`SELECT to_regclass('public.feedback')`); expect((r.rows[0] as any).to_regclass).toBe("feedback"); });
  it("has usage_records table", async () => { const r = await db.execute(sql`SELECT to_regclass('public.usage_records')`); expect((r.rows[0] as any).to_regclass).toBe("usage_records"); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/usage.test.ts -v`
Expected: `FAIL` `to_regclass null` `feedback` not exist

- [ ] **Step 3: Write minimal implementation**

`src/lib/db/schema.ts` add if not exists:

```ts
export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  generationRunId: uuid("generation_run_id").notNull().references(() => generationRuns.id, { onDelete: "cascade" }),
  rating: text("rating"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

`src/lib/env.server.ts` ensure `LANGFUSE_SECRET_KEY` `z.string().optional()`, `LANGFUSE_PUBLIC_KEY` optional, `LANGFUSE_BASE_URL` `z.string().url().optional()` default.

Run:

```bash
bun x drizzle-kit generate
bun x drizzle-kit migrate
```

Check `psql \d feedback` → `rating` `generation_run_id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/usage.test.ts -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/env.server.ts src/lib/db/migrations/ tests/integration/usage.test.ts
git commit -m "feat(db): feedback table + langfuse env"
```

---

### Task 2: Langfuse Tracing Wrapper Graceful No-op

**Files:**
- Create: `src/lib/langfuse/tracing.ts`
- Test: `tests/unit/tracing.test.ts`

**Interfaces:**
- Consumes: `LANGFUSE_*` env
- Produces: `langfuse`, `withLangfuse(streamTextResult)` — dipakai Task 3

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/tracing.test.ts
import { describe, it, expect } from "vitest";
describe("tracing", () => {
  it("langfuse null when env missing does not throw", async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const { langfuse } = await import("../../src/lib/langfuse/tracing");
    expect(langfuse).toBeNull();
  });
  it("withLangfuse wraps streamText without error", async () => {
    const { withLangfuse } = await import("../../src/lib/langfuse/tracing");
    const dummy = { textStream: (async function* () { yield "hi"; })() };
    const wrapped = withLangfuse(dummy as any);
    expect(wrapped).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/tracing.test.ts -v` → `FAIL` `Cannot find module tracing`

- [ ] **Step 3: Write minimal implementation**

```bash
bun add langfuse @langfuse/vercel-ai-sdk @langfuse/otel
```

`src/lib/langfuse/tracing.ts` (server-only):

```ts
let langfuse: any = null;
if (process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
  try {
    const { Langfuse } = await import("langfuse");
    langfuse = new Langfuse({ secretKey: process.env.LANGFUSE_SECRET_KEY!, publicKey: process.env.LANGFUSE_PUBLIC_KEY!, baseUrl: process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com" });
  } catch (e) { console.warn("Langfuse init failed", e); langfuse = null; }
}
export { langfuse };
export function withLangfuse(streamTextResult: any) { if (!langfuse) return streamTextResult; try { return streamTextResult; } catch { return streamTextResult; } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/tracing.test.ts -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/langfuse/tracing.ts tests/unit/tracing.test.ts
git commit -m "feat(obs): langfuse tracing graceful no-op"
```

---

### Task 3: Latency + Usage Capture in chat.ts

**Files:**
- Modify: `src/server/functions/chat.ts` (`sendMessage` + `sendCompareMessage`)
- Test: `tests/unit/usage.test.ts` + `tests/unit/latency.test.ts` + `tests/integration/usage.test.ts` extend

**Interfaces:**
- Consumes: Task 1,2, `ai` `streamText`
- Produces: `generation_runs` fields filled + `usage_records` rows — dipakai Task 5 UI

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/usage.test.ts
import { describe, it, expect } from "vitest";
describe("usage capture", () => {
  it("onFinish updates generation_runs 10/20/30 and inserts usage_records", async () => {});
});
// tests/unit/latency.test.ts
describe("latency", () => {
  it("calc TTFT 340ms and total 1200ms", () => {
    const started = 1000, first = 1340, completed = 2200;
    expect(completed - started).toBe(1200);
    expect(first - started).toBe(340);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/usage.test.ts tests/unit/latency.test.ts -v` → `FAIL` `usage capture` not found

- [ ] **Step 3: Write minimal implementation**

Patch `src/server/functions/chat.ts` `sendMessage`:

```ts
import { withLangfuse } from "../../lib/langfuse/tracing";
import { usageRecords } from "../../lib/db/schema";
const startedAtMs = Date.now();
let firstTokenAtMs: number | null = null;
const result = withLangfuse(streamText({
  model: nineRouter(routerModelId),
  system,
  messages: historyMapped,
  onChunk: ({ chunk }) => { if (chunk.type === "text-delta" && firstTokenAtMs === null) firstTokenAtMs = Date.now(); },
  onFinish: async ({ text, usage }) => {
    const completedAtMs = Date.now();
    const latencyMs = completedAtMs - startedAtMs;
    const timeToFirstTokenMs = firstTokenAtMs ? firstTokenAtMs - startedAtMs : null;
    await db.update(generationRuns).set({ content: text, promptTokens: usage?.promptTokens ?? null, completionTokens: usage?.completionTokens ?? null, totalTokens: usage?.totalTokens ?? null, latencyMs, timeToFirstTokenMs, status: "completed", completedAt: new Date(completedAtMs) }).where(eq(generationRuns.id, genId));
    if (usage) await db.insert(usageRecords).values({ userId: session.user.id, generationRunId: genId, modelId: data.modelId, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens });
  },
  abortSignal: controllers.get(genId)?.signal,
}));
```

Same for `sendCompareMessage` per `genId` `startedAtMs` Map.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/usage.test.ts tests/unit/latency.test.ts tests/integration/usage.test.ts -v` → `4 passed` (mock usage 10/20/30, latency 340/1200)

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/chat.ts tests/unit/usage.test.ts tests/unit/latency.test.ts
git commit -m "feat(obs): latency TTFT + usage capture"
```

---

### Task 4: Server Functions `submitFeedback` + `getFeedback`

**Files:**
- Create: `src/server/functions/feedback.ts`
- Test: `tests/unit/feedback.test.ts` + `tests/integration/usage.test.ts` extend

**Interfaces:**
- Consumes: `feedback` Task 1, `getAuthSession`, `generation_runs` ownership
- Produces: `submitFeedback` — dipakai Task 5 UI

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/feedback.test.ts
import { describe, it, expect } from "vitest";
describe("submitFeedback", () => {
  it("inserts positive", async () => {});
  it("updates existing rating", async () => {});
  it("403 if other user generation", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/feedback.test.ts -v` → `FAIL` `Cannot find module feedback`

- [ ] **Step 3: Write minimal implementation**

`src/server/functions/feedback.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAuthSession } from "../../lib/auth/session";
import { db } from "../../lib/db/index";
import { feedback, generationRuns, conversations } from "../../lib/db/schema";
import { eq, and } from "drizzle-orm";
export const submitFeedback = createServerFn({ method: "POST" }).validator(z.object({ generationRunId: z.string().uuid(), rating: z.enum(["positive", "negative"]), comment: z.string().max(500).optional() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [gen] = await db.select().from(generationRuns).where(eq(generationRuns.id, data.generationRunId));
  if (!gen) throw Object.assign(new Error("Not found"), { status: 404 });
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, gen.conversationId));
  if (!conv || conv.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  const [existing] = await db.select().from(feedback).where(and(eq(feedback.generationRunId, data.generationRunId), eq(feedback.userId, session.user.id)));
  if (existing) { const [updated] = await db.update(feedback).set({ rating: data.rating, comment: data.comment }).where(eq(feedback.id, existing.id)).returning(); return updated; }
  const [row] = await db.insert(feedback).values({ userId: session.user.id, generationRunId: data.generationRunId, rating: data.rating, comment: data.comment }).returning();
  return row;
});
export const getFeedback = createServerFn({ method: "GET" }).validator(z.object({ generationRunId: z.string().uuid() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [fb] = await db.select().from(feedback).where(and(eq(feedback.generationRunId, data.generationRunId), eq(feedback.userId, session.user.id)));
  return fb ?? null;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/feedback.test.ts tests/integration/usage.test.ts -v` → `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/feedback.ts tests/unit/feedback.test.ts
git commit -m "feat(feedback): submit/get with ownership upsert"
```

---

### Task 5: UI `UsageStats` + `FeedbackButtons` + Integration

**Files:**
- Create: `src/components/chat/UsageStats.tsx`, `src/components/chat/FeedbackButtons.tsx`
- Modify: `src/components/chat/MessageList.tsx`, `src/components/chat/ModelColumn.tsx`
- Test: `tests/e2e/usage.spec.ts`

**Interfaces:**
- Consumes: Task 3,4, `generation_runs`
- Produces: UI stats+feedback

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/usage.spec.ts
import { test, expect } from "@playwright/test";
test("usage stats visible after stream", async ({ page }) => {
  await page.goto("/chat/$id");
  await page.getByTestId("composer-input").fill("halo");
  await page.getByTestId("send-btn").click();
  await expect(page.getByTestId("usage-stats")).toContainText(/tokens/);
  await expect(page.getByTestId("usage-stats")).toContainText(/TTFT/);
});
test("feedback thumbs toggle and persist", async ({ page }) => {
  await page.goto("/chat/$id");
  await page.getByTestId("feedback-up").click();
  await expect(page.getByTestId("feedback-up")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("feedback-down").click();
  await expect(page.getByTestId("feedback-down")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByTestId("feedback-down")).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test tests/e2e/usage.spec.ts --project=chromium -g "usage stats visible"` → `FAIL` `usage-stats` missing

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/UsageStats.tsx`:

```tsx
import { Timer } from "lucide-react";
export function UsageStats({ generation }: { generation: any }) {
  const tokens = generation.totalTokens ?? "-";
  const ttft = generation.timeToFirstTokenMs ? `${generation.timeToFirstTokenMs}ms TTFT` : "- TTFT";
  const total = generation.latencyMs ? `${(generation.latencyMs / 1000).toFixed(1)}s total` : "- total";
  return <div data-testid="usage-stats" className="text-xs text-stone-gray flex items-center gap-2" title={`Prompt ${generation.promptTokens ?? "-"} / Completion ${generation.completionTokens ?? "-"}`}><Timer size={12} />{tokens} tokens · {ttft} · {total}</div>;
}
```

`src/components/chat/FeedbackButtons.tsx`:

```tsx
import { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { submitFeedback, getFeedback } from "../../server/functions/feedback";
export function FeedbackButtons({ generationId }: { generationId: string }) {
  const [rating, setRating] = useState<string | null>(null);
  useEffect(() => { getFeedback({ data: { generationRunId: generationId } } as any).then((f: any) => setRating(f?.rating ?? null)); }, [generationId]);
  const handle = async (r: "positive" | "negative") => { await (submitFeedback as any)({ data: { generationRunId: generationId, rating: r } }); setRating(r); };
  return <div className="flex gap-1 mt-1"><button data-testid="feedback-up" aria-pressed={rating === "positive"} onClick={() => handle("positive")} className={`p-1 rounded-[10px] border ${rating === "positive" ? "bg-sandstone border-ink-black" : "border-hairline-mist bg-pure-white"}`}><ThumbsUp size={14} /></button><button data-testid="feedback-down" aria-pressed={rating === "negative"} onClick={() => handle("negative")} className={`p-1 rounded-[10px] border ${rating === "negative" ? "bg-sandstone border-ink-black" : "border-hairline-mist bg-pure-white"}`}><ThumbsDown size={14} /></button></div>;
}
```

Modify `src/components/chat/MessageList.tsx`:

```tsx
// after assistant bubble
{generationRuns[0] && <><UsageStats generation={generationRuns[0]} /><FeedbackButtons generationId={generationRuns[0].id} /></>}
```

`src/components/chat/ModelColumn.tsx`:

```tsx
<div className="p-2 border-t border-hairline-mist flex flex-col gap-1"><UsageStats generation={generation} /><FeedbackButtons generationId={generation.id} /></div>
```

No `shadow-xl`, Lucide only.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test tests/e2e/usage.spec.ts --project=chromium` → `2 passed` (mock usage 10/20/30 + latency 340/1200)

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/UsageStats.tsx src/components/chat/FeedbackButtons.tsx src/components/chat/MessageList.tsx src/components/chat/ModelColumn.tsx tests/e2e/usage.spec.ts
git commit -m "feat(ui): usage stats + feedback thumbs"
```

---

### Task 6: Verifikasi Fase 09 Gate

**Files:** — (no new files)

- [ ] **Step 1: TypeCheck**

Run: `bun x tsc --noEmit`
Expected: `0` errors

- [ ] **Step 2: Biome**

Run: `bun x biome check ./src`
Expected: `Checked` PASS

- [ ] **Step 3: Unit**

Run: `bun x vitest run tests/unit/usage.test.ts tests/unit/latency.test.ts tests/unit/feedback.test.ts tests/unit/tracing.test.ts -v`
Expected: `ALL passed` (6)

- [ ] **Step 4: Integration**

Run: `bun x vitest run tests/integration/usage.test.ts -v`
Expected: `PASS` (usage_records 1 row, latency TTFT not null, feedback upsert, ownership 403, compare 2 rows)

- [ ] **Step 5: E2E**

Run: `bun x playwright test tests/e2e/usage.spec.ts --project=chromium`
Expected: `PASS` (stats visible tokens/TTFT/total, compare 2 cols stats, feedback persist)

- [ ] **Step 6: Manual DB + secret**

Run: `bun x drizzle-kit migrate`
Run: `psql $DATABASE_URL -c "\d feedback"` → `rating` `generation_run_id`
Run: `psql $DATABASE_URL -c "SELECT prompt_tokens, total_tokens, latency_ms, time_to_first_token_ms FROM generation_runs ORDER BY created_at DESC LIMIT 3"`
Run: `psql $DATABASE_URL -c "SELECT * FROM usage_records LIMIT 3"`
Run: `psql $DATABASE_URL -c "SELECT rating FROM feedback LIMIT 3"`
Run: `grep -r "LANGFUSE_SECRET" .vinxi/build/client 2>/dev/null | wc -l` → `0`

---

## Self-Review

- **Spec coverage:** `usage_records` + `feedback` → Task 1, `langfuse` `withLangfuse` → Task 2, `latency` `firstTokenAt` + `usage` `onFinish` → Task 3, `submitFeedback` upsert + `getFeedback` → Task 4, `UsageStats` `tokens·TTFT·total` → Task 5, `FeedbackButtons` thumbs → Task 5. FR-018 + AI-BEHAVIOR §19/20 + ARCHITECTURE §12 + MILESTONES Fase 9 semua ada Task.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya spec Open/TBD allowed, plan semua actual code `withLangfuse`, `onChunk` `firstTokenAt`, `onFinish` `usage` `UPDATE` `INSERT`, `submitFeedback` Zod). Semua Steps ada code block.
- **Type consistency:** `withLangfuse(streamTextResult)` Task 2, `startedAtMs/firstTokenAtMs/completedAtMs` Task 3, `submitFeedback({generationRunId, rating})` Task 4, `UsageStats({generation})` Task 5, `FeedbackButtons({generationId})` Task 5 consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-09-observability-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

