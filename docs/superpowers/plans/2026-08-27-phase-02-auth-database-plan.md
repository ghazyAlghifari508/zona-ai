# Fase 02 — Authentication + Database — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun fondasi data & auth (PostgreSQL Drizzle + pgvector + Better Auth Google OAuth only + helper getAuthSession + 5 tabel) sebagai prasyarat chat/persistence.

**Architecture:** Drizzle via `postgres.js` driver `drizzle(postgres(DATABASE_URL))`, `drizzle-kit` migrate 0001 `CREATE EXTENSION vector`, Better Auth `drizzleAdapter({provider:"pg"})` + `tanstackStartCookies()` + Google OAuth only, catch-all `ServerRoute /api/auth/$` `auth.handler`, `createAuthClient` client, `getAuthSession(request)` throw 401 `ERR-002`, `PublicShell` cream + pill 50px 1 tombol Google SVG.

**Tech Stack:** Bun, TypeScript, TanStack Start, TanStack Router, Drizzle ORM + postgres (postgres.js), pgvector, Better Auth + drizzleAdapter + tanstackStartCookies, Zod, Vitest + jsdom, Playwright chromium, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-phase-02-auth-database-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm), TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL (jangan Supabase/Mongo), Better Auth (jangan Clerk), pgvector (jangan Qdrant)
- Server-only env: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `NINE_ROUTER_API_KEY`, `R2_SECRET_ACCESS_KEY`, `TAVILY_API_KEY` tidak di client bundle — grep `.vinxi/build/client` 0
- Design: cream `#f5f1e4` L0 body bg, White `#ffffff` L1 cards/nav, radius 50px nav/cards/buttons + 10px small, Inter 400/500, no `shadow-lg/xl/2xl`, no neon/glow, no emoji Lucide only, no dark mode
- Auth: Google OAuth only `emailAndPassword.enabled===false`, tidak ada `<input type="password">`, `SameSite=Lax` `HttpOnly Secure`
- Ownership: `where eq(conversations.userId, session.user.id)` + `where eq(sessions.userId)` + `where eq(accounts.userId)` + 403 else, `ON DELETE CASCADE`
- Validation: Zod 18 vars fail-fast di `env.server.ts` (DATABASE_URL postgresql://, BETTER_AUTH_SECRET≥32, BETTER_AUTH_URL url, GOOGLE_CLIENT_ID .apps.googleusercontent.com, GOOGLE_CLIENT_SECRET min10)
- No fake behavior, no `dangerouslySetInnerHTML` di auth card, `getAuthSession` hard gate (bukan hanya beforeLoad)
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, `drizzle-kit migrate` sukses

---

## File Structure

```
zona-ai/
├── drizzle.config.ts             # dialect postgresql, schema ./src/lib/db/schema.ts, out ./src/lib/db/migrations, dbCredentials url
├── src/
│   ├── lib/db/index.ts           # drizzle(postgres(DATABASE_URL)) + schema
│   ├── lib/db/schema.ts          # users/sessions/accounts/conversations/messages + credits
│   ├── lib/db/migrations/0001_init.sql # CREATE EXTENSION vector + CREATE TABLE ...
│   ├── lib/db/seed.ts            # dev seed Alice (optional)
│   ├── lib/auth/auth.ts          # betterAuth instance
│   ├── lib/auth/auth-client.ts   # createAuthClient
│   ├── lib/auth/session.ts       # getAuthSession helper
│   ├── lib/utils/errors.ts       # ZonaError ERR-002
│   ├── server/routes/api.auth.$.ts # createServerFileRoute /api/auth/$ auth.handler
│   ├── routes/auth/sign-in.tsx   # PublicShell + Google button
│   ├── routes/auth/sign-up.tsx   # same or redirect sign-in
│   └── routes/chat/index.tsx     # beforeLoad redirect + placeholder WorkspaceShell
└── tests/
    ├── unit/auth.test.ts
    ├── unit/env.test.ts
    └── integration/db.test.ts
    └── e2e/auth.spec.ts
```

---

### Task 1: Drizzle DB Connection + Config

**Files:**
- Create: `src/lib/db/index.ts`
- Modify: `drizzle.config.ts`

**Interfaces:**
- Consumes: `process.env.DATABASE_URL` (validated Zod in env.server.ts Task 6 Fase 01)
- Produces: `export const db: Database` — dipakai Task 2 schema, Task 3 auth

- [ ] **Step 1: Write failing check (no index.ts)**

```bash
test -f src/lib/db/index.ts || echo "missing db index"
```

- [ ] **Step 2: Run to verify it fails**

Run: `test -f src/lib/db/index.ts; echo $?`
Expected: `1`

- [ ] **Step 3: Write minimal implementation**

`src/lib/db/index.ts` (server-only):

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
const client = postgres(process.env.DATABASE_URL!, { max: 10 });
export const db = drizzle(client, { schema });
```

`drizzle.config.ts` update:

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun x tsc --noEmit` → `0` ; `test -f src/lib/db/index.ts` → `0`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/index.ts drizzle.config.ts
git commit -m "feat(db): drizzle connection postgres.js"
```

---

### Task 2: Schema 5 Tables + pgvector Extension + Migration

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/migrations/0001_init.sql` (generated), `tests/integration/db.test.ts` (schema smoke)

**Interfaces:**
- Consumes: `db` Task 1
- Produces: `users`, `sessions`, `accounts`, `conversations`, `messages` tables — dipakai Task 3 auth, Task 4-5 routes

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/db.test.ts
import { describe, it, expect } from "vitest";
import { db } from "../../src/lib/db/index";
import { sql } from "drizzle-orm";
describe("db schema", () => {
  it("has conversations table with userId FK", async () => {
    const r = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name='user_id'`);
    expect(r.rows.length).toBe(1);
  });
  it("vector extension exists", async () => {
    const r = await db.execute(sql`SELECT * FROM pg_extension WHERE extname='vector'`);
    expect(r.rows.length).toBe(1);
  });
  it("users credits default 100", async () => {
    const r = await db.execute(sql`SELECT column_default FROM information_schema.columns WHERE table_name='users' AND column_name='credits'`);
    expect(String(r.rows[0].column_default)).toContain("100");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/db.test.ts -v`
Expected: `FAIL` `relation does not exist` atau `connection` karena tabel belum migrate

- [ ] **Step 3: Write minimal implementation**

`src/lib/db/schema.ts`:

```ts
import { pgTable, text, uuid, timestamp, boolean, integer } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  image: text("image"),
  credits: integer("credits").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  mode: text("mode").notNull().default("normal"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

Buat `src/lib/db/migrations/0000_enable_vector.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

Lalu:

```bash
bun x drizzle-kit generate
# check src/lib/db/migrations/0001_init.sql contains CREATE TABLE "users"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x drizzle-kit migrate` → `migrations applied`
Run: `bun x vitest run tests/integration/db.test.ts -v` → `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/ tests/integration/db.test.ts
git commit -m "feat(db): schema 5 tables + vector extension"
```

---

### Task 3: Better Auth Instance Google OAuth Only + Errors

**Files:**
- Create: `src/lib/auth/auth.ts`, `src/lib/utils/errors.ts`
- Test: `tests/unit/auth.test.ts`

**Interfaces:**
- Consumes: `db` Task 1, `users/sessions/accounts` Task 2, `GOOGLE_CLIENT_ID/SECRET`, `BETTER_AUTH_SECRET`
- Produces: `export const auth: BetterAuth` — dipakai Task 4

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/auth.test.ts
import { describe, it, expect } from "vitest";
describe("auth config", () => {
  it("has google provider and emailAndPassword disabled", async () => {
    const { auth } = await import("../../src/lib/auth/auth");
    expect((auth as any).options.socialProviders.google).toBeDefined();
    expect((auth as any).options.emailAndPassword.enabled).toBe(false);
  });
  it("uses drizzleAdapter pg", async () => {
    const { auth } = await import("../../src/lib/auth/auth");
    expect((auth as any).options.database).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/auth.test.ts -v`
Expected: `Cannot find module` `src/lib/auth/auth`

- [ ] **Step 3: Write minimal implementation**

```bash
bun add better-auth
```

`src/lib/utils/errors.ts`:

```ts
export interface ZonaError { code: string; message: string; retryable: boolean; action?: string; }
export const ERR_002: ZonaError = { code: "ERR-002", message: "Sesi berakhir, silakan login kembali.", retryable: false, action: "login" };
```

`src/lib/auth/auth.ts` (server-only):

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "../db/index";
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: false },
  socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } },
  plugins: [tanstackStartCookies()],
  session: { cookieName: "zona_session", expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: true } },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/auth.test.ts -v` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/auth.ts src/lib/utils/errors.ts tests/unit/auth.test.ts
git commit -m "feat(auth): Better Auth Google OAuth only"
```

---

### Task 4: Auth Client + Catch-all Route + getAuthSession Helper

**Files:**
- Create: `src/lib/auth/auth-client.ts`, `src/server/routes/api.auth.$.ts`, `src/lib/auth/session.ts`
- Test: `tests/unit/auth.test.ts` (extend)

**Interfaces:**
- Consumes: `auth` Task 3
- Produces: `authClient`, `getAuthSession(request)` — dipakai Task 5-6 dan Fase 04+

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/auth.test.ts tambah
describe("auth client + helper", () => {
  it("authClient has signIn.social", async () => {
    const { authClient } = await import("../../src/lib/auth/auth-client");
    expect(typeof authClient.signIn.social).toBe("function");
  });
  it("getAuthSession throws 401 when no session", async () => {
    const { getAuthSession } = await import("../../src/lib/auth/session");
    await expect(getAuthSession(new Request("http://localhost/api/test"))).rejects.toThrow("UNAUTHORIZED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/auth.test.ts -v` → FAIL `Cannot find module auth-client`

- [ ] **Step 3: Write minimal implementation**

`src/lib/auth/auth-client.ts` (client):

```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({ baseURL: process.env.BETTER_AUTH_URL! });
```

`src/lib/auth/session.ts` (server-only):

```ts
import { auth } from "./auth";
export async function getAuthSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) { const e = new Error("UNAUTHORIZED") as any; e.status = 401; e.code = "ERR-002"; throw e; }
  return session;
}
```

`src/server/routes/api.auth.$.ts`:

```ts
import { createServerFileRoute } from "@tanstack/react-start";
import { auth } from "../../lib/auth/auth";
export const ServerRoute = createServerFileRoute("/api/auth/$").methods({
  GET: async ({ request }) => auth.handler(request),
  POST: async ({ request }) => auth.handler(request),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/auth.test.ts -v` → `4 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/auth-client.ts src/lib/auth/session.ts src/server/routes/api.auth.\$.ts tests/unit/auth.test.ts
git commit -m "feat(auth): client + catch-all + getAuthSession"
```

---

### Task 5: Auth Pages Google Button Only

**Files:**
- Create: `src/routes/auth/sign-in.tsx`, `src/routes/auth/sign-up.tsx`
- Test: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `authClient` Task 4, `PublicShell` Fase 01
- Produces: UI `/auth/sign-in` — dipakai Task 6 protected

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/auth.spec.ts
import { test, expect } from "@playwright/test";
test("sign-in renders Google button only, no password input", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("button", { name: /Continue with Google|Masuk dengan Google/i })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toContain("245");
});
test("sign-in card 50px no shadow-xl", async ({ page }) => {
  await page.goto("/auth/sign-in");
  const card = page.locator('[data-testid="auth-card"]');
  await expect(card).toBeVisible();
  const radius = await card.evaluate((el) => getComputedStyle(el).borderRadius);
  expect(radius).toContain("50px");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test tests/e2e/auth.spec.ts --project=chromium --list` → listed but run FAIL 404 (routes missing)

- [ ] **Step 3: Write minimal implementation**

`src/routes/auth/sign-in.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../../lib/auth/auth-client";
import { PublicShell } from "../../components/layout/PublicShell";
export const Route = createFileRoute("/auth/sign-in")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (data?.user) throw redirect({ to: "/chat" });
  },
  component: SignIn,
});
function SignIn() {
  const handleGoogle = async () => { await authClient.signIn.social({ provider: "google", callbackURL: "/chat" }); };
  return (
    <PublicShell>
      <div className="min-h-[80vh] flex items-center justify-center bg-cream-paper px-4">
        <div data-testid="auth-card" className="w-full max-w-[420px] bg-pure-white rounded-[50px] p-10 border border-hairline-mist">
          <h1 className="text-[30px] font-medium text-ink-black text-center">Masuk ke Zona.ai</h1>
          <p className="mt-2 text-[15px] text-stone-gray text-center">Satu klik untuk mulai membandingkan model AI.</p>
          <button onClick={handleGoogle} className="mt-8 w-full flex items-center justify-center gap-2 rounded-full border border-ink-black bg-pure-white px-5 py-3 text-[15px] font-medium text-ink-black hover:bg-sandstone">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09A6.97 6.97 0 0 1 5.48 12c0-.73.13-1.43.36-2.09V7.07H2.18A10.98 10.98 0 0 0 1 12c0 1.78.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
        </div>
      </div>
    </PublicShell>
  );
}
```

`src/routes/auth/sign-up.tsx` same atau `redirect` ke `sign-in`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test tests/e2e/auth.spec.ts --project=chromium` → `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/routes/auth/sign-in.tsx src/routes/auth/sign-up.tsx tests/e2e/auth.spec.ts
git commit -m "feat(auth): Google OAuth pages no password"
```

---

### Task 6: Protected /chat Placeholder + Seed

**Files:**
- Create: `src/routes/chat/index.tsx`, `src/lib/db/seed.ts`
- Test: `tests/e2e/auth.spec.ts` (extend), `tests/integration/db.test.ts` (ownership)

**Interfaces:**
- Consumes: `getAuthSession` Task 4, `conversations` Task 2
- Produces: `/chat` shell — dipakai Fase 04

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/db.test.ts tambah
describe("ownership", () => {
  it("user B cannot see user A conversations", async () => {
    const { db } = await import("../../src/lib/db/index");
    const { users, conversations } = await import("../../src/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.insert(users).values({ id: "user-a", email: "a@test.com", name: "A" });
    await db.insert(users).values({ id: "user-b", email: "b@test.com", name: "B" });
    await db.insert(conversations).values({ id: crypto.randomUUID(), userId: "user-a", title: "A chat" } as any);
    const rowsB = await db.select().from(conversations).where(eq(conversations.userId, "user-b"));
    expect(rowsB.length).toBe(0);
    await db.delete(conversations).where(eq(conversations.userId, "user-a"));
    await db.delete(users).where(eq(users.id, "user-a"));
    await db.delete(users).where(eq(users.id, "user-b"));
  });
});
// e2e
test("chat redirects to sign-in when unauthenticated", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/db.test.ts -v` → FAIL `chat/index.tsx` missing, `playwright` 404

- [ ] **Step 3: Write minimal implementation**

`src/routes/chat/index.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../../lib/auth/auth-client";
import { WorkspaceShell } from "../../components/layout/WorkspaceShell";
export const Route = createFileRoute("/chat/")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (!data?.user) throw redirect({ to: "/auth/sign-in" });
  },
  component: ChatPlaceholder,
});
function ChatPlaceholder() {
  return (
    <WorkspaceShell>
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="text-center">
          <h2 className="text-[30px] font-medium text-ink-black">Selamat datang di Zona.ai</h2>
          <p className="mt-2 text-[15px] text-stone-gray">Chat workspace akan hadir di Fase 03. Auth & DB siap.</p>
        </div>
      </div>
    </WorkspaceShell>
  );
}
```

`src/lib/db/seed.ts` (dev only):

```ts
import { db } from "./index";
import { users } from "./schema";
import { eq } from "drizzle-orm";
export async function seedDev() {
  if (process.env.NODE_ENV === "production") return;
  const exists = await db.select().from(users).where(eq(users.email, "alice@test.zona.ai"));
  if (!exists.length) await db.insert(users).values({ id: "test-user-001", email: "alice@test.zona.ai", name: "Alice Developer", credits: 100 } as any);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/db.test.ts -v` → `1 passed` + `bun x playwright test --project=chromium -g "chat redirects"` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/routes/chat/index.tsx src/lib/db/seed.ts tests/e2e/auth.spec.ts tests/integration/db.test.ts
git commit -m "feat(chat): protected /chat placeholder + ownership"
```

---

### Task 7: Verifikasi Fase 02 Gate

**Files:** — (no new files)

- [ ] **Step 1: TypeCheck**

Run: `bun x tsc --noEmit`
Expected: `0` errors

- [ ] **Step 2: Biome**

Run: `bun x biome check ./src`
Expected: `Checked` PASS, `grep -r "shadow-xl" src/components/layout` → `0`

- [ ] **Step 3: Unit + Integration**

Run: `bun x vitest run tests/unit/auth.test.ts tests/unit/env.test.ts tests/integration/db.test.ts -v`
Expected: `ALL passed` (auth 4, env 1, db 3)

- [ ] **Step 4: E2E**

Run: `bun x playwright test tests/e2e/auth.spec.ts --project=chromium`
Expected: `3 passed` (Google button, card 50px, chat redirect)

- [ ] **Step 5: Manual DB**

Run: `bun x drizzle-kit migrate` → `migrations applied`
Run: `psql $DATABASE_URL -c "\d users"` → `credits integer default 100`, `psql -c "\d conversations"` exists, `psql -c "\dx"` → `vector`
Run: `curl -i http://localhost:3000/api/auth/session` tanpa cookie → `401`
Run: `grep -r "GOOGLE_CLIENT_SECRET" .vinxi/build/client 2>/dev/null | wc -l` → `0`

---

## Self-Review

- **Spec coverage:** 5 tabel + vector extension → Task 2, Better Auth Google only → Task 3, authClient + catch-all + getAuthSession → Task 4, auth pages Google only 50px no password → Task 5, protected /chat placeholder → Task 6, env Zod + security → Task 1/3/4, testing 3 types → Task 2/3/5/6.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya spec Open/TBD allowed). Semua Steps ada code block `drizzle(postgres)`, `betterAuth`, `createAuthClient`, `getAuthSession`, `PublicShell` JSX.
- **Type consistency:** `getAuthSession(request: Request)` konsisten Task 4, `drizzle(postgres(DATABASE_URL))` Task 1, `betterAuth({database:drizzleAdapter(db,{provider:"pg"})})` Task 3, `createServerFileRoute("/api/auth/$")` Task 4, `authClient.signIn.social({provider:"google"})` Task 5.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-02-auth-database-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

