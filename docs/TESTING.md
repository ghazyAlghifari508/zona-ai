# Zona.ai Testing Strategy

This document outlines the testing strategy for Zona.ai, covering testing philosophy, unit tests, integration tests, E2E tests, mocking, test data, and CI/CD integration. The primary tools used are Vitest for unit and integration testing, and Playwright for E2E testing.

## 1. Testing Philosophy

- **Test behavior, not implementation:** Focus on the observable behavior of the system rather than internal implementation details.
- **Confidence over coverage percentage:** Meaningful tests that verify critical paths and edge cases are prioritized over arbitrary coverage metrics.
- **Fast feedback loop:** Tests must run quickly to provide immediate feedback during development.
- **Tests should be deterministic:** Flaky tests must be identified and fixed or removed. Tests should produce the same result every time they are run.

## 2. Unit Tests (Vitest)

Unit tests focus on isolated business logic and utility functions.

**What to test:**
- **Model registry:** Loading logic, filtering models by capability, enabled/disabled state handling.
- **Zod validation schemas:** Valid and invalid inputs for all API contracts and data models.
- **Conversation logic:** Title generation algorithms, conversation mode determination (single vs. compare).
- **Comparison orchestration:** Parallel generation setup, streaming status aggregation.
- **Stream event parsing:** Parsing all AI event types, handling malformed events correctly.
- **Authorization utilities:** Ownership checks, session validation helpers.
- **Error handling:** Error taxonomy mapping, generation of user-friendly messages.
- **File validation:** MIME type checks, file size limit checks.
- **Chunking logic:** Text splitting, overlap calculation, metadata extraction.
- **Web search result formatting:** Transforming Tavily responses into prompt context.

**How to test:**
- **Tool:** Vitest with TypeScript.
- **Mocking:** Mock all external dependencies (Database, 9Router, Cloudflare R2, Tavily).
- **Data:** Use Zod schemas for generating reliable test fixtures.
- **Structure:** Co-locate test files with their corresponding source files (e.g., `*.test.ts` next to `*.ts`).

## 3. Integration Tests (Vitest)

Integration tests verify the interaction between application code and external systems or databases.

**What to test:**
- **PostgreSQL:** CRUD operations for `conversations`, `messages`, `generation_runs`, and `comparison_runs`.
- **Better Auth:** Registration flow, login, session management, logout functionality.
- **9Router adapter:** Connection handling, model listing (`/v1/models`), chat completion execution.
- **AI stream persistence:** Streaming a response and verifying it is saved correctly in the database.
- **Cloudflare R2:** Upload, download, and delete operations.
- **RAG pipeline:** Full flow from upload → extract → chunk → embed → retrieve.
- **Tavily:** Search query execution and formatting of results.
- **Drizzle + pgvector:** Vector insertion and cosine similarity search execution.

**How to test:**
- **Test database:** Use a separate PostgreSQL database exclusively for tests.
- **Lifecycle:** Migrate the database before the test suite runs, and clean up/truncate tables between individual tests.
- **Infrastructure:** Use test containers or a local PostgreSQL instance.
- **Mocking:** Mock external HTTP APIs (9Router, Tavily, R2) using Mock Service Worker (MSW) or similar tools, while keeping database interactions real.

## 4. E2E Tests (Playwright)

End-to-End tests verify the critical user journeys in a fully running application environment.

**Critical paths to test:**
1. Register a new account.
2. Login with an existing account.
3. Create a new conversation.
4. Send a message and receive a streaming response (Single Model mode).
5. Stop generation mid-stream.
6. Regenerate a response.
7. Compare Mode: Select 2+ models, send a prompt, and verify parallel responses.
8. Compare Mode partial failure: Verify system behavior when one model fails while others succeed.
9. Reload conversation: Verify data persistence and UI restoration.
10. Upload a supported file.
11. Web search in conversation: Verify citations appear correctly in the UI.
12. Logout.

**How to test:**
- **Tool:** Playwright with TypeScript.
- **Target:** Test against a running development server instance.
- **State:** Seed the test database with a known state before tests begin.
- **Determinism:** Mock 9Router responses to ensure test stability and deterministic behavior.
- **Responsiveness:** Test layouts across both desktop and mobile viewports.

## 5. Mocking Strategy

A clear boundary is maintained between what is mocked and what is real.

**What to mock:**
- **9Router:** Mock `/v1/chat/completions` (with streaming responses) and `/v1/models` (model list).
- **Tavily:** Mock the `/search` endpoint to return predictable search results.
- **Cloudflare R2:** Mock S3-compatible operations to avoid external network calls during tests.
- **Embedding model:** Mock embedding generation to return fixed vectors.

**What NOT to mock (use real integration):**
- **PostgreSQL:** Real database interactions using the dedicated test database.
- **Better Auth:** Real authentication flows against the test database.
- **Drizzle ORM:** Real queries to ensure schema definitions and relations are correct.

## 6. Test Data

- **Reference:** See `docs/SEED-MOCK-DATA.md` for test fixtures and seeding logic.
- **Entities:** Utilize synthetic users, conversations, and messages.
- **Configurations:** Use mock model configurations and lists.
- **Files:** Maintain sample file attachments (valid and invalid) for upload testing.
- **Streams:** Keep recordings of mock streaming responses for stable E2E testing.

## 7. CI/CD Considerations

- **Unit tests:** Run on every commit to provide immediate feedback.
- **Integration tests:** Run on every Pull Request (PR).
- **E2E tests:** Run on PR merge to `main`.
- **Infrastructure:** Use ephemeral test databases created specifically per CI run.
- **Execution:** Utilize parallel test execution wherever possible to reduce pipeline duration.

## 8. Coverage Requirements

- **Targets:** No strict percentage targets are enforced.
- **Focus Areas:** High coverage is expected on server functions (RPC), authorization checks, streaming logic, and comparison orchestration.
- **Reporting:** Coverage reports will be generated but will not block CI pipelines.
