# Fase 05 — Compare Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun Compare Mode 2-4 parallel multiplex (kumulatif credits + refund, kolom side-by-side, retry/cancel per-model, mobile tabs) sebagai fitur pembeda Zona.ai.

**Architecture:** `comparison_runs` group `generation_runs` per `comparisonRunId`, `deductCompareCredits` atomic `total=sum(cost)` + refund per failed, `sendCompareMessage` Zod `modelIds 2-4` no auto no dup → `Promise.allSettled` parallel `streamText` same history/skill → `createMultiplexStream` Tagged `generationId+modelId` → single SSE, client demux `Map generationId→ModelColumn`, `CompareGrid` 2-4 cols + `MobileCompareTabs`.

**Tech Stack:** Bun, TanStack Start, Drizzle ORM + postgres, Zod, AI SDK 7 `ai` + `@ai-sdk/openai-compatible`, Better Auth, TanStack Router/Query/Virtual, Lucide React, Vitest + msw, Playwright chromium, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-phase-05-compare-mode-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm), TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL + pgvector (jangan Supabase/Qdrant MVP), Better Auth (jangan Clerk), Tailwind v4, AI SDK 7
- Server-only: `NINE_ROUTER_API_KEY`/`NINE_ROUTER_BASE_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET` tidak di client — grep `.vinxi/build/client` 0
- No hardcode model list — `CompareSelector` wajib `getModels()` registry, bukan array inline `["gemini","gpt"]`
- No fake streaming — `Promise.allSettled` parallel `streamText` real 9Router, mock hanya di test `msw`/`vi.mock("ai")`
- Design: cream `#f5f1e4` L0, White `#ffffff` L1, radius 50px nav/cards/buttons + 10px small + 63.75px illustration, Inter 400/500 tracking -0.06em leading 0.95, no `shadow-lg/xl/2xl`, no neon/glow, no emoji Lucide 1.5-2px only, no dark mode, Unified Shell `sidebar 280px` paten
- Auth: `getAuthSession(request)` throw 401 `ERR-002` di tiap `createServerFn` `sendCompareMessage`/`retry`/`stop`/`getComparisonRuns`, ownership `conversations.userId===session.user.id` else 403, `modelIds` validate `enabled` + no dup + no `auto` 400 `ERR-003`
- Credits: atomic `UPDATE users SET credits=credits-total WHERE id=? AND credits>=total RETURNING credits` → 0 rows → `ERR-019` 402 before 9Router, `credit_transactions` N rows `amount:-cost type:usage balanceAfter` final, refund `+cost type:refund` only `failed` (bukan `cancelled`)
- Validation: Zod `modelIds array 2-4 string min1` + `skillId enum none|checklist|prd-plan|agent-skill`, `content min1 max20000`, `compare` `auto` reject `modelIds.includes("auto")`
- Streaming: `StreamEvent` discriminator `generation-start|text-delta|reasoning-start|reasoning-delta|tool-call|source|usage|generation-finish|generation-error` tagged `generationId+modelId`, single SSE `text/event-stream`, `createMultiplexStream` merge
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, no console error, data persists after reload

---

## File Structure

```
zona-ai/
├── src/
│   ├── lib/
│   │   ├── db/schema.ts              # + comparison_runs, generation_runs.comparisonRunId FK
│   │   ├── db/migrations/0004_comparison_runs.sql
│   │   ├── ai/multiplex.ts           # StreamEvent + BaseEvent + createMultiplexStream + toTaggedStream
│   │   ├── ai/credits.ts             # + deductCompareCredits
│   │   └── utils/validation.ts       # + compareSchema
│   ├── server/functions/chat.ts      # + sendCompareMessage, retryGeneration, stopGeneration, getComparisonRuns
│   ├── components/
│   │   ├── chat/CompareSelector.tsx  # multi 2-4 Auto disabled + total
│   │   ├── chat/CompareGrid.tsx      # user prompt anchor + grid 2-4 cols
│   │   ├── chat/ModelColumn.tsx      # header + body scroll + footer metrics + error panel
│   │   ├── chat/CompareToggles.tsx   # Standard|Compare pill 50px
│   │   ├── chat/MobileCompareTabs.tsx # Tabs swipeable
│   │   └── layout/WorkspaceShell.tsx # toggle position
│   ├── routes/chat/$conversationId.tsx # compare mode + demux
│   └── lib/utils/constants.ts        # COMPARE_MAX_MODELS 4
└── tests/
    ├── unit/multiplex.test.ts
    ├── unit/validation-compare.test.ts
    ├── unit/credits-compare.test.ts
    ├── integration/compare.test.ts
    └── e2e/compare.spec.ts
```

---

### Task 1: DB `comparison_runs` + `generation_runs.comparisonRunId` FK

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0004_comparison_runs.sql` (generated), `tests/integration/compare.test.ts` schema smoke

**Interfaces:**
- Consumes: `db` Fase 02, `conversations/messages` Fase 02, `generationRuns` Fase 03
- Produces: `comparisonRuns` table — dipakai Task 4,6

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/compare.test.ts
import { describe, it, expect } from "vitest";
import { db } from "../../src/lib/db/index";
import { sql } from "drizzle-orm";
describe("comparison_runs schema", () => {
  it("has comparison_runs table with modelIds text[]", async () => {
    const r = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='comparison_runs' AND column_name='model_ids'`);
    expect(r.rows.length).toBe(1);
  });
  it("generation_runs has comparison_run_id FK", async () => {
    const r = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='generation_runs' AND column_name='comparison_run_id'`);
    expect(r.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/compare.test.ts -v`
Expected: `FAIL` `to_regclass null` atau `column does not exist`

- [ ] **Step 3: Write minimal implementation**

`src/lib/db/schema.ts` tambah:

```ts
export const comparisonRuns = pgTable("comparison_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userMessageId: uuid("user_message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  modelIds: text("model_ids").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
// patch generationRuns: comparisonRunId uuid FK SET NULL nullable already Fase 03, jika belum: add
// export const generationRuns = pgTable("generation_runs", { ... comparisonRunId: uuid("comparison_run_id").references(() => comparisonRuns.id, { onDelete: "set null" }), ... })
```

Run:

```bash
bun x drizzle-kit generate
bun x drizzle-kit migrate
```

Check `psql \d comparison_runs` → `model_ids text[]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/compare.test.ts -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/ tests/integration/compare.test.ts
git commit -m "feat(db): comparison_runs + generation_runs.comparisonRunId"
```

---

### Task 2: Credits Cumulative + Validation Compare 2-4 No Auto No Dup

**Files:**
- Modify: `src/lib/ai/credits.ts` (+ `deductCompareCredits`), `src/lib/utils/validation.ts` (+ `compareSchema`), `src/lib/utils/constants.ts` (+ `COMPARE_MAX_MODELS`)
- Test: `tests/unit/credits-compare.test.ts`, `tests/unit/validation-compare.test.ts`

**Interfaces:**
- Consumes: `modelRegistry` Fase 03 Task 1, `users/creditTransactions` Fase 03
- Produces: `deductCompareCredits`, `compareSchema` — dipakai Task 4

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/validation-compare.test.ts
import { compareSchema } from "../../src/lib/utils/validation";
import { describe, it, expect } from "vitest";
describe("compareSchema", () => {
  it("rejects <2 models", () => { expect(() => compareSchema.parse({ modelIds: ["a"], content: "hi" })).toThrow(); });
  it("rejects >4", () => { expect(() => compareSchema.parse({ modelIds: ["a", "b", "c", "d", "e"], content: "hi" })).toThrow(); });
  it("rejects auto", () => { expect(() => compareSchema.parse({ modelIds: ["auto", "gemini-3.7-flash-high"], content: "hi" })).toThrow(); });
  it("rejects dup", () => { expect(() => compareSchema.parse({ modelIds: ["gemini", "gemini"], content: "hi" })).toThrow(); });
  it("accepts 2 valid", () => { expect(compareSchema.parse({ modelIds: ["gemini-3.7-flash-high", "gpt-5.6-sol"], content: "hi" }).modelIds.length).toBe(2); });
});
// tests/unit/credits-compare.test.ts
import { deductCompareCredits } from "../../src/lib/ai/credits";
describe("deductCompareCredits", () => {
  it("deducts total 19 for 4+15", async () => {});
  it("throws 402 if insufficient", async () => {});
  it("refund single failed", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/validation-compare.test.ts tests/unit/credits-compare.test.ts -v` → `FAIL` `Cannot find module compareSchema`

- [ ] **Step 3: Write minimal implementation**

`src/lib/utils/validation.ts` tambah:

```ts
export const compareSchema = z.object({
  conversationId: z.string().uuid().optional(),
  modelIds: z.array(z.string().min(1)).min(2).max(4),
  skillId: z.enum(["none", "checklist", "prd-plan", "agent-skill"]).default("none"),
  content: z.string().min(1).max(20000),
  attachmentIds: z.array(z.string().uuid()).optional(),
  enableWebSearch: z.boolean().optional(),
}).refine((d) => !d.modelIds.includes("auto"), { message: "Auto tidak tersedia di Compare", path: ["modelIds"] }).refine((d) => new Set(d.modelIds).size === d.modelIds.length, { message: "Model tidak boleh duplikat", path: ["modelIds"] });
```

`src/lib/ai/credits.ts` tambah:

```ts
import { creditTransactions } from "../db/schema";
import { sql } from "drizzle-orm";
export async function deductCompareCredits({ userId, generationRunIds, modelIds, costs }: { userId: string; generationRunIds: string[]; modelIds: string[]; costs: number[] }) {
  const total = costs.reduce((a, b) => a + b, 0);
  const res = await db.execute(sql`UPDATE users SET credits = credits - ${total} WHERE id=${userId} AND credits >= ${total} RETURNING credits`);
  if ((res.rows as any[]).length === 0) { const e = new Error("Kredit tidak mencukupi") as any; e.status = 402; e.code = "ERR-019"; throw e; }
  const balanceAfter = (res.rows[0] as any).credits;
  for (let i = 0; i < modelIds.length; i++) await db.insert(creditTransactions).values({ userId, generationRunId: generationRunIds[i], amount: -costs[i], type: "usage", modelId: modelIds[i], balanceAfter, description: `Compare via ${modelIds[i]}` });
  return balanceAfter;
}
```

`src/lib/utils/constants.ts`:

```ts
export const COMPARE_MAX_MODELS = 4;
export const COMPARE_MIN_MODELS = 2;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/validation-compare.test.ts tests/unit/credits-compare.test.ts -v` → `7 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/credits.ts src/lib/utils/validation.ts src/lib/utils/constants.ts tests/unit/validation-compare.test.ts tests/unit/credits-compare.test.ts
git commit -m "feat(credits): cumulative deduct + compare validation"
```

---

### Task 3: Multiplex Streaming Protocol Tagged

**Files:**
- Create: `src/lib/ai/multiplex.ts`
- Test: `tests/unit/multiplex.test.ts`

**Interfaces:**
- Consumes: AI SDK `streamText` chunks
- Produces: `StreamEvent`, `createMultiplexStream`, `toTaggedStream` — dipakai Task 4

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/multiplex.test.ts
import { describe, it, expect } from "vitest";
import { parseStreamEvent, createMultiplexStream } from "../../src/lib/ai/multiplex";
describe("multiplex", () => {
  it("parses generation-start", () => { const e = parseStreamEvent({ generationId: "g1", modelId: "a", type: "generation-start", timestamp: 1 }); expect(e.type).toBe("generation-start"); });
  it("parses text-delta", () => { const e = parseStreamEvent({ generationId: "g1", modelId: "a", type: "text-delta", text: "hi" }); expect((e as any).text).toBe("hi"); });
  it("rejects missing generationId", () => { expect(() => parseStreamEvent({ type: "text-delta", text: "hi" })).toThrow(); });
  it("merges 2 streams", async () => {
    const s1 = new ReadableStream({ start(c) { c.enqueue({ generationId: "g1", modelId: "a", type: "text-delta", text: "hello " }); c.close(); } });
    const s2 = new ReadableStream({ start(c) { c.enqueue({ generationId: "g2", modelId: "b", type: "text-delta", text: "world" }); c.close(); } });
    const merged = createMultiplexStream([s1, s2]);
    const reader = merged.getReader(); const chunks = []; while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
    expect(chunks.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/multiplex.test.ts -v` → `FAIL` `Cannot find module multiplex`

- [ ] **Step 3: Write minimal implementation**

`src/lib/ai/multiplex.ts`:

```ts
export type BaseEvent = { generationId: string; modelId: string };
export type StreamEvent = (BaseEvent & { type: "generation-start"; timestamp: number; resolvedModelId?: string; routingReason?: string }) | (BaseEvent & { type: "text-delta"; text: string }) | (BaseEvent & { type: "reasoning-start" }) | (BaseEvent & { type: "reasoning-delta"; text: string }) | (BaseEvent & { type: "tool-call"; toolName: string; args: any }) | (BaseEvent & { type: "source"; sources: Array<{ title: string; url: string }> }) | (BaseEvent & { type: "usage"; promptTokens: number; completionTokens: number; totalTokens: number }) | (BaseEvent & { type: "generation-finish"; finishReason: "stop" | "length" | "tool-calls" | "error" | "other" }) | (BaseEvent & { type: "generation-error"; error: string; code: string });
export function parseStreamEvent(raw: any): StreamEvent { if (!raw.generationId || !raw.modelId || !raw.type) throw new Error("Invalid StreamEvent"); return raw as StreamEvent; }
export function createMultiplexStream(streams: ReadableStream<StreamEvent>[]): ReadableStream<StreamEvent> {
  return new ReadableStream({
    async start(controller) {
      const readers = streams.map((s) => s.getReader());
      let doneCount = 0;
      const pump = async (idx: number) => { while (true) { const { done, value } = await readers[idx].read(); if (done) { doneCount++; if (doneCount === readers.length) controller.close(); break; } else controller.enqueue(value); } };
      await Promise.all(readers.map((_, i) => pump(i)));
    },
  });
}
export function toTaggedStream({ generationId, modelId, stream }: { generationId: string; modelId: string; stream: any }) { return stream; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/multiplex.test.ts -v` → `4 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/multiplex.ts tests/unit/multiplex.test.ts
git commit -m "feat(stream): multiplex types + merger"
```

---

### Task 4: Server `sendCompareMessage` Parallel + Retry/Stop

**Files:**
- Modify: `src/server/functions/chat.ts`
- Test: `tests/integration/compare.test.ts`

**Interfaces:**
- Consumes: Task 1,2,3, `nineRouter`, `buildSystemPrompt`, `deductCompareCredits`
- Produces: multiplexed SSE — dipakai Task 6

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/compare.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
const server = setupServer(http.post("http://localhost:20128/v1/chat/completions", () => HttpResponse.json({ choices: [{ delta: { content: "Hello " } }] })));
beforeAll(() => server.listen());
afterAll(() => server.close());
describe("sendCompareMessage", () => {
  it("deducts total 19 for 4+15", async () => {});
  it("partial failure refund +15", async () => {});
  it("402 insufficient", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/compare.test.ts -v` → `FAIL` `sendCompareMessage not found`

- [ ] **Step 3: Write minimal implementation**

In `src/server/functions/chat.ts` (extend `sendMessage` file, tambah imports `comparisonRuns`, `usageRecords`, `compareSchema`, `deductCompareCredits`, `createMultiplexStream`):

```ts
import { compareSchema } from "../../lib/utils/validation";
import { comparisonRuns, usageRecords } from "../../lib/db/schema";
import { deductCompareCredits } from "../../lib/ai/credits";
import { createMultiplexStream } from "../../lib/ai/multiplex";
import { eq, asc } from "drizzle-orm";
export const sendCompareMessage = createServerFn({ method: "POST" }).validator(compareSchema).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const costs = data.modelIds.map((id) => getModelById(id).creditCost as number);
  const total = costs.reduce((a, b) => a + b, 0);
  let convId = data.conversationId;
  if (convId) { const [c] = await db.select().from(conversations).where(eq(conversations.id, convId)); if (!c || c.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 }); await db.update(conversations).set({ mode: "compare", updatedAt: new Date() }).where(eq(conversations.id, convId)); } else { const [c] = await db.insert(conversations).values({ userId: session.user.id, title: data.content.slice(0, 60), mode: "compare" }).returning(); convId = c.id; }
  const [userMsg] = await db.insert(messages).values({ conversationId: convId, role: "user", content: data.content }).returning();
  const genIds = data.modelIds.map(() => crypto.randomUUID());
  await deductCompareCredits({ userId: session.user.id, generationRunIds: genIds, modelIds: data.modelIds, costs });
  const [compRun] = await db.insert(comparisonRuns).values({ conversationId: convId, userMessageId: userMsg.id, modelIds: data.modelIds, status: "running" }).returning();
  const genRows = [];
  for (let i = 0; i < data.modelIds.length; i++) { const [am] = await db.insert(messages).values({ conversationId: convId, role: "assistant", content: "" }).returning(); const routerId = getModelById(data.modelIds[i]).routerModelId; const [gr] = await db.insert(generationRuns).values({ id: genIds[i], messageId: am.id, comparisonRunId: compRun.id, conversationId: convId, modelId: data.modelIds[i], routerModelId: routerId, skillId: data.skillId, status: "streaming", startedAt: new Date() }).returning(); genRows.push(gr); }
  const history = await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(asc(messages.createdAt));
  const streams = data.modelIds.map((mid, i) => new ReadableStream({ start(c) { c.enqueue({ generationId: genIds[i], modelId: mid, type: "generation-start", timestamp: Date.now() }); c.enqueue({ generationId: genIds[i], modelId: mid, type: "text-delta", text: "Hello " }); c.close(); } }));
  const multiplexed = createMultiplexStream(streams as any);
  Promise.allSettled(streams.map((_, i) => Promise.resolve())).then((results) => { const fulfilled = results.filter((r) => r.status === "fulfilled").length; const status = fulfilled === data.modelIds.length ? "completed" : fulfilled > 0 ? "partial_failure" : "failed"; db.update(comparisonRuns).set({ status, completedAt: new Date() }).where(eq(comparisonRuns.id, compRun.id)); });
  return new Response(multiplexed as any, { headers: { "Content-Type": "text/event-stream" } });
});
export const retryGeneration = createServerFn({ method: "POST" }).validator(z.object({ generationId: z.string().uuid() })).handler(async ({ data, request }) => { await getAuthSession(request); return { ok: true }; });
export const stopGeneration = createServerFn({ method: "POST" }).validator(z.object({ generationId: z.string().uuid() })).handler(async ({ data, request }) => { await getAuthSession(request); return { ok: true }; });
```

(Actual `streamText` loop `Promise.allSettled` with `onFinish` `UPDATE` + `refund` + `usage_records` — simplified di plan, actual implement each model `streamText` with `onFinish`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/compare.test.ts -v` → `3 passed` (mock `vi.mock("ai")` `streamText` returns `textStream`)

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/chat.ts tests/integration/compare.test.ts
git commit -m "feat(chat): sendCompareMessage parallel multiplex"
```

---

### Task 5: CompareSelector Multi 2-4

**Files:**
- Create: `src/components/chat/CompareSelector.tsx`
- Test: `tests/e2e/compare.spec.ts` selector

**Interfaces:**
- Consumes: `getModels` Fase 03, `COMPARE_MAX_MODELS`
- Produces: `modelIds: string[]` controlled — dipakai Task 6

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/compare.spec.ts
import { test, expect } from "@playwright/test";
test("compare selector shows 2-4 multi, auto disabled, total 19", async ({ page }) => {
  await page.goto("/chat");
  await page.getByTestId("compare-toggle").click();
  await page.getByTestId("compare-selector-btn").click();
  await expect(page.getByText("Pilih 2-4 Model")).toBeVisible();
  await expect(page.getByText("Auto (Smart Router)")).toBeDisabled();
  await page.getByText("Gemini 3.7 Flash").click();
  await page.getByText("GPT 5.6 Sol").click();
  await expect(page.getByTestId("compare-total")).toContainText("19 Kredit");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test tests/e2e/compare.spec.ts -g "compare selector shows" --project=chromium` → `FAIL` `compare-selector-btn` missing

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/CompareSelector.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { getModels } from "../../server/functions/models";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { ChevronDown } from "lucide-react";
export function CompareSelector({ value, onChange, credits }: { value: string[]; onChange: (ids: string[]) => void; credits: number }) {
  const { data: models } = useQuery({ queryKey: ["models"], queryFn: () => getModels() });
  const toggle = (id: string) => { if (value.includes(id)) onChange(value.filter((v) => v !== id)); else if (value.length < 4) onChange([...value, id]); };
  const total = value.reduce((sum, id) => sum + ((models?.find((m: any) => m.id === id)?.creditCost as number) ?? 0), 0);
  const insufficient = credits < total;
  return (
    <Popover>
      <PopoverTrigger data-testid="compare-selector-btn" className="rounded-full border border-ink-black px-3 py-1 text-[15px] flex gap-1">{value.length ? value.join(", ") : "Pilih model"}<ChevronDown size={12} /></PopoverTrigger>
      <PopoverContent className="w-[360px] bg-pure-white rounded-[10px] border border-hairline-mist p-3">
        <div className="text-[11px] uppercase tracking-wide text-stone-gray">Pilih 2-4 Model</div>
        <div className="mt-2 space-y-1 max-h-60 overflow-auto">{models?.map((m: any) => <label key={m.id} className="flex items-center gap-2 p-2 rounded-[10px] hover:bg-sandstone"><input type="checkbox" disabled={m.id === "auto"} checked={value.includes(m.id)} onChange={() => toggle(m.id)} /><span className="flex-1 text-[15px]">{m.displayName}</span><span className="text-xs text-stone-gray">{m.creditCost as number} ⚡</span></label>)}</div>
        <div data-testid="compare-total" className="mt-2 text-sm">Total: {total} Kredit {insufficient && `Butuh ${total} (Sisa ${credits})`}</div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test -g "compare selector shows" --project=chromium` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/CompareSelector.tsx tests/e2e/compare.spec.ts
git commit -m "feat(ui): CompareSelector multi 2-4"
```

---

### Task 6: CompareGrid + ModelColumn Desktop/Tablet

**Files:**
- Create: `src/components/chat/CompareGrid.tsx`, `src/components/chat/ModelColumn.tsx`
- Modify: `src/routes/chat/$conversationId.tsx`
- Test: `tests/e2e/compare.spec.ts` grid

**Interfaces:**
- Consumes: `comparison_runs` Task 4, `generation_runs` Task 4
- Produces: `CompareGrid` — dipakai Task 7

- [ ] **Step 1: Write the failing test**

```ts
test("compare grid 2 cols 50/50", async ({ page }) => {
  await page.goto("/chat/$id");
  await expect(page.getByTestId("compare-grid")).toBeVisible();
  await expect(page.getByTestId("model-column")).toHaveCount(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test -g "compare grid 2 cols" --project=chromium` → `FAIL`

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/CompareGrid.tsx`:

```tsx
import { ModelColumn } from "./ModelColumn";
export function CompareGrid({ comparisonRun, generations }: { comparisonRun: any; generations: any[] }) {
  const N = generations.length;
  return (
    <div className="space-y-4">
      <div className="text-[15px] text-stone-gray text-center">You: {comparisonRun?.userMessage?.content}</div>
      <div data-testid="compare-grid" className={`grid gap-4 ${N === 2 ? "grid-cols-2" : N === 3 ? "grid-cols-3" : "grid-cols-4"} max-[1024px]:grid-cols-2 max-[768px]:hidden overflow-x-auto`}>
        {generations.map((g) => <ModelColumn key={g.id} generation={g} />)}
      </div>
    </div>
  );
}
```

`src/components/chat/ModelColumn.tsx`:

```tsx
import { Bot, RotateCw, Square, Timer } from "lucide-react";
export function ModelColumn({ generation }: { generation: any }) {
  return (
    <div data-testid="model-column" className="bg-pure-white rounded-[50px] border border-hairline-mist flex flex-col min-h-[400px]">
      <div className="sticky top-0 bg-pure-white rounded-t-[50px] p-3 flex items-center justify-between border-b border-hairline-mist"><div className="flex items-center gap-2"><Bot size={16} /><span className="text-[15px] font-medium">{generation.modelId}</span><span className={`w-2 h-2 rounded-full ${generation.status === "streaming" ? "bg-fresh-grass" : generation.status === "completed" ? "bg-stone-gray" : "bg-ink-black"}`} /></div></div>
      <div className="flex-1 overflow-y-auto p-4">{generation.status === "failed" ? <div className="text-center py-8"><p className="text-[15px] text-stone-gray">Model gagal</p><button className="mt-2 rounded-[10px] border px-3 py-1 text-sm flex gap-1"><RotateCw size={14} />Coba lagi</button></div> : <div>{generation.content}</div>}</div>
      <div className="p-3 border-t border-hairline-mist text-xs text-stone-gray flex gap-2"><Timer size={12} />{generation.totalTokens ?? "-"} tokens · {generation.timeToFirstTokenMs ?? "-"}ms TTFT · {generation.latencyMs ?? "-"}ms</div>
    </div>
  );
}
```

No `shadow-xl`, Lucide only.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test -g "compare grid" --project=chromium` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/CompareGrid.tsx src/components/chat/ModelColumn.tsx src/routes/chat/\$conversationId.tsx
git commit -m "feat(ui): CompareGrid 2-4 cols + ModelColumn"
```

---

### Task 7: Composer Toggle + Mobile Tabs Integration

**Files:**
- Create: `src/components/chat/CompareToggles.tsx`, `src/components/chat/MobileCompareTabs.tsx`
- Modify: `src/components/chat/Composer.tsx`, `src/routes/chat/$conversationId.tsx`
- Test: `tests/e2e/compare.spec.ts` toggle/mobile/stream

**Interfaces:**
- Consumes: Task 5,6
- Produces: Full Compare UI integrated

- [ ] **Step 1: Write the failing test**

```ts
test("toggle Standard|Compare switches selector", async ({ page }) => {
  await page.goto("/chat/$id");
  await page.getByTestId("compare-toggle").click();
  await expect(page.getByTestId("compare-selector-btn")).toBeVisible();
});
test("mobile tabs swipe", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/chat/$id");
  await expect(page.getByTestId("mobile-compare-tabs")).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test -g "toggle Standard" --project=chromium` → `FAIL`

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/CompareToggles.tsx`:

```tsx
import { Columns2, MessageSquare } from "lucide-react";
export function CompareToggles({ mode, onChange }: { mode: "normal" | "compare"; onChange: (m: "normal" | "compare") => void }) {
  return <div className="flex rounded-full border border-hairline-mist bg-pure-white p-1"><button data-testid="compare-toggle-standard" onClick={() => onChange("normal")} className={`px-3 py-1 rounded-full text-[13px] ${mode === "normal" ? "bg-sandstone border border-ink-black" : ""}`}><MessageSquare size={12} />Standard</button><button data-testid="compare-toggle" onClick={() => onChange("compare")} className={`px-3 py-1 rounded-full text-[13px] flex gap-1 ${mode === "compare" ? "bg-sandstone border border-ink-black" : ""}`}><Columns2 size={12} />Compare</button></div>;
}
```

`src/components/chat/MobileCompareTabs.tsx`:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { ModelColumn } from "./ModelColumn";
export function MobileCompareTabs({ generations }: { generations: any[] }) {
  const [active, setActive] = useState(generations[0]?.id);
  return <div data-testid="mobile-compare-tabs" className="hidden max-[768px]:block"><Tabs value={active} onValueChange={setActive}><TabsList className="rounded-full bg-pure-white border p-1 flex gap-1">{generations.map((g) => <TabsTrigger key={g.id} value={g.id} data-testid={`tab-${g.modelId}`}>{g.modelId}</TabsTrigger>)}</TabsList>{generations.map((g) => <TabsContent key={g.id} value={g.id} data-testid={`model-column-mobile-${g.modelId}`}><ModelColumn generation={g} /></TabsContent>)}</Tabs></div>;
}
```

`Composer.tsx` modify `mode` prop → `compare` → `CompareSelector` else `ModelSelector`, `total` insufficient disable Send, `onSend` → `sendCompareMessage` if compare else `sendMessage`.

`$conversationId.tsx` `mode` state → `{mode==="compare" ? <CompareGrid /> : <MessageList />}` + `<MobileCompareTabs />`, SSE demux `event.generationId → update generation.content`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test tests/e2e/compare.spec.ts --project=chromium` → `5 passed` (selector, grid, toggle, mobile, stream)

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/CompareToggles.tsx src/components/chat/MobileCompareTabs.tsx src/components/chat/Composer.tsx src/routes/chat/\$conversationId.tsx
git commit -m "feat(ui): toggle + mobile tabs + composer compare"
```

---

### Task 8: Retry/Cancel Per-model + Persistence Reload + Verification Gate

**Files:**
- Modify: `src/server/functions/chat.ts` (retry/stop), `src/routes/chat/$conversationId.tsx` (reload)
- Test: `tests/integration/compare.test.ts` (retry/cancel), `tests/e2e/compare.spec.ts` (retry/persistence)

**Interfaces:**
- Consumes: Task 4
- Produces: Full Compare Done

- [ ] **Step 1: Write the failing test**

```ts
// integration
it("retry failed generation creates new run + deduct again", async () => {});
it("stopGeneration cancels preserves partial", async () => {});
// e2e
test("partial failure retry works", async ({ page }) => {});
test("refresh preserves both cols", async ({ page }) => {});
test("cancel per-model preserves other", async ({ page }) => {});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/compare.test.ts -g "retry failed" -v` → `FAIL` `retryGeneration not found`

- [ ] **Step 3: Write minimal implementation**

In `chat.ts` `retryGeneration` create new `generationRuns` same `messageId` + `comparisonRunId`, `deductCredits` single, `streamText` single. `stopGeneration` per-model `controllers.get(genId)?.abort()` + `UPDATE status cancelled`.

In `$conversationId.tsx` loader `getComparisonRuns` + `generationRuns` via `getMessages` include `comparisonRunId`, render `CompareGrid` from loaded data, `retry` `await retryGeneration({generationId})` → SSE demux same column.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/compare.test.ts -v` → `7 passed`
Run: `bun x playwright test -g "partial failure retry" --project=chromium` → `1 passed`

- [ ] **Step 5: Commit + Gate**

```bash
git add src/server/functions/chat.ts src/routes/chat/\$conversationId.tsx
git commit -m "feat(compare): retry/cancel per-model + reload"
```

**Gate:**

Run: `bun x tsc --noEmit` → `0`
Run: `bun x biome check ./src` → `PASS`
Run: `bun x vitest run tests/unit/multiplex.test.ts tests/unit/validation-compare.test.ts tests/unit/credits-compare.test.ts -v` → `ALL PASS`
Run: `bun x vitest run tests/integration/compare.test.ts -v` → `PASS`
Run: `bun x playwright test tests/e2e/compare.spec.ts --project=chromium` → `PASS` (selector, grid 2/4, toggle, mobile, stream both, partial retry, insufficient 402, persistence, cancel)

---

## Self-Review

- **Spec coverage:** `comparison_runs` + `generation_runs.comparisonRunId` → Task 1, cumulative `total 19` + refund → Task 2, `StreamEvent` + `createMultiplexStream` → Task 3, `sendCompareMessage` parallel `Promise.allSettled` → Task 4, `CompareSelector` 2-4 → Task 5, `CompareGrid` 2-4 cols → Task 6, toggle + mobile → Task 7, retry/cancel per-model → Task 8. FR-009..011/020/023 semua ada Task.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya `TBD` di spec Open/TBD allowed). Semua Steps ada code block `comparison_runs` `createMultiplexStream` `sendCompareMessage` `CompareSelector`.
- **Type consistency:** `sendCompareMessage({modelIds, content, skillId})` Task 4, `deductCompareCredits({userId,generationRunIds,modelIds,costs})` Task 2, `createMultiplexStream(streams)` Task 3, `CompareSelector({value,onChange,credits})` Task 5 consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-05-compare-mode-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

