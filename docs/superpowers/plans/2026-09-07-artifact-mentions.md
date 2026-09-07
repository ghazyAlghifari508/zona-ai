# Artifact Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted structured `@artifact` mentions that load exact authorized versions as read-only context or deterministic revision targets, with an accessible Composer picker and historical Canvas links.

**Architecture:** Store each submitted mention as a relation between the user message, logical artifact, and immutable version. Keep the textarea as plain text while selected mentions live in a structured chip tray. Resolve all metadata and source bytes on the server, route Context requests through normal chat, route Revise requests through the Artifact Core operation API, and never infer mutation intent from prompt wording.

**Tech Stack:** Bun, TypeScript 7, TanStack Start 1.168, React 19, TanStack Query 5, Drizzle ORM 0.45/PostgreSQL, Zod 4, Tailwind CSS 4, Vitest 4, Playwright 1.61.

**Spec:** `docs/superpowers/specs/2026-09-07-artifact-canvas-mentions-design.md`

**Depends On:** Every task in `docs/superpowers/plans/2026-09-07-artifact-core-canvas.md` is completed, verified, and committed.

## Global Constraints

- A mention is structured `{ artifactId, versionId, mode }`, never a parsed `@filename` on the backend.
- Mention mode is explicitly `context` or `revise`; no regex or extra AI classifier decides mutation intent.
- Canvas open/active state is never implicit model context.
- Up to four unique artifact mentions are allowed per message.
- Picker results are limited to authorized artifacts in the current conversation.
- The server resolves title, filename, kind, version, and model metadata; client labels are not trusted.
- Context mentions can reference any immutable version; Revise mentions must reference the current version.
- Historical mentions reopen their exact referenced version.
- Context-only requests never create artifact versions.
- Multiple Revise targets execute independently; Compare uses N targets x M models and creates forks.
- Mention source reads use canonical R2 bytes through the Artifact Core repository.
- No `any`, `as never`, `as unknown as`, `@ts-ignore`, or `@ts-expect-error` may be introduced.
- Tests assert deterministic contracts and behavior, not model prose, class strings, markup snapshots, anchor markup, styling, or stochastic output.
- Every task ends with affected tests, `bun x tsc --noEmit`, `bun x biome check ./src`, the forbidden type-bypass scan, and one Conventional Commit.
- Use `bun x vitest run --maxWorkers=1` for the full local Vitest gate while the pre-existing parallel Sidebar timing flake remains unresolved.

## File Structure

- `src/lib/artifacts/mentions.ts`: mention schemas, query extraction, filtering/ranking, chip transitions, and keyboard state.
- `src/server/core/artifact-mentions.ts`: authorized mention resolution, persistence, exact source loading, and safe DTO hydration.
- `src/server/core/artifact-catalog-context.ts`: safe conversation-scoped labels for ambiguous unmentioned artifact requests.
- `src/components/artifacts/ArtifactMentionPicker.tsx`: accessible conversation artifact search/listbox.
- `src/components/artifacts/ArtifactMentionChips.tsx`: Context/Revise chip controls.
- `src/components/artifacts/ArtifactMentionTokens.tsx`: historical message tokens that focus exact Canvas versions.
- `src/components/chat/Composer.tsx`: textarea integration and structured submit payload.
- `src/routes/chat/$conversationId.tsx`: artifact list ownership, dispatch priority, and Canvas/Composer bridges.

---

### Task 1: Add Persisted Mention Schema and Request Contracts

**Files:**
- Modify: `src/lib/artifacts/contracts.ts`
- Create: `src/lib/artifacts/mentions.ts`
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0013_artifact_mentions.sql` through Drizzle generation
- Create: `src/lib/db/migrations/meta/0013_snapshot.json` through Drizzle generation
- Modify: `src/lib/db/migrations/meta/_journal.json` through Drizzle generation
- Modify: `src/lib/utils/validation.ts`
- Test: `tests/unit/artifact-mentions.test.ts`
- Test: `tests/integration/artifact-mentions.test.ts`

**Interfaces:**
- Produces:

```ts
export const ARTIFACT_MENTION_MODES = ['context', 'revise'] as const
export type ArtifactMentionMode = (typeof ARTIFACT_MENTION_MODES)[number]
export const artifactMentionInputSchema = z.object({
  artifactId: z.string().uuid(),
  versionId: z.string().uuid(),
  mode: z.enum(ARTIFACT_MENTION_MODES),
})
export type ArtifactMentionInput = z.infer<typeof artifactMentionInputSchema>

export type ArtifactMentionDraft = ArtifactMentionInput & {
  title: string
  kind: ArtifactKind
  version: number
  fileName: string
  modelDisplayName: string
}

export type SafeArtifactMention = Omit<
  ArtifactMentionDraft,
  'fileName' | 'modelDisplayName'
> & { position: number }
```

- Produces `messageArtifactMentions` with server-derived snapshot fields, composite `(versionId, artifactId) -> (artifactVersions.id, artifactVersions.artifactId)` scope enforcement, unique message/artifact and message/position constraints, and checks for mode membership plus nonnegative position.
- Produces `artifactMentionsSchema` capped by `MAX_ARTIFACT_MENTIONS`, deduplicated by artifact ID, and reused by `chatSchema` and `compareSchema` as `artifactMentions`.
- Extends `artifactOperationSchema` to exact Phase B variants: `{ type: 'create'; skillId: ArtifactSkillId; context: ArtifactMentionInput[] }` and `{ type: 'revise'; targets: ArtifactMentionInput[]; context: ArtifactMentionInput[] }`. Create context accepts only `context`; revision targets accept only `revise`; IDs cannot be duplicated across the two arrays; `targets.length + context.length` cannot exceed `MAX_ARTIFACT_MENTIONS`.
- Produces `MAX_ARTIFACT_MENTION_CONTEXT_BYTES = MAX_ARTIFACT_MENTIONS * MAX_ARTIFACT_VERSION_BYTES` rather than an inline aggregate limit.

- [ ] **Step 1: Write failing schema tests**

Unit tests cover valid Context/Revise values, invalid UUIDs/modes, more than four mentions, duplicate artifact IDs, operation mode partitions, duplicate IDs across target/context arrays, and preserved prompt text without mention parsing. Integration tests cover table uniqueness, nonnegative positions, mode checks, cascade behavior, and composite artifact/version FK behavior.

- [ ] **Step 2: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-mentions.test.ts tests/integration/artifact-mentions.test.ts tests/unit/validation.test.ts tests/unit/validation-compare.test.ts`

- [ ] **Step 3: Implement shared schemas and pure mention types**

Keep DTOs free of R2/storage fields. Define `ArtifactMentionDraft` separately from submitted input so UI labels can exist locally without entering the trusted request contract. Derive `SafeArtifactMention` for hydration from persisted snapshots rather than UI labels.

- [ ] **Step 4: Add the Drizzle table**

Use UUID surrogate PK, text mode typed through `$type<ArtifactMentionMode>()`, persisted server snapshots, and indexes for message, artifact, and version. Reuse the composite version identity declared by Plan A so the database rejects mismatched artifact/version pairs. Do not use a PostgreSQL enum.

- [ ] **Step 5: Generate and apply the named migration**

Run:

```bash
bun x drizzle-kit generate --name artifact_mentions
bun x drizzle-kit migrate
```

Expected generated paths are `0013_artifact_mentions.sql`, `0013_snapshot.json`, and updated `_journal.json`.

- [ ] **Step 6: Extend request validation**

Use `.superRefine` to reject duplicate artifact IDs at the trust boundary and reject mentions when `conversationId` is absent, because conversation-scoped artifacts cannot belong to a not-yet-created conversation. Do not accept title/type/version labels in the submitted shape.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-mentions.test.ts tests/integration/artifact-mentions.test.ts tests/unit/validation.test.ts tests/unit/validation-compare.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit mention persistence contracts**

```bash
git add src/lib/artifacts/contracts.ts src/lib/artifacts/mentions.ts src/lib/db/schema.ts src/lib/db/migrations src/lib/utils/validation.ts tests/unit/artifact-mentions.test.ts tests/integration/artifact-mentions.test.ts
git commit -m "feat(artifacts): add persisted mention contracts"
```

---

### Task 2: Resolve, Authorize, Persist, and Hydrate Exact Mentions

**Files:**
- Create: `src/server/core/artifact-mentions.ts`
- Modify: `src/server/core/messages.ts`
- Modify: `src/lib/utils/conversation-hydration.ts`
- Modify: `src/components/chat/MessageList.tsx`
- Test: `tests/integration/artifact-mentions.test.ts`
- Test: `tests/unit/conversation-hydration.test.ts`

**Interfaces:**
- Produces:

```ts
export type ResolvedArtifactMention = {
  artifactId: string
  versionId: string
  mode: 'context' | 'revise'
  title: string
  kind: ArtifactKind
  version: number
  attachmentId: string
  modelId: string
  routerModelId: string
  locator: StoredObjectLocator
  contentSha256: string | null
}

export async function resolveArtifactMentions({
  userId,
  conversationId,
  mentions,
}: {
  userId: string
  conversationId: string
  mentions: ArtifactMentionInput[]
}): Promise<ResolvedArtifactMention[]>

export async function persistArtifactMentions(
  tx: DatabaseTransaction,
  {
    messageId,
    mentions,
  }: { messageId: string; mentions: ResolvedArtifactMention[] },
): Promise<void>
```

- Expands hydrated user `ChatMessage` with safe ordered mention snapshots.
- `DatabaseTransaction` is exported by `src/lib/db/index.ts` from the installed Drizzle database type; do not duplicate a hand-written transaction interface.

- [ ] **Step 1: Write failing authorization tests**

Cover same-conversation success and rejection for another user, another conversation, mismatched artifact/version, unavailable version, duplicate artifact, and stale Revise version. Assert the entire mention set is authorized in one preflight before message creation, source reads, generation rows, or credit deduction.

- [ ] **Step 2: Write failing persistence and hydration tests**

Prove snapshots come from server rows, positions preserve chip order, Context/Revise mode survives reload, and user message hydration exposes safe tokens without source/storage fields.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/integration/artifact-mentions.test.ts tests/unit/conversation-hydration.test.ts`

- [ ] **Step 4: Implement one joined authorization query**

Resolve the complete mention set with explicit joins among artifact, version, attachment, and generation tables. Compare result count and IDs to input. For Revise, require `artifacts.currentVersionId === versionId`.

- [ ] **Step 5: Implement transaction-owned mention persistence**

Implement `persistArtifactMentions` as a caller-owned transaction helper and test it inside a minimal transaction that inserts a user message first. Insert snapshots in input order only after the user message ID exists; throwing from a later statement must roll back the message and mention rows together. Task 3 wires this helper into real chat/Compare preflight transactions.

- [ ] **Step 6: Extend safe message DTO and hydration**

Query mentions by conversation messages, group by message ID, sort by position, and return only exact safe token metadata. Keep assistant artifact hydration from Plan A unchanged.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/integration/artifact-mentions.test.ts tests/unit/conversation-hydration.test.ts tests/integration/artifact-workspace.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit authorized mention hydration**

```bash
git add src/server/core/artifact-mentions.ts src/server/core/messages.ts src/lib/utils/conversation-hydration.ts src/components/chat/MessageList.tsx tests/integration/artifact-mentions.test.ts tests/unit/conversation-hydration.test.ts
git commit -m "feat(artifacts): authorize and hydrate mentions"
```

---

### Task 3: Inject Exact Context Mentions into Normal Single and Compare Chat

**Files:**
- Modify: `src/server/core/artifact-mentions.ts`
- Create: `src/server/core/artifact-catalog-context.ts`
- Modify: `src/server/core/history.ts`
- Modify: `src/server/core/chat.ts`
- Modify: `src/server/core/artifact-operations.ts`
- Modify: `src/server/core/artifacts.ts`
- Modify: `src/server/functions/chat.ts`
- Test: `tests/integration/artifact-context.test.ts`
- Test: `tests/integration/chat.test.ts`
- Test: `tests/integration/compare.test.ts`

**Interfaces:**
- Produces `loadArtifactMentionSources(resolvedMentions): Promise<ArtifactMentionSource[]>` using exact R2 version bytes, stored hashes, and `MAX_ARTIFACT_MENTION_CONTEXT_BYTES`.
- Produces `buildMentionContext(sources): ModelMessage` with untrusted-document delimiters.
- Normal chat and Compare accept Context mentions; Revise mentions are rejected from ordinary chat core and routed in Task 4.
- Every normal single and Compare generation created here stores the exact initiating user message in `generationRuns.requestMessageId`.
- Produces `buildArtifactCatalogContext(summaries): string`, containing safe artifact IDs, titles, kinds, versions, and filenames but no bodies or storage locators; ordinary chat receives it with an instruction to ask for an explicit `@` selection instead of mutating an unmentioned artifact.

- [ ] **Step 1: Write failing exact-context tests**

Seed two versions with different R2 bytes. Prove the explicitly selected version, not current/latest or `generation_runs.content`, reaches `streamText`. Prove two mentions preserve order and Compare loads each source once before fan-out. Prove later unrelated turns do not inherit old artifact bodies from history. For an unmentioned ordinary request in a conversation containing artifacts, prove only safe catalog labels reach the model and artifact bodies do not.

- [ ] **Step 2: Write failing no-side-effect tests**

Submit Context-only single and Compare requests and assert artifact/version row counts and current pointers do not change. Verify missing R2 source fails instead of substituting DB copies.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/integration/artifact-context.test.ts tests/integration/chat.test.ts tests/integration/compare.test.ts`

- [ ] **Step 4: Implement canonical source loading**

Use persisted bucket/key through Task 2 resolved descriptors. Verify stored hash when present. Bound aggregate context using a named product constant and fail explicitly if exact selected sources exceed the supported request budget; do not silently truncate a revision/context document.

- [ ] **Step 5: Add untrusted context messages**

Wrap each selected source with stable artifact/version identity and explicit instructions that document content is data, not system instruction. Keep user prompt separate. `buildModelHistory` keeps historical mention labels and normal prose but never reconstructs old source bodies; only the current request's resolved rows enter `buildMentionContext`. Add the safe catalog message separately for unmentioned ambiguity; it instructs the assistant to request explicit `@` selection and carries no artifact source bytes.

- [ ] **Step 6: Persist request message and mentions before generation**

After authorization and exact source loading but before provider execution, use one transaction for the request message, mention snapshots, assistant message/run rows, and credit reservation. Set every run's `requestMessageId` to the exact initiating message. Update both ordinary and artifact retry paths to load that message ID; for Context retry, resolve and read its persisted exact mention versions again rather than using later conversation turns.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/integration/artifact-context.test.ts tests/integration/chat.test.ts tests/integration/compare.test.ts tests/integration/artifact-revision.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit exact Context support**

```bash
git add src/server/core/artifact-mentions.ts src/server/core/artifact-catalog-context.ts src/server/core/history.ts src/server/core/chat.ts src/server/core/artifact-operations.ts src/server/core/artifacts.ts src/server/functions/chat.ts tests/integration/artifact-context.test.ts tests/integration/chat.test.ts tests/integration/compare.test.ts
git commit -m "feat(chat): add exact artifact context"
```

---

### Task 4: Route Explicit Revise Mentions to Artifact Operations

**Files:**
- Modify: `src/lib/artifacts/mentions.ts`
- Modify: `src/server/core/artifact-operations.ts`
- Modify: `src/server/functions/chat.ts`
- Modify: `src/routes/chat/$conversationId.tsx`
- Test: `tests/unit/artifact-dispatch.test.ts`
- Test: `tests/integration/artifact-revision.test.ts`
- Test: `tests/integration/artifact-compare.test.ts`

**Interfaces:**
- Produces pure client/server-compatible dispatch decision:

```ts
type ArtifactDispatch =
  | { type: 'chat'; context: ArtifactMentionInput[] }
  | {
      type: 'artifact-create'
      skillId: ArtifactSkillId
      context: ArtifactMentionInput[]
    }
  | {
      type: 'artifact-revise'
      targets: ArtifactMentionInput[]
      context: ArtifactMentionInput[]
    }
```

- Priority: any Revise mention, then selected artifact skill, then ordinary chat.
- Context mentions accompany either create or revise operations without becoming targets.
- `targets` contains only Revise mentions; `context` is carried separately into `generateArtifactsCore` so read-only references cannot accidentally become mutations.

- [ ] **Step 1: Write failing dispatch tests**

Cover Revise overriding selected skill, Context-only plus artifact skill creating a new artifact, Context-only plus `none` using normal chat, context arrays preserving selected order, active Canvas state having no input to the decision, and explicit mention targeting artifact B while Canvas shows A.

- [ ] **Step 2: Extend revision integration tests**

Prove one user message with two Revise mentions creates two independent same-lineage versions in single mode. Prove two targets x four models create eight forks in Compare. One target/model failure must not alter unrelated targets.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-dispatch.test.ts tests/integration/artifact-revision.test.ts tests/integration/artifact-compare.test.ts`

- [ ] **Step 4: Implement deterministic dispatch**

Place the pure decision in the artifact domain module, not inside a component. Route handlers validate the same decision again so crafted clients cannot send Revise mentions through ordinary chat.

- [ ] **Step 5: Wire route submit to Artifact Core operations**

Pass exact `artifactId`, `versionId`, and mode arrays. After success, open/focus returned artifacts and versions from SSE events. Do not use active Canvas as fallback input.

- [ ] **Step 6: Reconstruct retry from `requestMessageId` and persisted mentions**

Artifact retry reloads the original user message and exact mention rows. Failed create and Context retries reuse their original operation. A failed revision generation retries only its own `generationRuns.sourceArtifactId` plus `sourceVersionId`; it verifies the matching persisted `revise` mention from `requestMessageId`, reloads the original `context` mentions, and runs normal current-version preflight again. It never retries sibling targets or substitutes the latest message/version. The retry response exposes the new generation ID for Stop, and the client refetches persisted messages after terminal completion.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-dispatch.test.ts tests/integration/artifact-revision.test.ts tests/integration/artifact-compare.test.ts tests/integration/artifact.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit explicit revision routing**

```bash
git add src/lib/artifacts/mentions.ts src/server/core/artifact-operations.ts src/server/functions/chat.ts 'src/routes/chat/$conversationId.tsx' tests/unit/artifact-dispatch.test.ts tests/integration/artifact-revision.test.ts tests/integration/artifact-compare.test.ts
git commit -m "feat(artifacts): route explicit revision mentions"
```

---

### Task 5: Add Pure Mention Query, Search, Selection, and Keyboard State

**Files:**
- Modify: `src/lib/artifacts/mentions.ts`
- Test: `tests/unit/artifact-mention-state.test.ts`

**Interfaces:**
- Produces:

```ts
export type MentionQuery = { start: number; end: number; query: string }
export type ArtifactMentionDraftState = {
  mentions: ArtifactMentionDraft[]
  activeQuery: MentionQuery | null
  selectedIndex: number
  feedback: string | null
}
export type ArtifactMentionCandidate = {
  artifact: ArtifactSummary
  kindLabel: string
  modelDisplayName: string
}

findActiveMentionQuery(text: string, caret: number): MentionQuery | null
replaceActiveMentionQuery(
  text: string,
  query: MentionQuery,
): { text: string; caret: number }
filterArtifactMentions(
  candidates: ArtifactMentionCandidate[],
  query: string,
): ArtifactMentionCandidate[]
addArtifactMention(
  state: ArtifactMentionDraftState,
  artifact: ArtifactMentionCandidate,
  mode: ArtifactMentionMode,
): ArtifactMentionDraftState
removeArtifactMention(
  state: ArtifactMentionDraftState,
  artifactId: string,
): ArtifactMentionDraftState
setArtifactMentionMode(
  state: ArtifactMentionDraftState,
  artifactId: string,
  mode: ArtifactMentionMode,
): ArtifactMentionDraftState
moveMentionPickerSelection(
  state: ArtifactMentionDraftState,
  direction: -1 | 1,
  resultCount: number,
): ArtifactMentionDraftState
```

- Search fields: title and filename from `ArtifactSummary`, plus registry-derived kind label and model display metadata supplied in `ArtifactMentionCandidate` by the caller.
- Ranking is deterministic: case-insensitive exact title/filename, then prefix, then substring across the approved fields, with original conversation artifact order as the final tie-breaker.

- [ ] **Step 1: Write failing query extraction tests**

Cover `@`, `@prd`, whitespace boundaries, punctuation termination, caret in the middle, escaped email-like text, and replacing only the active query range after selection.

- [ ] **Step 2: Write failing search/state tests**

Cover case-insensitive fields, stable result order, no-result state, maximum four, dedupe by artifact ID, remove, mode switch, Arrow Up/Down wrapping, Escape close, Enter selection, and Backspace removing the last chip only at an empty boundary.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-mention-state.test.ts`

- [ ] **Step 4: Implement pure helpers**

Do not import React, browser APIs, database types, or provider IDs. Use immutable arrays and Sets/Maps for dedupe and lookup. Implement the exact/prefix/substring ranking without fuzzy dependencies. Keep full labels in state while UI decides visual truncation.

- [ ] **Step 5: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-mention-state.test.ts tests/unit/artifact-workspace-state.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 6: Commit pure mention behavior**

```bash
git add src/lib/artifacts/mentions.ts tests/unit/artifact-mention-state.test.ts
git commit -m "feat(artifacts): add mention interaction state"
```

---

### Task 6: Build the Accessible Picker and Mention Chip Tray

**Files:**
- Create: `src/components/artifacts/ArtifactMentionPicker.tsx`
- Create: `src/components/artifacts/ArtifactMentionChips.tsx`
- Modify: `src/components/chat/Composer.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/chat/$conversationId.tsx`
- Test: `tests/unit/artifact-mention-picker.test.tsx`
- Test: `tests/unit/composer-artifact-mentions.test.tsx`
- Test: `tests/unit/home-chat-state.test.tsx`
- Test: `tests/unit/chat-artifact-layout.test.tsx`

**Interfaces:**
- `ArtifactMentionPicker` consumes authorized `ArtifactSummary[]`, active query, selected index, and selection/close callbacks.
- `ArtifactMentionChips` consumes `ArtifactMentionDraft[]` and remove/mode-change callbacks.
- Composer submit callbacks gain a required final parameter `artifactMentions: ArtifactMentionInput[]` after the existing `enableWebSearch` argument; every route/home caller passes an array, including `[]`.
- Composer accepts controlled `availableArtifacts`, optional `mentionsValue`, and `onMentionsChange` so route/Canvas actions can add chips.

- [ ] **Step 1: Write failing picker accessibility tests**

Prove typing `@` exposes a listbox, live filtering updates options, no-result message appears, Arrow keys move `aria-activedescendant`, Enter selects, Escape closes, and mouse/touch selection works.

- [ ] **Step 2: Write failing chip/submit tests**

Prove selection removes only the query fragment, adds a structured chip, Context/Revise mode can change, duplicate/max states are blocked with safe feedback, remove works, empty-boundary Backspace removes the last chip, and submit sends exact IDs/modes separately from trimmed text. Add caller contract tests proving ordinary home/chat sends pass `[]` and retain current Enter submission behavior when the picker is closed.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-mention-picker.test.tsx tests/unit/composer-artifact-mentions.test.tsx tests/unit/home-chat-state.test.tsx tests/unit/chat-artifact-layout.test.tsx`

- [ ] **Step 4: Implement the picker**

Use an accessible listbox/option pattern in the existing Composer surface. Keep it inside the Composer stacking context, use only allowed popover-level soft shadow, and preserve native textarea focus/IME behavior.

- [ ] **Step 5: Implement chips without replacing the textarea**

Render a compact tray before attachments/error. Each chip exposes full accessible name, visible kind/version, Context/Revise toggle, and remove button. Visual truncation must not modify metadata.

- [ ] **Step 6: Clear mentions only after a submit is accepted**

Like attachments, clear selected mention state after dispatch. If local validation blocks send, retain chips. If server preflight rejects, restore the captured submitted drafts from explicit route state because no user message was persisted; never reconstruct chips by parsing prompt text.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-mention-picker.test.tsx tests/unit/composer-artifact-mentions.test.tsx tests/unit/home-chat-state.test.tsx tests/unit/chat-artifact-layout.test.tsx tests/unit/model-selector-trigger.test.tsx tests/unit/validation-compare.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit Composer mention UI**

```bash
git add src/components/artifacts/ArtifactMentionPicker.tsx src/components/artifacts/ArtifactMentionChips.tsx src/components/chat/Composer.tsx src/routes/index.tsx 'src/routes/chat/$conversationId.tsx' tests/unit/artifact-mention-picker.test.tsx tests/unit/composer-artifact-mentions.test.tsx tests/unit/home-chat-state.test.tsx tests/unit/chat-artifact-layout.test.tsx
git commit -m "feat(composer): add artifact mention picker"
```

---

### Task 7: Connect Canvas Actions and Historical Mention Tokens

**Files:**
- Create: `src/components/artifacts/ArtifactMentionTokens.tsx`
- Modify: `src/components/artifacts/ArtifactHeader.tsx`
- Modify: `src/components/artifacts/ArtifactCanvas.tsx`
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/routes/chat/$conversationId.tsx`
- Test: `tests/unit/artifact-mention-tokens.test.tsx`
- Test: `tests/unit/artifact-canvas.test.tsx`
- Test: `tests/unit/chat-artifact-layout.test.tsx`

**Interfaces:**
- Canvas emits `onAddMention(version, 'context' | 'revise')`.
- Historical tokens emit `onOpenArtifact({ artifactId, versionId })`.
- Route owns controlled Composer mention drafts so Canvas can add/focus one without hidden context.

- [ ] **Step 1: Write failing Canvas bridge tests**

Prove `Tambahkan ke context` adds/focuses a Context chip for the selected version. Prove `Revisi di chat` is available only for current version and adds/focuses Revise. Merely opening or switching Canvas tabs must not change mention state.

- [ ] **Step 2: Write failing historical-token tests**

Render hydrated user mentions, click each token, and assert exact artifact/version focus. Missing/unavailable artifacts render a safe disabled state and do not expose raw errors.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-mention-tokens.test.tsx tests/unit/artifact-canvas.test.tsx tests/unit/chat-artifact-layout.test.tsx`

- [ ] **Step 4: Implement controlled route mention state**

Add/focus by artifact ID, replace mode/version only after explicit action, enforce four-item limit through pure helpers, focus the native Composer textarea through an explicit ref/callback bridge, and clear state on conversation change. Do not store mentions in model/skill preferences or Canvas workspace state.

- [ ] **Step 5: Render historical tokens separately from prompt prose**

Message content remains the exact user text after the selected `@query` fragment was removed. Tokens render from persisted relation rows before/alongside that content and are keyboard accessible.

- [ ] **Step 6: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-mention-tokens.test.tsx tests/unit/artifact-canvas.test.tsx tests/unit/chat-artifact-layout.test.tsx tests/unit/conversation-hydration.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 7: Commit Canvas and history integration**

```bash
git add src/components/artifacts/ArtifactMentionTokens.tsx src/components/artifacts/ArtifactHeader.tsx src/components/artifacts/ArtifactCanvas.tsx src/components/chat/MessageList.tsx 'src/routes/chat/$conversationId.tsx' tests/unit/artifact-mention-tokens.test.tsx tests/unit/artifact-canvas.test.tsx tests/unit/chat-artifact-layout.test.tsx
git commit -m "feat(artifacts): connect mentions to canvas"
```

---

### Task 8: Add Real Mention E2E Journeys and Final Verification

**Files:**
- Create: `tests/e2e/artifact-mentions.spec.ts`
- Modify: `tests/e2e/artifact-canvas.spec.ts`

**Interfaces:**
- Uses real authenticated conversation routes, exact persisted artifacts, versioned R2 objects, and deterministic model stream mocks.
- Covers the final user journeys from picker selection to persisted history and Canvas focus.

- [ ] **Step 1: Add authorized conversation artifact fixtures**

Seed several artifact types and versions with distinct exact source bytes and model metadata. Add another user's artifact for authorization rejection. Register all R2 keys for cleanup.

- [ ] **Step 2: Write failing picker and keyboard journeys**

Cover `@` open, search by title/type/model metadata, Arrow navigation, Enter selection, Escape close, remove, empty-boundary Backspace, duplicate prevention, and four-mention cap on desktop and mobile.

- [ ] **Step 3: Write failing Context journeys**

Mention one artifact to ask a question, mention two to compare, submit while Canvas displays a different artifact, and verify no version rows are created. Refresh and click persisted historical tokens to open exact versions. Submit a crafted cross-user structured mention and prove rejection occurs before message, generation, credit, or artifact side effects.

- [ ] **Step 4: Write failing Revise journeys**

Set a mention to Revise, submit, verify only the exact target advances v1 to v2 and Canvas selects v2. Cover multiple targets, Compare N x M forks, stale version rejection, and partial model failure. Finish with ordinary single chat and text Compare sends without mentions to prove both regression paths remain functional.

- [ ] **Step 5: Run focused E2E tests**

Run: `bun x playwright test tests/e2e/artifact-mentions.spec.ts tests/e2e/artifact-canvas.spec.ts`

- [ ] **Step 6: Treat any focused E2E failure as a blocking defect**

If a journey fails, stop this task, invoke `systematic-debugging`, fix the owning production boundary with a failing unit/integration regression test, run that boundary's full verification gate, and commit the fix separately before rerunning E2E. Do not weaken authorization checks, exact-version assertions, or no-version invariants. Do not use arbitrary sleeps or `page.setContent`.

- [ ] **Step 7: Run the complete final gate**

Run:

```bash
bun x tsc --noEmit
bun x biome check ./src
bun x vitest run --maxWorkers=1
bun x playwright test
bun run build
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
rg -n "shadow-lg|shadow-xl|shadow-2xl|bg-gradient|text-transparent" src/components/artifacts src/components/chat/Composer.tsx src/components/chat/FileCard.tsx
git diff --check
```

Expected: all commands pass and forbidden scans print no new feature-surface violations.

- [ ] **Step 8: Run live browser review**

Start `bun run dev`, then invoke the `agent-browser` and `webapp-testing` skills and verify at desktop and mobile viewports:

- no console errors;
- no horizontal overflow;
- independent chat/Canvas scrolling;
- Composer remains usable/stable;
- keyboard picker focus is visible and ordered;
- Canvas respects the existing warm paper/white surface hierarchy;
- no heavy card shadows, neon, gradients, emoji UI, or alternate shell.

- [ ] **Step 9: Review and commit final E2E coverage**

```bash
git status --short
git diff --stat
git add tests/e2e/artifact-mentions.spec.ts tests/e2e/artifact-canvas.spec.ts
git commit -m "test(artifacts): cover mention journeys"
```

- [ ] **Step 10: Inspect all feature commits before push**

```bash
git status --short --branch
git log --oneline --decorate -25
git diff origin/main...HEAD --stat
```

Expected: worktree clean; only approved Artifact Canvas/Mention commits plus their spec/plans are ahead of `origin/main`. Push only after this inspection and final verification evidence are fresh.

## Execution Handoff

Implement this plan only after Phase A is verified. The complete delivery is ready to push when Task 8 passes, all commits are atomic, the worktree is clean, and every artifact/mention acceptance criterion in the spec maps to passing deterministic tests or documented live browser evidence.
