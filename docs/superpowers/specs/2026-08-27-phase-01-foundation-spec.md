# Fase 01 — Foundation — Spec

> Status: DRAFT — Menunggu review. DILARANG bikin plan/code sebelum approve.
> Referensi: `docs/MILESTONES.md` Milestone 1, `AGENTS.md` Required Reading Order + Architecture Lock, `DESIGN.md` MindMarket, `.agents/rules/anti-ai-slop.md`, `.agents/rules/zona-ai-context.md`, `.agents/rules/zona-ai-no-assumptions.md`, `.agents/rules/zona-ai-no-hardcode.md`, `docs/ARCHITECTURE.md` §3/14/17, `docs/ENVIRONMENT.md`, `docs/TESTING.md`, `.env.example`

## 1. Tujuan

Membangun fondasi yang dapat di-build dan diverifikasi untuk semua fase berikutnya: TanStack Start + Bun yang jalan (`bun run dev` di 3000), tooling Biome + Vitest + Playwright terpasang lolos, Tailwind v4 `@theme` token DESIGN.md render cream `#f5f1e4` + radius 50px, shadcn baseline tanpa `shadow-xl`, dua shell kosong patuh anti-slop (PublicShell floating pill nav + WorkspaceShell sidebar 260-280px), validasi env Zod fail-fast 18 vars, serta struktur direktori `src/*` siap. Tanpa fase ini, Fase 02 DB/Auth tidak bisa migrate.

## 2. Scope

**Deliverable Fase 01 (8 tasks MILESTONES.md):**

| # | Task | File | Done Criteria |
|---|---|---|---|
| 1 | Initialize TanStack Start with Bun | `package.json` (Bun), `app.config.ts`, `tsconfig.json` `@/*` | `bun install` clean, `bun run dev` 3000 |
| 2 | Configure Biome | `biome.json` | `bun x biome check ./src` pass |
| 3 | Configure Vitest + Playwright | `vitest.config.ts` jsdom, `playwright.config.ts` baseURL 3000 chromium | `vitest run smoke` pass, `playwright test landing` pass |
| 4 | Tailwind v4 DESIGN.md tokens | `src/styles/app.css` `@theme` | body bg `rgb(245,241,228)`, nav pill 50px |
| 5 | shadcn/ui | `components.json` + `src/components/ui/button.tsx` etc. | no `shadow-xl`, alias `@/*` |
| 6 | Base layout cream canvas + floating nav | `PublicShell.tsx`, `WorkspaceShell.tsx`, `__root.tsx` | cream L0, White L1, no shadow |
| 7 | Env loading + validation | `src/lib/env.server.ts` Zod 18 vars | fail fast jika `DATABASE_URL` hilang |
| 8 | Directory structure | `src/lib/{db,auth,models,ai}` `src/server/functions` `src/components/{layout,chat,ui}` `.gitkeep` | struktur ada |

**Out of scope:** DB `drizzle migrate` (Fase 02), Better Auth (Fase 02), Model Registry (Fase 03), chat streaming (Fase 03), RAG/file. `drizzle.config.ts` hanya placeholder Fase 01 (isi `dialect:postgresql` + `schema` path, tanpa `dbCredentials` live).

## 3. Architecture & Stack Lock (ARCHITECTURE.md §3 + ADRs + zona-ai-context.md)

- **Language:** TypeScript, **Runtime:** Bun (bukan Node), **Package Manager:** Bun (jangan `npm`/`pnpm`/`yarn`).
- **Framework:** TanStack Start file-based routing `app.config.ts` `defineConfig({vite:{plugins:[tailwindcss(), viteTsConfigPaths()]}})`, `TanStack Router` + `TanStack Query` (siap, belum dipakai logika bisnis Fase 01).
- **UI:** React + Tailwind CSS v4 + shadcn/ui, **Virtual:** TanStack Virtual siap (dipakai Fase 04, tidak di Fase 01).
- **AI:** AI SDK 7 `ai` + `@ai-sdk/openai-compatible` belum di Fase 01, tapi lock tetap.
- **Lock:** TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL (jangan Supabase/Mongo), Better Auth (jangan Clerk), Bun (jangan Node). `AGENTS.md` Architecture Lock + `zona-ai-no-assumptions.md` locked stack.
- **No Assumptions:** `routerModelId`, pricing, file limits, timeout TBD/configurable — jangan invent di Fase 01.

## 4. File Structure (Target)

```
zona-ai/
├── app.config.ts                 # TanStack Start defineConfig + tailwindcss vite plugin
├── tsconfig.json                 # @/* alias, JSX react-jsx, bundler, vite/client
├── drizzle.config.ts             # placeholder: dialect postgresql, schema ./src/lib/db/schema.ts, out ./src/lib/db/migrations
├── biome.json                    # extends //, linter recommended:true, formatter space 2 single quote
├── vitest.config.ts              # defineConfig viteTsConfigPaths, environment jsdom, include tests/unit/**/*.test.ts src/**/*.test.ts
├── playwright.config.ts          # testDir tests/e2e, webServer bun run dev 3000, baseURL, projects chromium
├── components.json               # shadcn alias @/components
├── .env.example                  # sudah ada, validate match ENVIRONMENT.md
├── src/
│   ├── styles/app.css            # @import tailwindcss; @theme tokens DESIGN.md
│   ├── lib/env.server.ts        # Zod 18 vars server-only fail-fast
│   ├── lib/db/.gitkeep
│   ├── lib/auth/.gitkeep
│   ├── lib/models/.gitkeep
│   ├── lib/ai/.gitkeep
│   ├── server/functions/.gitkeep
│   ├── components/layout/PublicShell.tsx
│   ├── components/layout/WorkspaceShell.tsx
│   ├── components/ui/            # button, dialog, popover, dropdown-menu (shadcn, no shadow-xl)
│   ├── routes/__root.tsx         # import app.css + Inter font + Outlet
│   └── routes/index.tsx          # Landing PublicShell + hero 144px
├── tests/
│   ├── unit/smoke.test.ts        # 1+1=2
│   ├── unit/env.test.ts         # Zod valid/invalid
│   └── e2e/landing.spec.ts       # h1 visible + cream bg + nav pill
└── docs/superpowers/specs/       # spec Fase 01 ini
```

## 5. Design Tokens & Layout (DESIGN.md + anti-ai-slop.md)

**Colors `@theme`:**
- `--color-cream-paper: #f5f1e4` L0 canvas — `body` bg wajib, bukan `#ffffff`
- `--color-pure-white: #ffffff` L1 cards/nav, `--color-sandstone: #e0dbce` L2 recessed hover
- `--color-ink-black: #2c2e2a` text primary/border, `--color-stone-gray: #80827f` muted, `--color-hairline-mist: #d5d5d4` divider
- `--color-fresh-grass: #8ed462` accent structural only (nav stroke, toggle), `--color-sky-pop: #2ba0ff`, `--color-coral-pop: #ff705d`, `--color-sunshine-pop: #f5e211` decorative hemat, bukan error state

**Typography:** Inter tunggal `weights 400,500`, `sizes 9,15,17,18,20,30,53,81,140,144`, `tracking -0.06em` di ≥81px, `leading 0.95` display. Landing hero `144px -8.64px 0.95` `#2c2e2a`.

**Spacing/Radius:** base 4px, `4/20/60/136/216`, page `1200px`, card `50px` nav/cards/buttons, `10px` small, `63.75px` illustration. `card padding 20-21px`, `section gap 80-120px`.

**Surfaces/Elevation:** Cream L0 → White L1 → Sandstone L2 + `border 1px solid #d5d5d4` **bukan** `box-shadow`. Dilarang `shadow-lg/xl/2xl`.

**Shells:**
- **PublicShell:** White pill `50px` `border hairline-mist` `px-4 py-2` flex `max-width 1200px` `mt-4`, logo square `10px` `bg-fresh-grass` + wordmark `15px 500`, nav links `15px 500` hover `bg-sandstone` 50px, menu toggle `40px` circle `#8ed462`, CTA ghost pill `11px 20px` + blue dot `sky-pop`.
- **WorkspaceShell:** `flex min-h-screen bg-cream-paper`, `aside w-[280px] bg-pure-white border-r hairline-mist h-screen sticky top-0`, `main flex-1 p-6 max-width 800px mx-auto` Cream. Sidebar paten 260-280px, tidak ganti antar route (Unified App Shell anti-ai-slop §7).

## 6. Env Validation (ENVIRONMENT.md + .env.example)

`src/lib/env.server.ts` server-only `import { z } from "zod"` + `envSchema.parse(process.env)` throw on import if invalid (fail fast). Zod:

| Var | Schema |
|---|---|
| `DATABASE_URL` | `z.string().url().startsWith("postgresql://")` required |
| `BETTER_AUTH_SECRET` | `z.string().min(32)` required |
| `BETTER_AUTH_URL` | `z.string().url()` required |
| `GOOGLE_CLIENT_ID` | `z.string().includes(".apps.googleusercontent.com")` required |
| `GOOGLE_CLIENT_SECRET` | `z.string().min(10)` required |
| `NINE_ROUTER_BASE_URL` | `z.string().url().refine(u=>u.endsWith("/v1"))` required |
| `NINE_ROUTER_API_KEY` | `z.string().min(1)` required |
| `R2_ACCOUNT_ID` | `z.string().min(1)` required |
| `R2_ACCESS_KEY_ID` | `z.string().min(1)` required |
| `R2_SECRET_ACCESS_KEY` | `z.string().min(1)` required |
| `R2_BUCKET_NAME` | `z.string().min(1)` required |
| `R2_PUBLIC_URL` | `z.string().url().optional()` |
| `TAVILY_API_KEY` | `z.string().startsWith("tvly-")` required |
| `LANGFUSE_SECRET_KEY` | `z.string().optional()` (MVP dev optional, prod required) |
| `LANGFUSE_PUBLIC_KEY` | `z.string().optional()` |
| `LANGFUSE_BASE_URL` | `z.string().url().optional()` default `https://cloud.langfuse.com` |
| `APP_URL` | `z.string().url()` required |
| `NODE_ENV` | `z.enum(["development","production","test"]).default("development")` |

Server-only check: `if(typeof window!=="undefined") throw` atau `server-only` import. Tidak boleh di `src/components` client bundle.

## 7. Security & Boundaries (AGENTS.md + SECURITY.md)

- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `NINE_ROUTER_*`, `R2_*`, `TAVILY_*`, `LANGFUSE_*` tidak boleh di client bundle. Verifikasi `grep -r "DATABASE_URL" .vinxi/build/client` → 0.
- `createServerFn` belum dipakai Fase 01, tapi `env.server.ts` sudah server-only.
- Tidak ada `dangerouslySetInnerHTML` di shell.

## 8. Testing (TESTING.md)

- **Unit:** `tests/unit/smoke.test.ts` `expect(1+1).toBe(2)`, `tests/unit/env.test.ts` `envSchema` valid/invalid cases.
- **E2E:** `tests/e2e/landing.spec.ts` `page.goto("/")` → `h1 Zona.ai` visible, `body background rgb(245,241,228)`, `nav pill borderRadius 50px`, no password input, Inter loaded.
- **Run:** `bun x vitest run`, `bun x playwright test --project=chromium` against `bun run dev`.

## 9. Definition of Done (DEFINITION-OF-DONE.md Global 1-4 relevant Fase 01)

1. Code Implemented (shell + tokens + env)
2. No Architecture Violation (Bun TanStack Drizzle placeholder, no Next/Prisma)
3. No Secret Exposure (server-only env, grep client 0)
4. Validation Complete (Zod)
5. TypeCheck `tsc --noEmit` 0
6. Lint `biome check` pass
7. Unit Tests Pass
8. E2E Critical Path Passes (landing)
9. No Unexpected Console Errors
10. Responsive UI (hero 144px, pill nav, cream)
11. No `shadow-xl`, no emoji, no neon — anti-slop 7 self-check pass

## 10. Larangan Khusus Fase 01

- DILARANG `npm`/`pnpm` — wajib `bun`
- DILARANG `Next.js`/`Prisma`/`Supabase`/`Mongo`/`Redis`/`Qdrant`/`Elysia`
- DILARANG `shadow-lg/xl/2xl` — elevasi via surface stack + hairline border
- DILARANG dark mode / `backdrop-blur` / grid dots cyberpunk / gradient text / glowing border
- DILARANG hardcode model list (belum ada registry)
- DILARANG `Inter` selain + jangan serif, tracking -0.06em di display

## 11. Open/TBD

- `MAX_FILE_SIZE`, `AI_TIMEOUT_MS`, `TBD_MAX_FILE_SIZE` tetap TBD configurable, tidak di Fase 01.
- `BETTER_AUTH_SECRET` generate `openssl rand -base64 32`.

## 12. File yang Akan Dibuat/Dimodifikasi

- **Create:** `package.json`, `app.config.ts`, `tsconfig.json`, `drizzle.config.ts` placeholder, `biome.json`, `vitest.config.ts`, `playwright.config.ts`, `components.json`, `src/styles/app.css`, `src/lib/env.server.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/components/layout/PublicShell.tsx`, `WorkspaceShell.tsx`, `src/components/ui/*`, `tests/unit/smoke.test.ts`, `tests/unit/env.test.ts`, `tests/e2e/landing.spec.ts`, `src/lib/{db,auth,models,ai}/.gitkeep` etc.
- **Modify:** `.env.example` validate match ENVIRONMENT.md.

---

## Spec Self-Review

- **Placeholder scan:** Tidak ada `TBD` tanpa `configurable` kecuali Open/TBD section yang explicit TBD (allowed). Tidak ada `TODO`, `implement later`.
- **Internal consistency:** Tokens `cream #f5f1e4` konsisten DESIGN.md + shell + body bg, radius 50px konsisten, Inter tunggal, lock stack konsisten ARCHITECTURE.md, env 18 vars lengkap ENVIRONMENT.md.
- **Scope check:** Fase 01 hanya Foundation 8 tasks MILESTONES.md, tidak melebar ke DB migrate/auth/chat — sudah isolated.
- **Ambiguity check:** `drizzle.config.ts` placeholder dijelaskan tanpa `dbCredentials` live untuk fase ini — explicit.

Spec siap untuk user review sebelum `writing-plans`.

