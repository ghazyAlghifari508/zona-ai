# Error Handling Specification

This document details the error handling strategy for Zona.ai, covering error scenarios, user-facing behavior, retry mechanics, logging, and persistence.

## Error Response Format

We standardize error responses across the application using the following TypeScript interface:

```typescript
interface ZonaError {
  code: string;         // e.g., 'ERR-001', 'ERR-002'
  message: string;      // User-friendly message suitable for UI display
  details?: unknown;    // Server-only debug info (never sent to client)
  retryable: boolean;   // Whether the action can be retried by the user
  action?: string;      // Suggested action ('retry', 'select-model', 'login', etc.)
}
```

## Error Taxonomy

### ERR-001: 9Router Unreachable
- **Scenario:** 9Router server is down or returning a network error.
- **User-facing Behavior:** "AI service is temporarily unavailable. Please try again later."
- **Server Behavior:** Log error with timestamp and attempt details. Return appropriate 50x code.
- **Retry Behavior:** Manual (user clicks retry).
- **Logging:** Log to server console and Langfuse trace.
- **Persistence:** Generation marked as 'failed', partial content preserved if any.

### ERR-002: Authentication Failure
- **Scenario:** Session expired, missing, or invalid.
- **User-facing Behavior:** Redirect to login page with "Session expired" message.
- **Server Behavior:** Clear invalid session, return 401 Unauthorized.
- **Retry Behavior:** User must re-authenticate.
- **Logging:** Log session invalidation event (no sensitive tokens).
- **Persistence:** None required for the failed action.

### ERR-003: Invalid Model
- **Scenario:** Selected model not in registry or currently disabled.
- **User-facing Behavior:** "Selected model is no longer available. Please choose another."
- **Server Behavior:** Return 400 Bad Request with model details.
- **Retry Behavior:** Select a different model.
- **Logging:** Log model resolution failure.
- **Persistence:** Prompt is saved but generation is blocked.

### ERR-004: Provider Timeout
- **Scenario:** 9Router/provider doesn't respond within the timeout threshold.
- **User-facing Behavior:** "Response timed out. The AI model took too long to respond."
- **Server Behavior:** Abort stream, log timeout duration.
- **Retry Behavior:** Manual.
- **Logging:** Log to Langfuse and server console.
- **Persistence:** Preserve any partial streamed content received before timeout.

### ERR-005: One Model Fails in Compare Mode
- **Scenario:** In a multi-model comparison, one model fails while others succeed.
- **User-facing Behavior:** Failed model panel shows an error with a retry button; other panels continue or finish unaffected.
- **Server Behavior:** Set `ComparisonRun` status for the failed model to 'failed', overall status = 'partial_failure'.
- **Retry Behavior:** User can retry just the failed model.
- **Logging:** Log failure for the specific model.
- **Persistence:** Preserve responses for successful models and failure state for the failed one.

### ERR-006: All Models Fail in Compare Mode
- **Scenario:** All models in a comparison request fail.
- **User-facing Behavior:** All panels show errors, and an overall error message is displayed.
- **Server Behavior:** Set `ComparisonRun` overall status = 'failed'.
- **Retry Behavior:** Retry all or retry individual models.
- **Logging:** Log failures for all models.
- **Persistence:** Save the prompt and the failed state for each comparison branch.

### ERR-007: Stream Interrupted
- **Scenario:** Network disconnect during streaming response.
- **User-facing Behavior:** "Connection lost. Partial response preserved."
- **Server Behavior:** Stream aborted, generation marked appropriately.
- **Retry Behavior:** Manual, sends full conversation context again.
- **Logging:** Log abort event.
- **Persistence:** Partial content preserved up to the point of disconnect.

### ERR-008: User Cancels Generation
- **Scenario:** User explicitly clicks 'Stop' during generation.
- **User-facing Behavior:** Partial response remains with a "Generation stopped" indicator.
- **Server Behavior:** Abort stream via `AbortController`.
- **Retry Behavior:** N/A (User can start a new request or regenerate).
- **Logging:** Log user cancellation.
- **Persistence:** Partial content preserved, status = 'cancelled'.

### ERR-009: Database Save Failure
- **Scenario:** PostgreSQL write fails (e.g., saving message history).
- **User-facing Behavior:** Response is still shown (as streaming was real-time), but a warning appears: "Failed to save conversation".
- **Server Behavior:** Log error, retry save with exponential backoff.
- **Retry Behavior:** Automatic backoff (server-side).
- **Logging:** Critical error logged to console.
- **Persistence:** **Critical Rule:** Never lose a response the user already saw. Store in local state if DB fails temporarily.

### ERR-010: R2 Upload Failure
- **Scenario:** Cloudflare R2 upload fails.
- **User-facing Behavior:** "File upload failed. Please try again."
- **Server Behavior:** Log error with file details (size, type). Return 500.
- **Retry Behavior:** Manual re-upload.
- **Logging:** Log to server console.
- **Persistence:** N/A (Upload aborted).

### ERR-011: Unsupported File Type
- **Scenario:** User uploads an unsupported MIME type.
- **User-facing Behavior:** "This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images."
- **Server Behavior:** Reject before upload, return 400 Bad Request.
- **Retry Behavior:** User must upload a different file.
- **Logging:** Log rejected file type.
- **Persistence:** None.

### ERR-012: Oversized File
- **Scenario:** File exceeds the configured size limit.
- **User-facing Behavior:** "File is too large. Maximum size: [TBD]."
- **Server Behavior:** Reject before upload, return 413 Payload Too Large.
- **Retry Behavior:** User must upload a smaller file.
- **Logging:** Log rejected file size.
- **Persistence:** None.

### ERR-013: Text Extraction Failure
- **Scenario:** PDF/DOCX text extraction process fails.
- **User-facing Behavior:** "Could not process this document. It may be corrupted or password-protected."
- **Server Behavior:** Mark attachment processing as 'failed'.
- **Retry Behavior:** User can re-upload or choose to skip RAG for this file.
- **Logging:** Log extraction error details.
- **Persistence:** File may be stored, but metadata indicates failed extraction.

### ERR-014: Embedding Failure
- **Scenario:** Vector embedding generation fails.
- **User-facing Behavior:** "Document indexing failed. You can still chat, but document search may not work for this file."
- **Server Behavior:** Log error, mark attachment as partially processed (uploaded but not indexed).
- **Retry Behavior:** Background retry (if applicable) or manual retry by user.
- **Logging:** Log embedding service error.
- **Persistence:** Document is saved, but embeddings are missing.

### ERR-015: Web Search Failure
- **Scenario:** Tavily API request fails.
- **User-facing Behavior:** "Web search unavailable. Responding without web results."
- **Server Behavior:** Continue text generation without web context, log Tavily error.
- **Retry Behavior:** None (graceful degradation).
- **Logging:** Log Tavily failure to Langfuse/console.
- **Persistence:** Generated response is saved normally.

### ERR-016: Malformed Upstream Response
- **Scenario:** 9Router returns invalid or unexpected response format.
- **User-facing Behavior:** "Unexpected error from AI model."
- **Server Behavior:** Log full raw response (safely) for debugging.
- **Retry Behavior:** Manual.
- **Logging:** Log to Langfuse and server console.
- **Persistence:** Prompt saved, response marked as failed.

### ERR-017: Rate Limit
- **Scenario:** 9Router or an upstream provider returns 429 Too Many Requests.
- **User-facing Behavior:** "Too many requests. Please wait a moment and try again."
- **Server Behavior:** Return 429, respect `Retry-After` header if present.
- **Retry Behavior:** Manual after wait period.
- **Logging:** Log rate limit hit.
- **Persistence:** N/A.

### ERR-018: Network Disconnect (Client)
- **Scenario:** User's browser loses internet connection.
- **User-facing Behavior:** "You're offline. Reconnecting..." banner is shown.
- **Server Behavior:** Stream continues server-side, saving to the database. Client reconnects later and fetches saved state.
- **Retry Behavior:** Automatic fetch on reconnection.
- **Logging:** Client-side offline tracking.
- **Persistence:** Server saves streamed content regardless of client connection state.

### ERR-019: Insufficient Credits
- **Scenario:** User attempts to generate a message or start a Compare Mode run with a credit balance lower than the required model cost(s).
- **User-facing Behavior:** "Kredit tidak mencukupi untuk model ini. Beralihlah ke model yang lebih hemat atau gunakan Auto." (Inline toast or modal).
- **Server Behavior:** Rejects request immediately with HTTP 402 (`INSUFFICIENT_CREDITS`) without making upstream API calls to 9Router.
- **Retry Behavior:** User selects a lower-cost model (e.g. `Auto` or economy tier) or awaits daily refill.
- **Logging:** Log insufficient credit event.
- **Persistence:** None (no message or generation created).

## Logging Strategy

- **Langfuse Tracing:** All AI-related errors must be logged to the Langfuse trace for the conversation/generation.
- **Server Console:** Critical errors (DB failures, network failures) logged to the server console.
- **Included Context:** Timestamp, `userId`, `conversationId`, `modelId`, error code, and stack trace (server-side only).
- **Data Privacy:** **NEVER log** user message content or uploaded file content to external logging services without explicit consent. Never log API keys or secrets.

## UI Error Patterns

- **Inline Errors:** Shown directly within the chat flow (e.g., below a specific message bubble or model panel). Do not use blocking modals.
- **Toast Notifications:** Used for transient, non-blocking errors (e.g., network reconnects, background save failures).
- **Error Panels:** Used in Compare Mode to represent the error state of a specific model while others continue.
- **Full-page Errors:** Reserved exclusively for critical failures, such as complete system downtime or major authentication failures (e.g., unrecoverable session state).
