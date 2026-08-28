# Model Registry Architecture

## Core Concept
The Model Registry is the single source of truth for all AI models available in Zona.ai. No model information should be hardcoded in components.

## 1. Registry Architecture
- Models are defined in a structured registry.
- **For MVP:** The registry is config-based (a TypeScript configuration file) that can later migrate to a database table.
- The registry is loaded server-side and served to the client via a server function (e.g., `createServerFn`).

## 2. Model Schema
```typescript
interface ModelRegistryEntry {
  // Identity
  id: string;                    // Zona.ai internal canonical ID (e.g., 'gpt-4o', 'claude-sonnet-4')
  routerModelId: string;         // Actual 9Router model ID — TBD, must come from 9Router /v1/models
  
  // Display
  displayName: string;           // Human-readable name (e.g., 'GPT-4o', 'Claude Sonnet 4')
  provider: string;              // Provider name (e.g., 'OpenAI', 'Anthropic', 'Google')
  description: string;           // Short description
  
  // State
  enabled: boolean;              // Whether model is currently available
  creditCost: number | { min: number; max: number }; // Credit cost per prompt/message
  creditTier: 'economy' | 'balanced' | 'premium' | 'adaptive'; // Pricing tier classification
  
  // Capabilities
  capabilities: {
    text: boolean;               // Basic text generation (always true)
    vision: boolean;             // Can process images
    files: boolean;              // Can process file attachments
    tools: boolean;              // Supports tool/function calling
    reasoning: boolean;          // Supports extended thinking/chain-of-thought
  };
  
  // Metadata
  metadata: {
    contextWindow: number | null;  // Max context window in tokens, null if unknown
    pricing: {                     // TBD — for future external currency tracking
      inputPerMillion: number | null;
      outputPerMillion: number | null;
    } | null;
    category: string;              // e.g., 'flagship', 'fast', 'reasoning', 'economy'
    speedClass: string;            // e.g., 'fast', 'medium', 'slow'
  };
}
```

## 3. Canonical Model ID vs 9Router Model ID
- `id`: Zona.ai's internal identifier, stable and human-readable.
- `routerModelId`: The actual model identifier that 9Router expects in API calls.
- These MAY differ because 9Router may use different naming conventions.
- `routerModelId` values are **TBD** — they MUST come from inspecting `GET /v1/models` on the actual 9Router instance.
- DO NOT invent `routerModelId` values.

## 4. Initial Configured Model List (Verified with Local 9Router)
*Verified directly against running 9Router instance at `http://localhost:20128/v1/models`.*

### Virtual / Smart Router Models (Default)
- **Auto (Smart Router)** (`id: auto`)
  - `routerModelId`: `auto` (dynamic resolution server-side)
  - `provider`: `zona-router`
  - `displayName`: `Auto (Smart Router)`
  - `description`: Automatically routes prompts to the optimal model based on query complexity, reasoning requirements, and coding context.
  - `enabled`: `true`
  - `isDefault`: `true`
  - `creditCost`: `{ min: 1, max: 4 }` (1 for economy queries, up to 4 for reasoning/coding)
  - `creditTier`: `adaptive`
  - `capabilities`:
    - `text`: `true`
    - `vision`: `true`
    - `files`: `true`
    - `tools`: `true`
    - `reasoning`: `true`
  - `metadata`:
    - `contextWindow`: `1048576` (inherits from target model)
    - `maxOutput`: `128000` (inherits from target model)
    - `category`: `smart-router`
    - `speedClass`: `adaptive`
  - `routingRules`:
    - **Lightweight queries** (short facts, translation, greetings): routes to fast tier (e.g. `ag/gemini-3.7-flash-low` or `cx/gpt-5.4-mini`) $\rightarrow$ **1 Credit**
    - **Heavy reasoning queries** (math, logic, multi-step analysis, RAG): routes to `ag/gemini-3.7-flash-high` $\rightarrow$ **4 Credits**
    - **Coding & Architecture queries** (code snippets, stack traces, database schema): routes to `cx/gpt-5.6-sol` $\rightarrow$ **15 Credits** (or economy alternative if user credit is low)

### Primary MVP Models
- **Gemini 3.7 Flash High** (`id: gemini-3.7-flash-high`)
  - `routerModelId`: `ag/gemini-3.7-flash-high`
  - `provider`: `antigravity` (prefix `ag`)
  - `displayName`: `Gemini 3.7 Flash (High)`
  - `description`: Google's next-gen hybrid reasoning model with high thinking budget via Antigravity gateway.
  - `enabled`: `true`
  - `creditCost`: `4` (4 Credits per prompt)
  - `creditTier`: `balanced`
  - `capabilities`:
    - `text`: `true`
    - `vision`: `true`
    - `files`: `true`
    - `tools`: `true`
    - `reasoning`: `true` (thinkingFormat: `gemini-level`)
  - `metadata`:
    - `contextWindow`: `1048576` (1,048,576 tokens)
    - `maxOutput`: `65536` tokens
    - `category`: `reasoning`
    - `speedClass`: `fast`

- **GPT 5.6 Sol** (`id: gpt-5.6-sol`)
  - `routerModelId`: `cx/gpt-5.6-sol`
  - `provider`: `codex` (prefix `cx`)
  - `displayName`: `GPT 5.6 (Sol)`
  - `description`: OpenAI's high-tier frontier model routed via Codex gateway.
  - `enabled`: `true`
  - `creditCost`: `15` (15 Credits per prompt)
  - `creditTier`: `premium`
  - `capabilities`:
    - `text`: `true`
    - `vision`: `true`
    - `files`: `true`
    - `tools`: `true`
    - `reasoning`: `true` (thinkingFormat: `openai`)
  - `metadata`:
    - `contextWindow`: `372000` (372,000 tokens)
    - `maxOutput`: `128000` tokens
    - `category`: `flagship`
    - `speedClass`: `medium`

### Secondary / Future Model Candidates in 9Router
Other models detected in 9Router available for selection or fallback:
- `ag/claude-sonnet-4-6` (Anthropic Claude via Antigravity)
- `ag/claude-opus-4-6-thinking` (Anthropic Opus reasoning via Antigravity)
- `cx/gpt-5.5` (Codex OpenAI tier)
- `cx/gpt-5.4-mini` (Codex compact fast tier)

## 5. Model Discovery
- **Future:** Auto-discovery from 9Router's `/v1/models` endpoint.
- **MVP:** Config-based registry initialized with verified models above (`ag/gemini-3.7-flash-high` and `cx/gpt-5.6-sol`), with automatic capability mapping.
- Server function `getAvailableModels()` returns enabled models from the registry for the client.

## 6. Provider Information
```typescript
interface ProviderInfo {
  id: string;            // e.g., 'antigravity', 'codex', 'openai', 'anthropic', 'google'
  prefix: string;        // 9Router namespace prefix, e.g. 'ag', 'cx'
  displayName: string;   // e.g., 'Antigravity (Google)', 'Codex (OpenAI)'
  iconUrl?: string;      // Provider logo/icon
}
```

Configured active providers:
- `antigravity` (namespace `ag`, routes to Gemini & Claude OAuth connections)
- `codex` (namespace `cx`, routes to OpenAI Codex OAuth connections)

## 7. Availability & Enabled/Disabled
- Models can be enabled/disabled without code changes by editing the registry state.
- Disabled models do not appear in the frontend model selector.
- If a model becomes unavailable mid-session (e.g. 9Router node goes down), the system gracefully handles the error without crashing.

## 8. Model Ordering
- Models are ordered by: category priority, then provider, then name.
- Flagship models appear first.
- The exact order is configurable within the registry.

## 9. Capability-Based Filtering
- The UI can filter models by capability (e.g., show only vision-capable models when an image is uploaded).
- The server validates capability requirements before passing requests to 9Router (e.g., rejecting an image input for a non-vision model).

## 10. Credit Cost & Tiering System
Zona.ai implements a user-friendly, point-based credit system to balance operational API costs:
- **Tier 1: Economy / Fast (1 Credit):**
  - Designed for casual chat, translation, light summaries, or `Auto` on small prompts.
  - Models: `Auto` (low-complexity branch), `ag/gemini-3.7-flash-low`, `cx/gpt-5.4-mini`.
- **Tier 2: Balanced / Reasoning (3 - 5 Credits):**
  - High-intelligence models with extended thinking budget.
  - Models: `ag/gemini-3.7-flash-high` (4 Credits).
- **Tier 3: Premium Flagship (15 - 20 Credits):**
  - Heavy frontier models that consume significant upstream resources.
  - Models: `cx/gpt-5.6-sol` (15 Credits).
- **Compare Mode Cost:**
  - Total credit deducted is the sum of selected models (e.g. `Gemini 3.7 Flash High (4)` + `GPT 5.6 Sol (15)` = **19 Credits**).
  - Failed models are automatically refunded via `credit_transactions`.
- **Future Pricing Metadata:**
  - `inputPerMillion` and `outputPerMillion` exist in the schema for backend provider cost tracking, but are kept separate from user-facing credit points.

## 11. Deprecation / Removal
- Models can be soft-disabled (`enabled: false`).
- Conversations using deprecated models remain accessible in the history.
- The UI displays a "model no longer available" badge on old conversations using a disabled model.
- If a user tries to regenerate a message on a deprecated model, the UI prompts the user to select an alternative.

## 12. Validation
- On application startup, the registry can optionally validate its entries against 9Router's `/v1/models`.
- Log warnings for models present in the registry but not in 9Router.
- Log warnings for models available in 9Router but missing from the registry.
