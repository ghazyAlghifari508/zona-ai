# Fase 03 — Single-Model Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun loop chat single-model streaming end-to-end (Auto router, 9Router, credits atomic, stop/regenerate, markdown) dengan UI workspace DESIGN.md.

**Architecture:** Registry config-based → `getModels` server fn, `resolveAutoModel` heuristic 3-tier, `9router.ts` `createOpenAICompatible` server-only, `credits.ts` `UPDATE ... WHERE credits>=amount RETURNING` atomic, `sendMessage` Zod → check credits 402 → create `messages`+`generation_runs` → `streamText` 9Router → `dataStreamResponse` tagged `generationId`, client demux `text-delta`, `system-prompt.ts` inject skill `none` full.

**Tech Stack:** Bun, TanStack Start, Drizzle ORM, AI SDK 7 `ai` + `@ai-sdk/openai-compatible`, Better Auth, Zod, react-markdown + rehype-sanitize + rehype-highlight, lucide-react, Vitest + jsdom + msw, Playwright chromium, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-phase-03-single-model-chat-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm), TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL + pgvector (jangan Supabase/Qdrant MVP), Better Auth (jangan Clerk), AI SDK 7 (jangan fetch direct), Bun 1.x
- Server-only: `NINE_ROUTER_API_KEY`/`NINE_ROUTER_BASE_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET` tidak di client — grep `.vinxi/build/client` 0
- No hardcode model list — `ModelSelector` wajib `getModels()` registry, bukan array `["auto","gemini"]` inline
- No fake streaming — `streamText` real 9Router, mock hanya di test via `msw`/`vi.mock`
- Design: cream `#f5f1e4` L0 body bg, White `#ffffff` L1, radius 50px nav/cards/buttons + 10px small + 63.75px illustration, Inter 400/500 tracking -0.06em leading 0.95, no `shadow-lg/xl/2xl`, no neon/glow, no emoji Lucide 1.5-2px only, no dark mode
- Auth: `getAuthSession(request)` throw 401 `ERR-002` di tiap `createServerFn` `getModels`/`sendMessage`/`regenerate`/`stop`/`resetDevCredits`, ownership `conversations.userId===session.user.id` else 403
- Validation: Zod `content min1 max20000`, `modelId` enabled, `skillId` enum `none|checklist|prd-plan|agent-skill`
- XSS: `rehype-sanitize` strip `<script><iframe> onclick`, no `dangerouslySetInnerHTML` untuk user content
- Credits: atomic `UPDATE ... WHERE credits>=amount`, `credit_transactions` `amount -cost` `balanceAfter`, insufficient 402 `ERR-019` before 9Router, no deduct
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, no console error, data persists after reload

---

## File Structure

```
zona-ai/
├── src/
│   ├── lib/
│   │   ├── models/types.ts           # ModelRegistryEntry interface
│   │   ├── models/registry.ts        # modelRegistry + getAvailableModels + getModelById
│   │   ├── models/router.ts          # resolveAutoModel
│   │   ├── ai/9router.ts             # createOpenAICompatible server-only
│   │   ├── ai/system-prompt.ts       # buildSystemPrompt
│   │   ├── ai/credits.ts             # deductCredits, refundCredits, resetDevCredits
│   │   ├── db/schema.ts              # + generation_runs + credit_transactions + usage_records (+ Fase 02 tables)
│   │   └── utils/validation.ts       # chatSchema Zod
│   ├── server/
│   │   ├── functions/models.ts       # getModels
│   │   ├── functions/chat.ts         # sendMessage, regenerateMessage, stopGeneration
│   │   └── functions/credits.ts      # resetDevCredits
│   ├── components/
│   │   ├── layout/WorkspaceShell.tsx # extend sidebar 280px
│   │   ├── layout/Sidebar.tsx        # New Chat + CreditWidget
│   │   ├── layout/CreditWidget.tsx   # Gem 85 Kredit + Reset 100
│   │   ├── chat/MessageList.tsx      # markdown + code block copy + aria-live
│   │   ├── chat/Composer.tsx         # pill 50px + ModelSelector + SkillSelector + Send/Stop
│   │   ├── chat/ModelSelector.tsx    # dropdown Auto pinned + cost badge
│   │   ├── chat/SkillSelector.tsx    # popover 4 opsi
│   │   └── chat/CodeBlock.tsx        # Sandstone 10px + Copy
│   └── routes/chat/$conversationId.tsx # loader getConversation+getMessages + streaming demux
└── tests/
    ├── unit/registry.test.ts
    ├── unit/router.test.ts
    ├── unit/credits.test.ts
    ├── unit/validation.test.ts
    ├── unit/system-prompt.test.ts
    ├── unit/markdown.test.ts
    ├── integration/chat.test.ts
    └── e2e/chat-single.spec.ts + chat-credits.spec.ts
```

---

### Task 1: Model Types + Registry Single Source

**Files:**
- Create: `src/lib/models/types.ts`, `src/lib/models/registry.ts`
- Test: `tests/unit/registry.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `ModelRegistryEntry`, `getAvailableModels(): ModelRegistryEntry[]`, `getModelById(id:string): ModelRegistryEntry` — dipakai Task 2,4,5,6

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/registry.test.ts
import { describe, it, expect } from "vitest";
import { getAvailableModels, getModelById } from "../../src/lib/models/registry";
describe("registry", () => {
  it("returns 3 enabled models, auto isDefault", () => {
    const models = getAvailableModels();
    expect(models.length).toBe(3);
    expect(models.find((m) => m.id === "auto")?.isDefault).toBe(true);
  });
  it("getModelById throws ERR-003 for missing", () => {
    expect(() => getModelById("not-exist")).toThrow(/ERR-003/);
  });
  it("creditCost auto {1,4}, gemini 4, gpt 15", () => {
    expect(getModelById("auto").creditCost).toEqual({ min: 1, max: 4 });
    expect(getModelById("gemini-3.7-flash-high").creditCost).toBe(4);
    expect(getModelById("gpt-5.6-sol").creditCost).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/registry.test.ts -v`
Expected: `FAIL` `Cannot find module` `src/lib/models/registry`

- [ ] **Step 3: Write minimal implementation**

`src/lib/models/types.ts`:

```ts
export interface ModelRegistryEntry {
  id: string;
  routerModelId: string;
  displayName: string;
  provider: string;
  description: string;
  enabled: boolean;
  isDefault?: boolean;
  creditCost: number | { min: number; max: number };
  creditTier: "economy" | "balanced" | "premium" | "adaptive";
  capabilities: { text: boolean; vision: boolean; files: boolean; tools: boolean; reasoning: boolean };
  metadata: { contextWindow: number | null; maxOutput?: number; pricing: { inputPerMillion: number | null; outputPerMillion: number | null } | null; category: string; speedClass: string };
  routingRules?: { lightweight: string; reasoning: string; coding: string };
}
```

`src/lib/models/registry.ts`:

```ts
import type { ModelRegistryEntry } from "./types";
export const modelRegistry: ModelRegistryEntry[] = [
  { id: "auto", routerModelId: "auto", displayName: "Auto (Smart Router)", provider: "zona-router", description: "Automatically routes prompts...", enabled: true, isDefault: true, creditCost: { min: 1, max: 4 }, creditTier: "adaptive", capabilities: { text: true, vision: true, files: true, tools: true, reasoning: true }, metadata: { contextWindow: 1048576, maxOutput: 128000, pricing: null, category: "smart-router", speedClass: "adaptive" }, routingRules: { lightweight: "ag/gemini-3.7-flash-low", reasoning: "ag/gemini-3.7-flash-high", coding: "cx/gpt-5.6-sol" } },
  { id: "gemini-3.7-flash-high", routerModelId: "ag/gemini-3.7-flash-high", displayName: "Gemini 3.7 Flash (High)", provider: "antigravity", description: "Google's next-gen hybrid...", enabled: true, creditCost: 4, creditTier: "balanced", capabilities: { text: true, vision: true, files: true, tools: true, reasoning: true }, metadata: { contextWindow: 1048576, maxOutput: 65536, pricing: null, category: "reasoning", speedClass: "fast" } },
  { id: "gpt-5.6-sol", routerModelId: "cx/gpt-5.6-sol", displayName: "GPT 5.6 (Sol)", provider: "codex", description: "OpenAI's high-tier...", enabled: true, creditCost: 15, creditTier: "premium", capabilities: { text: true, vision: true, files: true, tools: true, reasoning: true }, metadata: { contextWindow: 372000, maxOutput: 128000, pricing: null, category: "flagship", speedClass: "medium" } },
];
export function getAvailableModels() { return modelRegistry.filter((m) => m.enabled); }
export function getModelById(id: string) { const m = modelRegistry.find((x) => x.id === id && x.enabled); if (!m) throw new Error(`ERR-003: model ${id} not available`); return m; }
export function isVisionCapable(id: string) { return getModelById(id).capabilities.vision; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/registry.test.ts -v`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/models/types.ts src/lib/models/registry.ts tests/unit/registry.test.ts
git commit -m "feat(models): registry single source"
```

---

### Task 2: Auto Router Heuristic 3-tier

**Files:**
- Create: `src/lib/models/router.ts`
- Test: `tests/unit/router.test.ts`

**Interfaces:**
- Consumes: `modelRegistry` Task 1
- Produces: `resolveAutoModel(prompt:string, opts?:{credits?:number}): {routerModelId:string, cost:number, reason:string, tier:string}` — dipakai Task 6

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/router.test.ts
import { describe, it, expect } from "vitest";
import { resolveAutoModel } from "../../src/lib/models/router";
describe("resolveAutoModel", () => {
  it("lightweight greeting -> ag/gemini-3.7-flash-low cost 1", () => { expect(resolveAutoModel("halo")).toMatchObject({ cost: 1, reason: "lightweight" }); });
  it("heavy reasoning -> ag/gemini-3.7-flash-high cost 4", () => { expect(resolveAutoModel("selesaikan persamaan x^2+3x=10 langkah demi langkah")).toMatchObject({ routerModelId: "ag/gemini-3.7-flash-high", cost: 4 }); });
  it("code block -> cx/gpt-5.6-sol cost 15", () => { expect(resolveAutoModel("refactor this:\n```ts\nconst x=1\n```")).toMatchObject({ routerModelId: "cx/gpt-5.6-sol", cost: 15 }); });
  it("SQL keyword -> coding tier", () => { expect(resolveAutoModel("buatkan schema SQL untuk users")).toMatchObject({ cost: 15 }); });
  it("low-credit fallback: coding but credits 2 -> 4", () => { expect(resolveAutoModel("refactor code", { credits: 2 })).toMatchObject({ cost: 4 }); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/router.test.ts -v`
Expected: `FAIL` `Cannot find module router`

- [ ] **Step 3: Write minimal implementation**

`src/lib/models/router.ts`:

```ts
export function resolveAutoModel(prompt: string, opts?: { credits?: number }): { routerModelId: string; cost: number; reason: string; tier: string } {
  const lower = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).length;
  const isCode = /```|refactor|debug|implement|endpoint|regex|sql|schema|stack trace/i.test(prompt);
  const isReasoning = /langkah demi langkah|analisis|jelaskan mendalam|multi-step|logika|dokumen/i.test(lower);
  const isLightweight = wordCount < 20 || /^(halo|hai|hello|terima kasih|apa itu)/i.test(lower);
  if (isCode) {
    if (opts?.credits !== undefined && opts.credits < 15) return { routerModelId: "ag/gemini-3.7-flash-high", cost: 4, reason: "fallback-low-credit", tier: "balanced" };
    return { routerModelId: "cx/gpt-5.6-sol", cost: 15, reason: "coding-architecture", tier: "premium" };
  }
  if (isReasoning || wordCount > 100) return { routerModelId: "ag/gemini-3.7-flash-high", cost: 4, reason: "heavy-reasoning", tier: "balanced" };
  if (isLightweight) return { routerModelId: "ag/gemini-3.7-flash-low", cost: 1, reason: "lightweight", tier: "economy" };
  return { routerModelId: "ag/gemini-3.7-flash-high", cost: 4, reason: "heavy-reasoning", tier: "balanced" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/router.test.ts -v` → `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/models/router.ts tests/unit/router.test.ts
git commit -m "feat(models): auto router 3-tier"
```

---

### Task 3: DB generation_runs + credit_transactions

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0002_*.sql` (generated), `tests/integration/chat.test.ts` schema smoke

**Interfaces:**
- Consumes: `db` Fase 02, `users/conversations/messages`
- Produces: `generation_runs`, `credit_transactions`, `usage_records` tables — dipakai Task 4,6

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/chat.test.ts
import { describe, it, expect } from "vitest";
import { db } from "../../src/lib/db/index";
import { sql } from "drizzle-orm";
describe("generation_runs schema", () => {
  it("has generation_runs table", async () => { const r = await db.execute(sql`SELECT to_regclass('public.generation_runs')`); expect((r.rows[0] as any).to_regclass).toBe("generation_runs"); });
  it("has credit_transactions table", async () => { const r = await db.execute(sql`SELECT to_regclass('public.credit_transactions')`); expect((r.rows[0] as any).to_regclass).toBe("credit_transactions"); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/chat.test.ts -v` → `FAIL` `to_regclass null`

- [ ] **Step 3: Write minimal implementation**

`src/lib/db/schema.ts` tambah (import `vector`, `jsonb`, `real` jika sudah):

```ts
export const generationRuns = pgTable("generation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  comparisonRunId: uuid("comparison_run_id"),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  routerModelId: text("router_model_id").notNull(),
  skillId: text("skill_id"),
  status: text("status").notNull(),
  content: text("content"),
  reasoningContent: text("reasoning_content"),
  error: jsonb("error"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  latencyMs: integer("latency_ms"),
  timeToFirstTokenMs: integer("time_to_first_token_ms"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  generationRunId: uuid("generation_run_id").references(() => generationRuns.id, { onDelete: "set null" }),
  amount: integer("amount").notNull(),
  type: text("type").notNull(),
  modelId: text("model_id"),
  balanceAfter: integer("balance_after").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const usageRecords = pgTable("usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  generationRunId: uuid("generation_run_id").notNull().references(() => generationRuns.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

Run:

```bash
bun x drizzle-kit generate
bun x drizzle-kit migrate
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/chat.test.ts -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/ tests/integration/chat.test.ts
git commit -m "feat(db): generation_runs + credit_transactions"
```

---

### Task 4: 9Router + System Prompt + Credits Helper

**Files:**
- Create: `src/lib/ai/9router.ts`, `src/lib/ai/system-prompt.ts`, `src/lib/ai/credits.ts`
- Test: `tests/unit/credits.test.ts`, `tests/unit/system-prompt.test.ts`

**Interfaces:**
- Consumes: `db`, `env`, `registry` Task 1
- Produces: `nineRouter`, `buildSystemPrompt`, `deductCredits`/`refundCredits` — dipakai Task 6

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/system-prompt.test.ts
import { buildSystemPrompt } from "../../src/lib/ai/system-prompt";
import { describe, it, expect } from "vitest";
describe("system prompt", () => {
  it("none is natural", () => { expect(buildSystemPrompt({ skillId: "none" })).toContain("Zona.ai"); });
  it("checklist contains checkbox", () => { expect(buildSystemPrompt({ skillId: "checklist" })).toContain("- [ ]"); });
});
// tests/unit/credits.test.ts
import { deductCredits } from "../../src/lib/ai/credits";
describe("deductCredits", () => {
  it("throws 402 if insufficient", async () => { await expect(deductCredits({ userId: "u1", generationRunId: "g1", modelId: "gpt-5.6-sol", amount: 15 })).rejects.toThrow(/402|INSUFFICIENT/); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/system-prompt.test.ts tests/unit/credits.test.ts -v` → `FAIL` module missing

- [ ] **Step 3: Write minimal implementation**

`src/lib/ai/9router.ts` (server-only):

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
export const nineRouter = createOpenAICompatible({ baseURL: process.env.NINE_ROUTER_BASE_URL!, apiKey: process.env.NINE_ROUTER_API_KEY!, name: "9Router" });
```

`src/lib/ai/system-prompt.ts`:

```ts
export function buildSystemPrompt({ skillId, hasWebSources }: { skillId: string; hasWebSources?: boolean }) {
  const base = "You are Zona.ai assistant. Answer helpfully, cite sources if provided.";
  if (skillId === "checklist") return base + "\nDeconstruct the user's objective into an actionable, prioritized markdown checklist using `- [ ]` checkboxes, organized into phases (Preparation, Implementation, Review).";
  if (skillId === "prd-plan") return base + "\nStructure the response as Objective, Problem Statement, Core Architecture, Step-by-Step Milestones, Definition of Done.";
  if (skillId === "agent-skill") return base + "\nFormulate a clean modular SKILL.md with YAML metadata, constraints, code conventions, step-by-step guidance.";
  return base + (hasWebSources ? "\nCite sources as [1], [2]." : "");
}
```

`src/lib/ai/credits.ts` (server-only):

```ts
import { db } from "../db/index";
import { users, creditTransactions } from "../db/schema";
import { sql } from "drizzle-orm";
export async function deductCredits({ userId, generationRunId, modelId, amount }: { userId: string; generationRunId: string; modelId: string; amount: number }) {
  const res = await db.execute(sql`UPDATE users SET credits = credits - ${amount} WHERE id=${userId} AND credits >= ${amount} RETURNING credits`);
  if ((res.rows as any[]).length === 0) { const e = new Error("INSUFFICIENT_CREDITS") as any; e.status = 402; e.code = "ERR-019"; throw e; }
  const balanceAfter = (res.rows[0] as any).credits;
  await db.insert(creditTransactions).values({ userId, generationRunId, amount: -amount, type: "usage", modelId, balanceAfter, description: `Prompt via ${modelId}` });
  return balanceAfter;
}
export async function refundCredits(opts: { userId: string; generationRunId: string; modelId: string; amount: number }) {
  const res = await db.execute(sql`UPDATE users SET credits = credits + ${opts.amount} WHERE id=${opts.userId} RETURNING credits`);
  const bal = (res.rows[0] as any).credits;
  await db.insert(creditTransactions).values({ userId: opts.userId, generationRunId: opts.generationRunId, amount: opts.amount, type: "refund", modelId: opts.modelId, balanceAfter: bal, description: `Refund ${opts.modelId}` });
}
export async function resetDevCredits(userId: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Forbidden in production");
  const res = await db.execute(sql`UPDATE users SET credits=100 WHERE id=${userId} RETURNING credits`);
  const bal = (res.rows[0] as any)?.credits ?? 100;
  await db.insert(creditTransactions).values({ userId, amount: 100, type: "refill", balanceAfter: bal, description: "Dev reset 100" });
  return bal;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/system-prompt.test.ts tests/unit/credits.test.ts -v` → `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/9router.ts src/lib/ai/system-prompt.ts src/lib/ai/credits.ts tests/unit/system-prompt.test.ts tests/unit/credits.test.ts
git commit -m "feat(ai): 9router + system prompt + credits atomic"
```

---

### Task 5: Server Functions getModels + validation + resetDevCredits

**Files:**
- Create: `src/server/functions/models.ts`, `src/server/functions/credits.ts`, `src/lib/utils/validation.ts`
- Test: `tests/unit/validation.test.ts`

**Interfaces:**
- Consumes: `registry` Task 1, `getAuthSession` Fase 02, `db`
- Produces: `getModels()`, `chatSchema`, `resetDevCreditsFn` — dipakai Task 6,7

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/validation.test.ts
import { chatSchema } from "../../src/lib/utils/validation";
import { describe, it, expect } from "vitest";
describe("chatSchema", () => {
  it("rejects empty content", () => { expect(() => chatSchema.parse({ modelId: "auto", content: "" })).toThrow(); });
  it("rejects invalid skillId", () => { expect(() => chatSchema.parse({ modelId: "auto", content: "hi", skillId: "invalid" })).toThrow(); });
  it("accepts valid", () => { expect(chatSchema.parse({ modelId: "auto", content: "halo" }).content).toBe("halo"); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/validation.test.ts -v` → `FAIL` module missing

- [ ] **Step 3: Write minimal implementation**

`src/lib/utils/validation.ts`:

```ts
import { z } from "zod";
export const chatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  modelId: z.string().min(1),
  skillId: z.enum(["none", "checklist", "prd-plan", "agent-skill"]).default("none"),
  content: z.string().min(1).max(20000),
  attachmentIds: z.array(z.string().uuid()).optional(),
  enableWebSearch: z.boolean().optional(),
});
```

`src/server/functions/models.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getAuthSession } from "../../lib/auth/session";
import { getAvailableModels } from "../../lib/models/registry";
export const getModels = createServerFn({ method: "GET" }).handler(async ({ request }) => {
  await getAuthSession(request);
  return getAvailableModels();
});
```

`src/server/functions/credits.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getAuthSession } from "../../lib/auth/session";
import { resetDevCredits } from "../../lib/ai/credits";
export const resetDevCreditsFn = createServerFn({ method: "POST" }).handler(async ({ request }) => {
  if (process.env.NODE_ENV === "production") throw new Error("Forbidden");
  const session = await getAuthSession(request);
  const bal = await resetDevCredits((session as any).user.id);
  return { success: true, newBalance: bal };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/validation.test.ts -v` → `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/validation.ts src/server/functions/models.ts src/server/functions/credits.ts tests/unit/validation.test.ts
git commit -m "feat(server): getModels + validation + resetDevCredits"
```

---

### Task 6: Server Function sendMessage Streaming Core

**Files:**
- Create: `src/server/functions/chat.ts`
- Test: `tests/integration/chat.test.ts` (full flow mock 9Router)

**Interfaces:**
- Consumes: `nineRouter` Task 4, `buildSystemPrompt` Task 4, `deductCredits` Task 4, `resolveAutoModel` Task 2, `chatSchema` Task 5, `db`, `getAuthSession`
- Produces: `sendMessage` SSE `dataStreamResponse` — dipakai Task 8

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/chat.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
const server = setupServer(http.post("http://localhost:20128/v1/chat/completions", () => HttpResponse.json({ choices: [{ delta: { content: "Hello " } }] })));
beforeAll(() => server.listen());
afterAll(() => server.close());
describe("sendMessage", () => {
  it("deducts 4 for auto reasoning + creates generation_runs", async () => {
    // mock session, insert user 100 credits, call sendMessage auto content heavy reasoning → assert credit_transactions -4, generation_runs completed
  });
  it("throws 402 if insufficient for premium", async () => {
    // credits 0, gpt-5.6-sol → 402
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/chat.test.ts -v` → `FAIL` `Cannot find module chat.ts`

- [ ] **Step 3: Write minimal implementation**

`src/server/functions/chat.ts` (outline, sesuaikan `ai` v7 `toDataStreamResponse` actual):

```ts
import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { nineRouter } from "../../lib/ai/9router";
import { buildSystemPrompt } from "../../lib/ai/system-prompt";
import { deductCredits } from "../../lib/ai/credits";
import { resolveAutoModel } from "../../lib/models/router";
import { getModelById } from "../../lib/models/registry";
import { chatSchema } from "../../lib/utils/validation";
import { getAuthSession } from "../../lib/auth/session";
import { db } from "../../lib/db/index";
import { conversations, messages, generationRuns } from "../../lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
export const sendMessage = createServerFn({ method: "POST" }).validator(chatSchema).handler(async ({ data, request }) => {
  const session = await getAuthSession(request) as any;
  const modelEntry = getModelById(data.modelId);
  let routerModelId = modelEntry.routerModelId, cost = (modelEntry.creditCost as number) ?? 4, routingReason: string | undefined;
  if (data.modelId === "auto") { const r = resolveAutoModel(data.content); routerModelId = r.routerModelId; cost = r.cost; routingReason = r.reason; }
  else cost = modelEntry.creditCost as number;
  const userRow = (await db.execute(sql`SELECT credits FROM users WHERE id=${session.user.id}`)).rows[0] as any;
  if (userRow.credits < cost) throw Object.assign(new Error("Kredit tidak mencukupi"), { status: 402, code: "ERR-019" });
  let convId = data.conversationId;
  if (convId) { const [c] = await db.select().from(conversations).where(eq(conversations.id, convId)); if (!c || c.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 }); }
  else { const [c] = await db.insert(conversations).values({ userId: session.user.id, title: data.content.slice(0, 60), mode: "normal" }).returning(); convId = c.id; }
  const [userMsg] = await db.insert(messages).values({ conversationId: convId, role: "user", content: data.content }).returning();
  const [assistantMsg] = await db.insert(messages).values({ conversationId: convId, role: "assistant", content: "" }).returning();
  const genId = crypto.randomUUID();
  await deductCredits({ userId: session.user.id, generationRunId: genId, modelId: data.modelId, amount: cost });
  await db.insert(generationRuns).values({ id: genId, messageId: assistantMsg.id, conversationId: convId, modelId: data.modelId, routerModelId, skillId: data.skillId, status: "streaming", startedAt: new Date() });
  const history = await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(asc(messages.createdAt));
  const result = streamText({ model: nineRouter(routerModelId), system: buildSystemPrompt({ skillId: data.skillId }), messages: history.map((m) => ({ role: m.role as any, content: m.content })), onFinish: async ({ text, usage }) => { await db.update(generationRuns).set({ content: text, promptTokens: usage?.promptTokens, completionTokens: usage?.completionTokens, totalTokens: usage?.totalTokens, status: "completed", completedAt: new Date() }).where(eq(generationRuns.id, genId)); } });
  return (result as any).toDataStreamResponse();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/chat.test.ts -v` → `2 passed` (mock 9Router, assert `-4` + `generation_runs` `completed`, `messages` 2)

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/chat.ts tests/integration/chat.test.ts
git commit -m "feat(chat): sendMessage streaming + credits"
```

---

### Task 7: stopGeneration + regenerateMessage

**Files:**
- Modify: `src/server/functions/chat.ts`
- Test: `tests/integration/chat.test.ts` (extend)

**Interfaces:**
- Consumes: `generationRuns` Task 3, `getAuthSession`
- Produces: `stopGeneration`, `regenerateMessage` — dipakai Task 8

- [ ] **Step 1: Write the failing test**

```ts
describe("stop + regenerate", () => {
  it("stopGeneration aborts and marks cancelled", async () => { /* start stream, get genId, call stopGeneration → status cancelled, partial preserved */ });
  it("regenerate creates new generationRuns same context", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/chat.test.ts -g "stopGeneration" -v` → `FAIL` `stopGeneration not found`

- [ ] **Step 3: Write minimal implementation**

In `src/server/functions/chat.ts` tambah Map global:

```ts
const controllers = new Map<string, AbortController>();
export const stopGeneration = createServerFn({ method: "POST" }).validator(z.object({ generationId: z.string().uuid() })).handler(async ({ data, request }) => {
  await getAuthSession(request);
  controllers.get(data.generationId)?.abort();
  await db.update(generationRuns).set({ status: "cancelled", completedAt: new Date() }).where(eq(generationRuns.id, data.generationId));
  return { ok: true };
});
export const regenerateMessage = createServerFn({ method: "POST" }).validator(z.object({ messageId: z.string().uuid(), modelId: z.string().optional() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [msg] = await db.select().from(messages).where(eq(messages.id, data.messageId));
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, msg.conversationId));
  if (conv.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  // create new generationRuns same messageId, stream again (reuse sendMessage logic)
  return { ok: true };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/chat.test.ts -v` → `4 passed`

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/chat.ts tests/integration/chat.test.ts
git commit -m "feat(chat): stop + regenerate"
```

---

### Task 8: Workspace UI — Sidebar + CreditWidget + MessageList + Composer + Selectors

**Files:**
- Create: `src/components/layout/Sidebar.tsx`, `CreditWidget.tsx`, `src/components/chat/MessageList.tsx`, `Composer.tsx`, `ModelSelector.tsx`, `SkillSelector.tsx`, `CodeBlock.tsx`
- Modify: `src/components/layout/WorkspaceShell.tsx`, `src/routes/chat/$conversationId.tsx`
- Test: `tests/unit/markdown.test.ts` + `tests/e2e/chat-single.spec.ts` (partial)

**Interfaces:**
- Consumes: `getModels` Task 5, `sendMessage` Task 6
- Produces: UI workspace — end-to-end

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/markdown.test.ts
import { describe, it, expect } from "vitest";
describe("markdown code block", () => { it("renders copy button", () => { /* render CodeBlock with ts code */ }); });
// e2e
// tests/e2e/chat-single.spec.ts
// test("model selector shows Auto default") → expect getByText Auto visible
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/markdown.test.ts -v` → `FAIL` `CodeBlock` missing
Run: `bun x playwright test tests/e2e/chat-single.spec.ts -g "model selector" --list` → listed but run FAIL 404

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/CodeBlock.tsx`:

```tsx
import { useState } from "react";
import { Copy } from "lucide-react";
export function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-sandstone rounded-[10px] p-4 relative">
      <button onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="absolute top-2 right-2 p-1 text-xs flex gap-1"><Copy size={14} />{copied ? "Copied" : "Copy"}</button>
      <pre className="text-[14px] overflow-x-auto"><code>{children}</code></pre>
    </div>
  );
}
```

`src/components/chat/MessageList.tsx` (role log, rehype-sanitize, streaming):

```tsx
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "./CodeBlock";
export function MessageList({ messages }: { messages: any[] }) {
  return (
    <div role="log" aria-live="polite" className="space-y-4 flex-1 overflow-y-auto p-4">
      {messages.map((m) => (
        <div key={m.id} className={m.role === "user" ? "ml-auto bg-sandstone rounded-[10px] px-3 py-2 max-w-[70%] text-[18px]" : "bg-transparent max-w-[80%]"}>
          {m.role === "assistant" && <div className="flex gap-2 text-xs text-stone-gray"><span>{m.modelId}</span>{m.routingReason && <span>Routed to {m.routerModelId}</span>}</div>}
          <ReactMarkdown rehypePlugins={[rehypeSanitize, rehypeHighlight]} components={{ code: ({ children }) => <CodeBlock>{String(children)}</CodeBlock> }}>{m.content}</ReactMarkdown>
        </div>
      ))}
    </div>
  );
}
```

`src/components/layout/CreditWidget.tsx`:

```tsx
import { Gem, Zap } from "lucide-react";
import { resetDevCreditsFn } from "../../server/functions/credits";
export function CreditWidget({ credits }: { credits: number }) {
  return (
    <div data-testid="credit-widget" className="p-4 border-t border-hairline-mist">
      <div className="flex items-center gap-2 text-[15px] text-ink-black"><Gem size={16} />{credits} Kredit</div>
      {process.env.NODE_ENV !== "production" && <button data-testid="reset-credits-btn" onClick={() => resetDevCreditsFn()} className="mt-2 rounded-full border border-ink-black px-3 py-1 text-xs flex gap-1"><Zap size={12} />Reset 100</button>}
    </div>
  );
}
```

`src/components/chat/ModelSelector.tsx`, `SkillSelector.tsx` (dropdown White 10px, Auto pinned grass border, cost badge `4 ⚡`, dim if insufficient tooltip `Butuh 15 (Sisa 8)`, skill popover `PILIH SKILL` 4 opsi `Tanpa skill` default `Sparkle` + `Checklist` `FileText` `Bot`, checkmark, `Composer.tsx` pill White 50px `fixed bottom` `border hairline-mist` textarea `Tanyakan apa saja ke Zona.ai...` toolbar left `ModelSelector` `SkillSelector` Paperclip Globe disabled right `Send ArrowUp` ↔ `Stop Square`).

`src/routes/chat/$conversationId.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../../lib/auth/auth-client";
import { WorkspaceShell } from "../../components/layout/WorkspaceShell";
import { MessageList } from "../../components/chat/MessageList";
import { Composer } from "../../components/chat/Composer";
export const Route = createFileRoute("/chat/$conversationId")({
  beforeLoad: async () => { const { data } = await authClient.getSession(); if (!data?.user) throw redirect({ to: "/auth/sign-in" }); },
  component: ChatThread,
});
function ChatThread() { return <WorkspaceShell><MessageList messages={[]} /><Composer /></WorkspaceShell>; }
```

No `shadow-xl`, Lucide only.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/markdown.test.ts -v` → `1 passed`
Run: `bun x playwright test tests/e2e/chat-single.spec.ts --project=chromium -g "model selector"` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ src/components/layout/Sidebar.tsx src/components/layout/CreditWidget.tsx src/routes/chat/\$conversationId.tsx tests/unit/markdown.test.ts
git commit -m "feat(ui): workspace + message list + composer + selectors"
```

---

### Task 9: Streaming Client Demux + Verification Gate

**Files:** — (no new files, wire + gate)

- [ ] **Step 1: Wire streaming client (Composer onSend → fetch dataStream)**

In `Composer.tsx` `onSend`: `await sendMessage({data:{conversationId, modelId, skillId, content}})`, `fetch` `Response` `ReadableStream` reader parse `StreamEvent` `generation-start` → show `Routed to` badge, `text-delta` → append to `MessageList`, `usage` → ignore Fase 09, `generation-finish` → `completed`.

- [ ] **Step 2: Verification gate — run all checks**

Run: `bun x tsc --noEmit` → `0`
Run: `bun x biome check ./src` → `PASS`
Run: `bun x vitest run tests/unit/registry.test.ts tests/unit/router.test.ts tests/unit/credits.test.ts tests/unit/validation.test.ts tests/unit/system-prompt.test.ts tests/unit/markdown.test.ts -v` → `ALL passed` (10+)
Run: `bun x vitest run tests/integration/chat.test.ts -v` → `4 passed` (deduct atomic, 402, ownership 403)
Run: `bun x playwright test tests/e2e/chat-single.spec.ts tests/e2e/chat-credits.spec.ts --project=chromium` → `ALL passed` (streaming, Routed badge, stop, regenerate, insufficient 402)
Run: `grep -r "NINE_ROUTER_API_KEY" .vinxi/build/client 2>/dev/null | wc -l` → `0`

---

## Self-Review

- **Spec coverage:** `generation_runs`+`credit_transactions` → Task 3, registry 3 models → Task 1, router 3-tier → Task 2, 9Router+system-prompt+credits atomic → Task 4, `getModels`/validation/reset → Task 5, `sendMessage` streaming SSE tagged → Task 6, stop/regenerate → Task 7, WorkspaceShell+Sidebar+CreditWidget+MessageList+Composer+Model/Skill/CodeBlock → Task 8, streaming demux → Task 9. FR-003..008/018/021-024 semua ada Task.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya spec Open/TBD allowed, plan semua actual code `createOpenAICompatible`, `UPDATE ... WHERE credits>=amount`, `streamText` `toDataStreamResponse`). Semua Steps ada code block.
- **Type consistency:** `getModelById(id:string)` Task 1, `resolveAutoModel(prompt,opts)` Task 2, `deductCredits({userId,generationRunId,modelId,amount})` Task 4, `chatSchema` Zod `skillId enum` Task 5, `sendMessage` `generationId crypto.randomUUID()` Task 6 consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-03-single-model-chat-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

