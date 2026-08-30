# AGENTS.md

Boot instructions for AI agents working on **Zona.ai** — Multi-Model AI Chat Workspace.

## Required Reading Order (Source of Truth)

1. `.agents/rules/zona-ai-context.md` — Product vision, locked stack, and architectural decisions
2. `.agents/rules/zona-ai-no-assumptions.md` — Strict fact verification and zero assumptions policy
3. `.agents/rules/zona-ai-no-hardcode.md` — Dynamic Model Registry, environment variables, and constants discipline
4. `.agents/rules/zona-ai-no-type-bypass.md` — Strict TypeScript types; prohibition of `as any`, `as never`, `as unknown as`, and `@ts-ignore`
5. `.agents/rules/anti-ai-slop.md` — MindMarket design token rules, color palettes, typography, and anti-slop guidelines
6. `.agents/rules/zona-ai-skills-mcp.md` — Single source of truth for required skills, MCPs, and plugins
7. `DESIGN.md` — Visual token reference (colors, typography, radii, spacing; not a page layout template)
8. `docs/ARCHITECTURE.md` + `docs/PRD.md` — System architecture and product requirements
9. `docs/superpowers/specs/` & `docs/superpowers/plans/` — Phase-specific technical specifications and implementation plans

---

## Core Principles

Zona.ai is a restrained, high-performance multi-model AI workspace designed for side-by-side model comparison.

1. **Dynamic Model Registry**: Zero hardcoded models. All available models are fetched dynamically from the local 9Router proxy (`http://localhost:20128/v1`).
2. **Fair & Objective Comparison**: Web searches (Tavily) and document extractions are executed once per turn and distributed equally across all compared models.
3. **Restrained Notion-Style Aesthetic**: Rooted in warm paper (`#f6f5f4`), pure white (`#ffffff`), and hairline borders (`rgba(0,0,0,0.08)`); Notion Blue (`#0075de`) is the single chromatic action color. Zero `shadow-xl`, zero neon accents, and zero decorative emojis in UI chrome (soft shadows allowed only on composer, dropdown/popover, and mobile sidebar overlay).
4. **Strict Type Safety**: TypeScript types must reflect actual domain data structures. Type-safety bypasses (`as never`, `as any`) are strictly disallowed.
5. **Zero Client-Side Secret Leakage**: Strict server boundaries. All API keys and connection credentials remain server-only. All operations verify session authentication and conversation ownership.

---

## Technology Stack

### Locked Stack (Required):
- **Runtime & Package Manager**: Bun
- **Full-Stack Framework**: TanStack Start + React 19 + TanStack Router (file-based)
- **State & Virtualization**: TanStack Query + TanStack Virtual
- **Styling**: Tailwind CSS v4 (`@theme` directive in `src/styles/app.css`)
- **Database & ORM**: PostgreSQL 17 + pgvector (`vector(1536)` HNSW cosine) + Drizzle ORM (`postgres.js`)
- **Authentication**: Better Auth (Google OAuth only; email/password disabled)
- **AI Integration**: Vercel AI SDK 7 (`ai` + `@ai-sdk/openai-compatible` targeting 9Router)
- **Object Storage**: Cloudflare R2 via `@aws-sdk/client-s3` (server-only)
- **Web Search**: Tavily Search API (server-only)
- **Observability**: Langfuse Tracing + OpenTelemetry (`@langfuse/vercel-ai-sdk`)
- **Quality Assurance**: Biome (formatting & linting), Vitest (unit & integration), Playwright (E2E & a11y)

### Prohibited Technologies:
- Next.js, Remix, or vanilla Vite without TanStack Start
- Prisma ORM, TypeORM, or Mongoose
- Supabase Database / Supabase SDK / Supabase MCPs (use local PostgreSQL + Drizzle)
- MongoDB, SQLite, Qdrant, Pinecone, or external Redis (use in-memory Map for MVP)
- Direct `fetch` calls to 9Router endpoints bypassing AI SDK 7
- Unsanitized HTML rendering (`rehype-sanitize` is required for Markdown)

---

## Engineering Standards

1. **No Type-Safety Bypasses (Iron Law)**:
   - Never use `as never`, `as any`, `: any`, `as unknown as T` (except documented SDK boundary conversions), `@ts-ignore`, or `@ts-expect-error` to suppress compiler diagnostics.
   - Use typed Drizzle schemas (`$inferInsert`, `$inferSelect`, `$type()`), AI SDK `CoreMessage[]`, and domain error classes (`AppError`, `ZonaError`).
2. **Deterministic Mechanical Testing**:
   - Unit and integration tests must never assert non-deterministic AI prose, exact Tailwind utility classes, or volatile HTML snapshot strings.
   - Tests must assert deterministic invariants only: Zod schemas, JSON response shapes, error status codes, authentication boundaries, and state transitions.
3. **Never Lower Test Standards**:
   - When a test fails, resolve the underlying defect in production code. Never soften assertions (e.g., replacing strict equality with `.toBeDefined()`).
4. **Server-Side Security**:
   - All server functions must validate the user session (`await getAuthSession(request)`) and verify resource ownership (`conversations.userId === session.user.id`).
   - Grepping client bundles (`.vinxi/build/client`) for secret keys must return zero matches.
5. **Test-Driven Development & Atomic Commits**:
   - Follow red-green-refactor per task: write failing test → verify failure → write minimal implementation → verify pass → create an atomic git commit with a descriptive message.

---

## Project Structure

- `src/lib/db/` — Drizzle schema (`schema.ts`), database client (`index.ts`), migrations, and seeds
- `src/lib/models/` — Dynamic Model Registry and 9Router adapter
- `src/lib/r2/` — Cloudflare R2 client wrapper (server-only)
- `src/lib/rag/` — Document parsers (`unpdf`, `mammoth`), chunker, and pgvector cosine search
- `src/lib/tavily/` — Tavily search provider (server-only)
- `src/lib/langfuse/` — Tracing and observability wrapper (server-only)
- `src/lib/security/` — In-memory rate limiting and security guards
- `src/lib/utils/` — Error taxonomy (`errors.ts`, `ZonaError`) and constants (`constants.ts`)
- `src/server/functions/` — TanStack Start server functions (`chat.ts`, `conversations.ts`, `messages.ts`, `files.ts`, `search.ts`, `feedback.ts`)
- `src/components/chat/` — Chat interface components (Composer, MessageList, CompareGrid, ModelColumn, CitationDrawer, UsageStats, FeedbackButtons)
- `src/components/layout/` — Shell layout (`WorkspaceShell.tsx`), Sidebar, and Navigation
- `src/routes/` — TanStack Router file-based routes (`__root.tsx`, `index.tsx`, `chat/$conversationId.tsx`, `auth/*`, `error.tsx`)
- `tests/` — Test suites (`tests/unit/`, `tests/integration/`, `tests/e2e/`)
- `docs/` — Specifications, architecture diagrams, and implementation plans

---

## Development Commands

```bash
bun install                  # Install dependencies
bun run dev                  # Start development server (http://localhost:3000)
bun run build                # Production build
bun x tsc --noEmit           # Type-check TypeScript codebase
bun x biome check ./src      # Run linter and code formatter
bun x vitest run             # Execute unit and integration tests
bun x playwright test        # Execute full end-to-end test suite
bun x drizzle-kit generate   # Generate SQL migrations
bun x drizzle-kit migrate    # Apply database migrations
```
