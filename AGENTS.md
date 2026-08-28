# Zona.ai — Agent Instructions

## Required Reading Order
Before making any changes, read these documents in order:
1. `docs/PRD.md` — Product requirements and feature scope
2. `docs/ARCHITECTURE.md` — System architecture and technology decisions
3. `docs/DATABASE.md` — Database schema and relationships
4. `docs/API.md` — API contracts and streaming protocol
5. `docs/AI-BEHAVIOR.md` — AI behavior specification
6. `docs/UI-UX.md` — UI/UX specification and design system
7. `DESIGN.md` — Visual design source of truth
8. `docs/MODEL-REGISTRY.md` — Model registry architecture
9. `docs/ERROR-HANDLING.md` — Error taxonomy and handling
10. `docs/SECURITY.md` — Security requirements
11. `docs/TESTING.md` — Testing strategy
12. `docs/ENVIRONMENT.md` — Environment variables
13. `docs/MILESTONES.md` — Implementation milestones
14. `docs/DEFINITION-OF-DONE.md` — Completion criteria
15. `.agents/rules/anti-ai-slop.md` — Anti-AI-Slop design constraints and rules

## Architecture Lock
The technology stack is LOCKED. Do not substitute:
- TanStack Start → Next.js
- Drizzle ORM → Prisma
- PostgreSQL → MongoDB/Supabase
- Better Auth → Clerk/Auth0
- Bun → Node.js
- Or any other locked technology

See `docs/ARCHITECTURE.md` for the complete locked stack and restrictions.

## Core Rules

### No Assumptions
- Do NOT invent model IDs, API keys, environment URLs, pricing, file limits, timeout values
- Mark undecided values as TBD/configurable
- Verify against actual documentation before using APIs

### No Hardcoding
- No hardcoded model lists in components
- No hardcoded API endpoints
- No hardcoded credentials
- Use Model Registry, environment variables, and configuration

### Inspect Before Edit
- Read existing code before modifying
- Understand the current state before making changes
- Check for existing patterns and follow them

### Root-Cause First Debugging
- Identify the actual cause before applying fixes
- No band-aid patches that mask underlying issues
- Verify the fix addresses the root cause

### Documentation Verification
- Check current official docs for framework/library APIs
- TanStack Start, AI SDK 7, Better Auth, Drizzle APIs change frequently
- Never rely on outdated API signatures

### Dependency Discipline
- Do not add new dependencies without justification
- Check if existing dependencies already solve the problem
- Prefer the locked stack's built-in capabilities

### Server/Client Boundaries
- Database, 9Router, R2, Tavily, Langfuse = server-only
- Never import server modules on the client
- Use `createServerFn` for all data operations
- Frontend never calls 9Router directly

### No Fake Behavior
- No fake progress bars
- No simulated streaming
- No mock data in production code
- UI state derives from actual signals

### Testing Requirements
- Write tests for new features (unit + integration)
- Run existing tests before committing
- See `docs/TESTING.md` for strategy

### Definition of Done
- Reference `docs/DEFINITION-OF-DONE.md` before marking work as complete
- TypeCheck, lint, tests must pass
- Auth/authorization verified
- Error/loading states handled

### Security Requirements
- Never expose 9Router/API credentials to client
- Verify auth in every server function
- Check ownership before data access
- Validate all inputs server-side
- See `docs/SECURITY.md` for full requirements

### Anti-AI-Slop Design Discipline
- Strictly follow `DESIGN.md` (MindMarket Style: Warm storybook on cream paper `#f5f1e4`)
- Strictly obey `.agents/rules/anti-ai-slop.md`
- NO heavy drop shadows (`box-shadow`, `shadow-xl`, `shadow-2xl`)
- NO neon colors, glowing borders, or rainbow gradient text
- NO cluttered "pill-in-pill" capsules
- NO emojis anywhere in the UI chrome/buttons/badges (use clean Lucide SVG icons only)
- NO dark mode or glassmorphism

### Never Silently Change Architecture
- Do not introduce new databases, frameworks, or services without explicit approval
- Do not switch from server functions to REST APIs without discussion
- Do not add microservice boundaries
