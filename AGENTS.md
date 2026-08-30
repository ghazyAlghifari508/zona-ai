# AGENTS.md

Boot instructions for AI agents working on **Zona.ai**.

## Read first

- `.agents/rules/zona-ai-context.md` → product definition, architecture, and locked stack
- `.agents/rules/zona-ai-no-assumptions.md` → strict fact verification and zero assumptions
- `.agents/rules/zona-ai-no-hardcode.md` → dynamic Model Registry, env, and constants discipline
- `.agents/rules/zona-ai-no-type-bypass.md` → strict type safety (no `as never`, `as any`, `@ts-ignore`)
- `.agents/rules/anti-ai-slop.md` → design constraints (MindMarket tokens, typography, no-slop)
- `.agents/rules/zona-ai-skills-mcp.md` → single source of truth for required skills, MCPs, and plugins
- `DESIGN.md` → design system tokens and UI standards (visual reference, not a page layout template)

---

## What makes Zona.ai special

A restrained, high-performance multi-model AI workspace for side-by-side model comparison. Four non-negotiables:

1. **Dynamic Model Registry**: Zero hardcoded models. Available AI models are loaded dynamically from the local 9Router proxy (`http://localhost:20128/v1`).
2. **Fair & Synchronous Comparison**: Parallel streaming with single-fetch web searches (Tavily) and document extractions shared across all compared models.
3. **100% Type-Safe & Robust**: Zero type-safety bypasses (`as never`/`as any` strictly forbidden). Strict Drizzle schema types and Zod validation at every boundary.
4. **Restrained MindMarket Aesthetic**: Rooted in cream paper (`#f5f1e4`), pure white (`#ffffff`), sandstone (`#e0dbce`), and hairline mist borders (`#d5d5d4`). Zero `shadow-xl`, zero neon, zero emoji clutter.

---

## Rules — god-tier

- **THE UNBREAKABLE BAR (NEVER LOWER THE TEST STANDARD)**: When a test fails, you MUST fix the production code and elevate the logic. NEVER soften assertions (e.g. replacing specific equality with loose `.toBeDefined()`), never delete or comment out valid boundary tests, and never write shallow pass-through tests just to get a cheap green check. If a test caught a break, fix the root cause.
- **NEVER TEST AI RESPONSE CONTENT, CLASSNAMES, ANCHORS, OR STOCHASTIC OUTPUT (IRON LAW)**: Unit and TDD tests MUST NOT assert AI model prose, answer wording, Indonesian phrasing, exact className strings, Tailwind utility lists, HTML tag structures, anchor hrefs/IDs, palette hues, fonts, layout structure, card counts, section sequences, or generated source snapshots. Tests assert deterministic mechanical invariants only:
  1. JSON Schemas (Zod validation)
  2. Structure conformance, data types, and presence of required keys
  3. Type narrowing and contract error handling
  4. Hard deterministic boundaries (action URLs, route topology, package policies, security, compilation)
     Never test exact className values, HTML markup strings, or regex-matched styling strings. Testing markup or styling creates rigid template-ish generator behavior. Rendered aesthetic quality and copy appeal belong exclusively to human evaluation and live browser reviews.
- **Domain before file type**: Organize by feature or domain first (`src/server/functions/`, `src/lib/models/`, `src/components/chat/`). Never create generic catch-all directories (`hooks/`, `utils/`, `helpers/`, `misc/`).
- **Structured test suites**: Unit tests sit in `tests/unit/`, integration tests in `tests/integration/`, and end-to-end user journeys in `tests/e2e/`. All tests follow strict Vitest & Playwright patterns.
- **No `any`, `as never`, or `@ts-ignore`**: `any` and `never` casting disables the type-checker. Use `unknown` with narrowing, `$inferInsert`, or schema validation. Fix actual root causes.
- **Self-explanatory code over comments**: Code must be obvious through clear names and modular structure. Never write multi-line block comments or banner dividers (`// ---`). Authored comments delete by default; keep only strictly necessary single-line invariant explanations.
- **Solid as hell**: Nothing ships without `typecheck + lint + affected tests` passing together. CI is the ultimate gate. Run `bun x tsc --noEmit` and `bun x biome check ./src` locally before handoff.
- **Small and surgical**: One concern per change. A 50-line fix beats a 500-line refactor.
- **ATOMIC COMMITS (COMMIT EVERY CHANGE — IRON LAW)**: Every single change, no matter how small, MUST be committed immediately and atomically once verified. Never leave a dirty working tree, and never bundle multiple unrelated fixes, refactors, or features into one giant commit. The moment a surgical edit, bugfix, or feature step passes verification (`bun x tsc --noEmit` + `bun x biome check ./src` + affected tests), execute `git add` and `git commit` immediately. Follow Conventional Commits format strictly (`feat:`, `fix:`, `refactor:`, `test:`, `style:`, `chore:`) with clear, descriptive commit messages. Keep the git history clean, granular, bisectable, and reversible at all times.
- **Fail loud at trust boundaries**: Validate untrusted input at server boundaries and fail closed on auth, credit deduction, rate limiting, or model routing failures.
- **Always unslop**: Follow `.agents/rules/anti-ai-slop.md` across all code, prompt strings, and docs. Cut AI filler words, puffery, and passive voice.

---

## Where code lives

- `src/lib/ai/` — 9Router client, credit transactions, multiplex streaming, and system prompts
- `src/lib/auth/` — Better Auth server setup, client, and session validation
- `src/lib/chat/` — Chat state helpers and conversation title generation
- `src/lib/db/` — Drizzle schema (`schema.ts`), database client (`index.ts`), migrations, and seeds
- `src/lib/models/` — Dynamic Model Registry and 9Router adapter
- `src/lib/r2/` — Cloudflare R2 object storage client (server-only)
- `src/lib/rag/` — Document extraction, chunking, and pgvector HNSW cosine search
- `src/lib/tavily/` — Web search provider adapter (server-only)
- `src/lib/langfuse/` — Tracing and observability wrapper (server-only)
- `src/lib/security/` — In-memory rate limiting and security guards
- `src/lib/utils/` — Error taxonomy (`errors.ts`, `ZonaError`) and constants (`constants.ts`)
- `src/server/functions/` — TanStack Start server functions (`chat.ts`, `conversations.ts`, `messages.ts`, `files.ts`, `search.ts`, `feedback.ts`)
- `src/components/chat/` — Workspace shell, Composer, MessageList, CompareGrid, ModelColumn, CitationDrawer, UsageStats, FeedbackButtons
- `src/components/layout/` — Layout components (`WorkspaceShell.tsx`, Sidebar, CreditWidget)
- `src/routes/` — TanStack Start file-based routes (`__root.tsx`, `index.tsx`, `chat/$conversationId.tsx`, `auth/*`, `error.tsx`)
- `tests/` — Unit, integration, and Playwright E2E suites (`tests/unit/`, `tests/integration/`, `tests/e2e/`)
- `docs/` — Specifications, architecture, and phase implementation plans

---

## Commands

```bash
bun install                  # Install dependencies
bun run dev                  # Start dev server (Vite + TanStack Start on http://localhost:3000)
bun x tsc --noEmit           # TypeScript typecheck (must be 0 errors)
bun x biome check ./src      # Linter & formatter check
bun x vitest run             # Run unit & integration tests
bun x playwright test        # Run E2E test suite
bun x drizzle-kit generate   # Generate new SQL migration files
bun x drizzle-kit migrate    # Apply migrations to PostgreSQL
```
