# Fase 01 — Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun scaffolding TanStack Start + Bun yang dapat di-build dan diverifikasi (tooling, tokens DESIGN.md, dua shell anti-slop, env Zod fail-fast, struktur direktori) sebagai fondasi Fase 02–11.

**Architecture:** Monolith TanStack Start file-based routing di atas Bun, `app.config.ts` + Vite + Tailwind v4 `@theme` + `viteTsConfigPaths`, `__root.tsx` import `app.css` + Inter, `PublicShell`/`WorkspaceShell` cream `#f5f1e4` White `#ffffff` radius 50px tanpa `shadow-xl`, `env.server.ts` Zod parse 18 vars server-only, tests Vitest jsdom + Playwright chromium.

**Tech Stack:** Bun, TypeScript, TanStack Start, TanStack Router, React, Tailwind CSS v4 + `@tailwindcss/vite`, Biome, Vitest + jsdom + @testing-library/react, Playwright, Zod, shadcn/ui (components.json), vite-tsconfig-paths

**Spec:** `docs/superpowers/specs/2026-08-27-phase-01-foundation-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm/pnpm), TanStack Start (jangan Next.js/Express/Elysia), Drizzle placeholder (jangan Prisma), PostgreSQL (jangan Supabase/Mongo), Better Auth (jangan Clerk), Tailwind v4 (jangan v3 config)
- No hardcode model list — belum ada model di Fase 01
- Server-only env: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `NINE_ROUTER_API_KEY`, `R2_SECRET_ACCESS_KEY`, `TAVILY_API_KEY`, `LANGFUSE_SECRET_KEY` tidak boleh di client bundle — grep `.vinxi/build/client` 0
- Design: cream `#f5f1e4` L0 body bg, White `#ffffff` L1 cards/nav, Sandstone `#e0dbce` L2, Ink `#2c2e2a` text, Grass `#8ed462` accent, radius 50px nav/cards/buttons + 10px small + 63.75px illustration, Inter 400/500 tracking -0.06em leading 0.95, no `shadow-lg/xl/2xl`, no neon/glow, no `gradient text`, no `pill-in-pill`, no emoji Lucide only, no dark mode/glassmorphism
- Layout: Unified App Shell — PublicShell `max-width 1200px` floating pill nav 50px, WorkspaceShell `sidebar 280px` White + main Cream, tidak ganti antar route
- Validation: Zod 18 vars fail-fast di `env.server.ts` (DATABASE_URL postgresql://, BETTER_AUTH_SECRET≥32, BETTER_AUTH_URL url, GOOGLE_CLIENT_ID .apps.googleusercontent.com, GOOGLE_CLIENT_SECRET min10, NINE_ROUTER_BASE_URL /v1, R2_* , TAVILY_API_KEY tvly-, LANGFUSE optional, APP_URL, NODE_ENV)
- No fake behavior: no fake progress, no mock data prod, UI dari signal nyata
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, no console error

---

## File Structure

```
zona-ai/
├── app.config.ts                 # TanStack Start defineConfig, vite plugins tailwindcss + viteTsConfigPaths
├── tsconfig.json                 # target ESNext, jsx react-jsx, strict, paths @/*, types vite/client
├── drizzle.config.ts             # placeholder dialect postgresql, schema ./src/lib/db/schema.ts, out ./src/lib/db/migrations
├── biome.json                    # extends //, linter recommended:true, formatter space 2 single quote
├── vitest.config.ts              # viteTsConfigPaths, environment jsdom, include tests/unit/**/*.test.ts
├── playwright.config.ts          # testDir tests/e2e, webServer bun run dev 3000 reuseExistingServer !CI, baseURL, projects chromium
├── components.json               # shadcn alias @/components, tailwind v4
├── src/
│   ├── styles/app.css            # @import tailwindcss; @theme tokens DESIGN.md
│   ├── lib/env.server.ts        # Zod parse 18 vars server-only
│   ├── lib/db/.gitkeep
│   ├── lib/auth/.gitkeep
│   ├── lib/models/.gitkeep
│   ├── lib/ai/.gitkeep
│   ├── server/functions/.gitkeep
│   ├── components/layout/PublicShell.tsx  # White pill nav 50px + cream
│   ├── components/layout/WorkspaceShell.tsx # sidebar 280px White + main Cream
│   ├── components/ui/            # button, dialog, popover, dropdown-menu (shadcn, no shadow-xl)
│   ├── routes/__root.tsx         # createRootRoute + Outlet + app.css + Inter link
│   └── routes/index.tsx          # createFileRoute / PublicShell hero 144px
└── tests/
    ├── unit/smoke.test.ts
    ├── unit/env.test.ts
    └── e2e/landing.spec.ts
```

---

### Task 1: Init TanStack Start + Bun + TS Config

**Files:**
- Create: `package.json`, `app.config.ts`, `tsconfig.json`

**Interfaces:**
- Consumes: Bun runtime `bun --version`
- Produces: `app.config.ts` (defineConfig) — dipakai Task 5 tailwind, `tsconfig.json` paths `@/*` — dipakai Task 2–5

- [ ] **Step 1: Write failing check (no package.json yet)**

```bash
test -f package.json || echo "missing package.json"
```

- [ ] **Step 2: Run to verify it fails**

Run: `test -f package.json; echo $?`
Expected: `1` (missing) atau `package.json` tidak ada

- [ ] **Step 3: Write minimal implementation**

```bash
bun init -y
bun add react react-dom @tanstack/react-start @tanstack/react-router
bun add -d typescript @types/react @types/react-dom vite vite-tsconfig-paths
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "jsx": "react-jsx",
    "strict": true,
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] },
    "types": ["vite/client"]
  },
  "include": ["src", "app.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`app.config.ts`:

```ts
import { defineConfig } from "@tanstack/react-start/config";
import viteTsConfigPaths from "vite-tsconfig-paths";
export default defineConfig({
  vite: { plugins: [viteTsConfigPaths()] },
});
```

`package.json` scripts:

```json
{ "scripts": { "dev": "vinxi dev", "build": "vinxi build", "start": "vinxi start" } }
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun --version` → `1.x` ; `bun install` → `installed` ; `bun x tsc --noEmit` → `0` (no errors)

- [ ] **Step 5: Commit**

```bash
git add package.json app.config.ts tsconfig.json bun.lockb
git commit -m "feat(foundation): init TanStack Start + Bun"
```

---

### Task 2: Biome Lint/Format

**Files:**
- Create: `biome.json`

**Interfaces:**
- Consumes: `tsconfig.json` Task 1
- Produces: `biome.json` — dipakai Task 8 gate `biome check`

- [ ] **Step 1: Write failing check**

```bash
test -f biome.json || echo "missing biome.json"
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun x biome check ./src 2>&1 | head -n 5`
Expected: `No configuration file found` atau missing `biome.json`

- [ ] **Step 3: Write minimal implementation**

```bash
bun add -d @biomejs/biome
```

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "extends": ["//"],
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": false } }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun x biome check ./src`
Expected: `Checked 0 files` (no files yet) → PASS, no error

- [ ] **Step 5: Commit**

```bash
git add biome.json
git commit -m "chore: biome config"
```

---

### Task 3: Vitest Config + Smoke Test

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: `tsconfig.json` Task 1
- Produces: `vitest.config.ts` — dipakai Task 8

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/smoke.test.ts
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("1+1=2", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (config missing)**

Run: `bun x vitest run tests/unit/smoke.test.ts -v`
Expected: `Cannot find vitest.config` atau `vitest.config.ts` missing → FAIL

- [ ] **Step 3: Write minimal implementation**

```bash
bun add -d vitest jsdom @testing-library/react @testing-library/jest-dom
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "src/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/smoke.test.ts -v`
Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/unit/smoke.test.ts
git commit -m "test: vitest + smoke"
```

---

### Task 4: Playwright Config + Landing Smoke E2E

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `app.config.ts` Task 1
- Produces: `playwright.config.ts` — dipakai Task 7–8

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/landing.spec.ts
import { test, expect } from "@playwright/test";
test("landing renders cream and nav pill", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Zona\.ai/ })).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toContain("245");
});
```

- [ ] **Step 2: Run test to verify it fails (no server yet)**

Run: `bun x playwright test tests/e2e/landing.spec.ts --project=chromium --list`
Expected: `1 test` listed but run FAIL (cannot connect 3000) — config exists but app not yet

- [ ] **Step 3: Write minimal implementation**

```bash
bun add -d @playwright/test
bun x playwright install --with-deps chromium
```

`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  webServer: { command: "bun run dev", port: 3000, reuseExistingServer: !process.env.CI, timeout: 120 * 1000 },
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
```

- [ ] **Step 4: Run to verify config valid (list)**

Run: `bun x playwright test --list`
Expected: `1 test` listed

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/landing.spec.ts
git commit -m "test: playwright config + landing smoke"
```

---

### Task 5: Tailwind v4 @theme Tokens DESIGN.md

**Files:**
- Create: `src/styles/app.css`
- Modify: `app.config.ts`

**Interfaces:**
- Consumes: `app.config.ts` Task 1
- Produces: `src/styles/app.css` — dipakai Task 7 shells, `__root.tsx` import

- [ ] **Step 1: Write failing check (no app.css)**

```bash
test -f src/styles/app.css || echo "missing app.css"
```

- [ ] **Step 2: Run to verify it fails**

Run: `test -f src/styles/app.css; echo $?`
Expected: `1`

- [ ] **Step 3: Write minimal implementation**

```bash
bun add tailwindcss @tailwindcss/vite
```

`src/styles/app.css`:

```css
@import "tailwindcss";
@theme {
  --color-fresh-grass: #8ed462;
  --color-cream-paper: #f5f1e4;
  --color-ink-black: #2c2e2a;
  --color-pure-white: #ffffff;
  --color-sandstone: #e0dbce;
  --color-stone-gray: #80827f;
  --color-hairline-mist: #d5d5d4;
  --color-pure-ink: #000000;
  --color-sky-pop: #2ba0ff;
  --color-coral-pop: #ff705d;
  --color-sunshine-pop: #f5e211;
  --font-inter: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --radius-full: 50px;
  --radius-full-2: 63.75px;
  --radius-lg: 10px;
  --text-display-lg: 144px;
  --leading-display-lg: 0.95;
  --tracking-display-lg: -8.64px;
}
body {
  background: var(--color-cream-paper);
  font-family: var(--font-inter);
  color: var(--color-ink-black);
}
```

`app.config.ts` update:

```ts
import { defineConfig } from "@tanstack/react-start/config";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  vite: { plugins: [tailwindcss(), viteTsConfigPaths()] },
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun x tsc --noEmit`
Expected: `0` (no errors, app.css imported later)

- [ ] **Step 5: Commit**

```bash
git add src/styles/app.css app.config.ts
git commit -m "style: tailwind v4 @theme DESIGN.md tokens"
```

---

### Task 6: shadcn/ui Baseline + Env Validation + Drizzle Placeholder

**Files:**
- Create: `components.json`, `src/components/ui/button.tsx` (generated), `src/lib/env.server.ts`, `drizzle.config.ts`, `tests/unit/env.test.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: `src/styles/app.css` Task 5
- Produces: `src/lib/env.server.ts` (Zod 18 vars) — dipakai Fase 02, `drizzle.config.ts` placeholder — dipakai Fase 02

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/env.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
const envSchema = z.object({ DATABASE_URL: z.string().url().startsWith("postgresql://"), BETTER_AUTH_SECRET: z.string().min(32) });
describe("env", () => {
  it("rejects missing DATABASE_URL", () => {
    expect(() => envSchema.parse({ DATABASE_URL: "invalid", BETTER_AUTH_SECRET: "short" })).toThrow();
  });
  it("rejects BETTER_AUTH_SECRET <32", () => {
    expect(() => envSchema.parse({ DATABASE_URL: "postgresql://a@b/c", BETTER_AUTH_SECRET: "short" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (env.server.ts missing)**

Run: `bun x vitest run tests/unit/env.test.ts -v`
Expected: FAIL (env.test imports real env.server not found) atau test file missing env.server → but test above is self-contained so may PASS — to force fail, check `test -f src/lib/env.server.ts`

Run: `test -f src/lib/env.server.ts; echo $?` → `1`

- [ ] **Step 3: Write minimal implementation**

```bash
bun x shadcn@latest init -d
# pilih: framework vite, tailwind v4, alias @/components
bun x shadcn@latest add button dialog popover dropdown-menu -y
```

Manual hapus `shadow-xl` jika ada di `src/components/ui/button.tsx` (ganti `border border-hairline-mist`).

`src/lib/env.server.ts` (server-only):

```ts
import { z } from "zod";
const envSchema = z.object({
  DATABASE_URL: z.string().url().refine((u) => u.startsWith("postgresql://"), "must start with postgresql://"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().includes(".apps.googleusercontent.com"),
  GOOGLE_CLIENT_SECRET: z.string().min(10),
  NINE_ROUTER_BASE_URL: z.string().url().refine((u) => u.endsWith("/v1"), "must end with /v1"),
  NINE_ROUTER_API_KEY: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL: z.string().url().optional(),
  TAVILY_API_KEY: z.string().startsWith("tvly-"),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});
export const env = envSchema.parse(process.env);
```

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "postgresql", schema: "./src/lib/db/schema.ts", out: "./src/lib/db/migrations", dbCredentials: { url: process.env.DATABASE_URL! } });
```

`tests/unit/env.test.ts` (overwrite with real import):

```ts
import { describe, it, expect } from "vitest";
describe("env.server", () => {
  it("rejects invalid DATABASE_URL", async () => {
    const { z } = await import("zod");
    const schema = z.string().url().refine((u) => u.startsWith("postgresql://"));
    expect(() => schema.parse("http://bad")).toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/env.test.ts -v`
Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add components.json src/components/ui/ src/lib/env.server.ts drizzle.config.ts tests/unit/env.test.ts
git commit -m "feat(env): shadcn baseline + Zod validation fail-fast"
```

---

### Task 7: Directory Structure + PublicShell + WorkspaceShell + __root + Landing

**Files:**
- Create: `src/routes/__root.tsx`, `src/components/layout/PublicShell.tsx`, `src/components/layout/WorkspaceShell.tsx`, `src/routes/index.tsx`, `src/lib/{db,auth,models,ai}/.gitkeep`, `src/server/functions/.gitkeep`

**Interfaces:**
- Consumes: `src/styles/app.css` Task 5, `src/lib/env.server.ts` Task 6
- Produces: shells — dipakai Fase 02 routes

- [ ] **Step 1: Write failing check (no __root.tsx)**

```bash
test -f src/routes/__root.tsx || echo "missing __root.tsx"
```

- [ ] **Step 2: Run to verify it fails**

Run: `test -f src/routes/__root.tsx; echo $?` → `1`

- [ ] **Step 3: Write minimal implementation**

```bash
mkdir -p src/lib/db src/lib/auth src/lib/models src/lib/ai src/server/functions src/components/layout src/components/chat src/components/ui src/routes
touch src/lib/db/.gitkeep src/lib/auth/.gitkeep src/lib/models/.gitkeep src/lib/ai/.gitkeep src/server/functions/.gitkeep
```

`src/routes/__root.tsx`:

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import "../styles/app.css";
export const Route = createRootRoute({
  component: Root,
});
function Root() {
  return (
    <html lang="id">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Outlet />
      </body>
    </html>
  );
}
```

`src/components/layout/PublicShell.tsx`:

```tsx
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream-paper">
      <nav className="mx-auto max-w-[1200px] mt-4 bg-pure-white rounded-full border border-hairline-mist px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[10px] bg-fresh-grass flex items-center justify-center text-ink-black font-medium">Z</div>
          <span className="text-[15px] font-medium text-ink-black">Zona.ai</span>
        </div>
        <div className="flex gap-4 text-[15px] font-medium text-ink-black">
          <a href="/" className="px-3 py-1 rounded-full hover:bg-sandstone">
            Home
          </a>
          <a href="#features" className="px-3 py-1 rounded-full hover:bg-sandstone">
            Features
          </a>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-fresh-grass flex items-center justify-center">
            <span className="text-ink-black">≡</span>
          </div>
          <a href="/auth/sign-in" className="rounded-full bg-pure-white border border-ink-black px-5 py-2 text-[15px] font-medium flex items-center gap-1">
            Get a quote <span className="w-4 h-4 rounded-full bg-sky-pop block" />
          </a>
        </div>
      </nav>
      <main className="mx-auto max-w-[1200px] px-6 py-10">{children}</main>
    </div>
  );
}
```

`src/components/layout/WorkspaceShell.tsx`:

```tsx
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream-paper flex">
      <aside className="w-[280px] bg-pure-white border-r border-hairline-mist h-screen sticky top-0 flex flex-col p-4">
        <div className="text-[15px] font-medium text-ink-black">Zona.ai</div>
        <button className="mt-4 rounded-full border border-ink-black bg-pure-white px-4 py-2 text-[15px] font-medium flex items-center gap-2 hover:bg-sandstone">
          + New Chat
        </button>
        <div className="mt-4 text-[13px] text-stone-gray">Workspace ready — Fase 02 akan isi daftar percakapan.</div>
      </aside>
      <main className="flex-1 p-6 max-w-[800px] mx-auto bg-cream-paper">{children}</main>
    </div>
  );
}
```

`src/routes/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "../components/layout/PublicShell";
export const Route = createFileRoute("/")({
  component: Landing,
});
function Landing() {
  return (
    <PublicShell>
      <h1 className="text-[144px] font-medium tracking-[-8.64px] leading-[0.95] text-ink-black">Zona.ai — Bandingkan AI.</h1>
      <p className="mt-4 text-[20px] text-ink-black max-w-[600px]">Workspace hangat untuk membandingkan model AI side-by-side di atas kertas cream.</p>
      <div className="mt-8 grid gap-4">
        <div className="bg-pure-white rounded-[50px] p-6 border border-hairline-mist">
          <h3 className="text-[30px] font-medium text-ink-black">No more chaos</h3>
          <p className="text-[17px] text-ink-black">Chat dengan Auto Router atau Compare 2-4 model.</p>
        </div>
      </div>
    </PublicShell>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun x tsc --noEmit` → `0`
Run: `bun run dev &` then `bun x playwright test tests/e2e/landing.spec.ts --project=chromium` → `1 passed` (cream body `rgb(245,241,228)`, nav `50px`, h1 `144px`)

- [ ] **Step 5: Commit**

```bash
git add src/routes/__root.tsx src/components/layout/PublicShell.tsx src/components/layout/WorkspaceShell.tsx src/routes/index.tsx src/lib/db/.gitkeep
git commit -m "feat(layout): PublicShell + WorkspaceShell + landing hero"
```

---

### Task 8: Verifikasi Fase 01 Gate

**Files:** — (no new files, gate only)

- [ ] **Step 1: TypeCheck**

Run: `bun x tsc --noEmit`
Expected: `0` errors

- [ ] **Step 2: Biome**

Run: `bun x biome check ./src`
Expected: `Checked` PASS, `grep -r "shadow-xl" src/components` → `0`

- [ ] **Step 3: Unit**

Run: `bun x vitest run tests/unit/smoke.test.ts tests/unit/env.test.ts -v`
Expected: `2 passed`

- [ ] **Step 4: E2E**

Run: `bun x playwright test tests/e2e/landing.spec.ts --project=chromium`
Expected: `1 passed` (h1 visible, cream bg, nav pill 50px, Inter loaded)

- [ ] **Step 5: Manual**

Run: `bun run dev` → open `http://localhost:3000` → inspect `body` `backgroundColor rgb(245,241,228)` → `nav` `borderRadius 50px` → `h1` `fontSize 144px` → no console error → `grep -r "DATABASE_URL" .vinxi/build/client` → `0`

---

## Self-Review

- **Spec coverage:** 8 tasks MILESTONES.md Fase 1 semua ada Task 1–7 → 1:Init Bun+TS, 2:Biome, 3:Vitest, 4:Playwright, 5:Tailwind tokens, 6:shadcn+env, 7:shells+landing. Env 18 vars, tokens cream/radius/Inter, shells anti-slop, lock stack — semua di Global Constraints.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya `TBD` di spec Open/TBD allowed, tidak di plan). Semua Steps ada code block `app.config.ts`, `biome.json`, `vitest.config.ts`, `app.css` `@theme`, `env.server.ts` Zod, `PublicShell`/`WorkspaceShell` JSX.
- **Type consistency:** `app.config.ts` `defineConfig` + `viteTsConfigPaths` + `tailwindcss` konsisten Task 1 & 5, `tsconfig` paths `@/*` konsisten, `env.server.ts` Zod 18 vars konsisten spec §6, `PublicShell` cream L0 White L1 konsisten DESIGN.md.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-01-foundation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

