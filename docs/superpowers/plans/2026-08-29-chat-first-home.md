# Chat-First Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/` Zona.ai's public chat entry while preserving guest drafts through Google OAuth.

**Architecture:** Extract the empty/new-chat workspace into a route-owned flow that branches on session state. Guests store draft locally and authenticate; authenticated users create a conversation before entering the existing persistent thread route. Protected server functions stay protected.

**Tech Stack:** TanStack Start, TanStack Router, React 19, Better Auth, TanStack Query, Tailwind CSS v4, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-08-29-chat-first-home-spec.md`

## Global Constraints

- No new dependency.
- No API or database contract change.
- Preserve server-side auth and ownership checks.
- Keep `DESIGN.md` tokens only; remove editorial/poster composition from `/`.
- Preserve guest draft; never auto-submit after OAuth.
- No type bypasses.

---

### Task 1: Guest Draft Boundary

**Files:**
- Create: `src/lib/chat/guest-draft.ts`
- Test: `tests/unit/guest-draft.test.ts`

**Interfaces:**
- Produces: `saveGuestDraft(content: string): void`
- Produces: `takeGuestDraft(): string`

- [ ] Write failing tests for trimmed persistence, one-time recovery, malformed/empty storage.
- [ ] Run `bun x vitest run tests/unit/guest-draft.test.ts`; expect failure from missing module.
- [ ] Implement minimal `sessionStorage` helper with a single project-owned key.
- [ ] Run the focused test; expect pass.

### Task 2: Public Chat Entry

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/components/chat/Composer.tsx`
- Modify: `src/components/layout/WorkspaceShell.tsx`
- Test: `tests/unit/chat-home.test.tsx`

**Interfaces:**
- Consumes: guest draft functions from Task 1.
- Produces: public empty chat UI; guest auth submit; authenticated conversation creation.

- [ ] Write component tests proving `/` contains chat composer, excludes poster copy, guest submit saves draft and invokes Google OAuth with `/`, authenticated submit creates/navigates without automatic generation.
- [ ] Run focused tests; expect current landing behavior failure.
- [ ] Add optional composer initial draft and submit interception without weakening protected controls.
- [ ] Replace landing content with compact chat-first workspace and session-aware controls.
- [ ] Run focused tests; expect pass.

### Task 3: Route Compatibility and Browser Coverage

**Files:**
- Modify: `src/routes/chat/index.tsx`
- Modify: `src/routes/auth/sign-in.tsx`
- Modify: `src/routes/auth/sign-up.tsx`
- Modify: `tests/e2e/landing.spec.ts`
- Modify: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `/` public chat behavior from Task 2.
- Produces: consistent post-auth destination `/`; legacy `/chat` compatibility.

- [ ] Update E2E assertions for chat-first `/`, guest composer, auth interception, responsive layout.
- [ ] Run targeted Playwright tests; expect old landing assertions to fail.
- [ ] Redirect authenticated `/chat` entry to `/`; update OAuth callbacks to `/`.
- [ ] Run targeted Playwright tests where environment supports OAuth/session mocking.

### Task 4: Verification

**Files:**
- Inspect all changed files.

**Interfaces:**
- Produces: verified implementation evidence.

- [ ] Run changed unit tests.
- [ ] Run `bun x tsc --noEmit`.
- [ ] Run `bun x biome check` on changed source/tests.
- [ ] Run the forbidden type-bypass scan required by project rules.
- [ ] Run `bun run build`.
- [ ] Smoke-test `/` at desktop and mobile widths; inspect console and layout.
- [ ] Inspect `git diff`; preserve unrelated work.

## Self-Review

- Spec coverage: route behavior, auth boundary, draft recovery, visual direction, responsive behavior, tests covered.
- Placeholder scan: no implementation placeholders.
- Type consistency: draft helper and callback destinations remain stable across tasks.
