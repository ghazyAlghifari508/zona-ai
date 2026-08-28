# Zona.ai — No-Hardcode Implementation Rules

## Core Principle

**NEVER hardcode values that should be configurable.** Every value that might change — AI model IDs, 9Router endpoints, provider capabilities, API endpoints, upload limits, search limits, timeouts, retry policies, credentials, feature flags, storage buckets, database URLs — must live in environment variables, config files, database-backed registries, or constants modules.

**NEVER choose a hardcoded or fake shortcut because it is faster.** If the real signal, model capability, stream state, retrieval result, or provider response is harder to wire, wire the real thing. Zona.ai is an AI product; fake AI behavior is especially harmful because it makes the UI lie about what the system or model is actually doing.

---

## Rule 1: No Inline Magic Values

When implementing ANY Zona.ai feature, NEVER copy-paste literal values from the PRD, task description, screenshots, user instructions, or provider examples directly into business logic if those values can change.

| Bad | Good |
|---|---|
| `fetch("http://localhost:20128/v1/chat/completions")` | `fetch(getNineRouterBaseUrl())` or use the configured 9Router client |
| `model: "claude-something"` in route handlers | Resolve model through the central model registry |
| `if (selectedModels.length > 4)` in multiple files | `MAX_COMPARE_MODELS` in config/constants |
| `setTimeout(abort, 90000)` scattered across providers | `AI_REQUEST_TIMEOUT_MS` in config |
| `if (file.size > 20 * 1024 * 1024)` in components and API routes | `MAX_UPLOAD_BYTES` from shared config |
| hardcoded R2 bucket name | `R2_BUCKET_NAME` from env/config |
| hardcoded Tavily result count | `WEB_SEARCH_RESULT_LIMIT` from config |

**Exception:** Test files may use inline values for isolated assertions and synthetic fixtures when the literal is part of the test case itself.

---

## Rule 2: Wrappers Over Direct Integration

When integrating with ANY external service, ALWAYS use a project-owned adapter/wrapper. Business logic must not directly depend on provider-specific SDK calls or URLs.

Zona.ai integrations that require wrappers/adapters include:

- 9Router / AI model gateway
- AI SDK provider configuration
- Cloudflare R2
- Tavily / Exa
- Langfuse / OpenTelemetry exporters
- embedding providers
- future billing/email providers

Pattern:

```typescript
// server/ai/gateway.ts — Zona.ai-owned abstraction
export async function streamModel(params: StreamModelParams) { ... }
export async function generateModel(params: GenerateModelParams) { ... }

// server/services/chat-service.ts — business logic
const stream = await streamModel({
  modelId,
  messages,
  tools,
});
```

For 9Router specifically, provider-specific details belong behind the AI gateway/model registry. Do NOT scatter `baseURL`, API keys, provider prefixes, or raw model IDs across routes/components.

**Why:** Zona.ai must be able to change a model ID, replace 9Router, route selected models directly to official providers, or add another gateway without grep-replacing the whole codebase.

---

## Rule 3: Environment Variables for Secrets and Deployment-Specific Values

These MUST come from environment variables or an environment config layer, never hardcoded:

- `DATABASE_URL`
- Better Auth secrets and OAuth credentials
- 9Router base URL and API key/token
- Cloudflare R2 credentials, endpoint, and bucket name
- Tavily / Exa API keys
- embedding-provider credentials
- Langfuse / OpenTelemetry credentials and collector URLs
- deployment-specific public app URL
- webhook secrets/tokens
- feature flags that differ by environment

Maintain a complete `.env.example` containing variable names and safe descriptions only. Never commit real secrets.

**Server-only rule:** 9Router credentials, database credentials, R2 secrets, search API keys, and observability secrets MUST never be included in client bundles or exposed through browser-readable environment variables.

---

## Rule 4: Central Model Registry — Never Scatter Model IDs

AI model IDs and model capabilities change frequently. Zona.ai MUST have one canonical model registry or database-backed model catalog.

The registry should own configurable metadata such as:

```typescript
interface ModelConfig {
  id: string;
  displayName: string;
  routerModelId: string;
  provider: string;
  enabled: boolean;
  capabilities: {
    vision: boolean;
    tools: boolean;
    fileInput: boolean;
    reasoning: boolean;
  };
}
```

Rules:

1. UI uses Zona.ai's stable internal `id`, not raw 9Router model IDs.
2. Only the AI gateway/model registry translates internal IDs to `routerModelId`.
3. Do NOT infer capabilities from model names (`includes("vision")`, `startsWith("gpt")`, etc.). Read capabilities from registry data.
4. Do NOT duplicate model display names, icons, provider names, or capabilities in multiple components.
5. A model being available in 9Router does NOT automatically mean it is enabled in Zona.ai.

**Why:** 9Router's available models can change independently of Zona.ai's UI and product behavior.

---

## Rule 5: Constants/Config for Product Rules

Product rules from the PRD belong in a shared config/constants layer, not scattered across components and routes.

Examples:

```typescript
// config/chat.ts
export const CHAT_LIMITS = {
  maxCompareModels: 4,
  maxAttachmentsPerMessage: 10,
  requestTimeoutMs: 90_000,
} as const;

// config/retrieval.ts
export const RETRIEVAL_CONFIG = {
  defaultTopK: 8,
  maxTopK: 20,
} as const;
```

The specific values above are examples only. The actual values MUST come from the approved PRD/config and should not be invented by the coding agent.

Potentially configurable Zona.ai rules include:

- max models in compare mode
- allowed upload MIME types
- file-size limits
- conversation/message limits
- model timeout and retry policy
- web-search result count
- RAG chunk/retrieval settings
- rate limits
- enabled tools per model/mode
- feature rollout flags

---

## Rule 6: Verify Before Implementing

Before writing ANY value or provider behavior into code:

1. Check whether it already exists in config/constants/model registry — reuse it.
2. If it is a secret, URL, bucket, host, or environment-specific value — use env/config.
3. If it is a product rule — use shared product config/constants.
4. If it is AI-model metadata/capability — use the model registry.
5. If it is an external API contract — verify current official docs or the project's adapter implementation.
6. Only inline truly static implementation details that cannot reasonably change.

Never invent a default merely to make the feature compile. If the PRD/config does not define a product decision, preserve the uncertainty explicitly and use an existing project default if one exists.

---

## Rule 7: Never Embed User Content or Reported Symptoms Into Product Logic

When the user reports a bug, weird AI response, broken model, failed file, or search symptom, NEVER copy their literal prompt, chat content, provider response, document text, exact error phrase, or model output into production checks, regexes, denylists, heuristics, comments, or permanent test fixtures.

| Bad | Good |
|---|---|
| regex matching the exact malformed model response the user reported | validate the generic stream/event/output contract |
| `if (modelOutput.includes("<reported phrase>"))` | enforce structured parsing/validation independent of wording |
| special-case a single model ID because one failure was observed | fix capability/routing/error handling in the model registry/gateway |
| test fixture containing private chat/file content | synthetic neutral fixture with the same structure |
| hardcoded URL from one failed search | test search adapter with controlled mock results |

**Why:** Zona.ai handles private chat messages and uploaded documents. User content must never leak into source code, permanent fixtures, analytics labels, or provider routing rules.

Fix the mechanism that allowed the bug: validation, parsing, stream multiplexing, cancellation, provider adapter, capability gating, retrieval, or persistence.

---

## Rule 8: Never Fake AI Behavior — UI Must Reflect Real Signals

Any status, progress, reasoning, streaming, tool, search, upload, or retrieval indicator MUST be driven by real system state.

Zona.ai MUST NOT simulate model behavior just to make the interface feel active.

| Forbidden | Required Instead |
|---|---|
| fake rotating phrases such as "Analyzing…", "Thinking deeply…", "Almost done…" driven only by timers | show a neutral real state such as `Connecting`, `Waiting for model`, or measured elapsed time |
| fake token typing before a model delta arrives | render actual streamed deltas only |
| fake reasoning text | show reasoning only when the model/provider actually exposes supported reasoning data |
| fake search steps | render actual tool/search lifecycle events |
| fake progress % for file parsing/embedding | use real measurable progress, otherwise indeterminate progress |
| show all compare models as "generating" after one already failed | maintain per-generation state for every selected model |
| hide provider/model errors behind endless loading | surface a recoverable per-model error state |

### Compare Mode Requirement

Each selected model MUST have its own real generation state, for example:

```text
queued → connecting → streaming → completed
                    ↘ failed
                    ↘ cancelled
```

One model's status must never be fabricated from another model's status.

### Decision procedure before implementing an indicator

1. Enumerate the real signals available: request accepted, provider connected, first delta, tool call, source received, usage received, finish reason, error, abort, upload progress, retrieval completion, etc.
2. Wire the indicator to those real events.
3. If no granular signal exists, show one honest neutral state and optionally measured elapsed time.
4. Never invent intermediate phases.

---

## Rule 9: Never Hardcode Provider Routing/Fallback Logic in UI

Routing belongs on the server in the AI orchestration layer.

Forbidden:

```typescript
if (modelId === "model-a") useEndpointA();
if (modelId === "model-b") useEndpointB();
```

inside React components or client hooks.

Required:

```text
UI internal model ID
        ↓
server AI orchestrator
        ↓
model registry
        ↓
9Router adapter / future provider adapter
```

Fallback policies, retry policies, and routing strategies must be server-side, configurable, observable, and testable.

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Behavior |
|---|---|---|
| Raw 9Router model ID in React component | Couples UI to gateway internals | Internal stable model ID + model registry |
| 9Router base URL inline in API route | Cannot safely switch local/staging/production | Env + AI gateway adapter |
| API keys in browser code | Credential leak | Server-only adapter |
| `if (modelName.includes(...))` for capability detection | Model naming is not a capability contract | Model registry capability flags |
| Duplicate upload limits in client/server | Values drift | Shared config + server enforcement |
| Direct R2/Tavily calls from business logic | Provider coupling | Storage/search wrapper |
| One global `isStreaming` for compare mode | Cannot represent partial failures or independent streams | Per-generation state keyed by generation ID/model ID |
| Fake thinking/typewriter state | Misrepresents AI behavior | Real streamed/provider events |
| Exact user prompt/output embedded into bug fix | Leaks user data and fixes only one symptom | Structural validation/root-cause fix |
| "This model will always support X" | Provider capabilities change | Registry + capability checks |

---

## Summary

1. **No magic values** — use config/constants.
2. **No scattered model IDs** — central model registry is the source of truth.
3. **No direct external integrations in business logic** — use Zona.ai-owned adapters.
4. **No hardcoded secrets/URLs** — environment/config only.
5. **No capability guessing from model names** — use verified registry metadata.
6. **No hardcoded provider routing in UI** — orchestration stays server-side.
7. **Never embed private user chat/file content into source code or permanent fixtures.**
8. **Never fake AI activity** — streaming, reasoning, search, upload, and compare indicators use real signals only.
9. **Verify before writing** — especially AI SDK, 9Router, TanStack Start, Drizzle, Better Auth, R2, and search-provider contracts.
