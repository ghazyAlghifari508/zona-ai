# Unified Compare Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the binary viewport switch between normal chat and compare mode so that toggling "Bandingkan" never causes chat history to disappear, never changes the conversation, and never navigates to a different UI.

**Architecture:** Compare mode becomes a composer-level behavior toggle, not a viewport switch. `MessageList` renders both single-model turns and compare-model turns inline in a unified timeline. The `CompareGrid` component is embedded per-turn inside `MessageList` for assistant messages that have multiple `generationRuns` sharing a `comparisonRunId`. The `$conversationId.tsx` route always renders `<MessageList>`, never conditionally swaps it out.

**Tech Stack:** React, TanStack Start, TanStack Virtual, Drizzle ORM, Zod, Tailwind CSS v4

**Spec:** User request in conversation a63ce291 — "Chat biasa dan Bandingkan Model HARUS tetap berada di SATU chat UI, SATU conversation, dan SATU timeline history."

## Global Constraints

- Zero `as any`, `as never`, or `@ts-ignore`
- All changes must pass `bun x tsc --noEmit`, `bun x biome check ./src`, and `bun x vitest run`
- Do NOT modify DB schema or create migrations — the existing schema already supports mixed turns
- Do NOT change server-side `sendCompareMessageCore` stream protocol — it already stores compare turns in the same conversation
- Preserve existing `CompareGrid`, `MobileCompareTabs`, and `ModelColumn` components — reuse them inline
- Brand color: `bg-notion-blue` (`#0075de`) for user bubbles, no orange, no neon
- The `conversations.mode` column becomes informational only (last-used mode), not a viewport driver

---

### Task 1: Extend `ChatMessage` Type and `hydrateMessages` to Support Compare Turns

**Files:**
- Modify: `src/components/chat/MessageList.tsx:15-27` (ChatMessage type)
- Modify: `src/lib/utils/conversation-hydration.ts` (full file rewrite)

**Interfaces:**
- Consumes: `PersistedMessage` from server (messages with `generationRuns[]` array, each run having optional `comparisonRunId`)
- Produces: Extended `ChatMessage` type with optional `compareGenerations` array; `hydrateMessages()` that groups compare assistant messages into a single `ChatMessage` with `compareGenerations`

The key insight: when `sendCompareMessageCore` runs, it creates 1 user message + N assistant messages (one per model). Each assistant message has 1 `generationRun` with a shared `comparisonRunId`. Currently `hydrateMessages` treats each as a separate `ChatMessage`. We need to group them.

- [ ] **Step 1: Extend the `ChatMessage` type**

In `src/components/chat/MessageList.tsx`, add `compareGenerations` to the type:

```typescript
export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string
  routerModelId?: string
  routingReason?: string
  streaming?: boolean
  webSources?: CitationSource[]
  errorCode?: string
  errorMessage?: string
  onRetry?: () => void
  compareGenerations?: Array<{
    id: string
    modelId: string
    status: string
    content: string
    reasoningContent?: string | null
    promptTokens?: number | null
    completionTokens?: number | null
    totalTokens?: number | null
    latencyMs?: number | null
    timeToFirstTokenMs?: number | null
    comparisonRunId?: string | null
    messageId?: string
    webSources?: Array<{
      url: string
      title: string | null
      snippet: string | null
      position: number
      score?: number | null
    }>
  }>
}
```

- [ ] **Step 2: Extend `PersistedMessage` type in `conversation-hydration.ts`**

Add `comparisonRunId`, `status`, `content`, `reasoningContent`, and token fields to the `generationRuns` array element type:

```typescript
type PersistedMessage = {
  id: string
  role: string
  content: string
  generationRuns: Array<{
    id: string
    modelId: string
    routerModelId: string
    status: string
    content?: string | null
    reasoningContent?: string | null
    comparisonRunId?: string | null
    messageId?: string
    promptTokens?: number | null
    completionTokens?: number | null
    totalTokens?: number | null
    latencyMs?: number | null
    timeToFirstTokenMs?: number | null
    webSources?: Array<{
      url: string
      title: string | null
      snippet: string | null
      position: number
      score?: number | null
    }>
  }>
}
```

- [ ] **Step 3: Rewrite `hydrateMessages` to group compare turns**

The algorithm:
1. Iterate messages in order.
2. For each user message, emit as-is.
3. For each assistant message, check if its `generationRuns[0]` has a `comparisonRunId`.
   - If NO `comparisonRunId`: emit as a normal single-model `ChatMessage`.
   - If YES `comparisonRunId`: collect ALL consecutive assistant messages sharing the same `comparisonRunId` and merge them into ONE `ChatMessage` with `role: 'assistant'` and a `compareGenerations` array. Use the first message's ID as the group ID. Skip the subsequent messages that were merged.

```typescript
export function hydrateMessages(messages: PersistedMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  let i = 0

  while (i < messages.length) {
    const message = messages[i]

    if (message.role !== 'assistant') {
      const run = message.generationRuns[0]
      result.push({
        id: message.id,
        role: message.role as ChatMessage['role'],
        content: message.content,
        ...(run
          ? {
              modelId: run.modelId,
              routerModelId: run.routerModelId,
              webSources: run.webSources ?? undefined,
            }
          : {}),
      })
      i++
      continue
    }

    const run = message.generationRuns[0]
    const compRunId = run?.comparisonRunId

    if (!compRunId) {
      result.push({
        id: message.id,
        role: 'assistant',
        content: message.content,
        ...(run
          ? {
              modelId: run.modelId,
              routerModelId: run.routerModelId,
              webSources: run.webSources ?? undefined,
            }
          : {}),
      })
      i++
      continue
    }

    // Group consecutive assistant messages sharing same comparisonRunId
    const compareGenerations: NonNullable<ChatMessage['compareGenerations']> = []
    const groupId = message.id
    while (i < messages.length) {
      const m = messages[i]
      const r = m.generationRuns[0]
      if (m.role !== 'assistant' || r?.comparisonRunId !== compRunId) break
      compareGenerations.push({
        id: r.id,
        modelId: r.modelId,
        status: r.status,
        content: r.content ?? m.content ?? '',
        reasoningContent: r.reasoningContent,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.totalTokens,
        latencyMs: r.latencyMs,
        timeToFirstTokenMs: r.timeToFirstTokenMs,
        comparisonRunId: r.comparisonRunId,
        messageId: m.id,
        webSources: r.webSources,
      })
      i++
    }

    result.push({
      id: groupId,
      role: 'assistant',
      content: '',
      compareGenerations,
    })
  }

  return result
}
```

- [ ] **Step 4: Run typecheck**

Run: `bun x tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageList.tsx src/lib/utils/conversation-hydration.ts
git commit -m "feat: extend ChatMessage type and hydrateMessages to support compare turns inline"
```

---

### Task 2: Render Compare Turns Inline in MessageList

**Files:**
- Modify: `src/components/chat/MessageList.tsx:128-212` (MessageItem component)

**Interfaces:**
- Consumes: `ChatMessage` with optional `compareGenerations` from Task 1
- Produces: `MessageItem` that renders `<CompareGrid>` + `<MobileCompareTabs>` inline when `message.compareGenerations` exists

- [ ] **Step 1: Import CompareGrid and MobileCompareTabs into MessageList**

At the top of `MessageList.tsx`, add:

```typescript
import { CompareGrid } from './CompareGrid'
import { MobileCompareTabs } from './MobileCompareTabs'
```

- [ ] **Step 2: Add `onRetryGeneration` and `onStopGeneration` props to `MessageList`**

```typescript
export function MessageList({
  messages,
  onRetryGeneration,
  onStopGeneration,
}: {
  messages: ChatMessage[]
  onRetryGeneration?: (generationId: string) => void
  onStopGeneration?: (generationId: string) => void
}) {
```

Pass them through to each `<MessageItem>`.

- [ ] **Step 3: Update `MessageItem` to handle compare turns**

Add a branch for compare assistant messages right after the user-role check:

```typescript
if (message.compareGenerations && message.compareGenerations.length > 0) {
  return (
    <div className="w-full py-5">
      <CompareGrid
        comparisonRun={null}
        generations={message.compareGenerations}
        onRetry={onRetryGeneration}
        onStop={onStopGeneration}
      />
      <MobileCompareTabs
        generations={message.compareGenerations}
        onRetry={onRetryGeneration}
        onStop={onStopGeneration}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run typecheck**

Run: `bun x tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageList.tsx
git commit -m "feat: render CompareGrid inline in MessageList for compare turns"
```

---

### Task 3: Unify the Chat Route — Always Render MessageList

**Files:**
- Modify: `src/routes/chat/$conversationId.tsx` (major refactor of viewport and state management)

**Interfaces:**
- Consumes: `MessageList` with compare support from Task 2, `hydrateMessages` from Task 1
- Produces: Unified chat route that always shows `<MessageList>`, appends compare turns into the messages array during streaming

This is the core task. The current route has a binary `{mode === 'compare' ? <CompareGrid> : <MessageList>}` split at line 682. We remove that split entirely.

- [ ] **Step 1: Remove binary viewport switch**

Replace lines 682-716 (the `{mode === 'compare' ? ... : ...}` ternary) with:

```tsx
<MessageList
  messages={messages}
  onRetryGeneration={handleRetry}
  onStopGeneration={handleStopPerModel}
/>
```

- [ ] **Step 2: Remove separate compare state variables**

Delete these state variables:
- `compareGenerations` (lines 117-152)
- `userPrompt` (lines 153-159)
- `compareIsStreaming` (line 160)

Compare generations now live INSIDE the `messages` array as `ChatMessage` items with `compareGenerations`.

- [ ] **Step 3: Rewrite `handleSendCompare` to append into `messages`**

Instead of managing a separate `compareGenerations` state, `handleSendCompare` should:
1. Append a user `ChatMessage` to `messages`.
2. Append a single assistant `ChatMessage` with `compareGenerations` to `messages`.
3. Stream events update the `compareGenerations` array inside that single assistant message.
4. After streaming completes, refetch persisted messages via `hydrateMessages`.

- [ ] **Step 4: Update `handleStop` to find streaming compare message in `messages`**

Instead of iterating over `compareGenerations` state, find the streaming compare message:
```typescript
const streamingMsg = messages.find(m => m.streaming && m.compareGenerations)
```

- [ ] **Step 5: Update `handleRetry` to update within `messages`**

Map over `messages` and update the specific `compareGenerations` entry by `genId`.

- [ ] **Step 6: Remove topbar compare label and compare empty state**

Delete lines 671-678 (topbar compare label) and lines 700-710 (compare mode empty state).

- [ ] **Step 7: Remove unused imports**

Remove `CompareGrid` and `MobileCompareTabs` imports from `$conversationId.tsx`.

- [ ] **Step 8: Run typecheck, lint, and format**

Run: `bun x tsc --noEmit`
Run: `bun x biome format --write ./src && bun x biome check ./src`

- [ ] **Step 9: Commit**

```bash
git add src/routes/chat/$conversationId.tsx
git commit -m "feat: unify compare mode into single message timeline"
```

---

### Task 4: Update Home Page Compare Flow

**Files:**
- Modify: `src/routes/index.tsx` (verify home page compare send pattern)

**Interfaces:**
- Consumes: `storePendingMessage` flow that navigates to `/chat/$conversationId`
- Produces: Home page that sends compare messages and navigates to unified timeline

- [ ] **Step 1: Verify home page compare flow**

Read `src/routes/index.tsx` and verify the compare send handler stores a pending message with `modelIds` and navigates. The `$conversationId.tsx` route picks it up via `sendPendingMessage`. No viewport switching should occur.

- [ ] **Step 2: Run full test suite**

Run: `bun x vitest run`

- [ ] **Step 3: Commit (if changes needed)**

```bash
git add src/routes/index.tsx
git commit -m "fix: home page compare flow compatible with unified timeline"
```

---

### Task 5: Remove `conversation.mode` as Viewport Driver from Server

**Files:**
- Modify: `src/server/core/chat.ts:524,529`

**Interfaces:**
- Consumes: Server-side compare message flow
- Produces: Server no longer mutates `conversations.mode` to `'compare'`

- [ ] **Step 1: Remove `mode: 'compare'` from server compare flow**

In `src/server/core/chat.ts`:
- Line 524: `.set({ mode: 'compare', updatedAt: new Date() })` → `.set({ updatedAt: new Date() })`
- Line 529: `.values({ userId, title: 'New Chat', mode: 'compare' })` → `.values({ userId, title: 'New Chat' })`

This ensures reloading a conversation always starts in `mode: 'normal'` (composer-level). Compare turns remain visible inline because `hydrateMessages` detects them via `comparisonRunId`.

- [ ] **Step 2: Update `$conversationId.tsx` mode initialization**

Change the mode initialization from reading `conversation.mode` to always defaulting to `'normal'`:
```typescript
const [mode, setMode] = useState<'normal' | 'compare'>('normal')
```

- [ ] **Step 3: Run typecheck and tests**

Run: `bun x tsc --noEmit`
Run: `bun x vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/server/core/chat.ts src/routes/chat/$conversationId.tsx
git commit -m "fix: stop setting conversation mode to compare on server"
```

---

### Task 6: Final Verification and Cleanup

**Files:**
- All modified files from Tasks 1-5

- [ ] **Step 1: Full typecheck**

Run: `bun x tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Full lint**

Run: `bun x biome check ./src`
Expected: 0 errors

- [ ] **Step 3: Full test suite**

Run: `bun x vitest run`
Expected: All tests pass

- [ ] **Step 4: Verify acceptance criteria**

1. ✅ Toggling "Bandingkan" in ModelSelector only changes `mode` state → Composer behavior changes, MessageList stays mounted
2. ✅ Chat history stays visible because MessageList is always rendered
3. ✅ Compare turns appear inline as CompareGrid within the message timeline
4. ✅ Single-model turns before/after compare turns are preserved
5. ✅ Reloading the page re-hydrates both single and compare turns via `hydrateMessages`
6. ✅ No separate page/route for compare mode
7. ✅ `conversations.mode` no longer drives viewport switching

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: cleanup unified compare mode implementation"
```
