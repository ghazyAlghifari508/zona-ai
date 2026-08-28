# Security Specification (SECURITY.md)

This document outlines the security architecture, practices, and guidelines for the Zona.ai project.

## 1. Authentication (Better Auth)
- **Framework**: Better Auth using the Drizzle adapter for PostgreSQL.
- **Session Type**: Session-based authentication (not JWT).
- **Cookie Handling**: Implemented via the `tanstackStartCookies()` plugin for seamless integration with TanStack Start.
- **Endpoint**: Auth handler is mounted at the catch-all route `/api/auth/$`.
- **MVP Provider**: Email/password authentication.
- **Future Providers**: OAuth providers (TBD/configurable).
- **Password Hashing**: Automatically handled by Better Auth (defaults to bcrypt/argon2).
- **Session Rotation**: Sessions are rotated during sensitive operations to prevent session fixation.

## 2. Session Handling
- **Storage**: Server-side sessions are stored in the PostgreSQL database (`sessions` table).
- **Cookie Security**: Session tokens are stored in `HTTP-only`, `Secure`, `SameSite=Lax` cookies.
- **Expiration**: Session expiration is TBD (configurable; default suggestion: 30 days).
- **Invalidation**: Sessions are immediately invalidated in the database upon user logout.
- **Concurrent Sessions**: Handling of concurrent sessions is TBD (decision required whether to allow multiple active sessions per user or restrict to a single active session).

## 3. Authorization
- **Server Function Verification**: Every server function MUST verify:
  1. A valid session exists for the request.
  2. The authenticated user owns the specific resource being accessed.
- **Enforcement Level**: Authorization checks happen at the `createServerFn` (server function) level. They are NOT just UI route guards.
- **Navigation Guard**: The `beforeLoad` check in TanStack Router is solely for UX navigation (redirecting unauthenticated users) and is NOT a security boundary.
- **Standard Pattern**: Implement a `getAuthSession()` helper that throws a `401 Unauthorized` (or equivalent) if no valid session exists.

## 4. Conversation Ownership
- **Strict Ownership**: Every conversation belongs to exactly one user (enforced via a `userId` foreign key).
- **Query Filtering**: All database queries involving conversations MUST filter by `userId`.
- **Access Violation**: Accessing or attempting to mutate another user's conversation returns a `403 Forbidden`.
- **Visibility**: No public sharing of conversations in the MVP. All conversations are strictly private to the owner.

## 5. File Ownership
- **Attachment Ownership**: Uploaded attachments belong to the uploading user (enforced via a `userId` foreign key).
- **R2 Storage Isolation**: Cloudflare R2 object keys are namespaced per user.
  - Example pattern: `users/{userId}/attachments/{attachmentId}/{filename}`
- **Verification**: File access or download requires server-side ownership verification.
- **No Direct Exposure**: Direct R2 URLs are NEVER exposed to the client. File downloads are served via a server function that performs an auth check before returning a signed URL or proxying the file.

## 6. Prompt & User Data Isolation
- **Absolute Privacy**: A user's conversation data and context are completely private.
- **No Data Leakage**: System architecture ensures no cross-user data leakage.
- **System Prompts**: System prompts are static/templated and never contain data extracted from other users' sessions.
- **RAG Scoping**: Any Retrieval-Augmented Generation (RAG) vector searches (via pgvector) are strictly scoped to the querying user's own embedded documents.

## 7. 9Router Credentials
- **Storage**: The 9Router API key is stored exclusively as a server-only environment variable.
- **No Client Exposure**: It is NEVER exposed in client-side code, HTML payloads, or SSR-rendered content.
- **Internal Routing**: The 9Router endpoint URL is server-only. All AI requests from the client are proxied through the Zona.ai server.

## 8. API Credentials
- **Server-Only Restriction**: All external service credentials (Tavily, Langfuse, Cloudflare R2) are server-only.
- **Startup Validation**: Environment variables are strictly validated (using Zod) on server startup.
- **Fail Fast**: If critical credentials are missing or invalid, the application fails fast with a clear error rather than booting in a compromised state.

## 9. Server-Only Secrets
These environment variables must NEVER appear in client bundles or SSR HTML:
- `DATABASE_URL`
- `NINE_ROUTER_API_KEY` / `NINE_ROUTER_BASE_URL`
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
- `TAVILY_API_KEY`
- `LANGFUSE_SECRET_KEY`
- `BETTER_AUTH_SECRET`
- Any other service credential.

*Implementation in TanStack Start*: Use `createServerFn` or server-only modules (`.server.ts` convention if applicable) to ensure these variables are stripped from the client bundle.

## 10. Upload Validation
- **Server-Side Validation**: Validate MIME types and file sizes strictly on the server (do not rely on client-side checks).
- **Magic Bytes Verification**: Re-validate file magic bytes on the server instead of trusting the client-provided `Content-Type` header.
- **Allowlist**: Implement a strict allowlist of accepted MIME types (e.g., specific image, document, and text formats).
- **Rejection**: Actively reject executables, scripts, and inherently dangerous file types.

## 11. MIME Verification
- **Inspection**: Check file magic bytes against the claimed MIME type.
- **Mismatch Rejection**: Reject files where the extension/claimed type does not match the actual magic bytes (e.g., an `.exe` renamed to `.pdf`).
- **Library**: Use a robust server-side library for magic byte detection.

## 12. Path & Object-Key Safety
- **Sanitization**: Sanitize all uploaded file names before storing them or referencing them in the database.
- **No Path Traversal**: Ensure R2 object keys are not susceptible to path traversal attacks (e.g., stripping `../`).
- **UUID Keys**: Use UUID-based object keys rather than user-supplied filenames for storage keys.
- **Metadata**: Store the user's original, sanitized filename separately in the database metadata for display purposes.

## 13. Rate Limiting
- **Status**: TBD (configurable limits need to be defined).
- **Considerations**: Implement per-user request limits for core features and per-IP limits for authentication endpoints to prevent brute forcing.
- **Targets**: Rate limiting applies to the chat API, file upload endpoints, and authentication attempts.
- **Implementation**: TBD (In-memory rate limiting is acceptable for MVP; migrate to a scalable solution like Redis as the application grows).

## 14. CSRF Protection
- **Auth Endpoints**: Better Auth handles CSRF protection for its managed authentication endpoints out-of-the-box.
- **Custom Functions**: For custom `createServerFn` mutations, verify `Origin` and `Referer` headers where appropriate.
- **Cookies**: The `SameSite=Lax` (or `Strict`) cookie attribute provides a strong baseline defense against Cross-Site Request Forgery.

## 15. XSS Prevention
- **Sanitization**: Sanitize all user-generated content before rendering it in the React UI.
- **Markdown**: Use a sanitizing markdown renderer to prevent raw HTML injection in AI responses or user messages.
- **Syntax Highlighting**: Ensure code block syntax highlighting libraries properly escape content.
- **React Standards**: Never use `dangerouslySetInnerHTML` with unsanitized or unverified content.
- **Content Security Policy (CSP)**: Implementation of CSP headers is TBD.

## 16. Markdown Sanitization
- **Renderer**: Use a secure, sanitizing markdown renderer (e.g., `rehype-sanitize`).
- **Stripping**: Aggressively strip dangerous HTML tags (`<script>`, `<iframe>`, etc.) and event attributes (`onclick`, `onload`).
- **Allowed Elements**: Allow safe markdown elements: headers, lists, code blocks, links, emphasis, and tables.
- **External Links**: Ensure all rendered links open in a new tab with `target="_blank"` and `rel="noopener noreferrer"`.

## 17. SSR & Client Data Exposure
- **Payload Safety**: Server-rendered HTML and hydration payloads must not contain:
  - Secret environment variables.
  - Other users' data.
  - Full database query results containing sensitive fields (select only what is needed for the page UI).
- **Dehydration**: When using TanStack Query dehydration, ensure the dehydrated state object is scrubbed of sensitive server-only fields.

## 18. Logging & Redaction
- **Never Log**: Passwords, API keys, session tokens, or full user message payloads (when logging to external observability services).
- **Safe Logging**: Log anonymized user IDs, action types, error codes, and timestamps.
- **Langfuse Traces**: If sending message content to Langfuse for AI observability, ensure it is opt-in or strictly scoped, and actively redact PII (Personally Identifiable Information) where possible.

## 19. Abuse Prevention
- **Prompt Injection**: Acknowledge that prompt injection is not fully solvable at the application level; monitor and log highly suspicious inputs.
- **Payload Limits**: Enforce maximum character/token lengths on user message payloads.
- **Rate Limiting**: Prevent rapid-fire API requests (as outlined in section 13).
- **File Bombs**: Enforce strict file size limits and decompression limits before processing any uploads to prevent resource exhaustion (zip bombs).

## 20. Dependency Security
- **Audits**: Run regular dependency audits (e.g., `bun audit` or equivalent).
- **Versioning**: Pin dependency versions in `package.json` to prevent malicious updates via semver.
- **Minimal Footprint**: Keep the dependency footprint as small as reasonably possible.
- **No Dynamic Execution**: Never use `eval()` or dynamic code execution on user or AI-generated input.
- **Review**: Carefully review the security posture and maintenance status of new dependencies before adding them to the project.
