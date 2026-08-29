# Zona.ai Implementation Milestones

This document outlines the implementation milestones for the Zona.ai project. Each milestone represents a cohesive body of work delivering specific value, building toward the full multi-model AI chat workspace.

## Milestone 1: Foundation
**Goal**: Project scaffolding, tooling, design system setup.
**Dependencies**: None
**Parallelizable**: Tooling/config tasks and design system/layout tasks can be done in parallel once the base project is initialized.

### Tasks
- [ ] Initialize TanStack Start project with Bun (Small)
- [ ] Configure Biome for linting/formatting (Small)
- [ ] Configure Vitest and Playwright (Medium)
- [ ] Set up Tailwind CSS v4 with design tokens from DESIGN.md (Small)
- [ ] Set up shadcn/ui components (Small)
- [ ] Create base layout components (cream canvas, floating nav) (Medium)
- [ ] Set up environment variable loading and validation (Small)
- [ ] Create project directory structure (Small)

## Milestone 2: Authentication + Database
**Goal**: User auth and database foundation.
**Dependencies**: Milestone 1
**Parallelizable**: DB schema setup and UI auth pages can be done in parallel before wiring them together.

### Tasks
- [ ] Set up PostgreSQL with Drizzle ORM (Medium)
- [ ] Run `CREATE EXTENSION IF NOT EXISTS vector` (Small)
- [ ] Implement Better Auth with Drizzle adapter (Medium)
- [ ] Create auth pages (sign up, sign in) (Medium)
- [ ] Implement session management (Medium)
- [ ] Add route protection (beforeLoad for UX) (Small)
- [ ] Add server-side auth verification helpers (Small)
- [ ] Create `users`, `sessions`, `accounts` tables (Better Auth managed) (Small)
- [ ] Create `conversations`, `messages` tables (Small)

## Milestone 3: Single-Model Chat
**Goal**: Basic AI chat with one model.
**Dependencies**: Milestone 2
**Parallelizable**: Model registry / 9Router connection and Chat UI scaffolding can run in parallel.

### Tasks
- [ ] Create Model Registry (config-based) (Small)
- [ ] Implement 9Router connection via `@ai-sdk/openai-compatible` (Medium)
- [ ] Implement chat server function with `streamText()` (Medium)
- [ ] Create chat workspace UI (sidebar + chat area) (Medium)
- [ ] Implement message list with markdown rendering (Medium)
- [ ] Implement composer (message input) (Medium)
- [ ] Implement model selector (single select) (Small)
- [ ] Implement streaming response display (Large)
- [ ] Implement stop generation (Medium)
- [ ] Implement regenerate response (Medium)
- [ ] Create `generation_runs` table and tracking (Small)

## Milestone 4: Conversation Persistence
**Goal**: Save and reload conversations.
**Dependencies**: Milestone 3
**Parallelizable**: Backend CRUD operations and Frontend UI integration.

### Tasks
- [ ] Persist conversations, messages, `generation_runs` to PostgreSQL (Large)
- [ ] Implement conversation list in sidebar (Medium)
- [ ] Implement conversation CRUD (create, rename, delete, archive) (Medium)
- [ ] Implement conversation reload (navigate away and back) (Medium)
- [ ] Implement conversation search (Medium)
- [ ] Auto-generate conversation titles (Small)
- [ ] Implement TanStack Virtual for long message lists (Medium)

## Milestone 5: Compare Mode
**Goal**: Multi-model comparison.
**Dependencies**: Milestone 4
**Parallelizable**: Backend stream multiplexing and Frontend Compare Mode UI.

### Tasks
- [ ] Create `comparison_runs` table (Small)
- [ ] Implement multi-model selector UI (Medium)
- [ ] Implement parallel `streamText()` calls (Large)
- [ ] Implement stream multiplexing to client (Large)
- [ ] Implement Compare Mode UI layout (side-by-side columns) (Medium)
- [ ] Implement individual model error handling (Medium)
- [ ] Implement individual model retry (Medium)
- [ ] Implement individual model cancellation (Medium)
- [ ] Track per-model token usage and latency (Medium)
- [ ] Implement mobile Compare Mode (swipeable tabs) (Large)

## Milestone 6: File Upload
**Goal**: File attachment and image input.
**Dependencies**: Milestone 4
**Parallelizable**: R2 backend integration and Frontend attachment UI.

### Tasks
- [ ] Set up Cloudflare R2 connection (Medium)
- [ ] Create `attachments` table (Small)
- [ ] Implement file upload server function (validation, R2 storage) (Medium)
- [ ] Implement attachment UI (drag-drop, preview, remove) (Medium)
- [ ] Implement image input for vision-capable models (AI SDK file parts) (Medium)
- [ ] Implement file size and MIME validation (Small)

## Milestone 7: RAG (Document Processing)
**Goal**: Document-based retrieval augmented generation.
**Dependencies**: Milestone 6
**Parallelizable**: Extraction pipeline and pgvector/search implementation.

### Tasks
- [ ] Set up pgvector and HNSW index (Medium)
- [ ] Create `document_chunks` table (Small)
- [ ] Implement text extraction pipeline (PDF, DOCX, TXT, CSV) (Large)
- [ ] Implement chunking strategy (Medium)
- [ ] Implement embedding generation (model TBD via 9Router or dedicated endpoint) (Medium)
- [ ] Implement similarity search (retrieval) (Medium)
- [ ] Inject retrieved context into AI prompt (Medium)
- [ ] Handle extraction/embedding failures gracefully (Medium)

## Milestone 8: Web Search
**Goal**: Web search with citations.
**Dependencies**: Milestone 5
**Parallelizable**: Tavily backend service and frontend UI/citation rendering.

### Tasks
- [ ] Set up Tavily client (behind service abstraction) (Medium)
- [ ] Create `web_sources` table (Small)
- [ ] Implement web search server function (Medium)
- [ ] Implement search trigger (user toggle) (Small)
- [ ] Inject search results into prompt (Medium)
- [ ] Implement citation rendering in UI (Medium)
- [ ] Implement Fair Compare mode (shared search results for all models) (Large)

## Milestone 9: Observability + Usage Tracking
**Goal**: AI observability and usage analytics.
**Dependencies**: Milestone 5
**Parallelizable**: Langfuse integration and UI usage stats.

### Tasks
- [ ] Set up Langfuse integration (`@langfuse/vercel-ai-sdk` + OpenTelemetry) (Medium)
- [ ] Create `usage_records` table (Small)
- [ ] Track token usage per generation (Small)
- [ ] Track latency (total + time-to-first-token) (Small)
- [ ] Display usage stats in UI (Medium)
- [ ] Create `feedback` table and UI (thumbs up/down) (Medium)

## Milestone 10: Hardening
**Goal**: Production readiness.
**Dependencies**: Milestones 7, 8, 9
**Parallelizable**: Audits, optimization, and testing can be done largely in parallel.

### Tasks
- [x] Comprehensive error handling (all scenarios from ERROR-HANDLING.md) (Large)
- [x] Rate limiting implementation (Medium)
- [x] Security audit (per SECURITY.md) (Medium)
- [x] Performance optimization (streaming, queries, bundle size) (Large)
- [x] Accessibility audit (WCAG 2.1 AA) (Medium)
- [x] Responsive design verification (Medium)
- [x] E2E test suite completion (Large)
- [x] Documentation review (Small)

## Milestone 11: Post-MVP (Future)
**Goal**: Advanced features.
**Dependencies**: Milestone 10
**Parallelizable**: All features can be tackled independently.

### Potential features (prioritized by value)
- [ ] Consensus Answer (Large)
- [ ] Blind Comparison (Medium)
- [ ] Model Leaderboard (Medium)
- [ ] Personal Model Ranking (Medium)
- [ ] Debate Mode (Large)
- [ ] Deep Research (Large)
- [ ] BYOK (Bring Your Own Key) (Medium)
