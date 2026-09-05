# PRD Artifact Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the PRD Plan skill from streaming raw text into chat into a file-generation workflow that produces a real downloadable `.md` file with real progress states.

**Architecture:** Dedicated `generatePrdArtifactCore` SSE endpoint. Server-side `streamText` accumulates content internally (never sent as raw text to client). Progress events emitted based on real section detection in generated content. After generation, content is validated, uploaded to R2 as `.md`, linked as attachment to assistant message. Client shows progress UI during generation, then a file card with download button.

**Tech Stack:** TanStack Start server functions, AI SDK `streamText`, Cloudflare R2 (`putObject`), Drizzle ORM (`attachments` table), SSE (`ReadableStream` + `TextEncoder`), React state machine for progress UI.

**Spec:** User requirements from conversation (no separate spec file — requirements are exhaustively defined in the user's prompt).

## Global Constraints

- Zero fake progress — all status events derived from real streaming lifecycle
- Zero `as any` / `as never` / `@ts-ignore`
- PRD Plan restricted to single model only (blocked in compare mode)
- File content source of truth: server-side text buffer, never DOM
- Filename sanitized against path traversal
- MindMarket aesthetic (cream/ink palette, no shadow-xl, no neon)
- Atomic commits after each verified task

---

### Task 1: PRD Stream Types & Utilities

**Files:**
- Create: `src/lib/ai/prd-stream.ts`
- Create: `src/lib/ai/prd-artifact.ts`
- Modify: `src/lib/utils/constants.ts`
- Test: `tests/unit/prd-artifact.test.ts`

**Interfaces:**
- Produces: `PrdPhase`, `PrdSection`, `PrdStreamEvent` types, `encodePrdSseEvent()`, `parsePrdStreamEvent()`, `generatePrdFilename()`, `sanitizeFilename()`, `validatePrdContent()`, `detectCurrentSection()`, `PRD_SECTION_MARKERS`, `PRD_MIME_TYPE` constant

- [ ] **Step 1: Create `src/lib/ai/prd-stream.ts`**

```typescript
// PRD SSE event types — separate from compare mode's StreamEvent

export type PrdPhase =
  | 'preparing'
  | 'generating'
  | 'creating_file'
  | 'completed'
  | 'error'

export type PrdSection =
  | 'overview'
  | 'requirements'
  | 'features'
  | 'userflow'
  | 'architecture'
  | 'schema'
  | 'techstack'

export type PrdStreamEvent =
  | { type: 'prd-status'; phase: 'preparing' }
  | { type: 'prd-status'; phase: 'generating'; section?: PrdSection }
  | { type: 'prd-status'; phase: 'creating_file' }
  | { type: 'prd-status'; phase: 'completed' }
  | { type: 'prd-status'; phase: 'error'; message: string }
  | {
      type: 'prd-artifact'
      attachmentId: string
      fileName: string
      fileSize: number
      mimeType: string
    }
  | {
      type: 'prd-done'
      messageId: string
      generationId: string
      conversationId: string
    }

const validPrdTypes = new Set([
  'prd-status',
  'prd-artifact',
  'prd-done',
])

export function parsePrdStreamEvent(raw: unknown): PrdStreamEvent {
  if (!raw || typeof raw !== 'object')
    throw new Error('Invalid PrdStreamEvent: not an object')
  const r = raw as Record<string, unknown>
  if (!r.type || typeof r.type !== 'string' || !validPrdTypes.has(r.type))
    throw new Error('Invalid PrdStreamEvent: invalid type')
  return raw as PrdStreamEvent
}

export function encodePrdSseEvent(event: PrdStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}
```

- [ ] **Step 2: Create `src/lib/ai/prd-artifact.ts`**

```typescript
import type { PrdSection } from './prd-stream'

export const PRD_MIME_TYPE = 'text/markdown'

export const PRD_SECTION_MARKERS: ReadonlyArray<{
  marker: RegExp
  section: PrdSection
}> = [
  { marker: /^## 1\.\s/m, section: 'overview' },
  { marker: /^## 2\.\s/m, section: 'requirements' },
  { marker: /^## 3\.\s/m, section: 'features' },
  { marker: /^## 4\.\s/m, section: 'userflow' },
  { marker: /^## 5\.\s/m, section: 'architecture' },
  { marker: /^## 6\.\s/m, section: 'schema' },
  { marker: /^## 7\.\s/m, section: 'techstack' },
]

export function detectCurrentSection(text: string): PrdSection | null {
  let lastSection: PrdSection | null = null
  for (const { marker, section } of PRD_SECTION_MARKERS) {
    if (marker.test(text)) lastSection = section
  }
  return lastSection
}

export function sanitizeFilename(raw: string): string {
  return raw
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]|[-.]$/g, '')
    .slice(0, 100)
    || 'PRD-Document'
}

export function generatePrdFilename(userPrompt: string): string {
  const cleaned = userPrompt
    .replace(/buatkan\s+prd\s*/i, '')
    .replace(/buat(kan)?\s*/i, '')
    .replace(/untuk\s*/i, '')
    .replace(/fitur\s*/i, 'Fitur-')
    .replace(/aplikasi\s*/i, 'Aplikasi-')
    .trim()
  const words = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')
  const base = sanitizeFilename(words || 'Document')
  return `PRD-${base}.md`
}

export function validatePrdContent(
  content: string,
): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  if (!content || content.trim().length < 100) {
    issues.push('Content too short')
  }
  const hasHeading =
    /^#\s+PRD/m.test(content) || /^## 1\.\s/m.test(content)
  if (!hasHeading) {
    issues.push('Missing PRD heading')
  }
  let sectionCount = 0
  for (const { marker } of PRD_SECTION_MARKERS) {
    if (marker.test(content)) sectionCount++
  }
  if (sectionCount < 3) {
    issues.push(`Only ${sectionCount}/7 sections detected`)
  }
  return { valid: issues.length === 0, issues }
}
```

- [ ] **Step 3: Add PRD constant to `src/lib/utils/constants.ts`**

Append:
```typescript
export const RATE_LIMIT_PRD_PER_MINUTE = Number(
  getEnv(['RATE_LIMIT', 'PRD', 'PER', 'MINUTE'].join('_')) ?? 5,
)
```

- [ ] **Step 4: Write and run tests `tests/unit/prd-artifact.test.ts`**

Test: `generatePrdFilename`, `sanitizeFilename`, `validatePrdContent`, `detectCurrentSection`, `encodePrdSseEvent`, `parsePrdStreamEvent`.

- [ ] **Step 5: Verify and commit**

```bash
bun x tsc --noEmit
bun x biome check ./src
bun x vitest run tests/unit/prd-artifact.test.ts
git add src/ tests/
git commit -m "feat(prd): add PRD stream types, filename generation, and content validation utilities"
```

---

### Task 2: PRD Server Core Pipeline

**Files:**
- Create: `src/server/core/prd.ts`

**Interfaces:**
- Consumes: `encodePrdSseEvent`, `PrdStreamEvent`, `PrdSection` from `prd-stream.ts`; `detectCurrentSection`, `generatePrdFilename`, `sanitizeFilename`, `validatePrdContent`, `PRD_MIME_TYPE` from `prd-artifact.ts`; `streamText` from AI SDK; `putObject` from R2; `deductCredits`/`refundCredits`; `buildSystemPrompt`; `getAuthSession`; `enforceRateLimit`; DB schema
- Produces: `generatePrdArtifactCore({ data, request }): Promise<Response>` (SSE response)

- [ ] **Step 1: Create `src/server/core/prd.ts`**

The full server-side PRD generation pipeline. Key flow:
1. Auth + rate limit + credit deduction (same pattern as `sendMessageCore`)
2. Create conversation/messages/generationRun in DB
3. Open custom SSE `ReadableStream`
4. Emit `preparing` event
5. Call `streamText()`, consume `textStream` internally
6. For each text chunk: accumulate in buffer, detect sections, emit progress events
7. After stream completes: validate content, generate filename, upload to R2, create attachment, update message
8. Emit `prd-artifact` + `completed` + `prd-done` events
9. Close stream
10. Error path: emit `prd-status:error`, refund credits, mark generationRun failed

The text-deltas NEVER leave the server. Only structured progress events are sent via SSE.

- [ ] **Step 2: Verify typecheck**

```bash
bun x tsc --noEmit
bun x biome check ./src
git add src/server/core/prd.ts
git commit -m "feat(prd): implement server-side PRD artifact generation pipeline"
```

---

### Task 3: PRD Server Function

**Files:**
- Modify: `src/server/functions/chat.ts`

**Interfaces:**
- Consumes: `generatePrdArtifactCore` from `../core/prd`; `chatSchema` from validation
- Produces: `generatePrdArtifact` server function export

- [ ] **Step 1: Add `generatePrdArtifact` to `src/server/functions/chat.ts`**

```typescript
import { generatePrdArtifactCore } from '../core/prd'

export const generatePrdArtifact = createServerFn({ method: 'POST' })
  .validator((data: unknown) => chatSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return generatePrdArtifactCore({
      data: data as z.infer<typeof chatSchema>,
      request,
    })
  })
```

- [ ] **Step 2: Verify and commit**

```bash
bun x tsc --noEmit
bun x biome check ./src
git add src/server/functions/chat.ts
git commit -m "feat(prd): expose generatePrdArtifact server function"
```

---

### Task 4: Message Persistence — Include Attachments

**Files:**
- Modify: `src/server/core/messages.ts`
- Modify: `src/lib/utils/conversation-hydration.ts`

**Interfaces:**
- Consumes: `attachments` table from schema
- Produces: `PersistedMessage` now includes `attachments` array; `ChatMessage` now includes `prdArtifact` field

- [ ] **Step 1: Add attachment query to `getMessagesCore`**

In `src/server/core/messages.ts`, alongside the existing parallel queries for messages/generationRuns/webSources, add:
```typescript
const attachmentRows = await db
  .select()
  .from(attachments)
  .where(eq(attachments.conversationId, data.conversationId))
```
Group by `messageId` and include in the returned message objects.

- [ ] **Step 2: Update `hydrateMessages` in `conversation-hydration.ts`**

Add `attachments` to `PersistedMessage` type. When hydrating an assistant message whose generationRun has `skillId === 'prd-plan'` and has a `text/markdown` attachment, populate:
```typescript
prdArtifact: {
  attachmentId: att.id,
  fileName: att.fileName,
  fileSize: att.fileSize,
  mimeType: att.mimeType,
}
```

- [ ] **Step 3: Update `ChatMessage` type in `MessageList.tsx`**

Add optional fields:
```typescript
prdStatus?: import('@/lib/ai/prd-stream').PrdPhase
prdSection?: import('@/lib/ai/prd-stream').PrdSection
prdArtifact?: {
  attachmentId: string
  fileName: string
  fileSize: number
  mimeType: string
}
```

- [ ] **Step 4: Verify and commit**

```bash
bun x tsc --noEmit
bun x biome check ./src
git add src/
git commit -m "feat(prd): include attachments in message persistence and hydration"
```

---

### Task 5: UI Components — PrdProgress & FileCard

**Files:**
- Create: `src/components/chat/PrdProgress.tsx`
- Create: `src/components/chat/FileCard.tsx`
- Test: `tests/unit/prd-progress.test.tsx`

**Interfaces:**
- Consumes: `PrdPhase`, `PrdSection` types
- Produces: `<PrdProgress phase section />`, `<FileCard artifact />`

- [ ] **Step 1: Create `src/components/chat/PrdProgress.tsx`**

Displays animated progress during PRD generation. Status text mapped from real phase+section:

| Phase | Section | Display Text |
|---|---|---|
| preparing | — | Menyiapkan PRD... |
| generating | overview | Menulis overview... |
| generating | requirements | Menyusun requirements... |
| generating | features | Menulis fitur inti... |
| generating | userflow | Menyusun user flow... |
| generating | architecture | Merancang arsitektur... |
| generating | schema | Membuat database schema... |
| generating | techstack | Menyusun tech stack... |
| generating | (none) | Menulis dokumen... |
| creating_file | — | Menyiapkan file Markdown... |
| error | — | (error message) |

Uses subtle CSS animation (pulsing dot or spinner), MindMarket palette.

- [ ] **Step 2: Create `src/components/chat/FileCard.tsx`**

Renders file attachment card:
- Document icon (hugeicons `File01Icon`)
- Filename + `.md` type badge
- File size formatted (`formatFileSize(bytes)`)
- Download link: `<a href="/api/attachments/${attachmentId}" download={fileName}>`
- Styled: `border-hairline`, `bg-pure-white`, rounded-lg, clean

- [ ] **Step 3: Write tests**

Test PrdProgress renders correct status text for each phase.
Test FileCard renders filename, size, and download link.

- [ ] **Step 4: Verify and commit**

```bash
bun x tsc --noEmit
bun x biome check ./src
bun x vitest run tests/unit/prd-progress.test.tsx
git add src/ tests/
git commit -m "feat(prd): add PrdProgress and FileCard UI components"
```

---

### Task 6: Client-Side PRD Handler & MessageList Integration

**Files:**
- Modify: `src/routes/chat/$conversationId.tsx`
- Modify: `src/components/chat/MessageList.tsx`

**Interfaces:**
- Consumes: `generatePrdArtifact` server function; `parsePrdStreamEvent` from `prd-stream.ts`; `PrdProgress`, `FileCard` components
- Produces: Complete PRD flow in chat UI

- [ ] **Step 1: Add `handleSendPrd` to `$conversationId.tsx`**

In `ChatThread`, add a new handler that:
1. Creates optimistic user message + PRD placeholder assistant message (with `prdStatus: 'preparing'`)
2. Calls `generatePrdArtifact()` server function
3. Reads SSE response body, parses `PrdStreamEvent`
4. Updates assistant message state with phase/section/artifact
5. On `prd-done`: hydrates from DB via `getMessages()`

- [ ] **Step 2: Modify `handleSend` dispatch in `$conversationId.tsx`**

In the existing `handleSend`, add early check:
```typescript
if (skillId === 'prd-plan') {
  return handleSendPrd(content, modelId, attachmentIds, enableWebSearch)
}
```

- [ ] **Step 3: Add import of `generatePrdArtifact`**

```typescript
import { generatePrdArtifact } from '@/server/functions/chat'
```

- [ ] **Step 4: Modify `MessageItem` in `MessageList.tsx`**

For assistant messages, add PRD-specific rendering:
```typescript
// Before existing markdown rendering:
if (message.prdStatus && message.prdStatus !== 'completed') {
  return <PrdProgress phase={message.prdStatus} section={message.prdSection} />
}
if (message.prdArtifact) {
  return <FileCard artifact={message.prdArtifact} /> + short summary
}
// else: existing markdown rendering
```

- [ ] **Step 5: Verify and commit**

```bash
bun x tsc --noEmit
bun x biome check ./src
git add src/
git commit -m "feat(prd): integrate PRD handler and file card rendering in chat"
```

---

### Task 7: Compare Mode Guard

**Files:**
- Modify: `src/components/chat/Composer.tsx`

**Interfaces:**
- Consumes: `skillId` state, `compareEnabled` state
- Produces: Auto-disables compare mode when PRD Plan is selected

- [ ] **Step 1: Add compare mode guard in Composer**

When skill changes to `'prd-plan'` and compare mode is enabled, auto-disable compare mode:
```typescript
// In the skill onChange handler or useEffect:
if (skillId === 'prd-plan' && compareEnabled) {
  onCompareEnabledChange?.(false)
}
```

Also: when compare mode is toggled ON and current skill is `'prd-plan'`, reset skill to `'none'`:
```typescript
if (enabled && skillId === 'prd-plan') {
  setSkillId('none')
}
```

- [ ] **Step 2: Add visual indicator**

When PRD Plan is selected, the compare toggle should show a tooltip or be visually muted explaining "PRD Plan hanya tersedia untuk single model".

- [ ] **Step 3: Verify and commit**

```bash
bun x tsc --noEmit
bun x biome check ./src
git add src/
git commit -m "feat(prd): block PRD Plan skill in compare mode with clear UX"
```

---

### Task 8: Full Verification

- [ ] **Step 1: Run full test suite**

```bash
bun x tsc --noEmit
bun x biome check ./src
bun x vitest run
```

- [ ] **Step 2: Fix any failures**

- [ ] **Step 3: Final commit if needed**
