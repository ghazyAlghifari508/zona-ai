# Zona.ai API Contract Specification

This document defines the application programming interfaces (APIs) for Zona.ai.

## Architecture: TanStack Start

IMPORTANT: In TanStack Start, there are TWO types of server-side endpoints used in this application:
1. **Server Functions (`createServerFn`)**: Type-safe RPC calls for internal app logic (loaders, actions, mutations). This is the primary mechanism for the frontend to communicate with the backend. They operate under the same-origin policy.
2. **Server Routes**: Raw HTTP endpoints for external access (e.g., auth callbacks, OAuth, file downloads, webhooks). These use file-based routing.

Most logical "APIs" documented here will be implemented as Server Functions rather than traditional REST endpoints, but the logical contract remains the same.

---

## 1. Chat API

**Server Function**: `sendMessage` (Logical equivalent: `POST /api/chat`)

- **Authentication**: Required (Session-based)
- **Request Schema**:
  ```typescript
  {
    conversationId?: string; // Creates conversation if not provided
    modelId: string;
    skillId?: 'none' | 'checklist' | 'prd-plan' | 'agent-skill'; // Optional task preset (defaults to 'none')
    content: string;
    attachmentIds?: string[];
    enableWebSearch?: boolean;
  }
  ```
- **Response**: Streaming (Server-Sent Events via Vercel AI SDK data stream protocol)
- **Format**: Data Stream
- **Behavior**:
  - Validates that user has sufficient `credits` for the model's `creditCost`.
  - Creates a new `conversation` if `conversationId` is omitted.
  - Creates a user `message`.
  - Deducts model credit cost from `users.credits` and logs a row in `credit_transactions`.
  - Creates an assistant `message` and associated `generation_run` (storing `skillId`).
- **Validation**:
  - `content` must not be empty.
  - `modelId` must be a valid, enabled model.
  - `skillId` (if provided) must be one of the recognized preset skills.
- **Authorization**: If `conversationId` is provided, the authenticated user must own the conversation.
- **Rate Limit**: TBD
- **Errors**:
  - `400 Bad Request`: Invalid input or validation failure.
  - `401 Unauthorized`: No active session.
  - `402 Payment Required`: Insufficient credit balance to execute generation.
  - `403 Forbidden`: User does not own the conversation.
  - `404 Not Found`: Conversation not found.
  - `502 Bad Gateway`: 9Router upstream error.
  - `504 Gateway Timeout`: 9Router or provider timeout.

---

## 2. Compare Chat API

**Server Function**: `sendCompareMessage` (Logical equivalent: `POST /api/chat/compare`)

- **Authentication**: Required
- **Request Schema**:
  ```typescript
  {
    conversationId?: string; // Creates conversation if not provided
    modelIds: string[]; 
    skillId?: 'none' | 'checklist' | 'prd-plan' | 'agent-skill'; // Preset applied uniformly to all compared models
    content: string;
    attachmentIds?: string[];
    enableWebSearch?: boolean;
  }
  ```
- **Response**: Multiplexed streaming
- **Format**: Data Stream (Multiplexed)
- **Behavior**:
  - Calculates cumulative credit cost: `sum(models.creditCost)`.
  - Verifies user has sufficient `credits`; otherwise rejects with `402 Payment Required`.
  - Deducts cumulative credits and logs transactions.
  - Creates a `comparison_run` and individual `generation_run`s for each model.
  - Streams responses from all requested models simultaneously in parallel.
  - **Partial failure & Refund**: If one model fails, other models continue generating, and the failed model's credit portion is automatically refunded via a `refund` record in `credit_transactions`.
- **Validation**:
  - `modelIds` must contain between 2 and 4 models (`modelIds.length >= 2 && modelIds.length <= 4`).
- **Authorization**: User must own `conversationId` if provided.
- **Rate Limit**: TBD
- **Errors**:
  - `400 Bad Request`: Invalid input or validation failure (e.g. fewer than 2 or more than 4 models).
  - `401 Unauthorized`: No active session.
  - `402 Payment Required`: Insufficient credit balance for combined model costs.
  - `403 Forbidden`: User does not own the conversation.

### `resetDevCredits` (Development Only)
**Server Function**: `resetDevCredits`
- **Authentication**: Required
- **Behavior**: Resets the current user's `users.credits` to `100`, records an `initial_grant`/`refill` in `credit_transactions`.
- **Environment**: Available in development mode only (`process.env.NODE_ENV !== 'production'`).
- **Response**: `{ success: true, newBalance: 100 }`

---

## 3. Models API

**Server Function**: `getModels` (Logical equivalent: `GET /api/models`)

- **Authentication**: Required
- **Request Schema**: None
- **Response Schema**:
  ```typescript
  {
    models: Array<{
      id: string; // TBD/Configurable model ID
      displayName: string;
      provider: string;
      capabilities: string[]; // e.g. ["vision", "reasoning", "search"]
      enabled: boolean;
      category: string;
      speedClass: string; // e.g. "fast", "reasoning"
    }>
  }
  ```
- **Format**: JSON
- **Behavior**: Fetches available models from the model registry (Database or Config). Discovers upstream models via 9Router `/v1/models` internally and enriches with DB metadata.

---

## 4. Conversations API

Implemented as a set of Server Functions.

### `getConversations`
- **Auth**: Required
- **Request**: `{ cursor?: string, limit?: number }`
- **Response**: Paginated list of user's conversations, sorted by `updatedAt` DESC.
- **Format**: JSON

### `getConversation`
- **Auth**: Required
- **Request**: `{ id: string }`
- **Response**: Conversation metadata and all associated messages.
- **Authorization**: User must own the conversation.
- **Format**: JSON

### `createConversation`
- **Auth**: Required
- **Request**: `{ title?: string }`
- **Response**: Newly created conversation object.
- **Format**: JSON

### `updateConversation`
- **Auth**: Required
- **Request**: `{ id: string, title: string }`
- **Authorization**: User must own the conversation.
- **Format**: JSON

### `deleteConversation`
- **Auth**: Required
- **Request**: `{ id: string, hard?: boolean }`
- **Behavior**: Soft deletes by default, hard deletes if requested.
- **Authorization**: User must own the conversation.

### `archiveConversation`
- **Auth**: Required
- **Request**: `{ id: string }`
- **Behavior**: Archives the conversation.
- **Authorization**: User must own the conversation.

---

## 5. Messages API

Implemented as a set of Server Functions.

### `getMessages`
- **Auth**: Required
- **Request**: `{ conversationId: string }`
- **Response**: List of messages with embedded `generation_runs` for assistant messages.
- **Authorization**: User must own the `conversationId`.

### `regenerateMessage`
- **Auth**: Required
- **Request**: `{ messageId: string, modelId?: string }`
- **Response**: Streaming Data Stream
- **Behavior**: Re-generates a specific assistant message. Can specify a different model.

### `stopGeneration`
- **Auth**: Required
- **Request**: `{ generationId: string }`
- **Behavior**: Cancels an in-progress generation via abort controller.

---

## 6. Files API

Implemented as Server Functions or Server Routes depending on raw payload needs.

### `uploadFile`
- **Auth**: Required
- **Request**: `FormData` containing file.
- **Behavior**: Uploads file to Cloudflare R2, creates attachment record in DB, triggers background processing (e.g., pgvector indexing).
- **Validation**: Strict MIME type checking. File size limit `[TBD_MAX_FILE_SIZE]`.
- **Response**: Attachment metadata.

### `getAttachment`
- **Auth**: Required
- **Request**: `{ id: string }`
- **Response**: Pre-signed URL or direct stream (via Server Route) from Cloudflare R2 + DB metadata.
- **Authorization**: User must own the attachment or the conversation it belongs to.

### `deleteAttachment`
- **Auth**: Required
- **Request**: `{ id: string }`
- **Behavior**: Deletes from R2 and removes DB record.

---

## 7. Web Search API

**Server Function**: `searchWeb`

- **Auth**: Required
- **Request**: `{ query: string, searchDepth?: 'basic' | 'advanced' }`
- **Response**: 
  ```typescript
  {
    results: Array<{
      url: string;
      title: string;
      content: string;
      score: number;
    }>
  }
  ```
- **Behavior**: Calls Tavily API (`@tavily/core`). Stores results in `web_sources` table for citation reference. This is also integrated internally into the chat flow when `enableWebSearch` is true.

---

## 8. Auth Routes

These are strictly **Server Routes** handled by Better Auth, not TanStack Server Functions.

**Endpoint**: `GET/POST /api/auth/$` (Catch-all)

- **Authentication Method**: **Google OAuth Only** (no password login or registration forms).
- **Behavior**: Handles OAuth workflows:
  - Google OAuth sign-in redirect
  - Google OAuth callback (`/api/auth/callback/google`)
  - Sign-out
  - Session verification
- **Client Usage**:
  - The frontend triggers authentication via Better Auth `authClient`:
    ```typescript
    await authClient.signIn.social({ provider: "google", callbackURL: "/chat" });
    ```
  - Upon success, Better Auth creates/updates the `users` record (with default 100 credits) and writes secure HTTP-only cookies.

---

## Streaming Protocol Specification

Zona.ai leverages the Vercel AI SDK Data Stream Protocol for streaming responses.

### Multiplexed Compare Mode Streaming
In Compare Chat API (`sendCompareMessage`), multiple LLM generation streams run in parallel. Because they share a single HTTP connection, the streams are **multiplexed**. 

To distinguish which model generated which chunk, **every event is tagged** with identifying metadata:
- `generationId`: Unique ID for the specific model's run
- `modelId`: Identifier of the model

### Event Contract
Each event pushed over the stream uses a type discriminator. The core events include:

```typescript
type StreamEvent = 
  | GenerationStartEvent
  | TextDeltaEvent
  | ReasoningStartEvent
  | ReasoningDeltaEvent
  | ToolCallEvent
  | SourceEvent
  | UsageEvent
  | GenerationFinishEvent
  | GenerationErrorEvent;

interface BaseEvent {
  generationId: string;
  modelId: string;
}

interface GenerationStartEvent extends BaseEvent {
  type: 'generation-start';
  timestamp: number;
  resolvedModelId?: string; // Present when modelId is 'auto' (e.g. 'ag/gemini-3.7-flash-high')
  routingReason?: string;   // Explanation of why this model was chosen (e.g. 'heavy-reasoning')
}

interface TextDeltaEvent extends BaseEvent {
  type: 'text-delta';
  text: string;
}

interface ReasoningStartEvent extends BaseEvent {
  type: 'reasoning-start';
}

interface ReasoningDeltaEvent extends BaseEvent {
  type: 'reasoning-delta';
  text: string;
}

interface ToolCallEvent extends BaseEvent {
  type: 'tool-call';
  toolName: string;
  args: any;
}

interface SourceEvent extends BaseEvent {
  type: 'source';
  sources: Array<{ title: string, url: string }>; // e.g. web search results
}

interface UsageEvent extends BaseEvent {
  type: 'usage';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface GenerationFinishEvent extends BaseEvent {
  type: 'generation-finish';
  finishReason: 'stop' | 'length' | 'tool-calls' | 'error' | 'other';
}

interface GenerationErrorEvent extends BaseEvent {
  type: 'generation-error';
  error: string;
  code: string;
}
```

## Rate Limiting (Fase 10)

Semua endpoint generatif (chat, compare, upload, web search) menerapkan rate limiting
in-memory per user (`src/lib/security/rate-limit.ts`):

| Scope | Key | Default |
|---|---|---|
| `sendMessage` | `chat:{userId}` | 20/menit |
| `sendCompareMessage` | `compare:{userId}` | 20/menit |
| `uploadFile` | `upload:{userId}` | 10/menit |
| `searchWeb` | `search:{userId}` | 30/menit |

Batas dapat dikonfigurasi via env `RATE_LIMIT_*_PER_MINUTE` (lihat `docs/ENVIRONMENT.md`).
Rate limit diperiksa sebelum deduct kredit (fail-fast).

### Response 429 (ERR-017)

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
Content-Type: application/json

{ "message": "ERR-017: Too many requests. Please wait a moment and try again. Retry-After: 42s", "code": "ERR-017", "status": 429 }
```

Client harus menunggu sesuai header `Retry-After` (detik) sebelum mencoba ulang.
