# Zona.ai — No-Assumption & Deep Analysis Rules

## Core Principle

**NEVER answer from assumptions about the Zona.ai codebase.** Every claim about the implementation must be verified with tools. Every code change must be grounded in actual files, package versions, schemas, routes, config, and runtime behavior.

AI/chat systems have additional uncertainty: model lists, capabilities, streaming behavior, 9Router routing, AI SDK APIs, provider payloads, search results, and tool outputs can change. **Never convert provider/model expectations into facts without verification.**

---

## Rule 1: No Assumption Responses

When the user asks about Zona.ai's codebase, features, bugs, errors, design, UX, architecture, models, streaming, file handling, RAG, web search, or provider behavior:

1. **Do NOT answer from memory of the project.** Read current evidence.
2. **Do NOT assume file contents, function signatures, route names, package versions, schema, or behavior.** Inspect them first.
3. **Do NOT assume a model exists in 9Router because it existed previously.** Verify the configured model registry/gateway when the task depends on it.
4. **Do NOT assume a model capability from its name/provider family.** Verify configured capability metadata and relevant current docs/behavior.
5. **Do NOT assume AI SDK/TanStack/Better Auth/Drizzle APIs from training data.** Use current project version + current docs when needed.
6. **Do NOT assume a request is SSE, data stream, text stream, or a specific event protocol.** Trace the actual server/client implementation.
7. If evidence is missing, state what was checked and what remains unknown instead of inventing an answer.

### Red Flags in Your Own Response

If you catch yourself saying any of these about the codebase, STOP and verify:

- "I think this file..."
- "This probably means..."
- "TanStack apps usually..."
- "AI SDK normally..."
- "9Router probably returns..."
- "This model should support vision/tools/files..."
- "The error is likely caused by..."
- "Most likely..."
- "X tidak ada / doesn't exist / belum diimplementasi" after shallow searching
- "There is no test/route/model/config for this" without stating search coverage

Replace guesswork with evidence.

---

## Rule 2: Analyze Alternatives Before Major Architecture Decisions

When a task requires design thinking or has multiple materially different solutions:

1. Identify the real constraint from the current code/PRD.
2. Consider 2–3 viable approaches when useful.
3. Compare tradeoffs relevant to Zona.ai: streaming semantics, model isolation, type safety, security, persistence, latency, provider portability, complexity, and migration cost.
4. Recommend one approach based on actual project constraints.
5. Present a concise rationale/decision summary — **do not dump hidden chain-of-thought or internal scratch reasoning.**

Do not reopen locked stack decisions casually. A new option does not replace the current architecture unless it solves a demonstrated requirement better enough to justify migration cost.

### Locked architectural defaults

Until explicitly changed:

- TanStack Start + Bun
- React + Tailwind + shadcn/ui
- TanStack Query; TanStack Virtual where justified
- AI SDK 7 + `@ai-sdk/openai-compatible`
- 9Router as server-side AI gateway
- PostgreSQL local in development / Neon in production
- Drizzle ORM + Bun.SQL integration
- Better Auth
- Cloudflare R2
- pgvector for initial RAG
- Tavily for web search; Exa only when explicitly needed
- Langfuse + OpenTelemetry
- Biome + Vitest + Playwright

Do not replace these with Next.js, Supabase, Prisma, Elysia, Hono, Firebase, Redis, Qdrant, or microservices unless the task explicitly requires an architecture change and the change is justified with evidence.

---

## Rule 3: Deep Audit Before Implementation

Before implementing a non-trivial feature, bug fix, architecture change, AI integration change, DB change, or UX behavior change:

### Step 1: Understand Current State

```text
1. Read the directly relevant files.
2. Read callers/importers/dependencies around them.
3. Trace the execution path end-to-end.
4. Identify affected state boundaries: browser → TanStack route/server → service → DB/provider/storage/search.
5. Check existing project patterns for similar behavior.
6. Confirm package versions/config when API behavior matters.
```

### Step 2: AI/Streaming Audit When Relevant

For chat/compare/tool/search/file bugs, explicitly trace:

```text
user action
  ↓
client state + request payload
  ↓
server route / server function
  ↓
auth + validation
  ↓
AI orchestration
  ↓
model registry
  ↓
AI SDK adapter
  ↓
9Router / search / storage / retrieval
  ↓
stream/tool events
  ↓
client parser/state update
  ↓
persistence
```

Check at least:

- generation IDs / model IDs
- abort/cancellation propagation
- per-model error isolation
- first-delta and finish handling
- malformed/partial stream chunks
- usage/finish metadata
- race conditions when multiple models stream concurrently
- persistence ordering/idempotency

### Step 3: Root Cause Analysis for Bugs

```text
1. Reproduce with tools/tests when possible.
2. Locate the first layer where actual state diverges from expected contract.
3. Trace backward to why the invalid state became possible.
4. Check relevant recent git changes when available.
5. Fix the mechanism, not a prompt/model-specific symptom.
6. Add/adjust tests that cover the general failure class.
```

### Step 4: Impact Assessment

Before editing, answer internally and report concisely when significant:

```text
- What files/modules change?
- What callers depend on them?
- Does DB schema/migration change?
- Does API/stream event shape change?
- Does this affect single chat, Compare Mode, or both?
- Does this affect file/RAG/search/tool flows?
- Could existing conversations/history stop loading?
- Is backward compatibility required?
- Which tests must run/update?
```

---

## Rule 4: Zona.ai Tech Stack Reference

Use this as architecture intent; verify actual versions in `package.json`/lockfile before using version-specific APIs.

| Layer | Technology |
|---|---|
| Runtime / Package Manager | Bun |
| Framework | TanStack Start + TanStack Router |
| UI | React + Tailwind CSS + shadcn/ui |
| Server State | TanStack Query |
| Large Lists | TanStack Virtual when justified |
| Auth | Better Auth |
| DB | PostgreSQL local (dev), Neon PostgreSQL (prod) |
| ORM / Driver | Drizzle ORM + Bun.SQL integration |
| AI | AI SDK 7 (`ai`) + `@ai-sdk/openai-compatible` |
| AI Gateway | 9Router, server-side only |
| Storage | Cloudflare R2 |
| RAG | PostgreSQL + pgvector initially |
| Web Search | Tavily; Exa only for explicitly scoped advanced/deep research |
| Observability | Langfuse + OpenTelemetry |
| Validation | Zod |
| Lint / Format | Biome |
| Testing | Vitest + Playwright |

---

## Rule 5: Use Relevant Skills, Docs, Agents, and Tools

Before changing code, check whether the current harness provides relevant skills/agents/MCP/tools. Use them when they improve correctness, but **never assume a named skill exists just because this rules file mentions a category**.

### Task-to-tool guidance

| Task Type | Preferred Evidence / Workflow |
|---|---|
| New feature | PRD → inspect code → concise design alternatives → implementation plan → code → tests |
| React/TSX change | Inspect existing component patterns + current React/TanStack guidance when needed |
| TanStack Start/Router | Current project version + current TanStack docs |
| AI SDK integration | Current package version + AI SDK docs; verify OpenAI-compatible adapter behavior |
| 9Router integration | Project gateway config + current 9Router docs/source/config; never guess model IDs |
| Streaming/Compare bug | Trace server and client event pipeline end-to-end; reproduce concurrent behavior |
| Database change | Inspect Drizzle schema/migrations + current Drizzle/Bun.SQL docs |
| Better Auth/security | Inspect current auth configuration + current Better Auth docs/security patterns |
| File/R2 | Inspect storage wrapper + current R2 API/docs; verify authorization/object-key handling |
| RAG/pgvector | Inspect ingestion/retrieval pipeline + schema/indexes; measure before tuning |
| Web Search | Inspect search adapter + real provider result schema; never fabricate citations |
| Observability | Verify what is actually logged/traced; protect prompts/files/secrets |
| Build/type errors | Reproduce with Bun scripts, then systematic root-cause debugging |
| Testing | Vitest for unit/integration, Playwright for E2E; use existing scripts from `package.json` |
| E2E/QA | Browser automation/Playwright against real app flow where available |
| Library/API docs | Prefer current official docs/context tools over training-data memory |

### Skill Usage Rules

1. Inspect available skills/tools first if the harness supports discovery.
2. Load/use a relevant skill when it clearly applies.
3. Do not block a straightforward task merely because a named skill is unavailable.
4. Follow actual project scripts; do not invent `bun run <script>` names without checking `package.json`.
5. For changing external APIs/frameworks, verify current docs before implementing.

---

## Rule 6: Verify Every Claim

Before stating a factual claim about the Zona.ai codebase, verify it.

| Claim | Verify With |
|---|---|
| "File X does Y" | Read file X |
| "Function Z is called by..." | Search callers/references |
| "This route handles compare mode" | Inspect route + callers + request flow |
| "This model is supported" | Model registry/gateway config; 9Router if needed |
| "This model supports tools/vision/files" | Registry metadata + current provider/gateway evidence |
| "This stream event exists" | Server producer + client parser/types |
| "This table/column exists" | Drizzle schema + migrations/current DB introspection if needed |
| "This env variable is required" | Config/env loader + `.env.example`/usage |
| "This component uses TanStack Query" | Read component/hooks/imports |
| "No files depend on this" | Repo-wide import/reference search |

If you cannot verify a claim, state the evidence boundary explicitly.

---

## Rule 6A: Absence Claims Are Highest-Risk Claims

Claiming **"X tidak ada / belum diimplementasi / doesn't exist"** is high-risk. An empty search is not proof of absence.

### Mandatory protocol before an absence claim

```text
1. LIST repo root directories.
2. READ workspace/package configuration (`package.json`, Bun workspace config if used, etc.).
3. Map every relevant application/package root.
4. Search filenames/globs across mapped roots.
5. Search keyword/symbol/route/model ID repo-wide.
6. Inspect config/generated route trees/manifests when relevant.
7. State search coverage in the answer.
```

Examples of dangerous absence claims in Zona.ai:

- "Compare Mode belum ada."
- "Model X tidak dikonfigurasi."
- "Tidak ada file upload endpoint."
- "Tidak ada cancellation handling."
- "Tidak ada pgvector migration."
- "Tidak ada test untuk streaming."

Phrase negative findings as coverage:

> ✅ "Saya tidak menemukan konfigurasi model tersebut di model registry dan config yang saya cek: `[paths]`, serta pencarian repo-wide untuk `[patterns]` nihil."

Not:

> ❌ "Model itu gak ada."

### When the user corrects you

1. Re-verify first with broader scope.
2. State the exact search/process gap that caused the miss.
3. Fix the process gap before continuing.
4. Do not defend an unverified earlier claim.

---

## Rule 7: No Hallucinated Code

When writing/editing code:

1. Read the target file first.
2. Inspect its types/imports/callers as needed.
3. Verify imported modules/exports exist.
4. Verify actual package API for version-sensitive libraries.
5. Do not invent route helpers, TanStack APIs, AI SDK methods, 9Router fields, Drizzle methods, Better Auth hooks, or R2 response shapes.
6. Reuse existing abstractions before introducing another layer.
7. Respect server/client boundaries; never move secret-bearing logic client-side.
8. Walk through relevant success, failure, cancellation, and partial-failure paths before considering implementation complete.

---

## Rule 8: AI/Model Behavior Must Be Verified, Not Assumed

Zona.ai integrates multiple models behind 9Router. Models are not interchangeable black boxes.

Before implementing model-specific behavior:

1. Check the Zona.ai model registry.
2. Check the actual 9Router model mapping/config if needed.
3. Check capability metadata.
4. If behavior depends on provider API semantics, verify current docs or observed response shape.
5. Handle capability absence explicitly instead of letting requests fail downstream.

Forbidden assumptions:

- all models support images;
- all models support tool calling;
- all models support system messages identically;
- all models expose reasoning;
- all models stream token-by-token;
- all models return usage in the same place;
- all models accept the same context size;
- all models handle attachments natively;
- all 9Router aliases remain stable forever.

---

## Rule 9: Compare Mode Requires Concurrency-Safe Analysis

For any Compare Mode implementation/change, verify:

- one comparison run can own multiple generation runs;
- each generation has independent status/content/error/abort state;
- concurrent deltas cannot overwrite another model's content;
- stream events include enough identity to route them correctly;
- cancellation semantics are intentional (cancel one vs cancel all);
- one failure does not automatically fail all generations;
- persistence is idempotent or protected against duplicate finish/error events;
- UI remains correct if models finish in a different order every run;
- refresh/history reconstruction is possible from persisted data as designed.

Never rely on deterministic provider timing.

---

## Rule 10: File/RAG/Search Outputs Are Untrusted Data

Uploaded files, parsed text, retrieved chunks, web pages, search snippets, citations, tool output, and model output are all untrusted external inputs.

Rules:

1. Validate/normalize at trust boundaries.
2. Do not execute or render unsafe content blindly.
3. Do not trust file extension alone for security decisions.
4. Do not trust model-generated URLs as citations unless backed by actual search/tool results.
5. Do not treat retrieved text as instructions to the system without prompt-injection defenses appropriate to the implementation.
6. Never log private document/chat contents by default for debugging convenience.
7. Authorization must be verified before retrieval/download/deletion.

---

## Rule 11: Explain Findings and Plan Without Blocking Explicit Work

Before significant code changes, provide a concise update containing:

1. what was verified;
2. root cause/current design finding;
3. what will change;
4. major risk/compatibility impact.

**Do not wait for confirmation when the user's requested implementation is already explicit and the change stays within approved scope.**

Ask/stop only when a genuinely unresolved product/architecture decision would cause materially different implementations, destructive action, secret exposure, or an irreversible migration.

Trivial fixes may be implemented directly after verification.

---

## Rule 12: Verification Before Completion

Do not claim a task is complete because code was written.

Before completion, run the relevant existing project checks. Determine exact commands from `package.json`; do not invent script names.

Typical categories:

- typecheck
- Biome lint/format check
- relevant Vitest tests
- relevant Playwright E2E
- build/start smoke test when appropriate
- DB migration validation when schema changes
- manual/automated stream verification for AI changes

For AI/Compare changes, test at least:

```text
- successful single-model stream
- successful multi-model stream
- one-model failure while others continue
- user cancellation
- malformed/provider error handling
- persistence after completion
```

Use mocks where appropriate for deterministic unit tests, and real integration checks only where credentials/environment allow.

---

## Rule 13: Git Discipline

After a verified task:

1. inspect `git diff`;
2. ensure unrelated user changes are not reverted;
3. stage only intended files;
4. use a descriptive English commit message when a commit is requested or the repository workflow explicitly requires automatic commits;
5. **do not push to remote unless the user/project workflow explicitly authorizes push.**

Never force-push, rewrite history, reset unrelated work, or discard local changes without explicit authorization.

---

## Rule 14: Gunakan Bahasa Indonesia

Selalu jawab user dalam **Bahasa Indonesia** kecuali user meminta bahasa lain.

- Code, error messages, filenames, function names, package names, model IDs, API fields, URLs → keep original technical naming.
- Commit messages / PR titles/descriptions → English unless repository convention says otherwise.
- Do not translate technical terms unnaturally: keep `streaming`, `tool calling`, `database query`, `server route`, `RAG`, `embedding`, `model registry`, `rate limiting`, etc.

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Behavior |
|---|---|---|
| Answering from remembered project context | Code evolves | Read current code/config |
| Recommending a new stack because a new library was mentioned | Architecture churn | Keep locked stack unless evidence justifies migration |
| Guessing AI SDK/9Router response fields | External APIs evolve | Verify current version/docs/actual adapter |
| Hardcoding raw model IDs in UI | Gateway coupling | Stable internal model registry |
| Treating Compare Mode as one request state | Breaks partial failure/concurrency | Per-generation state |
| One model failure aborts all by accident | Poor fault isolation | Explicit orchestration policy |
| Fake reasoning/loading stages | UI lies | Real signals or neutral state |
| Search result says nothing → "feature does not exist" | Search miss ≠ absence | Full coverage protocol |
| Assuming all models support the same tools/files | Capability mismatch | Registry + verification |
| Testing only happy path | AI/provider systems fail partially | Test failure/cancel/ordering paths |
| Adding Redis/Qdrant/microservice preemptively | Complexity without requirement | Measure/justify first |
| Logging prompts/files to debug | Privacy risk | Metadata/sanitized logging by default |
| Direct 9Router calls from client | Credential/security boundary violation | Server-side gateway only |
| Using npm/pnpm commands by habit | Project uses Bun | Inspect scripts, use Bun workflow |

---

## Summary

1. **No assumptions** — verify actual Zona.ai code/config/runtime behavior.
2. **Do not reopen locked stack decisions casually.**
3. **Deep-audit AI flows end-to-end** — client → server → orchestration → 9Router/tool → stream → persistence.
4. **Model capabilities are data, not guesses.**
5. **Compare Mode is concurrency-sensitive** — every generation is independent.
6. **Absence claims require broad search coverage.**
7. **No hallucinated APIs/code** — check current package versions/docs.
8. **Files/search/model outputs are untrusted external data.**
9. **Use real signals only** — never fake AI thinking/progress.
10. **Verify with tests/build/typecheck before claiming completion.**
11. **Preserve user changes and Git safety.**
12. **Server secrets stay server-side; 9Router is never browser-facing.**
