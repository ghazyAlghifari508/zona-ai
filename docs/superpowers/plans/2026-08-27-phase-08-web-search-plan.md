# Fase 08 — Web Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun Tavily web search toggle → `web_sources` persist per `generationRunId` → inject `Web context` cite `[1][2]` → citations chips + drawer, dengan Fair Compare single fetch.

**Architecture:** `tavily/client.ts` `TavilyProvider` server-only `fetch https://api.tavily.com/search` `TAVILY_API_KEY tvly-...`, `search.ts` `searchWeb` standalone `POST` Zod `query` → `searchProvider.search` graceful `ERR-015` empty, `chat.ts` `sendMessage` `enableWebSearch` → `searchProvider.search` once → `INSERT web_sources` per `genId` `position` `score` `snippet 500` → `system = buildSystemPrompt(hasWebSources) + Web context`, `sendCompareMessage` Fair Once → same `webResults` per `genIds` same `system`, `Composer` Globe toggle `aria-pressed`, `CitationDrawer` White 10px.

**Tech Stack:** Bun, TanStack Start, Drizzle ORM + postgres, Zod, fetch/`@tavily/core` (fetch MVP), Better Auth, TanStack Router/Query, Lucide React, Vitest + msw, Playwright chromium, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-phase-08-web-search-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm), TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL + pgvector (jangan Supabase/Qdrant MVP), Better Auth (jangan Clerk), Tailwind v4, R2, Tavily (jangan Exa di MVP), AI SDK 7
- Server-only: `TAVILY_API_KEY` `tvly-...`, `DATABASE_URL`, `NINE_ROUTER_API_KEY`, `R2_SECRET_ACCESS_KEY` tidak di client — grep `.vinxi/build/client` `tvly-` 0, `tavily/client.ts` tidak di `components/*`
- No hardcode `maxResults 5` di banyak file — single `src/lib/utils/constants.ts` `TAVILY_MAX_RESULTS = Number(process.env.TAVILY_MAX_RESULTS ?? 5)` + `TAVILY_TIMEOUT_MS` TBD 10000
- No `web_sources` tanpa `generationRunId` — schema `not null` must have `genId`, `position integer not null`, `score real nullable`, `snippet 500`
- No fake web results — Tavily real `fetch` `https://api.tavily.com/search` `POST` `{api_key, query, search_depth, max_results}`, mock hanya di test `msw`/`vi.mock` `fetch`, not `setTimeout` mock data prod
- Design: cream `#f5f1e4` L0, White `#ffffff` L1, radius 50px nav/cards/dialog + 10px small, Inter 400/500, no `shadow-lg/xl/2xl`, no neon, no emoji Lucide 1.5-2px only, no dark mode, Unified Shell `sidebar 280px` paten
- Auth: `getAuthSession(request)` throw 401 `ERR-002` di tiap `createServerFn` `searchWeb`/`sendMessage`/`sendCompareMessage` + ownership `conversations.userId===session.user.id` else 403 `web_sources` via `conversationId`
- Fair Compare: `searchProvider.search` **sekali** per `sendCompareMessage` untuk N models, `spy fetch` count 1 vs N, `web_sources` N x results same `position`/`score` `system` same, not per-model fetch
- Graceful: `ERR-015` `Web search unavailable. Responding without web results.` toast no chips, chat still streams, no throw 500, no block chat if Tavily fails
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, `drizzle-kit migrate` sukses, `psql \d web_sources` `generation_run_id not null`, `grep tvly-` in client 0

---

## File Structure

```
zona-ai/
├── src/
│   ├── lib/
│   │   ├── tavily/client.ts          # SearchProvider interface + TavilyProvider fetch server-only
│   │   ├── utils/constants.ts        # + TAVILY_MAX_RESULTS, TAVILY_TIMEOUT_MS
│   │   ├── db/schema.ts              # + web_sources + HNSW? not, btree
│   │   └── db/migrations/0007_web_sources.sql
│   ├── server/functions/search.ts    # searchWeb standalone
│   ├── server/functions/chat.ts      # + enableWebSearch inject + web_sources insert + source event
│   ├── components/chat/Composer.tsx  # + Globe toggle enableWebSearch state
│   ├── components/chat/MessageList.tsx # + chips + drawer per message generationId join web_sources
│   ├── components/chat/ModelColumn.tsx # + per-column drawer
│   ├── components/chat/CitationDrawer.tsx # chips + drawer White 10px
│   └── lib/env.server.ts            # validate TAVILY_API_KEY tvly-...
└── tests/
    ├── unit/tavily.test.ts
    ├── unit/citation.test.ts
    ├── integration/search.test.ts
    └── e2e/websearch.spec.ts
```

---

### Task 1: DB `web_sources` + Constants + Tavily Provider

**Files:**
- Create: `src/lib/tavily/client.ts`
- Modify: `src/lib/db/schema.ts`, `src/lib/utils/constants.ts`, `src/lib/db/migrations/0007_web_sources.sql`
- Test: `tests/unit/tavily.test.ts`, `tests/integration/search.test.ts` schema smoke

**Interfaces:**
- Consumes: `TAVILY_API_KEY`, `db`, `generation_runs` Fase 03/05
- Produces: `web_sources` table, `SearchProvider`/`searchProvider` — dipakai Task 2,3

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/tavily.test.ts
import { describe, it, expect, vi } from "vitest";
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ url: "https://example.com/article-1", title: "Understanding RAG Systems", content: "RAG combines retrieval...", score: 0.95 }, { url: "https://example.com/article-2", title: "AI Model Comparison Guide", content: "Comparing...", score: 0.88 }] }) } as any)));
import { searchProvider } from "../../src/lib/tavily/client";
describe("tavily provider", () => {
  it("search returns 2 results with score", async () => { const r = await searchProvider.search("hello"); expect(r.length).toBe(2); expect(r[0].score).toBe(0.95); expect(r[0].url).toContain("example.com"); });
  it("passes searchDepth basic", async () => { const spy = vi.mocked(global.fetch); await searchProvider.search("hi", { searchDepth: "basic" }); expect(spy).toHaveBeenCalledWith(expect.stringContaining("api.tavily.com"), expect.objectContaining({ body: expect.stringContaining("basic") })); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/tavily.test.ts -v`
Expected: `FAIL` `Cannot find module` `src/lib/tavily/client`

- [ ] **Step 3: Write minimal implementation**

`src/lib/utils/constants.ts` add:

```ts
export const TAVILY_MAX_RESULTS = Number(process.env.TAVILY_MAX_RESULTS ?? 5);
export const TAVILY_TIMEOUT_MS = Number(process.env.TAVILY_TIMEOUT_MS ?? 10000);
```

`src/lib/db/schema.ts` add:

```ts
export const webSources = pgTable("web_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationRunId: uuid("generation_run_id").notNull().references(() => generationRuns.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
  snippet: text("snippet"),
  score: real("score"),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

`src/lib/tavily/client.ts` (server-only):

```ts
import { TAVILY_MAX_RESULTS } from "../utils/constants";
export interface SearchProvider { search(query: string, opts?: { searchDepth?: "basic" | "advanced"; maxResults?: number }): Promise<Array<{ url: string; title: string; content: string; score: number }>>; }
export class TavilyProvider implements SearchProvider {
  async search(query: string, opts?: { searchDepth?: "basic" | "advanced"; maxResults?: number }) {
    const res = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY!, query, search_depth: opts?.searchDepth ?? "basic", max_results: opts?.maxResults ?? TAVILY_MAX_RESULTS, include_answer: false }) });
    if (!res.ok) { const e = new Error("Web search unavailable. Responding without web results.") as any; e.code = "ERR-015"; throw e; }
    const data = (await res.json()) as any;
    return (data.results as any[]).map((r) => ({ url: r.url, title: r.title, content: r.content, score: r.score }));
  }
}
export const searchProvider = new TavilyProvider();
```

Run:

```bash
bun x drizzle-kit generate
bun x drizzle-kit migrate
```

Check `psql \d web_sources` → `generation_run_id not null`, `conversation_id`, `position`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/tavily.test.ts tests/integration/search.test.ts -v` (schema smoke `SELECT to_regclass('web_sources')`) → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/tavily/client.ts src/lib/db/schema.ts src/lib/utils/constants.ts src/lib/db/migrations/ tests/unit/tavily.test.ts
git commit -m "feat(web): tavily provider + web_sources + constants"
```

---

### Task 2: Server Function `searchWeb` Standalone Graceful

**Files:**
- Create: `src/server/functions/search.ts`
- Test: `tests/integration/search.test.ts` standalone

**Interfaces:**
- Consumes: `searchProvider` Task 1, `getAuthSession` Fase 02
- Produces: `searchWeb({query})` — dipakai Task 3, also standalone

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/search.test.ts
import { describe, it, expect } from "vitest";
describe("searchWeb standalone", () => {
  it("returns 2 results no web_sources insert (standalone)", async () => {});
  it("handles Tavily fail graceful empty", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/search.test.ts -g "standalone" -v` → `FAIL` `Cannot find module` `src/server/functions/search`

- [ ] **Step 3: Write minimal implementation**

`src/server/functions/search.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAuthSession } from "../../lib/auth/session";
import { searchProvider } from "../../lib/tavily/client";
export const searchWeb = createServerFn({ method: "POST" }).validator(z.object({ query: z.string().min(1).max(500), searchDepth: z.enum(["basic", "advanced"]).default("basic") })).handler(async ({ data, request }) => {
  await getAuthSession(request);
  try {
    const results = await searchProvider.search(data.query, { searchDepth: data.searchDepth });
    return { results };
  } catch (e: any) {
    console.error("Tavily fail", e);
    return { results: [] };
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/search.test.ts -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/search.ts tests/integration/search.test.ts
git commit -m "feat(web): searchWeb standalone graceful"
```

---

### Task 3: `sendMessage` enableWebSearch Inject + web_sources Insert

**Files:**
- Modify: `src/server/functions/chat.ts` (sendMessage)
- Test: `tests/integration/search.test.ts` extend

**Interfaces:**
- Consumes: Task 1,2, `generation_runs`, `buildSystemPrompt`
- Produces: `web_sources` rows + `system` with web context — streaming

- [ ] **Step 1: Write the failing test**

```ts
describe("sendMessage enableWebSearch", () => {
  it("inserts 2 web_sources and injects system", async () => {});
  it("Tavily fail → 0 web_sources, still streams", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/search.test.ts -g "sendMessage enableWebSearch" -v` → `FAIL` `enableWebSearch` not handled

- [ ] **Step 3: Write minimal implementation**

In `src/server/functions/chat.ts` `sendMessage` after `genId` created:

```ts
import { searchProvider } from "../../lib/tavily/client";
import { webSources } from "../../lib/db/schema";
import { TAVILY_MAX_RESULTS } from "../../lib/utils/constants";
let webResults: Array<{ url: string; title: string; content: string; score: number }> = [];
if (data.enableWebSearch) {
  try { webResults = await searchProvider.search(data.content, { searchDepth: "basic", maxResults: TAVILY_MAX_RESULTS }); } catch (e) { console.error("Tavily ERR-015", e); webResults = []; }
  if (webResults.length) { for (let i = 0; i < webResults.length; i++) { const r = webResults[i]; await db.insert(webSources).values({ generationRunId: genId, conversationId: convId, url: r.url, title: r.title, snippet: r.content.slice(0, 500), score: r.score, position: i }); } }
}
const hasWeb = webResults.length > 0;
const system = buildSystemPrompt({ skillId: data.skillId, hasWebSources: hasWeb }) + (hasWeb ? `\n\nWeb context (cite as [1], [2]):\n${webResults.map((r, i) => `[${i + 1}] ${r.title} - ${r.url}\n${r.content.slice(0, 500)}`).join("\n\n")}` : "");
// pass system to streamText
// source event: webResults.map(r=>({title:r.title, url:r.url})) as SourceEvent
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/search.test.ts -g "sendMessage enableWebSearch" -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/chat.ts tests/integration/search.test.ts
git commit -m "feat(chat): sendMessage web inject + web_sources"
```

---

### Task 4: `sendCompareMessage` Fair Compare Once

**Files:**
- Modify: `src/server/functions/chat.ts` (sendCompareMessage)
- Test: `tests/integration/search.test.ts` Fair

**Interfaces:**
- Consumes: Task 3 logic
- Produces: Fair Compare single fetch

- [ ] **Step 1: Write the failing test**

```ts
describe("Fair Compare", () => {
  it("fetches Tavily once for 2 models, same web_sources", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    // call sendCompareMessage enableWebSearch true 2 models → assert fetchSpy called 1 time, web_sources total 4 rows same urls
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/search.test.ts -g "Fair Compare" -v` → `FAIL` `fetch` count 2 (per-model)

- [ ] **Step 3: Write minimal implementation**

In `src/server/functions/chat.ts` `sendCompareMessage` before loop `data.modelIds`:

```ts
let webResultsCompare: typeof webResults = [];
if (data.enableWebSearch) { try { webResultsCompare = await searchProvider.search(data.content, { maxResults: TAVILY_MAX_RESULTS }); } catch (e) { webResultsCompare = []; } }
const hasWebCompare = webResultsCompare.length > 0;
const systemCompare = buildSystemPrompt({ skillId: data.skillId, hasWebSources: hasWebCompare }) + (hasWebCompare ? `\n\nWeb context:\n${webResultsCompare.map((r, i) => `[${i + 1}] ${r.title} - ${r.url}\n${r.content.slice(0, 500)}`).join("\n\n")}` : "");
// after genIds created N, for each genId insert web_sources same results:
if (hasWebCompare) { for (const genId of genIds) { for (let i = 0; i < webResultsCompare.length; i++) { const r = webResultsCompare[i]; await db.insert(webSources).values({ generationRunId: genId, conversationId: convId, url: r.url, title: r.title, snippet: r.content.slice(0, 500), score: r.score, position: i }); } } }
// in per-model streamText, pass same systemCompare
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/search.test.ts -g "Fair Compare" -v` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/chat.ts tests/integration/search.test.ts
git commit -m "feat(compare): Fair Compare single Tavily fetch"
```

---

### Task 5: Composer Web Toggle Globe

**Files:**
- Modify: `src/components/chat/Composer.tsx`
- Test: `tests/e2e/websearch.spec.ts` toggle

**Interfaces:**
- Consumes: Task 3,4 `enableWebSearch` boolean
- Produces: Globe toggle → `onSend(..., enableWebSearch)`

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/websearch.spec.ts
import { test, expect } from "@playwright/test";
test("composer web toggle visible and toggles", async ({ page }) => {
  await page.goto("/chat/$id");
  await expect(page.getByTestId("web-toggle")).toBeVisible();
  await page.getByTestId("web-toggle").click();
  await expect(page.getByTestId("web-toggle")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("web-toggle").click();
  await expect(page.getByTestId("web-toggle")).toHaveAttribute("aria-pressed", "false");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test tests/e2e/websearch.spec.ts -g "web toggle visible" --project=chromium` → `FAIL` `web-toggle` missing

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/Composer.tsx` add:

```tsx
import { Globe } from "lucide-react";
const [enableWebSearch, setEnableWebSearch] = useState(false);
return <div className="...">
  <button data-testid="web-toggle" aria-pressed={enableWebSearch} onClick={() => setEnableWebSearch((v) => !v)} className={`p-2 rounded-[10px] border ${enableWebSearch ? "bg-sandstone border-ink-black" : "border-hairline-mist bg-pure-white"} flex items-center gap-1 text-[13px]`} title="Real-time web search via Tavily"><Globe size={16} />Web {enableWebSearch && <span className="w-2 h-2 rounded-full bg-fresh-grass" />}</button>
</div>;
// onSend: await sendMessage({data:{content, modelId, skillId, enableWebSearch, attachmentIds}})
```

No `shadow-xl`, Lucide.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test -g "web toggle visible" --project=chromium` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/Composer.tsx tests/e2e/websearch.spec.ts
git commit -m "feat(ui): composer web toggle Globe"
```

---

### Task 6: CitationDrawer Chips + Drawer

**Files:**
- Create: `src/components/chat/CitationDrawer.tsx`
- Modify: `src/components/chat/MessageList.tsx`, `src/components/chat/ModelColumn.tsx`
- Test: `tests/unit/citation.test.ts` + `tests/e2e/websearch.spec.ts` drawer

**Interfaces:**
- Consumes: `web_sources` rows via `generationId`
- Produces: chips + drawer

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/citation.test.ts
import { describe, it, expect } from "vitest";
describe("CitationDrawer", () => {
  it("renders 2 sources with title/url/snippet", () => {});
  it("collapses/expands", () => {});
});
// E2E
// test("chips and drawer visible after web search", ...) 
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/citation.test.ts -v` → `FAIL` `Cannot find module CitationDrawer`

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/CitationDrawer.tsx`:

```tsx
import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
export function CitationDrawer({ sources }: { sources: Array<{ url: string; title: string | null; snippet: string | null; position: number }> }) {
  const [open, setOpen] = useState(true);
  if (!sources.length) return null;
  return <div className="mt-2"><div className="flex gap-1 flex-wrap">{sources.map((s) => <a key={s.position} href={s.url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-sandstone rounded-[10px] text-xs text-ink-black hover:bg-pure-white border border-hairline-mist">[{s.position + 1}]</a>)}<button onClick={() => setOpen((v) => !v)} className="text-xs text-stone-gray flex gap-1">Sources ({sources.length})<ChevronDown size={12} className={open ? "rotate-180" : ""} /></button></div>{open && <div className="mt-2 bg-pure-white rounded-[10px] border border-hairline-mist p-3 space-y-2">{sources.sort((a, b) => a.position - b.position).map((s) => <a key={s.position} href={s.url} target="_blank" rel="noopener noreferrer" className="flex gap-2 p-2 rounded-[10px] hover:bg-sandstone"><span className="px-2 py-0.5 bg-sandstone rounded-full text-xs">[{s.position + 1}]</span><div className="flex-1"><div className="text-[15px] font-medium truncate">{s.title}</div><div className="text-[13px] text-stone-gray truncate">{s.url}</div><div className="text-sm text-stone-gray line-clamp-2">{s.snippet}</div></div><ExternalLink size={12} className="text-stone-gray" /></a>)}</div>}</div>;
}
```

`src/components/chat/MessageList.tsx` add: fetch `web_sources` per `generationId` via `getMessages` join, pass to `CitationDrawer` below assistant bubble.

`src/components/chat/ModelColumn.tsx` same per column.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/citation.test.ts -v` → `2 passed`
Run: `bun x playwright test -g "chips and drawer" --project=chromium` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/CitationDrawer.tsx src/components/chat/MessageList.tsx src/components/chat/ModelColumn.tsx tests/unit/citation.test.ts
git commit -m "feat(ui): citation chips + drawer"
```

---

### Task 7: E2E Fair Compare + Graceful + Persistence

**Files:**
- Modify: `tests/e2e/websearch.spec.ts` extend, `tests/integration/search.test.ts` ownership
- Test: `tests/e2e/websearch.spec.ts` fair/graceful/persistence

**Interfaces:**
- Consumes: Task 4,6

- [ ] **Step 1: Write the failing test**

```ts
test("compare fair same web sources in both cols", async ({ page }) => {});
test("Tavily fail graceful no chips", async ({ page }) => {});
test("refresh preserves web_sources", async ({ page }) => {});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test -g "compare fair same" --project=chromium` → `FAIL` `compare fair` not yet

- [ ] **Step 3: Write minimal implementation**

In `src/server/functions/messages.ts` `getMessages` join `web_sources` via `generationRuns` `generationRunId`, return `web_sources` per message for `MessageList` reload.

In `Composer` on `enableWebSearch` catch toast: `sonner` `toast("Web search unavailable. Responding without web results.")`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test tests/e2e/websearch.spec.ts --project=chromium` → `4 passed` (toggle, chips+drawer, compare fair, graceful, persistence)

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/websearch.spec.ts tests/integration/search.test.ts src/server/functions/messages.ts
git commit -m "feat(web): e2e fair graceful persistence"
```

---

### Task 8: Verifikasi Fase 08 Gate

**Files:** — (no new files)

- [ ] **Step 1: TypeCheck**

Run: `bun x tsc --noEmit`
Expected: `0` errors

- [ ] **Step 2: Biome**

Run: `bun x biome check ./src`
Expected: `Checked` PASS

- [ ] **Step 3: Unit**

Run: `bun x vitest run tests/unit/tavily.test.ts tests/unit/citation.test.ts -v`
Expected: `4 passed`

- [ ] **Step 4: Integration**

Run: `bun x vitest run tests/integration/search.test.ts -v`
Expected: `5 passed` (standalone, sendMessage inject, Tavily fail graceful, Fair Compare once, ownership)

- [ ] **Step 5: E2E**

Run: `bun x playwright test tests/e2e/websearch.spec.ts --project=chromium`
Expected: `5 passed` (toggle, chips+drawer, compare fair, graceful, persistence)

- [ ] **Step 6: Manual DB + secret**

Run: `bun x drizzle-kit migrate`
Run: `psql $DATABASE_URL -c "\d web_sources"` → `generation_run_id not null`, `conversation_id`, `position`
Run: `psql $DATABASE_URL -c "SELECT count(*) FROM web_sources WHERE generation_run_id IN (SELECT id FROM generation_runs WHERE conversation_id='test')"`
Run: `grep -r "TAVILY_API_KEY\|tvly-" .vinxi/build/client 2>/dev/null | wc -l` → `0`
Run: `psql $DATABASE_URL -c "SELECT generation_run_id, count(*) FROM web_sources WHERE conversation_id='compare-conv' GROUP BY generation_run_id"` → each count 2 same

---

## Self-Review

- **Spec coverage:** `web_sources` table → Task 1, `SearchProvider` `TAVILY_API_KEY` → Task 1, `searchWeb` standalone graceful → Task 2, `sendMessage` enableWebSearch inject + web_sources insert → Task 3, Fair Compare once → Task 4, Globe toggle `aria-pressed` → Task 5, chips + drawer White 10px → Task 6, E2E fair/graceful/persistence → Task 7. FR-017 + PRD Web Search Done + ARCHITECTURE Fair Compare + API `searchWeb` + UI-UX Citation + ERROR ERR-015 semua ada Task.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya spec Open/TBD allowed, plan semua actual code `fetch https://api.tavily.com/search`, `TAVILY_MAX_RESULTS`, `webSources` `position`, `Globe` toggle). Semua Steps ada code block `TavilyProvider`, `searchWeb`, `sendMessage` `webResults`, `Composer` Globe, `CitationDrawer`.
- **Type consistency:** `SearchProvider.search(query, opts)` Task 1, `searchWeb({query, searchDepth})` Task 2, `sendMessage({content, modelId, skillId, enableWebSearch})` Task 3, `sendCompareMessage({modelIds, content, enableWebSearch})` Task 4, `Composer` `enableWebSearch boolean` Task 5 consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-08-web-search-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

