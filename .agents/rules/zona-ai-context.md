# Zona.ai — Application Context (WAJIB DIBACA SEBELUM KERJA)

**Tujuan file ini:** memberi coding agent konteks produk dan arsitektur Zona.ai sebelum membaca atau mengubah codebase. Jangan mengarang flow, model capability, endpoint, schema, atau dependency. Setelah codebase sudah ada, **actual code + package manifest + migration + config adalah bukti implementasi saat ini**; dokumen ini menjelaskan intent/architecture yang harus dijaga dan harus diperbarui jika keputusan produk berubah.

---

## Apa Itu Zona.ai?

**Zona.ai** adalah aplikasi chat AI multi-model yang terinspirasi dari pengalaman penggunaan ChatGPT/Gemini, tetapi dengan fokus utama pada **kebebasan memilih model dan membandingkan beberapa model dalam satu percakapan**.

Core experience:

- user dapat chat dengan satu model AI pilihan;
- user dapat memilih beberapa model lalu menjalankan **Compare Mode**, sehingga semua model yang dipilih menjawab prompt yang sama secara paralel;
- setiap response di Compare Mode harus streaming dan memiliki lifecycle/error state sendiri;
- user dapat memakai web search;
- user dapat upload file dan menggunakan file tersebut sebagai context;
- conversation/history tersimpan;
- model AI utama diakses melalui **9Router** sebagai gateway OpenAI-compatible;
- aplikasi harus dirancang agar gateway/provider bisa diganti tanpa rewrite product logic.

Zona.ai **bukan wrapper UI tipis yang memanggil 9Router langsung dari browser**. Zona.ai memiliki orchestration layer sendiri untuk auth, conversation state, compare mode, tools, file/RAG, persistence, validation, usage/latency tracking, dan error isolation.

---

## Product Principles

1. **Model-agnostic** — UI dan product logic menggunakan internal model IDs/capabilities, bukan bergantung pada raw provider/9Router IDs.
2. **Streaming-first** — response tampil ketika delta nyata diterima, tidak menunggu seluruh generation selesai.
3. **Compare is first-class** — multi-model bukan hack berupa beberapa fetch terpisah di UI; ia memiliki orchestration dan persistence yang jelas.
4. **Partial failure is valid** — satu model gagal tidak boleh menggagalkan model lain yang masih berjalan.
5. **Server owns secrets** — browser tidak boleh memegang credential 9Router, database, R2, search provider, atau observability secret.
6. **User data is private by default** — chat/file tidak boleh dimasukkan ke logs, source code, permanent test fixtures, atau analytics payload tanpa alasan dan sanitization yang eksplisit.
7. **Real signals only** — jangan fake thinking, fake search, fake token stream, atau fake progress.
8. **PostgreSQL is system of record** — client state bukan sumber kebenaran permanen.
9. **Do not over-engineer MVP** — Redis, Qdrant, microservices, queue infrastructure, dan provider-direct routing ditambahkan hanya jika requirement nyata membutuhkannya.

---

## Locked Tech Stack

**Jangan mengganti teknologi di tabel ini tanpa keputusan eksplisit yang mengubah architecture spec.** Jika package versions di codebase berbeda, `package.json`/lockfile adalah sumber versi yang benar; jangan menebak versi dari dokumen ini.

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Runtime | **Bun** |
| Package Manager | **Bun** |
| Full-stack Framework | **TanStack Start** |
| Routing | **TanStack Router** (file-based routing) |
| UI | React + Tailwind CSS + shadcn/ui |
| Server State | TanStack Query |
| Long-list Virtualization | TanStack Virtual untuk chat/history yang panjang bila diperlukan |
| AI SDK | **AI SDK 7** (`ai`) |
| 9Router Adapter | **`@ai-sdk/openai-compatible`** |
| AI Gateway | **9Router** — server-side only |
| Validation | Zod |
| Authentication | Better Auth |
| Database | PostgreSQL |
| Development DB | PostgreSQL lokal |
| Production DB | Neon PostgreSQL (managed PostgreSQL) |
| DB Layer | Drizzle ORM |
| PostgreSQL Driver | Bun.SQL / Drizzle Bun SQL integration sesuai actual implementation |
| Object Storage | Cloudflare R2 |
| Initial RAG | PostgreSQL + pgvector |
| Web Search | Tavily |
| Deep Research / advanced search | Exa only when enabled by product scope |
| Observability | Langfuse + OpenTelemetry |
| Lint / Format | Biome |
| Unit / Integration Testing | Vitest |
| E2E Testing | Playwright |
| App Deployment Target | Railway unless deployment architecture is explicitly changed |
| 9Router Production Placement | Private service/VPS/internal network; never browser-facing |

### Explicit Non-Stack for MVP

Do NOT introduce these unless architecture is explicitly changed:

- Next.js
- Supabase
- Firebase
- Prisma
- Elysia/Hono as a second application backend
- Redis/Valkey
- Kafka
- Qdrant
- Kubernetes/microservices

They are not "bad" technologies; they are simply **not part of the current Zona.ai architecture**.

---

## Environment Model

### Development

```text
Developer machine
├── TanStack Start running on Bun
├── PostgreSQL local
├── 9Router local/private endpoint
└── optional local mocks for external services
```

### Production

```text
Browser
   ↓
Zona.ai — TanStack Start / Bun
   ├── Better Auth
   ├── AI orchestration
   ├── API/server routes
   ├── Drizzle
   │    └── Neon PostgreSQL
   ├── Cloudflare R2
   ├── Tavily / optional Exa
   ├── Langfuse / OpenTelemetry
   └── private 9Router
         ├── GPT-family models
         ├── Claude-family models
         ├── Gemini-family models
         └── other models configured in 9Router
```

**Critical:** browser → Zona.ai server → 9Router. Never browser → 9Router directly.

---

## Core User Flows

### 1. Single-Model Chat

```text
1. User creates/opens a conversation.
2. User selects one enabled model from Zona.ai model registry.
3. User sends a message, optionally with attachments and/or web search enabled.
4. Server authenticates user and validates request.
5. Server persists/identifies the user message and generation request.
6. AI orchestration resolves the internal model ID to a configured 9Router model.
7. AI SDK calls 9Router via the OpenAI-compatible adapter.
8. Real model deltas stream to the client.
9. Final assistant content + generation metadata are persisted.
10. Errors/cancellation are stored and rendered honestly.
```

### 2. Compare Mode

```text
1. User selects multiple enabled models.
2. User sends one prompt.
3. Server creates one comparison run and one generation per selected model.
4. Generations start in parallel.
5. Each model receives the same user message and the applicable shared conversation/tool context defined by the product spec.
6. Each generation streams independently.
7. Server multiplexes model events to the client with generation/model identifiers.
8. UI renders responses side-by-side or in the approved compare layout.
9. One model may complete/fail/cancel independently without stopping the others.
10. Results and metadata are persisted per generation and linked to the same comparison run.
```

**Never implement Compare Mode as one global `isStreaming` boolean.** State must be generation-scoped.

### 3. Web Search

```text
User enables web search
        ↓
Zona.ai server validates mode/tool access
        ↓
Search adapter (Tavily; Exa only if enabled)
        ↓
normalized search results/sources
        ↓
AI orchestration
        ↓
model response + citations/source metadata
```

Do not call Tavily/Exa directly from React components. Do not invent citations. Source UI must be backed by actual search/tool results.

### 4. File Upload + RAG

```text
Upload
  ↓
server validates file metadata/type/size
  ↓
Cloudflare R2 stores original object
  ↓
PostgreSQL stores attachment metadata
  ↓
extract/parse/chunk according to supported file pipeline
  ↓
embedding
  ↓
pgvector
  ↓
retrieval at message time
  ↓
retrieved context passed to selected model(s)
```

File limits, supported MIME types, parsing behavior, chunking, embedding model, and retrieval settings MUST come from approved config/PRD. Do not invent them.

---

## AI Integration Architecture

### AI SDK + 9Router

Zona.ai uses AI SDK 7 with the OpenAI-compatible provider adapter to communicate with 9Router.

Conceptual boundary:

```text
UI/internal model ID
        ↓
AI orchestration service
        ↓
model registry
        ↓
AI SDK 7
        ↓
@ai-sdk/openai-compatible
        ↓
9Router
        ↓
actual configured model/provider
```

Business logic should NOT know raw 9Router URLs, secrets, or provider-specific request syntax.

### Model Registry

Zona.ai needs a canonical model registry. It may be config-backed initially and database-backed later, but there must be one source of truth.

Expected metadata can include:

- stable internal `id`
- display name
- 9Router `routerModelId`
- provider/family for display/analytics
- enabled/disabled state
- capability flags (vision/tools/file input/reasoning/etc.)
- optional UI metadata
- optional product access metadata when pricing/plans exist

**Do not infer capabilities from names.** Verify them from configured model metadata and current provider/gateway behavior.

### Generation Identity

Every model generation should have its own stable generation ID. Compare Mode must be able to distinguish events such as:

```json
{
  "type": "text-delta",
  "generationId": "<generation-id>",
  "modelId": "<internal-model-id>",
  "delta": "..."
}
```

Exact event schemas are owned by the API/AI behavior spec and actual implementation. Do not invent or silently change them in isolated components.

### Generation Lifecycle

Conceptual lifecycle:

```text
queued
  ↓
connecting
  ↓
streaming
  ↓
completed

or → failed
or → cancelled
```

Provider-specific states may be added only if they are backed by real signals.

### Partial Failure Rule

For Compare Mode:

```text
GPT       completed
Claude    failed
Gemini    streaming
```

is a valid system state.

Do NOT collapse it into one global error. Each generation owns its own status, error, timing, usage, and final content.

### Reasoning/Thinking Data

Some models/providers expose reasoning metadata; some do not. Zona.ai must never fabricate thinking text or infer a hidden reasoning phase from elapsed time.

If no real reasoning signal exists, render a neutral honest loading/connection state until actual output/tool events arrive.

---

## Database Schema — Core Entities

The exact Drizzle schema/migrations are the source of truth once implemented. The target domain model should cover at least these concepts:

| Entity | Purpose |
|---|---|
| `users` | Better Auth user + app profile fields |
| `sessions` | Better Auth sessions |
| `accounts` | OAuth/credential accounts as configured |
| `conversations` | Chat thread metadata owned by a user |
| `messages` | User/assistant/system/tool messages or normalized message records according to final schema |
| `models` / model registry | Zona.ai model metadata and 9Router mapping if database-backed |
| `generation_runs` | One model generation: status, model, timing, usage, error, finish metadata |
| `comparison_runs` | Groups multiple generation runs for one compare request |
| `attachments` | File metadata + R2 object reference |
| `document_chunks` | Parsed chunks + embedding/vector data for RAG |
| `web_sources` | Search/citation metadata linked to generation/message as designed |
| `feedback` | User rating/preference/compare feedback when feature is implemented |
| `usage_records` | Optional normalized usage/cost accounting if not stored directly on generation runs |

### Ownership Rule

Every user-owned entity must be queried/mutated with ownership authorization. Do not rely on a client-provided `userId` as proof of ownership.

The exact authorization implementation is defined by Better Auth/session middleware and server query patterns in the actual codebase.

---

## State Management Rules

### Server truth

PostgreSQL is the persistent source of truth for:

- conversations
- messages
- comparison runs
- generation state/results
- attachments metadata
- model registry when DB-backed
- retrieval/search metadata as defined by schema

### TanStack Query

Use TanStack Query/loaders for server state fetching, caching, invalidation, and synchronization where appropriate.

### Local UI state

Use component/local state or an explicitly chosen client store only for ephemeral UI state such as:

- open/closed panels
- temporary model selection before submit
- composer draft state (unless product requires persistence)
- active tab/layout preferences
- client-only interaction state

Do NOT introduce Zustand or another global store automatically. Add a client-state library only if the codebase/architecture explicitly chooses it.

### TanStack Virtual

Use TanStack Virtual when conversation/history rendering is large enough to benefit. Do not virtualize blindly if it breaks variable-height streaming messages, scroll anchoring, accessibility, or interaction behavior.

---

## File / Storage Rules

- Original uploaded files live in Cloudflare R2, not PostgreSQL blobs unless architecture explicitly changes.
- PostgreSQL stores object references and metadata.
- Signed upload/download URLs, if used, must be short-lived and authorized.
- Never expose R2 secret credentials to the client.
- Server validates upload ownership, MIME/type policy, file size, and object key.
- Object keys must not trust raw user filenames as unique storage paths.
- Deleting a conversation/file must follow the product's retention policy; do not silently orphan vectors or R2 objects.

---

## Web Search Rules

- Tavily is the default web-search provider in the current architecture.
- Exa is optional for future deep-research/advanced retrieval features; do not add it simply because it appears in this document.
- External search results must be normalized behind a search adapter.
- Citations shown in UI must map to real returned sources.
- Search failure should have explicit behavior; do not fabricate sources or pretend search succeeded.
- Search credentials are server-only.

---

## Security Boundaries

1. **9Router is server-side only.** Never send its credential/base routing secret to the browser.
2. **9Router production service should be private/internal.** Do not expose admin/dashboard/internal endpoints publicly unless explicitly secured and required.
3. **Auth is Better Auth.** Do not implement a second homemade auth/session system.
4. **Database access is server-side.** Browser never receives `DATABASE_URL`.
5. **R2/search/observability secrets are server-side.**
6. **Authorization is mandatory for every user-owned conversation, message, generation, attachment, and file operation.**
7. **User prompts/files are sensitive.** Avoid raw prompt/document contents in logs by default.
8. **Validate all API inputs with the project validation layer (Zod) at trust boundaries.**
9. **Model/tool outputs are untrusted external data.** Parse/validate structured outputs before persistence or execution.
10. **Never let model output directly execute privileged server operations without explicit tool schema + authorization + validation.**

---

## Suggested Project Structure

This is a target organization, NOT permission to assume files already exist. Before modifying a real repo, map its actual structure first.

```text
src/
├── routes/                 # TanStack Start UI + server/API routes
├── components/
│   ├── chat/
│   ├── compare/
│   ├── files/
│   ├── models/
│   ├── layout/
│   └── ui/
├── server/
│   ├── ai/
│   │   ├── gateway/
│   │   ├── model-registry/
│   │   ├── orchestration/
│   │   └── tools/
│   ├── auth/
│   ├── db/
│   ├── storage/
│   ├── search/
│   └── observability/
├── db/
│   ├── schema/
│   └── migrations/
├── config/
├── lib/
└── types/
```

If the generated starter or existing repository uses a different structure, preserve coherent existing conventions instead of forcing this tree blindly.

---

## Expected Key Routes / Surfaces

Exact route names are finalized by the PRD and actual route tree. Conceptually Zona.ai needs:

```text
/                       landing or authenticated chat entry
/chat/$conversationId   conversation
/login                  authentication
/models                 model discovery/selection if product includes dedicated page
/library                uploaded files if product includes library surface
/settings/*             account/preferences
/api/chat               single-model generation endpoint or equivalent
/api/chat/compare       compare orchestration endpoint or equivalent
/api/models             enabled Zona.ai model catalog
/api/files/*            upload/file operations
/api/search             search tool endpoint only if architecture exposes one separately
```

Do not create routes merely because they are listed conceptually here; confirm the PRD and existing route tree first.

---

## Rules Sebelum Ngoding

1. **Read the current task + PRD + architecture/rules first.**
2. **Map the actual repo before assuming structure.** TanStack Start uses file-based routing, but confirm the project's generated/current layout.
3. **Use Bun commands/package manager.** Do not introduce npm/pnpm/yarn lockfiles unless explicitly changing package management.
4. **TanStack Start is the application framework.** Do not introduce Next.js or a second backend framework for ordinary API/server logic.
5. **AI SDK 7 + `@ai-sdk/openai-compatible` is the AI client layer.** 9Router is the gateway behind it.
6. **Never call 9Router from browser code.**
7. **Model registry is the source of truth for UI models/capabilities.** Do not scatter raw 9Router IDs.
8. **Compare Mode = parallel, generation-scoped streaming.** One failure must not kill unrelated generations.
9. **PostgreSQL = persistent truth.** Dev uses local PostgreSQL; production targets Neon unless architecture changes.
10. **Drizzle owns schema/migrations.** Do not create a second ORM/data layer.
11. **R2 stores original file objects; PostgreSQL stores metadata; pgvector handles initial RAG.**
12. **Tavily is default web search.** Exa is optional, not automatically required.
13. **No fake AI signals.** UI states come from real generation/tool/upload/retrieval events.
14. **Server secrets stay server-only.**
15. **Verify current library APIs/docs before implementation.** TanStack Start, AI SDK, Better Auth, Drizzle/Bun.SQL, R2 APIs, and 9Router can evolve.
16. **Do not add Redis, Qdrant, microservices, queues, or new infrastructure without a demonstrated requirement.**
17. **Fix root causes, not observed prompt/model-specific symptoms.**
18. **Run typecheck/lint/tests relevant to the change before declaring completion.**

---

## What Is NOT Defined Yet

Unless another approved document defines these, **do not invent them**:

- pricing/subscription tiers
- credits/token billing model
- exact free/pro model access
- exact model catalog
- exact maximum models in Compare Mode
- upload size/type limits
- message/context limits
- retention/deletion policy
- public sharing behavior
- BYOK behavior
- voice/image generation
- agents/MCP/skills
- mobile app
- team/workspace features

If a task depends on one of these decisions, inspect the PRD/config/current implementation. Do not silently create product policy.
