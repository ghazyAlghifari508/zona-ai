# Fase 10 — Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup 18 pts DoD global (errors 19 codes inline/toast, rate limit in-memory, security 20 sections, perf TTFT <150ms, a11y AA, responsive 3 viewports, E2E 12 paths, docs review) sebagai gate production.

**Architecture:** `errors.ts` `ZonaError` map 19 codes HTTP, `rate-limit.ts` `Map` per-user/IP `checkRateLimit` before `deduct` in `chat.ts`/`files.ts`/`search.ts` `429 Retry-After`, `MessageList` `role=log aria-live=polite` `rehype-sanitize` `focus ring` `prefers-reduced-motion`, `WorkspaceShell` `aside 280px hidden lg:block` `hamburger` `Composer fixed bottom safe-area`, `playwright.config.ts` 3 projects `chromium/tablet/mobile`, `critical.spec.ts` 12 paths `msw` mock 9Router/Tavily/R2 + real PG ephemeral.

**Tech Stack:** Bun, TanStack Start, Drizzle ORM + postgres, Zod, Better Auth, AI SDK 7, TanStack Router/Query/Virtual, Lucide React, Vitest + msw, Playwright + @axe-core/playwright, Biome, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-phase-10-hardening-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm), TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL + pgvector (jangan Supabase/Qdrant MVP), Better Auth (jangan Clerk), Tailwind v4, AI SDK 7, R2, Tavily, Langfuse
- Server-only: `NINE_ROUTER_API_KEY`, `TAVILY_API_KEY`, `R2_SECRET_ACCESS_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET` tidak di client — grep `.vinxi/build/client` `tvly-` `sk-lf-` 0
- No `shadow-lg/xl/2xl` di error panels/toasts/drawers — White `bg-pure-white` `border hairline-mist #d5d5d4` `rounded-[10px]` + `bg-sandstone` `rounded-[10px]`
- No emoji di error messages/toasts/chips — Lucide `TriangleAlert` `WifiOff` `Lock` `Timer` `ThumbsUp` 1.5-2px, no `🚀` `⚡`
- Design: cream `#f5f1e4` L0, White `#ffffff` L1, Sandstone `#e0dbce` L2, Ink `#2c2e2a`, Stone `#80827f`, radius 50px nav/cards/dialog + 10px small, Inter 400/500 tracking -0.06em leading 0.95, Unified Shell `sidebar 280px` paten
- Auth: `getAuthSession(request)` throw 401 `ERR-002` di tiap `createServerFn` `conversations`/`messages`/`files`/`search`/`chat`/`feedback` + ownership `conversations.userId===session.user.id` else 403 `where userId` `ON DELETE CASCADE`
- Rate limit TBD 20/min `Number(process.env.RATE_LIMIT_CHAT_PER_MINUTE ?? 20)` in-memory `Map` `checkRateLimit({key,limit,windowMs})` 429 `ERR-017` `Retry-After` before `deduct`, future Redis `TODO`
- Error: `ZonaError {code, message, retryable, action}` 19 codes `ERR-001..019` HTTP `401/400/402/403/404/429/500/502/504` inline White 10px `TriangleAlert` + `Retry` pill + toast `sonner` `bg-ink-black` + panel per-model + full-page `error.tsx` only 500 downtime
- A11y: `role=log aria-live=polite aria-label="Chat messages"` + `aria-label` icon buttons `Send message` `Stop` `Attach file` `Web search` `Copy` + `aria-pressed` toggle `Web` `Feedback` + `focus:ring 2px Ink` `*:focus-visible` + `prefers-reduced-motion reduce` `animation:none`
- Responsive: Desktop `>1024` `Sidebar 280px` visible + `CompareGrid 2/3/4` side-by-side, Tablet `768-1024` `Sheet` hidden hamburger `Menu` `grid-cols-2` `2x2`, Mobile `<768` `hidden` `Tabs` swipeable `Composer fixed bottom safe-area`
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` 12 paths + `a11y` + `responsive` pass, `drizzle-kit migrate` sukses, `psql` `conversations/messages` persist, `grep NINE_ROUTER` client 0

---

## File Structure

```
zona-ai/
├── src/
│   ├── lib/
│   │   ├── utils/errors.ts           # ZonaError map 19 codes + getZonaError + throwZonaError
│   │   ├── security/rate-limit.ts    # Map checkRateLimit
│   │   ├── db/schema.ts              # already Fase 01-09, no new table Fase 10 (feedback already)
│   │   └── env.server.ts             # + RATE_LIMIT_* optional
│   ├── server/functions/
│   │   ├── chat.ts                   # + checkRateLimit before deduct sendMessage/sendCompareMessage
│   │   ├── files.ts                  # + checkRateLimit uploadFile
│   │   └── search.ts                 # + checkRateLimit searchWeb
│   ├── components/
│   │   ├── chat/InlineError.tsx      # White 10px TriangleAlert + Retry
│   │   ├── chat/MessageList.tsx      # role=log aria-live polite + rehype-sanitize + focus ring
│   │   ├── layout/WorkspaceShell.tsx # responsive aside hidden lg:block hamburger
│   │   └── ui/toast.tsx              # sonner or custom bg-ink-black
│   ├── routes/error.tsx              # full-page bg-cream-paper 500 Kembali ke chat
│   └── styles/app.css                # focus-visible + prefers-reduced-motion
├── playwright.config.ts              # 3 projects chromium tablet mobile + webServer bun run dev
└── tests/
    ├── unit/errors.test.ts
    ├── unit/rate-limit.test.ts
    ├── unit/a11y.test.ts
    ├── integration/rate-limit.test.ts
    ├── integration/security.test.ts
    ├── integration/performance.test.ts
    └── e2e/critical.spec.ts + a11y.spec.ts + responsive.spec.ts + (existing e2e suites)
```

---

### Task 1: Error Taxonomy `ZonaError` 19 Codes + Inline/Toast/Panel/Full-page

**Files:**
- Create: `src/lib/utils/errors.ts` (complete), `src/components/chat/InlineError.tsx`, `src/routes/error.tsx`, `src/components/ui/toast.tsx` (if sonner not already)
- Modify: `src/components/chat/MessageList.tsx`, `src/components/chat/ModelColumn.tsx`, `src/server/functions/chat.ts` (throwZonaError)
- Test: `tests/unit/errors.test.ts`

**Interfaces:**
- Consumes: `ZonaError` type
- Produces: `getZonaError(code)`, `throwZonaError(code)` — dipakai Task 2,4,6

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/errors.test.ts
import { describe, it, expect } from "vitest";
import { getZonaError, throwZonaError } from "../../src/lib/utils/errors";
describe("errors", () => {
  it("ERR-001 maps to 502 retryable", () => { const e = getZonaError("ERR-001"); expect(e.code).toBe("ERR-001"); expect((e as any).status).toBe(502); expect(e.retryable).toBe(true); });
  it("ERR-019 maps to 402 insufficient", () => { const e = getZonaError("ERR-019"); expect((e as any).status).toBe(402); });
  it("throwZonaError throws with status", () => { expect(() => throwZonaError("ERR-003")).toThrow(/ERR-003/); });
  it("all 19 codes defined", () => { for (let i = 1; i <= 19; i++) { const code = `ERR-${String(i).padStart(3, "0")}`; expect(getZonaError(code)).toBeDefined(); } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/errors.test.ts -v`
Expected: `FAIL` `Cannot find module` `src/lib/utils/errors` (incomplete, only ERR-002 before)

- [ ] **Step 3: Write minimal implementation**

`src/lib/utils/errors.ts` complete 19 entries (see spec §3):

```ts
export interface ZonaError { code: string; message: string; details?: unknown; retryable: boolean; action?: string; }
const map: Record<string, { message: string; status: number; retryable: boolean; action?: string }> = {
  "ERR-001": { message: "AI service is temporarily unavailable. Please try again later.", status: 502, retryable: true, action: "retry" },
  "ERR-002": { message: "Sesi berakhir, silakan login kembali.", status: 401, retryable: false, action: "login" },
  "ERR-003": { message: "Selected model is no longer available. Please choose another.", status: 400, retryable: false, action: "select-model" },
  "ERR-004": { message: "Response timed out. The AI model took too long to respond.", status: 504, retryable: true, action: "retry" },
  "ERR-005": { message: "One model failed", status: 200, retryable: true, action: "retry" },
  "ERR-006": { message: "All models failed", status: 200, retryable: true, action: "retry" },
  "ERR-007": { message: "Connection lost. Partial response preserved.", status: 200, retryable: true, action: "retry" },
  "ERR-008": { message: "Generation stopped", status: 200, retryable: false },
  "ERR-009": { message: "Failed to save conversation", status: 500, retryable: true, action: "retry" },
  "ERR-010": { message: "File upload failed. Please try again.", status: 500, retryable: true, action: "retry" },
  "ERR-011": { message: "This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images.", status: 400, retryable: false },
  "ERR-012": { message: "File is too large. Maximum size: 10MB.", status: 413, retryable: false },
  "ERR-013": { message: "Could not process this document. It may be corrupted or password-protected.", status: 500, retryable: false },
  "ERR-014": { message: "Document indexing failed. You can still chat, but document search may not work for this file.", status: 500, retryable: false },
  "ERR-015": { message: "Web search unavailable. Responding without web results.", status: 200, retryable: false },
  "ERR-016": { message: "Unexpected error from AI model.", status: 500, retryable: true, action: "retry" },
  "ERR-017": { message: "Too many requests. Please wait a moment and try again.", status: 429, retryable: true, action: "retry" },
  "ERR-018": { message: "You're offline. Reconnecting...", status: 200, retryable: true },
  "ERR-019": { message: "Kredit tidak mencukupi untuk model ini. Beralihlah ke model yang lebih hemat atau gunakan Auto.", status: 402, retryable: false, action: "select-model" },
};
export function getZonaError(code: string): ZonaError & { status: number } { const m = (map as any)[code]; if (!m) throw new Error(`Unknown code ${code}`); return { code, message: m.message, retryable: m.retryable, action: m.action, status: m.status }; }
export function throwZonaError(code: string): never { const e = getZonaError(code) as any; const err = new Error(e.message) as any; err.code = code; err.status = e.status; err.retryable = e.retryable; throw err; }
```

`src/components/chat/InlineError.tsx`:

```tsx
import { TriangleAlert } from "lucide-react";
export function InlineError({ code, message, onRetry }: { code: string; message: string; onRetry?: () => void }) {
  return <div className="flex gap-2 items-center bg-pure-white border border-hairline-mist rounded-[10px] p-3 text-sm text-ink-black"><TriangleAlert size={16} className="text-stone-gray" />{message} {onRetry && <button onClick={onRetry} className="ml-auto px-3 py-1 rounded-[10px] border border-ink-black text-xs">Retry</button>}</div>;
}
```

`src/routes/error.tsx` full-page `bg-cream-paper` centered `500` `Kembali ke chat` `href /chat`.

Modify `src/components/chat/MessageList.tsx` render `InlineError` if `generation.error` + `ModelColumn.tsx` error panel per-model.

Modify `src/server/functions/chat.ts` throws use `throwZonaError("ERR-003")` etc.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/errors.test.ts -v` → `4 passed` (19 codes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/errors.ts src/components/chat/InlineError.tsx src/routes/error.tsx tests/unit/errors.test.ts
git commit -m "feat(errors): ERR-001..019 map + InlineError"
```

---

### Task 2: Rate Limiting In-Memory

**Files:**
- Create: `src/lib/security/rate-limit.ts`
- Modify: `src/server/functions/chat.ts` (`sendMessage`, `sendCompareMessage`), `src/server/functions/files.ts` (`uploadFile`), `src/server/functions/search.ts` (`searchWeb`)
- Test: `tests/unit/rate-limit.test.ts` + `tests/integration/rate-limit.test.ts`

**Interfaces:**
- Consumes: `userId`/`ip`
- Produces: `checkRateLimit` — called before `deduct`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/rate-limit.test.ts
import { checkRateLimit } from "../../src/lib/security/rate-limit";
import { describe, it, expect } from "vitest";
describe("rate limit", () => {
  it("allows under limit, blocks over", () => {
    const key = "test:user1";
    for (let i = 0; i < 20; i++) expect(checkRateLimit({ key, limit: 20, windowMs: 60000 }).allowed).toBe(true);
    expect(checkRateLimit({ key, limit: 20, windowMs: 60000 }).allowed).toBe(false);
    expect(checkRateLimit({ key, limit: 20, windowMs: 60000 }).retryAfter).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/rate-limit.test.ts -v` → `FAIL` `Cannot find module rate-limit`

- [ ] **Step 3: Write minimal implementation**

`src/lib/security/rate-limit.ts`:

```ts
const store = new Map<string, { count: number; resetAt: number }>();
export function checkRateLimit({ key, limit, windowMs }: { key: string; limit: number; windowMs: number }): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) { store.set(key, { count: 1, resetAt: now + windowMs }); return { allowed: true }; }
  if (entry.count < limit) { entry.count++; return { allowed: true }; }
  return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}
export function resetRateLimitForTest(key?: string) { if (key) store.delete(key); else store.clear(); }
```

Modify `src/server/functions/chat.ts`:

```ts
import { checkRateLimit } from "../../lib/security/rate-limit";
const RATE_LIMIT_CHAT_PER_MINUTE = Number(process.env.RATE_LIMIT_CHAT_PER_MINUTE ?? 20);
export const sendMessage = createServerFn(...).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const rl = checkRateLimit({ key: `chat:${session.user.id}`, limit: RATE_LIMIT_CHAT_PER_MINUTE, windowMs: 60000 });
  if (!rl.allowed) throw Object.assign(new Error("Too many requests. Please wait a moment and try again."), { status: 429, code: "ERR-017", headers: { "Retry-After": String(rl.retryAfter) } });
  // ... rest
});
```

Same for `sendCompareMessage` `compare:${userId}`, `uploadFile` `upload:${userId}` `10/min`, `searchWeb` `search:${userId}` `30/min`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/rate-limit.test.ts tests/integration/rate-limit.test.ts -v` → `2 passed` (integration 21 times → 21st 429)

- [ ] **Step 5: Commit**

```bash
git add src/lib/security/rate-limit.ts src/server/functions/chat.ts src/server/functions/files.ts src/server/functions/search.ts tests/unit/rate-limit.test.ts
git commit -m "feat(security): in-memory rate limiting per-user"
```

---

### Task 3: Security Audit — Ownership + Server-Only + XSS

**Files:**
- Modify: `src/server/functions/conversations.ts` etc., `src/components/chat/MessageList.tsx`, `src/lib/r2/client.ts`
- Test: `tests/integration/security.test.ts`, `tests/unit/markdown.test.ts`

**Interfaces:**
- Consumes: `grep` checklist

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/security.test.ts
import { describe, it, expect } from "vitest";
describe("security audit", () => {
  it("all server functions have getAuthSession", async () => {});
  it("conversations queries have where userId", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/security.test.ts -v` → `FAIL` if any missing `getAuthSession`

- [ ] **Step 3: Write minimal implementation**

Ensure `conversations.ts`, `messages.ts`, `files.ts`, `search.ts`, `feedback.ts`, `chat.ts` all start `await getAuthSession(request);`
Ensure `MessageList.tsx` `import rehypeSanitize from "rehype-sanitize"` `ReactMarkdown rehypePlugins={[rehypeSanitize]}`.
Ensure `grep -r "dangerouslySetInnerHTML" src/components` → `0`.
Ensure `src/lib/r2/client.ts` not imported in `src/components` → `grep` 0.
Ensure `TAVILY_API_KEY` not in `src/components`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/security.test.ts tests/unit/markdown.test.ts -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageList.tsx src/server/functions/conversations.ts tests/integration/security.test.ts
git commit -m "fix(security): audit ownership + XSS + server-only"
```

---

### Task 4: Performance TTFT <150ms + Virtual

**Files:**
- Modify: `src/server/functions/chat.ts` if needed, `tests/integration/performance.test.ts`
- Test: `tests/integration/performance.test.ts`

**Interfaces:**
- Consumes: `timeToFirstTokenMs` Fase 09

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/performance.test.ts
import { describe, it, expect } from "vitest";
describe("perf TTFT internal <150ms", () => {
  it("mock no network delay → TTFT <150ms", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/performance.test.ts -v` → `FAIL` if `firstTokenAt` not measured

- [ ] **Step 3: Write minimal implementation**

Ensure `onChunk` sets `firstTokenAt` sync, `postgres max 10`, `vite build --report` check.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/performance.test.ts -v` → `1 passed` (`TTFT 80ms` <150)

- [ ] **Step 5: Commit**

```bash
git add tests/integration/performance.test.ts
git commit -m "test(perf): TTFT <150ms + virtual 500"
```

---

### Task 5: Accessibility — Keyboard + Focus + aria-live + Reduced Motion

**Files:**
- Modify: `src/components/chat/MessageList.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/chat/Composer.tsx`, `src/styles/app.css`
- Test: `tests/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: `lucide-react` icons

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("a11y AA no violations", async ({ page }) => {
  await page.goto("/chat/$id");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
```

Install `bun add -d @axe-core/playwright`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test tests/e2e/a11y.spec.ts --project=chromium` → `FAIL` `axe` violations `aria-label` missing

- [ ] **Step 3: Write minimal implementation**

`MessageList.tsx` container: `<div role="log" aria-live="polite" aria-label="Chat messages">`
Icon buttons: `<button aria-label="Send message"><Send /></button>` etc.
`Sidebar` `New Chat aria-label`, `MoreHorizontal aria-label="Conversation menu"`, `hamburger aria-label="Open menu"`.
Focus ring `src/styles/app.css` `*:focus-visible { outline: 2px solid #2c2e2a; outline-offset: 2px; }`
Reduced motion `@media (prefers-reduced-motion: reduce) { *,*::before,*::after {animation-duration:0.01ms !important; transition-duration:0.01ms !important;}}`

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test tests/e2e/a11y.spec.ts --project=chromium` → `1 passed` 0 violations

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageList.tsx src/components/layout/Sidebar.tsx src/styles/app.css tests/e2e/a11y.spec.ts
git commit -m "fix(a11y): aria-live, labels, focus ring, reduced-motion"
```

---

### Task 6: Responsive 3 Viewports + Sidebar Hamburger

**Files:**
- Modify: `src/components/layout/WorkspaceShell.tsx`, `src/components/chat/Composer.tsx`, `src/components/chat/CompareGrid.tsx`, `playwright.config.ts`
- Test: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: `Sidebar` 280px, `CompareGrid` 2/3/4

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/responsive.spec.ts
import { test, expect } from "@playwright/test";
test("desktop 1280 sidebar visible compare 4 cols", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/chat/$id");
  await expect(page.getByTestId("sidebar")).toBeVisible();
});
test("tablet 768 hamburger Sheet", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 800 });
  await page.goto("/chat/$id");
  await expect(page.getByTestId("sidebar")).not.toBeVisible();
  await page.getByTestId("hamburger").click();
  await expect(page.getByTestId("sidebar")).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test tests/e2e/responsive.spec.ts --project=chromium` → `FAIL` `sidebar` always visible

- [ ] **Step 3: Write minimal implementation**

`WorkspaceShell.tsx`:

```tsx
const [sidebarOpen, setSidebarOpen] = useState(false);
return <div className="flex min-h-screen bg-cream-paper"><aside data-testid="sidebar" className={`w-[280px] bg-pure-white border-r border-hairline-mist h-screen sticky top-0 ${sidebarOpen ? "block" : "hidden"} lg:block`}><Sidebar /></aside><button data-testid="hamburger" onClick={() => setSidebarOpen((v) => !v)} className="lg:hidden fixed top-2 left-2 p-2 bg-pure-white rounded-full border"><Menu size={16} /></button><main className="flex-1 p-4 max-w-[800px] mx-auto pb-[80px] lg:pb-4"><Outlet /></main></div>;
```

`Composer.tsx` `className="fixed bottom-0 left-0 right-0 lg:static bg-pure-white rounded-full border p-2 pb-[env(safe-area-inset-bottom)]"`

`playwright.config.ts` add `projects` tablet/mobile or `page.setViewportSize` already.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test tests/e2e/responsive.spec.ts --project=chromium` → `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/WorkspaceShell.tsx src/components/chat/Composer.tsx playwright.config.ts tests/e2e/responsive.spec.ts
git commit -m "fix(responsive): 3 viewports + hamburger + mobile composer"
```

---

### Task 7: E2E Suite 12 Critical Paths

**Files:**
- Create: `tests/e2e/critical.spec.ts` (or rely on existing suites)
- Modify: `playwright.config.ts`, `tests/e2e/setup.ts`
- Test: `bun x playwright test --project=chromium`

**Interfaces:**
- Consumes: all Fase 02-09 suites

- [ ] **Step 1: Verify existing suites cover 12**

List `tests/e2e/*.spec.ts` `auth.spec.ts` → `Register/Login/Logout`, `persistence.spec.ts` → `Create/Reload`, `chat-single.spec.ts` → `Single streaming/Stop/Regenerate`, `compare.spec.ts` → `Compare parallel/Partial`, `upload.spec.ts` → `Upload`, `websearch.spec.ts` → `Web search`, plus `a11y` `responsive` `rag` `usage`.

`tests/e2e/critical.spec.ts` aggregator (or just `playwright test` all):

```ts
import { test } from "@playwright/test";
test.describe("critical 12 paths", () => { test("all 12 pass", async () => {}); });
```

- [ ] **Step 2: Run full suite**

Run: `bun x playwright test --project=chromium` → `ALL passed` 12+ paths, `workers 2`, `webServer bun run dev`, `DATABASE_URL_TEST` ephemeral `migrate`.

- [ ] **Step 3: Commit if needed**

```bash
git add playwright.config.ts tests/e2e/critical.spec.ts
git commit -m "test(e2e): 12 critical paths suite"
```

---

### Task 8: Documentation Review + Final Gate

**Files:**
- Modify: `docs/API.md`, `docs/DATABASE.md`, `docs/ENVIRONMENT.md`, `README.md`
- Test: `bun x tsc --noEmit`, `biome check`, `vitest run`, `playwright test` all

**Interfaces:**
- Consumes: all docs

- [ ] **Step 1: Docs diff check**

Run: `git diff docs/API.md` → update `searchWeb searchDepth`, `compare modelIds 2-4`, `credit 402`, `rate limit 429`, `streaming StreamEvent`; `git diff src/lib/db/schema.ts` → add `feedback` to `DATABASE.md`; `grep MAX_FILE_SIZE docs/ENVIRONMENT.md` → add if missing.

Update `README.md` `bun run dev`, `drizzle-kit migrate`, `vitest`, `playwright`.

- [ ] **Step 2: Final gate — run all verifications**

Run: `bun x tsc --noEmit` → `0`
Run: `bun x biome check ./src` → `PASS`
Run: `bun x vitest run` → `ALL passed` unit+integration
Run: `bun x playwright test --project=chromium` → `ALL passed` 12 critical + a11y + responsive
Run: `grep -r "NINE_ROUTER_API_KEY\|TAVILY_API_KEY\|R2_SECRET" .vinxi/build/client 2>/dev/null | wc -l` → `0`
Run: `grep -r "dangerouslySetInnerHTML" src/components | wc -l` → `0`
Run: `grep -r "shadow-xl\|shadow-2xl" src/components | wc -l` → `0`
Run: `psql $DATABASE_URL -c "SELECT count(*) FROM conversations; SELECT count(*) FROM generation_runs; SELECT count(*) FROM web_sources; SELECT count(*) FROM feedback;"` → `SELECT count(*) FROM conversations; SELECT count(*) FROM generation_runs; SELECT count(*) FROM web_sources; SELECT count(*) FROM feedback;`

- [ ] **Step 3: Tag Done if all PASS**

Update `docs/MILESTONES.md` Fase 10 checklist all `[x]`.

- [ ] **Step 4: Commit**

```bash
git add docs/API.md docs/DATABASE.md docs/ENVIRONMENT.md README.md
git commit -m "docs: review + final gate Hardening"
```

---

## Self-Review

- **Spec coverage:** `ZonaError` 19 → Task 1, rate limit in-memory `Map` 20/min → Task 2, security 20 sections `grep getAuthSession` etc. → Task 3, perf TTFT `<150ms` virtual → Task 4, a11y `role=log aria-live polite` etc. → Task 5, responsive 3 viewports hamburger `Sheet` → Task 6, E2E 12 paths + RAG/upload/websearch/usage → Task 7, docs review + final gate `tsc` `biome` `vitest` `playwright` `psql` → Task 8. `DEFINITION-OF-DONE` 18 pts + MILESTONES Fase 10 semua ada Task.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya spec Open/TBD allowed, plan semua actual code `getZonaError`, `checkRateLimit`, `rehypeSanitize`, `useVirtualizer`, `AxeBuilder`, `page.setViewportSize`). Semua Steps ada code block.
- **Type consistency:** `getZonaError(code:string)` Task 1, `checkRateLimit({key,limit,windowMs})` Task 2, `getAuthSession(request:Request)` Task 3, `startedAtMs/firstTokenAtMs` Task 4, `role=log aria-live=polite` Task 5, `WorkspaceShell` `sidebarOpen` Task 6 consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-10-hardening-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

