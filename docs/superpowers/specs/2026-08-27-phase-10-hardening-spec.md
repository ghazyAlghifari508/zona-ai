# Fase 10 — Hardening (Production Readiness) — Spec

> Status: DRAFT — Menunggu review (brainstorming assume approved). DILARANG bikin plan/code sebelum approve plan.
> Referensi: `docs/MILESTONES.md` Milestone 10, `docs/DEFINITION-OF-DONE.md` Global 18 pts + Feature DoD, `docs/ERROR-HANDLING.md` ERR-001..019 + Logging + UI Patterns, `docs/SECURITY.md` 20 sections, `docs/TESTING.md` §4 12 Critical Paths + Mocking, `docs/ARCHITECTURE.md` §12 Observability + §14 Deployment, `docs/UI-UX.md` Responsive + Accessibility, `DESIGN.md`, `.agents/rules/anti-ai-slop.md`

## 1. Tujuan (Brainstorming Architectural — assume approved)

Menutup 18 pts DoD global + Milestone 10 Hardening: error 19 codes inline/toast/panel (bukan modal), rate limit per-user/IP in-memory `Map` 20/min 429 `Retry-After`, security audit 20 sections `SECURITY.md`, perf TTFT internal <150ms + `streamText` non-blocking + pooling `max 10`, a11y WCAG AA `role=log aria-live=polite` + `aria-label` + `focus ring 2px Ink` + `prefers-reduced-motion`, responsive 3 viewports Desktop >1024 full + Tablet 768-1024 collapsible Sheet + Mobile <768 hidden Sidebar + swipe Tabs Compare + Composer `safe-area`, E2E 12 critical paths `TESTING.md` + RAG/upload/websearch/usage, docs review `API.md` `DATABASE.md` `ENVIRONMENT.md`, final gate `tsc` `biome` `vitest` `playwright` clean 0.

## 2. Scope & Dependensi

- **Dependensi:** Fase 03-09 Done (single chat, persistence cursor `updatedAt DESC`, compare 2-4 parallel multiplex `generationId`, file R2 `users/{userId}/attachments/{uuid}`, RAG `document_chunks` HNSW `vector_cosine_ops`, web `web_sources` Fair Compare `fetch` once, observability `usage_records` + `feedback` `langfuse` `withLangfuse`).
- **Deliverable Fase 10:**
  1. `src/lib/utils/errors.ts` `ZonaError {code, message, retryable, action}` map 19 codes + HTTP `401/400/402/403/404/429/500/502/504` + `throwZonaError`
  2. UI `InlineError` White 10px `TriangleAlert` + `Retry` pill + `Toast` `sonner` `bg-ink-black text-pure-white` `rounded-[10px]` + `ModelColumn` error panel per-model + `src/routes/error.tsx` full-page `bg-cream-paper` 500 `Kembali ke chat`
  3. `src/lib/security/rate-limit.ts` `Map` `checkRateLimit({key,limit,windowMs})` `allowed`/`retryAfter` 429 `ERR-017` before `deduct` in `chat.ts` `sendMessage` `20/min` `compare:compare` `upload:upload` `10/min` `search:search` `30/min` `auth:auth` per-IP, future Redis `INCR`
  4. Security audit 20 sections `SECURITY.md` `grep getAuthSession` `where userId` `users/{userId}/attachments` `NINE_ROUTER_API_KEY` server-only `grep 0` `dangerouslySetInnerHTML 0` `rehype-sanitize` `R2 key UUID` `SameSite=Lax`
  5. Perf `timeToFirstTokenMs` `firstTokenAt-started` `onChunk text-delta` sync `TTFT <150ms` mock no network `vitest` `integration/performance.test.ts` + `useVirtualizer` `estimateSize 80 overscan 5` 500 msgs `<50 DOM` + `vite build --report` chunk `<500kb gz` + `Query staleTime` `getConversations 30s` `getModels 5min`
  6. A11y `MessageList` `role=log aria-live=polite aria-label="Chat messages"` + icon buttons `aria-label` `Send message` `Stop generation` `Attach file` `Web search` `Copy code` + `Composer textarea aria-label` + `Sidebar New Chat aria-label` + focus `*:focus-visible outline 2px solid #2c2e2a` `app.css` + reduced-motion `@media (prefers-reduced-motion: reduce) {* {animation-duration:0.01ms !important}}` + `axe-core` `playwright` `withTags wcag2a wcag2aa` 0 violations
  7. Responsive `WorkspaceShell` `aside w-[280px] hidden lg:block` `hamburger fixed top-2 left-2 lg:hidden` `Sheet` `Composer fixed bottom-0 lg:static pb-[env(safe-area-inset-bottom)]` `CompareGrid hidden max-[768px]:hidden` + `MobileCompareTabs hidden max-[768px]:block` `playwright` 3 viewports `1280,768,375x667`
  8. E2E 12 critical paths `TESTING.md` §4 `Register` `Login` `Create` `Single streaming` `Stop` `Regenerate` `Compare parallel` `Compare partial failure` `Reload` `Upload` `Web search citations` `Logout` + `RAG` `upload` `websearch` `usage` `feedback` `latency` `responsive` `a11y` `msw` mock 9Router/Tavily/R2 `setupServer` `http.post /v1/chat/completions` SSE `data: {"choices":[{"delta":{"content":"hello "}}]}` `fetch` `page.route` `**/api.tavily.com/search` + real PG test DB `DATABASE_URL_TEST` ephemeral `migrate` before `playwright` `workers 2` `webServer bun run dev`
  9. Docs review `API.md` `searchWeb searchDepth` `compare modelIds 2-4` `credit 402` `rate limit 429`, `DATABASE.md` `web_sources` `feedback` `document_chunks` HNSW, `ENVIRONMENT.md` `RATE_LIMIT_*` `RAG_*` `EMBEDDING_*` `TAVILY_MAX_RESULTS` `MAX_FILE_SIZE_BYTES`, `README` `bun run dev` `drizzle-kit migrate` `vitest` `playwright`
  10. Final gate verification
- **Out of scope:** Post-MVP `consensus` `blind` `leaderboard` `debate` `deep research` `BYOK` Fase 11 index.

## 3. Error Taxonomy 19 Codes (ERROR-HANDLING.md)

| Code | HTTP | Scenario | UI Inline/Toast/Panel | Server Log + Persistence | Retry |
|---|---|---|---|---|---|
| ERR-001 | 502 | 9Router unreachable | Inline `AI service is temporarily unavailable. Please try again later.` + Retry | Langfuse trace `generation.status failed` partial preserved | Manual Retry |
| ERR-002 | 401 | Session expired | Redirect `/auth/sign-in` toast `Sesi berakhir` | Clear session log anonymized | Re-auth |
| ERR-003 | 400 | Invalid/disabled model | `Selected model is no longer available. Please choose another.` | 400 log modelId | Select other |
| ERR-004 | 504 | Provider timeout | `Response timed out. The AI model took too long to respond.` + Retry | Abort stream log duration | Manual |
| ERR-005 | 200 | One model fails Compare | Failed panel `Retry` per-model others completed | `comparison_runs partial_failure` + refund `+cost` failed only | Retry failed only |
| ERR-006 | 200 | All models fail Compare | All panels error + banner `Semua model gagal` + Retry all | `failed` | Retry all |
| ERR-007 | 200 | Stream interrupted network | `Connection lost. Partial response preserved.` | Abort preserve partial | Manual full context resend |
| ERR-008 | 200 | User cancel | `Generation stopped` partial `cancelled` | `AbortController abort` | New request |
| ERR-009 | 500 | DB save fail | `Failed to save conversation` toast stream tetap show | Log critical retry exponential 3x never lose shown response local fallback | Auto backoff |
| ERR-010 | 500 | R2 upload fails | `File upload failed. Please try again.` + Retry per file | Log size/type 500 no DB insert if R2 fail | Manual re-upload |
| ERR-011 | 400 | Unsupported MIME magic mismatch | `This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images.` inline preview Stone Gray | 400 log rejected type no R2 | Different file |
| ERR-012 | 413 | Oversized `>MAX 10MB` | `File is too large. Maximum size: 10MB.` | 413 log size | Smaller file |
| ERR-013 | 500 | Text extraction fails | `Could not process this document. It may be corrupted or password-protected.` badge `failed` | `processingStatus failed` | Re-upload |
| ERR-014 | 500 | Embedding fails | `Document indexing failed. You can still chat, but document search may not work for this file.` | `processingStatus failed` delete partial chunks log | Background retry |
| ERR-015 | 200 | Tavily fail | `Web search unavailable. Responding without web results.` toast no chips | Continue without web log Langfuse | No retry degrade |
| ERR-016 | 500 | Malformed upstream 9Router invalid JSON | `Unexpected error from AI model.` | Log raw sanitized no PII | Manual |
| ERR-017 | 429 | Rate limit 9Router 429 / local rate limit | `Too many requests. Please wait a moment and try again.` + `Retry-After` header | Return 429 respect `Retry-After` | Manual after wait |
| ERR-018 | 200 | Client offline `navigator.onLine` false | Banner `You're offline. Reconnecting...` fixed top Sandstone | Client tracking `navigator.onLine` server streams still save to DB | Auto fetch on reconnect |
| ERR-019 | 402 | Insufficient credits | `Kredit tidak mencukupi untuk model ini. Beralihlah ke model yang lebih hemat atau gunakan Auto.` inline toast modal | Reject before 9Router 402 `INSUFFICIENT_CREDITS` no deduct | Select lower cost `Auto` |

**ZonaError `src/lib/utils/errors.ts`:** `interface ZonaError {code, message, details?, retryable:boolean, action?:string}` + `getZonaError(code)` `throwZonaError(code)` + HTTP mapping `401/400/402/403/404/429/500/502/504`.

**UI Patterns:** Inline White `10px` `TriangleAlert` + `Retry` pill 10px `border ink-black` per message/column, Toast `sonner` `bg-ink-black text-pure-white rounded-[10px] p-3` `fixed bottom-right` transient, Panel per-model Compare, Full-page `error.tsx` `bg-cream-paper` centered `500` `Kembali ke chat` only 500 downtime `401 unrecoverable`.

## 4. Rate Limiting (`SECURITY.md §13`, `MILESTONES` Fase 10)

**MVP In-memory `src/lib/security/rate-limit.ts` `Map<string,{count,resetAt}>`:**

```ts
export function checkRateLimit({key,limit,windowMs}:{key:string,limit:number,windowMs:number}):{allowed:boolean, retryAfter?:number}{
  const now=Date.now(); const entry=store.get(key);
  if(!entry || now>=entry.resetAt){ store.set(key,{count:1, resetAt:now+windowMs}); return {allowed:true}; }
  if(entry.count<limit){ entry.count++; return {allowed:true}; }
  return {allowed:false, retryAfter:Math.ceil((entry.resetAt-now)/1000)};
}
export function resetRateLimitForTest(key?:string){ if(key) store.delete(key); else store.clear(); }
```

**Targets `constants.ts` + `process.env.RATE_LIMIT_*` TBD 20/min default:** `chat:${userId}` `sendMessage` `RATE_LIMIT_CHAT_PER_MINUTE ?? 20` `60000ms`, `compare:${userId}` same `20`, `upload:${userId}` `10/min`, `search:${userId}` `30/min`, `auth:${ip}` `10/min` per-IP `REQ` `x-forwarded-for` `429` `Too many requests` `Retry-After: 60`.

**Call before `deductCredits` fail fast in `chat.ts` `sendMessage`/`sendCompareMessage`, `files.ts` `uploadFile`, `search.ts` `searchWeb`.** Future Redis `INCR` + `EXPIRE` `TODO Redis` comment.

## 5. Security Audit 20 Sections `SECURITY.md` (grep checklist Fase 10)

| # | Section | Audit Action Fase 10 | Pass Criteria |
|---|---|---|---|
| 1 | Authentication | `betterAuth drizzleAdapter` + `tanstackStartCookies` + `emailAndPassword.enabled===false` Google only | No password form `auth.ts` `enabled===false` |
| 2 | Session Handling | `sessions` table `Set-Cookie HttpOnly Secure SameSite=Lax` `zona_session` `expiresIn 30d` `psql sessions delete on logout` | `Set-Cookie` header `HttpOnly; Secure; SameSite=Lax` |
| 3 | Authorization | `getAuthSession` di tiap `createServerFn` `conversations/messages/files/search/chat/feedback` + ownership `conversations.userId` | Grep `getAuthSession` count = files, no missing |
| 4 | Conversation Ownership | `where eq(conversations.userId, session.user.id)` + 403 else `no public sharing` | Integration `B cannot A 403` |
| 5 | File Ownership | `attachments.userId` + R2 `users/{userId}/attachments/{uuid}/{name}` + `getAttachment` verify | Grep `attachments.userId` + `users/{userId}` |
| 6 | Prompt Isolation | RAG `WHERE conversationId` scoped `retrieve.ts` `SELECT ... WHERE conversation_id=$2` | Grep `WHERE conversation_id` |
| 7 | 9Router Credentials | `NINE_ROUTER_API_KEY` `src/lib/ai/9router.ts` `createOpenAICompatible` server-only, never `import` in `components/*` | Grep `NINE_ROUTER_API_KEY` in `.vinxi/build/client` → 0 |
| 8 | API Credentials | Zod `env.server.ts` `DATABASE_URL` `R2_*` `TAVILY_API_KEY` `LANGFUSE_*` fail fast `throw on import` | `bun x tsc` + missing env boot error |
| 9 | Server-Only Secrets | `src/lib/r2/client.ts` `tavily/client.ts` `langfuse/tracing.ts` not imported in `components/*` | Grep `from.*r2/client` in `src/components` → 0 |
| 10 | Upload Validation | Zod + `file-validation.ts` + `validateMagicBytes` server `uploadFile` | `uploadFile` calls `validateMime/Size/Magic` |
| 11 | MIME Verification | `file-type` magic check `validateMagicBytes` | Implemented `unpdf`/`file-type` |
| 12 | Path Safety | `sanitizeFilename` + UUID key `replace(/\.\./g,"")` | `sanitizeFilename` exists `users/{userId}/attachments/{uuid}` |
| 13 | Rate Limiting | `rate-limit.ts` in-memory `Map` `checkRateLimit` before `deduct` | Called in `chat/files/search` |
| 14 | CSRF | Better Auth handle `/api/auth/*`, custom `createServerFn` verify `Origin` header where appropriate `SameSite=Lax` | `SameSite=Lax` cookie + `Origin` check optional Fase 10 |
| 15 | XSS | `rehype-sanitize` in `MessageList.tsx` `ReactMarkdown rehypePlugins={[rehypeSanitize]}` no `dangerouslySetInnerHTML` | Grep `dangerouslySetInnerHTML` in `src/components` → 0 |
| 16 | Markdown Sanitization | `rehype-sanitize` strip `<script><iframe> onclick` | `markdown.test.ts` `<script>` stripped |
| 17 | SSR & Client Data Exposure | Hydration `getMessages` `select` only needed fields `conversations.userId` not `DATABASE_URL`, dehydration scrub `TanStack Query` | `getMessages` `select` not `*` |
| 18 | Logging & Redaction | Never log `password/apiKey/session token/content` full, `langfuse` redact PII `userId anonymized hash` `modelId` `error.code` | Grep `console.log.*password` → 0 |
| 19 | Abuse Prevention | `content max 20000` Zod, `MAX_FILE_SIZE_BYTES` TBD 10MB `validateSize`, `file Bombs` decompression limit, `rate limit` | `max(20000)` `MAX_FILE_SIZE` |
| 20 | Dependency Security | `bun audit` + `package.json` pinned `~` exact + no `eval` | `bun audit` 0 critical, `grep -r "eval(" src` → 0 |

## 6. Performance (NFR-001 TTFT <150ms + NFR-004 + MILESTONES Fase 10)

- **TTFT internal <150ms:** `firstTokenAt - startedAt` `onChunk text-delta` sync `firstTokenAt=Date.now()` not `setTimeout`, mock 9Router no network delay → `integration/performance.test.ts` `mock streamText` yields first chunk immediate → assert `<150ms` real `Date.now()` not fake `setTimeout`.
- **Non-blocking:** `Promise.allSettled` Compare not sequential `for await`, DB pooling `postgres max 10` or Neon pooling `pgbouncer`.
- **Bundle:** `vite build --report` `client` chunk `<500kb gz` check `build` `client` `Report`.
- **Virtual:** `useVirtualizer` `estimateSize 80 overscan 5` 500 msgs `<50 DOM` `virtual.test.ts`.
- **Caching:** `TanStack Query` `staleTime` `getConversations 30s` `getModels 5min`.

## 7. Accessibility (WCAG 2.1 AA `DESIGN.md` + `UI-UX.md` §6)

- **Contrast:** Cream `#f5f1e4` Ink `#2c2e2a` ratio `12.5:1` >4.5:1, White `#ffffff` Ink `15:1`, Stone Gray `#80827f` White `4.6:1` 15px pass AA 4.5:1, check `axe` `polypane`.
- **Keyboard:** `Tab` `New Chat` → `Search` → `⋯` menu → `ModelSelector` → `SkillSelector` → `Attachment` → `Composer textarea` → `Send` → `Web toggle` → `CitationDrawer` link → `Feedback` thumbs, `Shift+Tab` reverse, `Enter` activate, `Escape` close `Popover`/`Dialog`.
- **Screen Reader:** `MessageList` container `role="log" aria-live="polite" aria-label="Chat messages"` streaming, `aria-label` icon buttons `Send message` `Stop generation` `Attach file` `Web search` `Copy code` `Conversation menu`, `aria-pressed` toggle `Web` `Feedback`, `Tabs` `aria-selected` for Compare mobile.
- **Reduced Motion:** `src/styles/app.css` `@media (prefers-reduced-motion: reduce) { *,*::before,*::after {animation-duration:0.01ms !important; transition-duration:0.01ms !important;}}` disable `animate-pulse` `slide-in` `fade-in` for `MessageList` virtual, `CitationDrawer` collapse.
- **Test:** `axe-core` `@axe-core/playwright` `await checkA11y(page)` 0 violations.

## 8. Responsive 3 Viewports (UI-UX §5 + MILESTONES Fase 10)

- **Desktop >1024:** `Sidebar 280px` visible `flex` + `Main` `max-width 800px` + Compare `grid-cols 2/3/4` side-by-side `gap-4` `overflow-x-auto` for 4.
- **Tablet 768-1024:** Sidebar collapsible `Sheet` `hidden` behind hamburger `Menu` Lucide 16 `fixed top-2 left-2 lg:hidden` `onClick setSidebarOpen`, Compare `2x2 grid` for 4 models `grid-cols-2`, `overflow-x-auto` snap, `Composer` `max-width 800px`.
- **Mobile <768:** Sidebar `hidden` hamburger `Menu` or swipe `touch` `translateX` `Sheet`, `Chat` full screen `p-2`, `Composer` `fixed bottom-0 left-0 right-0 lg:static bg-pure-white rounded-full border p-2 pb-[env(safe-area-inset-bottom)]` `safe-area`, Compare `Tabs` swipeable `MobileCompareTabs` `hidden max-[768px]:block` `TabsList rounded-full` `TabsTrigger` per model, `CitationDrawer` full width, `MessageList` virtual still `estimateSize 80`.
- **Verify:** Playwright `projects` `chromium` `viewport 1280`, `tablet 768`, `mobile 375x667 isMobile true` or `page.setViewportSize`.

## 9. E2E Suite 12 Critical Paths `TESTING.md` §4 + MILESTONES Fase 10 (all must pass)

| # | Path | Spec Fase | Mock |
|---|---|---|---|
| 1 | Register new account Google OAuth | Fase 02 auth | Mock `authClient.signIn.social` redirect `mock` `page.route /api/auth/**` |
| 2 | Login existing Google OAuth | Fase 02 | Same |
| 3 | Create new conversation New Chat | Fase 04 `createConversation` `getConversations` | Real PG test DB `DATABASE_URL_TEST` ephemeral `migrate` |
| 4 | Send message streaming Single `Auto`/`gemini` halo | Fase 03 `sendMessage` `streamText` SSE `generation-start` `text-delta` `usage` `generation-finish` | Mock `msw` `http.post http://localhost:20128/v1/chat/completions` `HttpResponse` `ReadableStream` `data: {"choices":[{"delta":{"content":"Hello "}}]}` `streamText` mock `vi.mock("ai")` or `msw` |
| 5 | Stop generation mid-stream | Fase 03 `stopGeneration` `AbortController` | Mock slow stream `setTimeout` 200ms `Hello ` chunks `page.getByTestId("stop-btn").click()` → `cancelled` partial preserved |
| 6 | Regenerate response `regenerateMessage` same `messageId` new `generation_runs` | Fase 03 | Mock new stream `Hello again` |
| 7 | Compare 2+ models parallel side-by-side `CompareGrid` 2 cols `ModelColumn` `streaming` | Fase 05 `sendCompareMessage` `comparison_runs` `generation_runs` `createMultiplexStream` | Mock `msw` 2 streams `msw` `fetch` `page.route` `**/v1/chat/completions` return different `generationId` chunks tagged |
| 8 | Compare partial failure one model fail + Retry per-model `ERR-005` `partial_failure` refund `+15` others completed | Fase 05 `ERR-005` | Mock one `500` `HttpResponse` `status 500` `generation-error` `code ERR-001` other 200 `partial_failure` |
| 9 | Reload conversation `getConversation` + `getMessages` `refresh` preserves `conversations`/`messages`/`generation_runs`/`document_chunks`/`web_sources`/`feedback` | Fase 04 `loader` `getConversation` `getMessages` | Real PG `page.reload()` → `assert webSources` still `expect(page.getByText("Hello ")).toBeVisible()` `expect(page.getByTestId("compare-grid")).toBeVisible()` |
| 10 | Upload supported file `sample-report.pdf` `photo.png` `data.csv` `uploadFile` `putObject` `R2` `attachments` `processingStatus pending` `getAttachment` `deleteAttachment` | Fase 06 `ALLOWED_MIME` `validateMime/Size/Magic` `sanitizeFilename` | Mock `aws-sdk-client-mock` `S3Client` `PutObjectCommand` `GetObjectCommand` `DeleteObjectCommand` `msw` not network, `file-type` `fileChooser setFiles` `Buffer.from("%PDF")` |
| 11 | Web search `Tavily` `enableWebSearch` `searchProvider.search` `web_sources` `CitationDrawer` `[1]` `https://example.com/article-1` `score 0.95` `snippet` `Web context` `Cite as [1]` `source` event | Fase 08 `Tavily` `fetch https://api.tavily.com/search` `POST` `{api_key: tvly-..., query, search_depth, max_results 5}` `page.route` `**/api.tavily.com/search` `HttpResponse.json({results:[{url,title,content,score}]})` | Mock `page.route` `**/api.tavily.com/search` `HttpResponse.json` |
| 12 | Logout `authClient.signOut` `sessions` delete `redirect /auth/sign-in` | Fase 02 `auth.ts` `session cookie` `HttpOnly Secure SameSite=Lax` | `authClient.signOut` mock |

Plus `RAG` `rag.spec.ts` `sample-report.pdf` `Indexing`→`Indexed` `apa isi laporan?` `Context` same to all models `vector_cosine_ops`, `upload.spec.ts` `photo.png` thumbnail `40x40` `rounded-[10px]` `exe renamed pdf` `Unsupported` `MAX+1` `File is too large` `non-vision 400`, `websearch.spec.ts` `Globe` toggle `aria-pressed` `chips [1][2]` drawer `title/url/snippet` `ExternalLink` `Compare Fair fetch count 1`, `usage.spec.ts` `tokens` `ms TTFT` `s total` `Timer` `ThumbsUp/Down` `feedback` persist `reload` `langfuse` `sk-lf-` not in client, `a11y.spec.ts` `axe` 0 violations `Tab` `focus ring 2px Ink` `prefers-reduced-motion`, `responsive.spec.ts` `1280: sidebar visible compare 4 cols` `768: hamburger Sheet` `375: tabs swipeable composer bottom`.

**Setup `playwright.config.ts`:** `testDir tests/e2e`, `webServer: {command:"bun run dev", port:3000, reuseExistingServer:!process.env.CI, timeout:120*1000}`, `use: {baseURL:"http://localhost:3000"}`, `projects: [{name:"chromium", use:{browserName:"chromium"}}, {name:"tablet", use:{browserName:"chromium", viewport:{width:768,height:800}}}, {name:"mobile", use:{browserName:"chromium", viewport:{width:375,height:667, isMobile:true}}}]` `workers:2`, `globalSetup` `tests/e2e/setup.ts` `seedDev` `migrate` ephemeral `DATABASE_URL_TEST` `Neon branch` `pgvector` `CREATE EXTENSION vector`.

**CI:** `bun x drizzle-kit migrate` before `playwright test`, `DATABASE_URL_TEST` ephemeral per run, `workers 2`.

## 10. Documentation Review

- `docs/API.md` — update `searchWeb searchDepth`, `compare modelIds 2-4`, `credit 402`, `rate limit 429`, `streaming` `StreamEvent` `generation-start` `resolvedModelId`
- `docs/DATABASE.md` — add `web_sources` `feedback` `document_chunks` HNSW `CREATE INDEX USING hnsw`, `attachments` key pattern `users/{userId}/attachments/{uuid}/{sanitized}`, `feedback` unique `userId+generationRunId`
- `docs/ENVIRONMENT.md` — add `RATE_LIMIT_CHAT_PER_MINUTE` `RAG_CHUNK_SIZE` `RAG_TOP_K` `EMBEDDING_*` `TAVILY_MAX_RESULTS` `MAX_FILE_SIZE_BYTES` TBD `TAVILY_TIMEOUT_MS` `LANGFUSE_ENABLE_CONTENT` optional
- `docs/SECURITY.md` — update `CSRF Origin` check added `rate limiting` `Rag scoping` `WHERE conversationId`
- `README.md` — `bun run dev` `bun x drizzle-kit migrate` `bun x vitest` `bun x playwright test` `bun x tsc --noEmit` `bun x biome check`

## 11. Definition of Done Global 18 pts + Feature DoD

Fase 10 gate ALL 18 must pass:

1 Code Implemented ✅ Fase 03-09
2 Requirement Fulfilled PRD FR-001..024 — audit `grep FR-`
3 No Architecture Violation locked stack `grep prisma|next` 0
4 No Secret Exposure `grep NINE_ROUTER_API_KEY|TAVILY_API_KEY|R2_SECRET` in `.vinxi/build/client` → 0
5 Validation Complete Zod `chatSchema` `compareSchema` `file-validation` `magic` server
6 Auth/Authorization Correct `getAuthSession` + `where userId` in all `server/functions/*` + `generation_runs.conversationId` join `conversations` 403
7 Loading States Handled skeleton `bg-sandstone pulse` `streaming cursor ▌` `File Uploading...` `Indexing...` `Searching the web...` no blank
8 Error States Handled `InlineError` White 10px `Toast` `ModelColumn` error panel per-model `Retry` no raw `stack`
9 Responsive UI 3 viewports `playwright` `chromium/tablet/mobile` pass
10 Accessibility Baseline `axe` AA `Tab` `focus ring 2px Ink` `aria-live polite` `aria-label` `prefers-reduced-motion`
11 TypeCheck Passes `tsc --noEmit` 0
12 Lint Passes `biome check` 0 `grep shadow-xl` 0
13 Unit Tests Pass `vitest run` all unit `registry` `router` `credits` `validation` `file-validation` `chunk` `embed` `tavily` `citation` `usage` `latency` `feedback` `tracing` `errors` `rate-limit`
14 Integration Tests Pass `vitest run` integration `db` `chat` `conversations` `compare` `files` `rag` `search` `usage` `rate-limit` `security` `performance` real PG + `msw` mock 9Router/Tavily/R2
15 E2E Critical Path Passes `playwright test` 12 paths `Register`→`Logout` + `RAG` `upload` `websearch` `usage` `a11y` `responsive`
16 No Unexpected Console Errors `page.on('console')` `type error` 0 `grep console.error` not `ERR-`
17 Data Persists Correctly `refresh` preserves `conversations/messages/generation_runs/comparison_runs/document_chunks/web_sources/feedback/usage_records/credit_transactions` `SELECT count(*)` after suite
18 Docs Updated `API.md` etc. if `schema`/`env` changed `git diff docs/`

Plus feature-specific DoD Single `stop` `regenerate` `markdown` `code copy` `title auto`, Compare `2+ parallel` `partial failure` `cancel` `swipeable`, File `drag-drop` `400/413` `R2` `vision`, RAG `extract→chunk→embed→retrieve` `HNSW`, Web Search `toggle` `citations` `Fair Compare`.

## 12. File yang Akan Dibuat/Dimodifikasi

- **Create:** `src/lib/security/rate-limit.ts` `Map` `checkRateLimit`, `src/lib/utils/errors.ts` lengkap 19 codes + `throwZonaError`, `src/routes/error.tsx` full-page `bg-cream-paper` centered `500` `Kembali ke chat`, `tests/e2e/critical.spec.ts` aggregator (or rely on `tests/e2e/*.spec.ts` existing), `playwright.config.ts` update 3 viewports
- **Modify:** `src/server/functions/chat.ts` `checkRateLimit` before `deduct` `sendMessage`/`sendCompareMessage`, `src/server/functions/files.ts` `checkRateLimit` `uploadFile`, `src/server/functions/search.ts` `checkRateLimit` `searchWeb`, `src/components/chat/MessageList.tsx` `role=log aria-live=polite` `aria-label` + `rehype-sanitize` check, `src/components/layout/Sidebar.tsx` `keyboard Tab` `hamburger Sheet`, `src/styles/app.css` `@media (prefers-reduced-motion: reduce) {* {animation:none !important}}` `*:focus-visible outline 2px solid #2c2e2a`, `docs/API.md`, `DATABASE.md`, `ENVIRONMENT.md`, `README.md`
- **Test:** `tests/unit/rate-limit.test.ts` `errors.test.ts` `a11y.test.ts`, `tests/integration/rate-limit.test.ts` `security.test.ts` `performance.test.ts`, `tests/e2e/critical.spec.ts` `a11y.spec.ts` `responsive.spec.ts` plus existing suites

## 13. Larangan Khusus (jangan halu)

- DILARANG invent `RATE_LIMIT_*` numeric final — TBD configurable `20/min` default `Number(process.env.RATE_LIMIT_CHAT_PER_MINUTE ?? 20)` `UPSERT`, not hardcode `20` di banyak file
- DILARANG `Redis` di MVP — `Map` in-memory `TODO Redis` comment, not `ioredis`
- DILARANG `TTFT <150ms` as `setTimeout` fake — `Date.now()` real `firstTokenAt-started` measure in `integration/performance.test.ts` mock no network delay, not `setTimeout 100`
- DILARANG `shadow-xl`/`shadow-2xl` di error panels/toasts/drawers — White Sandstone + `border hairline-mist #d5d5d4` White 10px
- DILARANG emoji di error messages/toasts — Lucide `TriangleAlert` `WifiOff` `Lock` `Timer` `ThumbsUp` 1.5-2px, no `🚀` `⚡`
- DILARANG `role="alert"` berlebihan untuk streaming — prefer `role="log" aria-live="polite"` (not `assertive`) for `MessageList`
- DILARANG `beforeLoad` sebagai security — tetap server `getAuthSession` `where userId`
- DILARANG invent `CONVERSATIONS_PAGE_SIZE` etc. — sudah `constants.ts` Fase 04 `20` reuse
- DILARANG `eval`/`dangerouslySetInnerHTML` unsanitized — `grep` must 0
- DILARANG expose `NINE_ROUTER_API_KEY` etc. — `grep` client 0

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD`/`TODO` kecuali Open/TBD section allowed configurable `RATE_LIMIT_CHAT_PER_MINUTE TBD 20` explicit `Number(process.env.* ?? 20)`, `CSP` TBD comment, `TTFT 150ms` TBD adjustable explicit, tidak ada `TODO` `implement later`.
- **Internal consistency:** `ZonaError` `code 19` `ERR-001..019` konsisten `ERROR-HANDLING.md` `map` `getZonaError` `throwZonaError` + `ratelimit` `Map` `checkRateLimit` `key chat:${userId}` konsisten `chat.ts` before `deduct`, `role=log aria-live=polite` konsisten `TESTING.md` `a11y` + `UI-UX.md` §6.
- **Scope check:** Fase 10 hanya Hardening `errors` `rate limit` `security audit` `perf` `a11y` `responsive` `E2E 12` + `docs` — tidak melebar ke `consensus` Fase 11 Post-MVP — isolated.
- **Ambiguity check:** `RATE_LIMIT_CHAT_PER_MINUTE 20` explicit `Number(process.env.* ?? 20)`, `TTFT <150ms` explicit `firstTokenAt - startedAt` real measure, `isArchived` vs `isDeleted` soft delete explicit Fase 10 `isArchived`.

Spec siap untuk user review sebelum `writing-plans`.

