# Fase 02 — Authentication + Database — Spec

> Status: DRAFT — Menunggu review. DILARANG bikin plan/code sebelum approve.
> Referensi: `docs/MILESTONES.md` Milestone 2, `docs/PRD.md` FR-001/FR-002/FR-012/FR-013, `docs/ARCHITECTURE.md` §7/§8, `docs/DATABASE.md` §1-2, `docs/ENVIRONMENT.md`, `docs/SECURITY.md` §1-4, `docs/TESTING.md`, `docs/DEFINITION-OF-DONE.md`, `DESIGN.md`, `.agents/rules/anti-ai-slop.md`, `.agents/rules/zona-ai-context.md`

## 1. Tujuan

Membangun fondasi data & auth sebagai prasyarat Fase 03-11: PostgreSQL + Drizzle + `pgvector` extension aktif, Better Auth Google OAuth only (zero password) dengan session `HttpOnly Secure SameSite=Lax`, helper `getAuthSession()` sebagai security boundary, route protection UX (`beforeLoad`) + server verify, halaman auth `PublicShell` cream + pill 50px, serta tabel inti `users/sessions/accounts/conversations/messages`. Tanpa fase ini, chat/persistence/compare/file tidak bisa `migrate` atau `auth`.

## 2. Scope & Dependensi

- **Dependensi:** Fase 01 Done (TanStack Start Bun scaffold, Biome, Vitest, Playwright, Tailwind `@theme` tokens, `PublicShell`/`WorkspaceShell` skeleton, `env.server.ts` Zod 18 vars placeholder, `drizzle.config.ts` placeholder).
- **Deliverable Fase 02:**
  1. `src/lib/db/index.ts` Drizzle via `postgres` (`postgres.js`) — `drizzle(postgres(DATABASE_URL))`
  2. `src/lib/db/schema.ts` 5 tabel + `drizzle.config.ts` `dialect postgresql` + migration `0001_init.sql`
  3. `CREATE EXTENSION IF NOT EXISTS vector` + `pgcrypto` di migrasi pertama (siap Fase 07, aktif dari sekarang)
  4. `src/lib/auth/auth.ts` Better Auth `drizzleAdapter({provider:"pg"})` + `tanstackStartCookies()` + Google OAuth only
  5. `src/lib/auth/auth-client.ts` `createAuthClient`
  6. `src/server/routes/api.auth.$.ts` catch-all `/api/auth/$`
  7. `src/lib/auth/session.ts` `getAuthSession(request)` throw 401 `ERR-002`
  8. `src/routes/auth/sign-in.tsx` & `sign-up.tsx` Google button only, `PublicShell`
  9. `src/routes/chat/index.tsx` protected placeholder `beforeLoad` redirect + server verify pattern
  10. `src/lib/utils/errors.ts` minimal `ERR-002` + `src/lib/db/seed.ts` dev optional
- **Out of scope:** `generation_runs`/`comparison_runs`/`attachments`/`document_chunks`/`web_sources`/`usage_records`/`credit_transactions`/`feedback` (Fase 03-09), CRUD penuh `getConversations` pagination baru Fase 04 (Fase 02 hanya `CREATE TABLE`), Model Registry baru Fase 03.

## 3. Data Model

### 3.1 `users` (Better Auth managed, tambah `credits`)

- `id text PK` (Better Auth generate)
- `name text`
- `email text unique not null`
- `emailVerified boolean`
- `image text nullable`
- `credits integer default 100 not null` — active balance (dipakai Fase 03 deduct)
- `createdAt timestamptz`, `updatedAt timestamptz`

### 3.2 `sessions`

- `id text PK`
- `userId text FK users.id ON DELETE CASCADE`
- `token text unique`
- `expiresAt timestamptz`
- `ipAddress text nullable`, `userAgent text nullable`
- `createdAt`, `updatedAt`

### 3.3 `accounts`

- `id text PK`
- `userId FK CASCADE`
- `accountId text`, `providerId text` (`google`)
- `accessToken`, `refreshToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password nullable`

### 3.4 `conversations`

- `id uuid PK default gen_random_uuid()`
- `userId FK users.id CASCADE`
- `title text nullable` (auto Fase 04)
- `mode text default 'normal'` (`normal`/`compare`)
- `isArchived boolean default false`
- `createdAt`, `updatedAt` timestamptz
- Index `userId`, `createdAt DESC`

### 3.5 `messages`

- `id uuid PK`
- `conversationId FK conversations.id CASCADE`
- `role text` (`user`/`assistant`/`system`)
- `content text`
- `createdAt`
- Index `conversationId+createdAt`

**Extension & Index:** Migrasi pertama `CREATE EXTENSION IF NOT EXISTS vector;` + `pgcrypto`; semua `timestamptz` UTC; `ON DELETE CASCADE` untuk ownership, `SET NULL` belum di Fase 02.

## 4. Auth Architecture

- **Instance `src/lib/auth/auth.ts` server-only:**
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
    session: { cookieName: "zona_session", expiresIn: 60*60*24*30, cookieCache: { enabled: true } },
    advanced: { useSecureCookies: process.env.NODE_ENV==="production" },
  });
  ```
  `emailAndPassword.enabled===false` (PRD FR-001), `drizzleAdapter` `provider:"pg"`.

- **Client `src/lib/auth/auth-client.ts`:**
  ```ts
  import { createAuthClient } from "better-auth/react";
  export const authClient = createAuthClient({ baseURL: process.env.BETTER_AUTH_URL! });
  // usage: authClient.signIn.social({provider:"google", callbackURL:"/chat"}), signOut, getSession
  ```

- **Catch-all `src/server/routes/api.auth.$.ts`:**
  ```ts
  import { createServerFileRoute } from "@tanstack/react-start";
  import { auth } from "../../lib/auth/auth";
  export const ServerRoute = createServerFileRoute("/api/auth/$").methods({
    GET: async ({ request }) => auth.handler(request),
    POST: async ({ request }) => auth.handler(request),
  });
  ```

- **Helper `src/lib/auth/session.ts` server-only (security boundary):**
  ```ts
  import { auth } from "./auth";
  export async function getAuthSession(request: Request) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) { const e=new Error("UNAUTHORIZED") as any; e.status=401; e.code="ERR-002"; throw e; }
    return session;
  }
  ```
  Dipakai tiap `createServerFn` Fase 04+.

- **Protection:** `src/routes/chat/index.tsx` `beforeLoad` `authClient.getSession()` redirect `/auth/sign-in` (UX only), server tetap `getAuthSession` (hard gate).

## 5. UI Auth Pages

- **Routes:** `/auth/sign-in` & `/auth/sign-up` (sign-up redirect sign-in karena OAuth sama) — `PublicShell` cream `#f5f1e4` + floating pill nav 50px `max-width 1200px`.
- **Card:** White L1 `#ffffff` `rounded-[50px]` `p-10` `border hairline-mist #d5d5d4` `max-width 420px`, `Inter` — Heading `30px 500 #2c2e2a` `Masuk ke Zona.ai`, subtext `15px Stone Gray #80827f` `Satu klik untuk mulai membandingkan model AI.`
- **Button:** Satu pill `50px` `border #2c2e2a` `bg-pure-white` `px-5 py-3` `15px 500` + inline SVG Google 20x20 4 warna + `Continue with Google` / `Masuk dengan Google`, hover `bg-sandstone`, `Loader2` saat loading, `disabled`. Tidak ada `<input type="password">`.
- **Anti-slop:** No `shadow-xl`, no neon, no emoji Lucide only, radius 50px.

## 6. Security & Env

- **Never expose:** `DATABASE_URL`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` tidak di client bundle — `grep` client 0.
- **Ownership:** `conversations.userId` FK, `where eq(conversations.userId, session.user.id)` + 403 else, `messages` via `conversations.userId` join.
- **Env Zod `env.server.ts`:** `DATABASE_URL` `postgresql://` url, `BETTER_AUTH_SECRET≥32`, `BETTER_AUTH_URL` url, `GOOGLE_CLIENT_ID .apps.googleusercontent.com`, `GOOGLE_CLIENT_SECRET min10`, `APP_URL`, `NODE_ENV` — fail fast throw on import.
- **CSRF:** Better Auth handle `/api/auth/*` `SameSite=Lax` `HttpOnly Secure`.

## 7. Testing

- **Unit `tests/unit/auth.test.ts`:** mock `auth.api.getSession` null vs valid → `getAuthSession` throw 401 vs pass; `tests/unit/env.test.ts` Zod valid/invalid.
- **Integration `tests/integration/db.test.ts`:** real PG test DB `migrate` → insert user → insert `conversations` owner 1 row, other user 0 row → delete user cascade `conversations` gone, `vector` extension exists.
- **E2E `tests/e2e/auth.spec.ts`:** `page.goto /auth/sign-in` → Google button visible, 0 password input, cream `rgb(245,241,228)`, card `50px` → click Google (mock route) → `/chat` without session redirect `/auth/sign-in`.
- **Manual:** `bun x drizzle-kit migrate` → `psql \d users`, `curl -i /api/auth/session` tanpa cookie → 401.

## 8. Definition of Done

- `migrate` sukses, `\d users/conversations/messages` + `vector` extension ada
- `curl /api/auth/session` tanpa cookie → 401, dengan cookie → 200
- `/auth/sign-in` Google only, no password, cream, no shadow
- `getAuthSession` helper throw 401, ownership filter ready
- `tsc --noEmit` 0, `biome check` pass, `vitest` pass, no secret in client

## 9. File yang Akan Dibuat/Dimodifikasi

- **Create:** `src/lib/db/index.ts`, `schema.ts`, `migrations/0001_init.sql`, `src/lib/auth/auth.ts`, `auth-client.ts`, `session.ts`, `src/server/routes/api.auth.$.ts`, `src/routes/auth/sign-in.tsx`, `sign-up.tsx`, `src/routes/chat/index.tsx` placeholder, `src/lib/utils/errors.ts` ERR-002, `src/lib/db/seed.ts` dev optional
- **Modify:** `drizzle.config.ts`, `src/routes/__root.tsx`, `src/lib/env.server.ts`

## 10. Larangan Khusus

- DILARANG `emailAndPassword.enabled:true` / password form — reject jika ada `<input type="password">`
- DILARANG expose `DATABASE_URL`/`GOOGLE_CLIENT_SECRET` di client
- DILARANG `beforeLoad` sebagai satu-satunya security — wajib `getAuthSession`
- DILARANG hardcode `userId` — wajib `where eq(...session.user.id)`
- DILARANG `shadow-xl` di card

## 11. Open/TBD

- `SESSION_EXPIRES_IN` 30 hari default, configurable
- `isArchived` vs `isDeleted` soft delete — Fase 02 `isArchived` saja

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD`/`TODO` kecuali Open/TBD section explicit configurable (allowed).
- **Internal consistency:** `credits default 100` konsisten PRD, `vector` extension konsisten DATABASE.md, Google only konsisten PRD FR-001, 5 tabel konsisten MILESTONES Fase 2, Zod 32 char konsisten ENVIRONMENT.md.
- **Scope check:** Fase 02 hanya 5 tabel + auth, tidak melebar ke `generation_runs` (Fase 03) — isolated.
- **Ambiguity check:** `getAuthSession(request)` signature explicit `Request` + throw 401 `ERR-002`, helper sebagai hard gate dijelaskan.

Spec siap untuk user review sebelum `writing-plans`.

