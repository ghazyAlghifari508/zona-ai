# Artifact Core and Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build persisted logical artifacts, immutable versions, PRD/Agent Skill/Checklist creation, single-model revisions, Compare artifact fan-out, and a responsive tabbed Canvas that previews and downloads the exact stored Markdown file.

**Architecture:** Add `artifacts` and `artifact_versions` as an additive domain layer over the existing attachments/R2 pipeline. Keep R2 bytes canonical, finalize every version through one compensation-aware transaction boundary, and expose safe owner-authorized metadata/content APIs. Integrate Canvas inside the conversation route so the existing chat scroll owner and Composer remain independent.

**Tech Stack:** Bun, TypeScript 7, TanStack Start 1.168, React 19, TanStack Query 5, Drizzle ORM 0.45/PostgreSQL, AI SDK 7, Cloudflare R2 through `@aws-sdk/client-s3`, Zod 4, Tailwind CSS 4, react-markdown 10, remark-gfm 4, Vitest 4, Playwright 1.61.

**Spec:** `docs/superpowers/specs/2026-09-07-artifact-canvas-mentions-design.md`

## Global Constraints

- Artifact lifecycle follows the owning conversation; there is no global artifact library.
- R2 Markdown bytes are canonical for preview, Copy, revision input, and Download.
- Existing attachment IDs and `/api/attachments/$attachmentId?download=1` URLs remain valid.
- Artifact versions and their R2 objects are immutable.
- New Checklist requests always produce Markdown artifacts; historical Checklist chat messages remain unchanged.
- Compare creation produces one artifact per model; Compare revision produces one fork per target/model pair.
- Model names, router IDs, capabilities, costs, and display metadata come from the current registry/catalog, never component literals.
- All IDs from the client are untrusted and authorized against session user plus conversation ownership.
- No `any`, `as never`, `as unknown as`, `@ts-ignore`, or `@ts-expect-error` may be introduced.
- No fake timers or invented generation phases; every visible phase maps to a real lifecycle event.
- No raw HTML execution, Mermaid execution, heavy card shadows, neon, gradients, emoji chrome, or a second application shell.
- Tests assert deterministic contracts, authorization, persistence, and behavior, not model prose, class strings, markup snapshots, anchor markup, styling, or stochastic output.
- Official shadcn discovery found generic Tabs, Badge, and Combobox options; this specialized surface reuses existing project UI primitives and local WAI-ARIA behavior instead of adding registry packages that do not own closable-version tabs or textarea-caret query state.
- Every task ends with affected tests, `bun x tsc --noEmit`, `bun x biome check ./src`, the forbidden type-bypass scan, and one Conventional Commit.
- The existing full-suite Sidebar timing flake must not be hidden by weakening assertions or changing timeouts; use `bun x vitest run --maxWorkers=1` for the full local Vitest gate until its separate root cause is fixed.

## File Structure

### Shared Artifact Domain

- `src/lib/artifacts/contracts.ts`: artifact kinds, operations, safe DTOs, Zod schemas, descriptor types, and shared limits.
- `src/lib/db/index.ts`: database client and reusable inferred transaction type.
- `src/lib/artifacts/workspace-state.ts`: pure tab/version/scroll state transitions.
- `src/lib/ai/artifact-stream.ts`: Zod stream events for single and Compare artifact generations.
- `src/lib/chat/skills.ts`: skill-to-artifact profile metadata.

### Server Artifact Domain

- `src/server/core/artifact-repository.ts`: ownership-aware artifact/version metadata queries and exact source resolution.
- `src/server/core/artifact-finalization.ts`: immutable R2 write, SHA-256, DB transaction, stale-version check, and compensation.
- `src/server/core/artifact-generation.ts`: shared generation worker and real lifecycle emission.
- `src/server/core/artifact-operations.ts`: create/revise planning, preflight, credit reservation, single/Compare fan-out, and completion barrier.
- `src/server/core/artifact-workspace.ts`: list/detail/content read use cases.
- `src/server/functions/artifacts.ts`: client-safe validated server functions for metadata.
- `src/routes/api/artifacts/$artifactId/versions/$versionId.tsx`: exact owner-authorized Markdown byte response.

### Artifact UI

- `src/components/artifacts/ArtifactCanvas.tsx`: responsive Canvas composition and error/loading boundaries.
- `src/components/artifacts/ArtifactTabs.tsx`: browser-style deduplicated tab controls.
- `src/components/artifacts/ArtifactHeader.tsx`: metadata, version selection, Copy, Download, and close controls.
- `src/components/artifacts/useArtifactContent.ts`: TanStack Query exact-version content loader.
- `src/components/artifacts/ConversationArtifactLayout.tsx`: desktop split and mobile full-workspace composition while both panes stay mounted.
- `src/components/chat/FileCard.tsx`: separate Open and Download interactions.
- `src/components/chat/MessageList.tsx`: propagate artifact-open actions.
- `src/components/chat/CompareGrid.tsx`: artifact result cards and Open All.
- `src/routes/chat/$conversationId.tsx`: route-local Canvas state and split/full-workspace layout.

### Tests

- Unit tests remain under `tests/unit/`.
- PostgreSQL/R2 orchestration tests remain under `tests/integration/`.
- Real route journeys remain under `tests/e2e/`.

---

### Task 1: Declare Markdown and AI Runtime Dependencies and Enable GFM

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src/components/chat/MarkdownContent.tsx`
- Modify: `src/styles/app.css`
- Test: `tests/unit/markdown-sanitize.test.tsx`
- Test: `tests/unit/markdown.test.ts`

**Interfaces:**
- Consumes: existing `MarkdownContent({ text, className })` and sanitization/highlighting pipeline.
- Produces: `CHAT_MARKDOWN_REMARK_PLUGINS` containing `remarkGfm`; all existing Markdown consumers gain GFM tables and task lists without enabling raw HTML.

- [ ] **Step 1: Add failing GFM behavior tests**

Add tests that render `MarkdownContent` with a table and task-list source and assert accessible cell text and checkbox state. Add an untrusted-HTML case proving script/iframe content is not executable. Do not inspect class names or exact HTML strings.

```tsx
render(
  <MarkdownContent
    text={'| Name | State |\n| --- | --- |\n| PRD | Ready |\n\n- [ ] Review'}
  />,
)
expect(screen.getByText('PRD')).toBeTruthy()
expect(screen.getByRole('checkbox')).not.toBeChecked()
```

- [ ] **Step 2: Run the Markdown tests and verify the GFM case fails**

Run: `bun x vitest run tests/unit/markdown.test.ts tests/unit/markdown-sanitize.test.tsx`

Expected: the new table/task-list behavior fails because `remark-gfm` is not configured.

- [ ] **Step 3: Install exact current dependencies**

Run:

```bash
bun add --exact ai@7.0.83 @ai-sdk/openai-compatible@3.0.39 react-markdown@10.1.0 rehype-highlight@7.0.2 rehype-sanitize@6.0.0 remark-gfm@4.0.1
```

This repairs undeclared imports already used by source and adds only the approved GFM plugin.

- [ ] **Step 4: Configure the shared renderer**

In `MarkdownContent.tsx`, add a typed remark plugin list and pass it to `ReactMarkdown`:

```tsx
import remarkGfm from 'remark-gfm'

export const CHAT_MARKDOWN_REMARK_PLUGINS: NonNullable<
  ComponentProps<typeof ReactMarkdown>['remarkPlugins']
> = [remarkGfm]

<ReactMarkdown
  remarkPlugins={CHAT_MARKDOWN_REMARK_PLUGINS}
  rehypePlugins={CHAT_MARKDOWN_PLUGINS}
  components={CHAT_MARKDOWN_COMPONENTS}
>
```

Do not add `rehype-raw`. Extend `.chat-prose` semantic element rules in `app.css` only for readable tables and task-list spacing.

- [ ] **Step 5: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/markdown.test.ts tests/unit/markdown-sanitize.test.tsx tests/unit/syntax-highlight.test.tsx
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

Expected: tests pass and the type-bypass scan prints no matches.

- [ ] **Step 6: Commit the dependency and renderer baseline**

```bash
git add package.json bun.lock src/components/chat/MarkdownContent.tsx src/styles/app.css tests/unit/markdown.test.ts tests/unit/markdown-sanitize.test.tsx
git commit -m "feat(markdown): add safe GFM rendering"
```

---

### Task 2: Add Artifact Contracts, Schema, Migration, and Conservative Backfill

**Files:**
- Create: `src/lib/artifacts/contracts.ts`
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/migrations/meta/_journal.json` through Drizzle generation
- Create: `src/lib/db/migrations/0012_artifact_workspace.sql` through Drizzle generation
- Create: `src/lib/db/migrations/meta/0012_snapshot.json` through Drizzle generation
- Modify: `src/lib/utils/constants.ts`
- Modify: `src/lib/chat/skills.ts`
- Test: `tests/unit/artifact-contracts.test.ts`
- Test: `tests/integration/artifact-schema.test.ts`

**Interfaces:**
- Produces: `ARTIFACT_KINDS`, `ARTIFACT_OPERATION_TYPES`, `ArtifactKind`, `ArtifactOperationType`, `ArtifactDescriptor`, `ArtifactVersionDescriptor`, `ArtifactSummary`, `artifactIdSchema`, `artifactVersionIdSchema`, `MAX_ARTIFACT_MENTIONS = 4`, `ARTIFACT_TITLE_MAX_LENGTH = 200`, and `MAX_ARTIFACT_VERSION_BYTES = 256 * 1024`.
- Produces Drizzle tables: `artifacts` and `artifactVersions`; adds nullable `generationRuns.requestMessageId`, `generationRuns.sourceArtifactId`, and `generationRuns.sourceVersionId`. `requestMessageId` has an index and `messages` FK using `onDelete: 'set null'`; source IDs use a composite FK to the exact artifact/version pair and retain failed-run retry provenance.
- Produces `DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]` from `src/lib/db/index.ts` for helpers that must join a caller-owned transaction.
- Consumes: existing `attachments`, `generationRuns`, `messages`, `conversations`, and `users` tables.

- [ ] **Step 1: Write failing contract and database tests**

Contract tests must prove:

- kinds accept `prd`, `agent-skill`, and `checklist` only;
- artifact descriptors require UUID artifact/version/attachment/generation IDs and positive version;
- `MAX_ARTIFACT_MENTIONS` equals four independently of Compare constants.

Integration tests must insert an artifact and immutable versions and prove:

- `(artifactId, version)` is unique;
- attachment and generation are each owned by only one version;
- an artifact cannot point `currentVersionId` to another artifact's version;
- deleting an artifact cascades its versions even when `currentVersionId` points at one of them;
- `requestMessageId` accepts the initiating user message.
- each revision generation durably records its composite source artifact/version identity, including failed runs that produced no output version.

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `bun x vitest run tests/unit/artifact-contracts.test.ts tests/integration/artifact-schema.test.ts`

Expected: imports/tables do not exist.

- [ ] **Step 3: Define shared contracts without provider metadata duplication**

Create `contracts.ts` around literal tuples and Zod:

```ts
export const ARTIFACT_KINDS = ['prd', 'agent-skill', 'checklist'] as const
export const ARTIFACT_OPERATION_TYPES = ['create', 'revise'] as const

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]
export type ArtifactOperationType = (typeof ARTIFACT_OPERATION_TYPES)[number]

export const artifactDescriptorSchema = z.object({
  artifactId: z.string().uuid(),
  versionId: z.string().uuid(),
  attachmentId: z.string().uuid(),
  generationId: z.string().uuid(),
  kind: z.enum(ARTIFACT_KINDS),
  title: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(120),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.literal('text/markdown'),
  version: z.number().int().positive(),
  modelId: z.string().min(1),
  routerModelId: z.string().min(1),
})
```

Move `ArtifactKind` ownership from `skills.ts` to this artifact domain module and re-export it where compatibility is needed.

- [ ] **Step 4: Define the Drizzle schema**

Use text columns typed through `$type<ArtifactKind>()`, UUID surrogate primary keys, unique indexes for business constraints, a check for positive versions, title-length checks bounded by `ARTIFACT_TITLE_MAX_LENGTH`, and a composite current-version FK. Add indexes for owner/conversation listing, `(conversationId, updatedAt)`, kind filtering, version ordering, request-message lookup, and source-version lookup. Avoid PostgreSQL enums.

Declare `artifactVersions` before `artifacts` and use `AnyPgColumn` callbacks for the cycle. Give `artifactVersions` a composite unique key over `(id, artifactId)`, then define the artifact current pointer in the `artifacts` table callback:

```ts
foreignKey({
  name: 'artifacts_current_version_scope_fk',
  columns: [table.currentVersionId, table.id],
  foreignColumns: [artifactVersions.id, artifactVersions.artifactId],
}).onDelete('restrict')
```

Use `(): AnyPgColumn => artifacts.id` on the version-to-artifact reference to avoid TypeScript circular inference. The database, not only application code, must reject a cross-artifact current pointer. If Drizzle generation cannot represent this documented schema pattern, stop and verify the installed Drizzle API rather than adding an unmodeled SQL-only constraint.

The composite pointer has been probed against local PostgreSQL: deleting the artifact still cascades the referenced versions. Keep a real integration assertion for this behavior so later constraint changes cannot break conversation deletion.

Add the two nullable source columns in the existing `generationRuns` declaration and reference the later `artifactVersions` columns through typed `AnyPgColumn` callbacks. Require both columns to be null for creates or both non-null for revisions/forks through a database check. This composite relation is the exact retry target for a failed single or Compare revision; never reconstruct a target from row order or the latest conversation message.

- [ ] **Step 5: Generate the named migration**

Run: `bun x drizzle-kit generate --name artifact_workspace`

Expected generated paths:

- `src/lib/db/migrations/0012_artifact_workspace.sql`
- `src/lib/db/migrations/meta/0012_snapshot.json`
- updated `_journal.json`

Inspect the SQL for all unique/check/FK constraints. Append this conservative, idempotent backfill after the generated table and constraint statements:

```sql
WITH eligible_generations AS MATERIALIZED (
  SELECT g.message_id, (array_agg(g.id ORDER BY g.id))[1] AS generation_run_id
  FROM generation_runs g
  INNER JOIN messages m ON m.id = g.message_id
  WHERE g.status = 'completed'
    AND g.skill_id IN ('prd-plan', 'agent-skill')
    AND m.role = 'assistant'
  GROUP BY g.message_id
  HAVING count(*) = 1
),
eligible_attachments AS MATERIALIZED (
  SELECT a.message_id, (array_agg(a.id ORDER BY a.id))[1] AS attachment_id
  FROM attachments a
  WHERE a.message_id IS NOT NULL
    AND (a.mime_type = 'text/markdown' OR a.file_name ILIKE '%.md')
  GROUP BY a.message_id
  HAVING count(*) = 1
),
candidates AS MATERIALIZED (
  SELECT
    gen_random_uuid() AS artifact_id,
    gen_random_uuid() AS version_id,
    a.id AS attachment_id,
    a.user_id,
    a.conversation_id,
    a.file_name,
    a.created_at,
    g.id AS generation_run_id,
    g.model_id,
    g.router_model_id,
    CASE g.skill_id
      WHEN 'prd-plan' THEN 'prd'
      WHEN 'agent-skill' THEN 'agent-skill'
    END AS kind
  FROM eligible_generations eg
  INNER JOIN generation_runs g ON g.id = eg.generation_run_id
  INNER JOIN eligible_attachments ea ON ea.message_id = eg.message_id
  INNER JOIN attachments a ON a.id = ea.attachment_id
  INNER JOIN messages m ON m.id = g.message_id
  INNER JOIN conversations c ON c.id = g.conversation_id
  WHERE a.conversation_id = g.conversation_id
    AND m.conversation_id = g.conversation_id
    AND c.user_id = a.user_id
    AND NOT EXISTS (
      SELECT 1
      FROM artifact_versions av
      WHERE av.attachment_id = a.id OR av.generation_run_id = g.id
    )
),
inserted_artifacts AS (
  INSERT INTO artifacts (
    id, user_id, conversation_id, kind, title, current_version_id,
    created_at, updated_at
  )
  SELECT
    artifact_id, user_id, conversation_id, kind, left(file_name, 200), NULL,
    created_at, created_at
  FROM candidates
  RETURNING id
),
inserted_versions AS (
  INSERT INTO artifact_versions (
    id, artifact_id, version, source_version_id, attachment_id,
    generation_run_id, title, content_sha256, created_by_model_id,
    created_by_router_model_id, change_summary, created_at
  )
  SELECT
    c.version_id, c.artifact_id, 1, NULL, c.attachment_id,
    c.generation_run_id, left(c.file_name, 200), NULL, c.model_id,
    c.router_model_id, 'Legacy artifact imported', c.created_at
  FROM candidates c
  INNER JOIN inserted_artifacts ia ON ia.id = c.artifact_id
  RETURNING id, artifact_id
)
UPDATE artifacts a
SET current_version_id = iv.id
FROM inserted_versions iv
WHERE a.id = iv.artifact_id;
```

The filename is the only persisted display metadata available for legacy files, so it is intentionally used as both legacy title snapshots. Historical Checklist JSON is excluded. Add an integration fixture with ambiguous generations and another with multiple Markdown attachments; both must remain ordinary records. Re-run the backfill statement in the test and prove it inserts no duplicates.

- [ ] **Step 6: Apply migration to the local development database**

Run: `bun x drizzle-kit migrate`

Expected: migration 0012 applies without dropping or rewriting existing attachment IDs.

- [ ] **Step 7: Run schema verification**

Run:

```bash
bun x vitest run tests/unit/artifact-contracts.test.ts tests/integration/artifact-schema.test.ts tests/unit/registry.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit schema and backfill**

```bash
git add src/lib/artifacts/contracts.ts src/lib/db/index.ts src/lib/db/schema.ts src/lib/db/migrations src/lib/utils/constants.ts src/lib/chat/skills.ts tests/unit/artifact-contracts.test.ts tests/integration/artifact-schema.test.ts
git commit -m "feat(artifacts): add immutable version schema"
```

---

### Task 3: Add Bucket-Aware R2 Reads and Safe Artifact Metadata APIs

**Files:**
- Modify: `src/lib/r2/client.ts`
- Modify: `src/lib/rag/extract.ts`
- Modify: `src/lib/rag/process.ts`
- Modify: `src/server/core/chat.ts`
- Modify: `src/server/core/artifacts.ts`
- Create: `src/server/core/artifact-repository.ts`
- Create: `src/server/core/artifact-workspace.ts`
- Create: `src/server/functions/artifacts.ts`
- Create: `src/routes/api/artifacts/$artifactId/versions/$versionId.tsx`
- Modify: `src/routeTree.gen.ts` only through TanStack route generation
- Modify: `src/server/functions/files.ts`
- Test: `tests/unit/r2.test.ts`
- Test: `tests/unit/extract.test.ts`
- Test: `tests/integration/artifact-workspace.test.ts`
- Test: `tests/integration/artifact-download.test.ts`
- Test: `tests/integration/artifact.test.ts`
- Test: `tests/integration/files.test.ts`
- Test: `tests/integration/rag.test.ts`

**Interfaces:**
- Produces `StoredObjectLocator = { bucket: string; key: string }`, `putObject({ bucket, key, body, contentType })`, `getObject({ bucket, key })`, and `deleteObject({ bucket, key })`. There is no implicit default-bucket overload.
- Changes document extraction to `extractText({ r2Bucket, r2Key, mimeType }): Promise<string>`.
- Produces `getOwnedArtifactVersion({ userId, artifactId, versionId }): Promise<OwnedArtifactVersionSource>`, `listConversationArtifactSummaries({ userId, conversationId }): Promise<ArtifactSummary[]>`, `getOwnedArtifact({ userId, artifactId }): Promise<ArtifactDetail>`, and `readArtifactVersionContentCore({ userId, artifactId, versionId }): Promise<{ bytes: Uint8Array; contentSha256: string }>`.
- Produces server functions `listConversationArtifacts({ conversationId })` and `getArtifact({ artifactId })` with Zod UUID validators.
- Produces safe metadata DTOs from `contracts.ts`; no R2 locator fields leave the server.

- [ ] **Step 1: Write failing ownership, byte-read, hash, and redaction tests**

Cover:

- same owner can list conversation artifacts and read an exact version;
- another user, another conversation, or a mismatched artifact/version pair gets 403/404 without storage access;
- the content route returns exact R2 bytes, Markdown UTF-8, `nosniff`, private cache, and the stored hash validator;
- a backfilled null hash is computed and persisted on first successful read;
- a non-null stored hash mismatch fails with a safe integrity error and returns no file bytes;
- `/api/attachments?conversationId=...` omits `r2Key`, `r2Bucket`, and `extractedText`;
- R2 read/delete uses the persisted bucket instead of only `env.R2_BUCKET_NAME`.

- [ ] **Step 2: Run tests and verify failures**

Run: `bun x vitest run tests/unit/r2.test.ts tests/integration/artifact-workspace.test.ts tests/integration/files.test.ts`

- [ ] **Step 3: Make R2 object identity explicit**

Use a project-owned object locator:

```ts
export type StoredObjectLocator = { bucket: string; key: string }
export type PutStoredObjectInput = StoredObjectLocator & {
  body: Uint8Array
  contentType: string
}

export async function getObject({ bucket, key }: StoredObjectLocator) {
  return s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
}
```

Update every existing caller in `files.ts`, `chat.ts`, `artifacts.ts`, `extract.ts`, and `process.ts`. New writes pass `env.R2_BUCKET_NAME`; every attachment read/delete passes `attachment.r2Bucket`. Update the existing R2 mocks in artifact, artifact-download, files, RAG, and extraction tests to assert locator objects rather than string keys.

- [ ] **Step 4: Implement ownership-aware repository queries**

Use explicit `db.select().from().innerJoin()` projections. `getOwnedArtifactVersion` must join artifact, owning conversation, version, attachment, and generation and constrain conversation user ID, artifact user ID, plus artifact/version IDs in one query. Return a narrow server-only source descriptor containing its conversation ID, bucket, and key. Mention resolution later compares that returned conversation ID to the request conversation.

- [ ] **Step 5: Implement metadata server functions and exact file route**

Use `createServerFn({ method: 'GET' }).validator(...)` for list/detail metadata and a TanStack file route for byte content. Map `AppError` to safe JSON only on errors; successful content returns bytes, not JSON.

Generate `src/routeTree.gen.ts` by running `bun run build`; never hand-edit it. The content route must quote the SHA-256 in `ETag`, honor a matching `If-None-Match` with `304`, and use the exact bytes for `Content-Length`.

- [ ] **Step 6: Replace attachment list `.select()` with a projection**

Return only `id`, `messageId`, `conversationId`, `fileName`, `fileSize`, `mimeType`, `processingStatus`, and `createdAt`. Keep Composer polling behavior unchanged.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/r2.test.ts tests/unit/extract.test.ts tests/integration/artifact-workspace.test.ts tests/integration/files.test.ts tests/integration/artifact-download.test.ts tests/integration/artifact.test.ts tests/integration/rag.test.ts
bun x tsc --noEmit
bun x biome check ./src
bun run build
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit the read boundary**

```bash
git add src/lib/r2/client.ts src/lib/rag/extract.ts src/lib/rag/process.ts src/server/core/chat.ts src/server/core/artifacts.ts src/server/core/artifact-repository.ts src/server/core/artifact-workspace.ts src/server/functions/artifacts.ts src/routes/api/artifacts src/routeTree.gen.ts src/server/functions/files.ts tests/unit/r2.test.ts tests/unit/extract.test.ts tests/integration/artifact-workspace.test.ts tests/integration/artifact-download.test.ts tests/integration/artifact.test.ts tests/integration/files.test.ts tests/integration/rag.test.ts
git commit -m "feat(artifacts): add authorized workspace reads"
```

---

### Task 4: Create One Immutable Artifact Finalization Boundary

**Files:**
- Create: `src/server/core/artifact-finalization.ts`
- Modify: `src/server/core/artifacts.ts`
- Modify: `src/lib/ai/artifact-stream.ts`
- Test: `tests/unit/artifact-finalize.test.ts`
- Test: `tests/unit/artifact-stream.test.ts`
- Test: `tests/integration/artifact.test.ts`

**Interfaces:**
- Produces:

```ts
type ArtifactFinalizationCommon = {
  userId: string
  conversationId: string
  messageId: string
  generationId: string
  kind: ArtifactKind
  title: string
  modelId: string
  routerModelId: string
  fileName: string
  mimeType: 'text/markdown'
  bytes: Uint8Array
  summary: string
  usage: UsageLike | null
  timing: { latencyMs: number; timeToFirstTokenMs: number | null }
}

type FinalizeArtifactVersionInput =
  | (ArtifactFinalizationCommon & { finalizationMode: 'create' })
  | (ArtifactFinalizationCommon & {
      finalizationMode: 'revise'
      artifactId: string
      sourceArtifactId: string
      sourceVersionId: string
      expectedCurrentVersionId: string
    })
  | (ArtifactFinalizationCommon & {
      finalizationMode: 'fork'
      sourceArtifactId: string
      sourceVersionId: string
      expectedCurrentVersionId: string
    })
```

- Produces: `finalizeArtifactVersion(input): Promise<ArtifactDescriptor>`.
- Expands every SSE event with `generationId`, `modelId`, `kind`, `operation`, optional `comparisonRunId`, and optional source IDs. Terminal creation events additionally carry logical IDs, title, version, attachment, model provenance, summary, message ID, and conversation ID.
- Replaces the old `creating_file`/error-phase workaround with real phases: `preparing`, `generating`, `validating`, `saving`, `completed`, `failed`, and `cancelled`; terminal errors remain typed `artifact-error` events.

- [ ] **Step 1: Expand failing finalization and stream contract tests**

Prove:

- create returns artifact ID/version ID/version 1 and stores SHA-256 of exact bytes;
- revision increments version and moves current pointer only after commit;
- fork creates a new artifact at version 1 and records the exact external `sourceVersionId`;
- stale expected current version throws 409 and compensates the new R2 object;
- a fork whose source stopped being current during generation also throws 409 and compensates its new object;
- DB failure preserves all old rows/pointers and deletes only the new object;
- stream events reject missing model/artifact/version identity;
- `cancelled` is emitted as a real terminal phase instead of an error phase.

- [ ] **Step 2: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-finalize.test.ts tests/unit/artifact-stream.test.ts tests/integration/artifact.test.ts`

- [ ] **Step 3: Implement byte hashing and immutable key construction**

Use `createHash('sha256').update(bytes).digest('hex')`. Build each new object key from server-generated attachment ID and canonical filename; never reuse an existing attachment key.

- [ ] **Step 4: Implement transaction finalization**

For revision, lock the artifact row through Drizzle `.for('update')`, verify ownership, kind, and `currentVersionId`, calculate the next version inside the transaction, then insert attachment/version and update the pointer, current title, and `updatedAt`. For create/fork, insert artifact with a null pointer, insert version 1, then set the pointer before commit. A fork's source version is authorized before the R2 write but is allowed to belong to `sourceArtifactId`; lock that source artifact and recheck `expectedCurrentVersionId` in the final transaction. A same-lineage revision source must belong to the updated artifact.

Only mark `messages` and `generation_runs` completed within this same transaction, and require the generation's current status to be `streaming` so cancellation can win safely. Persist a profile-owned deterministic `changeSummary` such as creation, revision, or fork status; do not copy model prose into that field. New artifact attachments keep `extractedText` null so R2 remains the only artifact body source; `generationRuns.content` may remain an operational compatibility copy but is never used for preview, Copy, Download, or revisions. Keep R2 compensation outside PostgreSQL as the existing helper does.

- [ ] **Step 5: Route the current PRD/Agent Skill create flow through the finalizer**

Remove direct attachment insert logic from `artifacts.ts`. Extend `ValidatedArtifact` with a required `title` bounded by `ARTIFACT_TITLE_MAX_LENGTH`. PRD derives and normalizes it from a validated non-empty H1, Agent Skill derives it from validated frontmatter, and later Checklist derives it from validated JSON; filenames never become titles for new artifacts. Preserve current summaries and validated canonical bytes, but emit the expanded descriptor returned by `finalizeArtifactVersion`.

- [ ] **Step 6: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-finalize.test.ts tests/unit/artifact-stream.test.ts tests/integration/artifact.test.ts tests/integration/artifact-download.test.ts tests/unit/conversation-hydration.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 7: Commit the finalization boundary**

```bash
git add src/server/core/artifact-finalization.ts src/server/core/artifacts.ts src/lib/ai/artifact-stream.ts tests/unit/artifact-finalize.test.ts tests/unit/artifact-stream.test.ts tests/integration/artifact.test.ts
git commit -m "refactor(artifacts): centralize immutable finalization"
```

---

### Task 5: Add Checklist Artifact Output

**Files:**
- Create: `src/lib/ai/checklist-artifact.ts`
- Modify: `src/server/core/artifact-profiles.ts`
- Modify: `src/lib/chat/skills.ts`
- Modify: `src/lib/utils/validation.ts`
- Modify: `src/components/chat/Composer.tsx`
- Modify: `src/components/chat/SkillSelector.tsx`
- Test: `tests/unit/checklist-artifact.test.ts`
- Test: `tests/unit/validation.test.ts`
- Test: `tests/unit/skill-selector.test.tsx`
- Test: `tests/integration/artifact.test.ts`

**Interfaces:**
- Produces: `buildChecklistArtifact(fullText): ValidatedArtifact | null`, `CHECKLIST_MIME_TYPE`, and Checklist profile metadata.
- Changes `checklist` to `outputMode: 'artifact'`, `supportsCompare: true`, and `artifactKind: 'checklist'`.
- Extends `ArtifactProfile.skillId` and artifact validation schema to all registry-derived artifact skill IDs.

- [ ] **Step 1: Write failing checklist artifact tests**

Use synthetic valid/invalid Checklist JSON. Assert canonical Markdown structure and metadata without pinning generated prose:

```ts
expect(result?.mimeType).toBe('text/markdown')
expect(result?.fileName.endsWith('.md')).toBe(true)
expect(result?.markdown.split('\n').filter((line) => line.startsWith('- [ ] '))).toHaveLength(2)
expect(CHECKLIST_MIME_TYPE).toBe('text/markdown')
```

Prove invalid JSON, no valid items, unsafe/empty titles, and byte overrun produce no artifact. Add registry/schema tests that Checklist is accepted by artifact generation and Compare.

- [ ] **Step 2: Run tests and verify failures**

Run: `bun x vitest run tests/unit/checklist-artifact.test.ts tests/unit/validation.test.ts tests/integration/artifact.test.ts`

- [ ] **Step 3: Implement deterministic JSON-to-Markdown conversion**

Reuse `parseChecklist` and `getChecklistCopyText`. Add one H1 title followed by task-list lines, canonical newline handling, filename sanitization, byte limit constant, and deterministic summary metadata. Do not persist model JSON as the version file.

- [ ] **Step 4: Register the Checklist profile**

Reuse the current Checklist system prompt for generation. Profile validation parses JSON; profile build returns canonical Markdown. Keep historical chat rendering code untouched so existing messages still hydrate as interactive Checklist content.

- [ ] **Step 5: Remove the Compare UI guard only for artifact skills whose registry metadata supports Compare**

`SkillSelector` and `Composer` must read `skillSupportsCompare`; do not special-case Checklist by ID in components.

- [ ] **Step 6: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/checklist.test.ts tests/unit/checklist-artifact.test.ts tests/unit/validation.test.ts tests/unit/skill-selector.test.tsx tests/unit/system-prompt.test.ts tests/integration/artifact.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 7: Commit Checklist artifact support**

```bash
git add src/lib/ai/checklist-artifact.ts src/server/core/artifact-profiles.ts src/lib/chat/skills.ts src/lib/utils/validation.ts src/components/chat/Composer.tsx src/components/chat/SkillSelector.tsx tests/unit/checklist-artifact.test.ts tests/unit/validation.test.ts tests/unit/skill-selector.test.tsx tests/integration/artifact.test.ts
git commit -m "feat(artifacts): generate checklist files"
```

---

### Task 6: Add Single-Model Revision Planning and Exact Source Loading

**Files:**
- Create: `src/server/core/artifact-generation.ts`
- Create: `src/server/core/artifact-operations.ts`
- Modify: `src/lib/ai/credits.ts`
- Modify: `src/server/core/artifact-profiles.ts`
- Modify: `src/server/core/artifacts.ts`
- Modify: `src/lib/utils/validation.ts`
- Modify: `src/server/functions/chat.ts`
- Test: `tests/unit/artifact-operations.test.ts`
- Test: `tests/unit/credits-compare.test.ts`
- Test: `tests/integration/artifact-revision.test.ts`

**Interfaces:**
- Produces `artifactOperationSchema`:

```ts
z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), skillId: artifactSkillIdSchema }),
  z.object({
    type: z.literal('revise'),
    targets: z.array(z.object({ artifactId: uuid, versionId: uuid })).min(1).max(4),
  }),
])
```

- Produces: `planArtifactOperations`, `executeArtifactGeneration`, and `generateArtifactsCore` for one or several models/targets.
- Consumes exact source bytes from `artifact-repository.ts` and immutable finalization from Task 4.
- Produces `logArtifactLifecycle(event)` with a typed allowlist of IDs, operation, kind, byte size, version, lifecycle status, safe error code, timing, usage, mention counts, and fan-out counts. It never accepts prompt text, Markdown, file bytes, or extracted document text.
- Produces `reserveGenerationBatchCredits(tx, { userId, reservations })`, where each reservation is `{ generationRunId, modelId, amount }`; even the one-model path uses this caller-owned transaction helper.

- [ ] **Step 1: Write failing operation-planner tests**

Prove create plans one target for one model, single revision plans one generation per target, duplicate artifact targets reject, each revision chooses the profile from the persisted source kind, and the planner never infers revision from prompt words.

- [ ] **Step 2: Write failing revision integration tests**

Seed v1 in R2 and PostgreSQL. Verify:

- exact v1 bytes enter the revision prompt;
- successful revision creates v2 on the same artifact;
- v1 attachment/object remains unchanged;
- title/kind remain profile-owned;
- invalid model output leaves v1 current;
- stale base returns 409 before a new generation begins;
- `requestMessageId` links each revision run to the exact user instruction.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-operations.test.ts tests/unit/credits-compare.test.ts tests/integration/artifact-revision.test.ts`

- [ ] **Step 4: Add profile-owned revision prompts**

Each profile receives source Markdown and an instruction through clearly delimited, non-executable document context. System instructions state that artifact source is untrusted data and the output must be one complete replacement document in that profile's canonical format.

- [ ] **Step 5: Extract the shared generation worker**

Move server stream consumption, byte cap, real section detection, usage normalization, cancellation, profile validation, and finalization calls out of the 947-line `artifacts.ts`. Keep orchestration separate from provider details and preserve current AI SDK 7 `streamText` usage verified against installed `ai@7.0.83` types.

- [ ] **Step 6: Implement single-model preflight and revision execution**

Authorize every source and load every exact base before inserting messages or deducting credit. In one preflight transaction insert one user message, one assistant message and run per target, populate every run's `requestMessageId` plus exact source IDs, reserve generation-scoped credits, and roll everything back if any reservation fails. Execute workers concurrently only after the transaction commits, and return a validated multiplexed artifact SSE response even when only one worker exists. Phase A retry reloads create instructions through `requestMessageId` and retries a failed revision from that generation's own persisted source IDs after repeating stale-current authorization; Phase B later adds persisted Context mention reconstruction.

Emit allowlisted lifecycle metadata at accepted, first delta, validation, saving, and terminal boundaries. Log finalization duration separately from total latency, and include context/revision counts and planned fan-out without serializing inputs.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-operations.test.ts tests/unit/credits-compare.test.ts tests/integration/artifact-revision.test.ts tests/integration/artifact.test.ts tests/unit/artifact-stream.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit single-model revision core**

```bash
git add src/server/core/artifact-generation.ts src/server/core/artifact-operations.ts src/server/core/artifact-profiles.ts src/server/core/artifacts.ts src/lib/ai/credits.ts src/lib/utils/validation.ts src/server/functions/chat.ts tests/unit/artifact-operations.test.ts tests/unit/credits-compare.test.ts tests/integration/artifact-revision.test.ts
git commit -m "feat(artifacts): add immutable revisions"
```

---

### Task 7: Add Compare Artifact Creation, Forks, and Completion Barrier

**Files:**
- Modify: `src/server/core/artifact-operations.ts`
- Modify: `src/lib/ai/artifact-stream.ts`
- Modify: `src/lib/utils/validation.ts`
- Modify: `src/server/functions/chat.ts`
- Modify: `src/lib/chat/skills.ts`
- Modify: `src/components/chat/SkillSelector.tsx`
- Test: `tests/unit/artifact-operations.test.ts`
- Test: `tests/integration/artifact-compare.test.ts`
- Test: `tests/integration/compare.test.ts`

**Interfaces:**
- Extends artifact generation input with `modelIds: string[]` constrained by `COMPARE_MIN_MODELS` and `COMPARE_MAX_MODELS`; `auto` remains rejected in Compare.
- Produces N target x M model operation plans and one comparison run per revision target.
- Consumes `reserveGenerationBatchCredits` from Task 6 to atomically reserve the entire planned total and insert generation-scoped credit rows inside the caller's preflight transaction.
- Produces a completion barrier based on worker promises, not elapsed time.

- [ ] **Step 1: Write failing fan-out tests**

Prove:

- four models creating one PRD produce four distinct artifact/version/attachment IDs;
- two revision targets and four models plan eight generations and two comparison runs;
- every fork starts at v1 and has `sourceVersionId` pointing to the requested source;
- source artifacts remain unchanged;
- one model failure leaves other artifacts completed/openable;
- cancellation/refund is isolated to its generation;
- comparison status finalizes only after all workers are terminal;
- insufficient credits creates no conversation, generations, comparison runs, deductions, messages, or R2 writes.

- [ ] **Step 2: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-operations.test.ts tests/integration/artifact-compare.test.ts tests/integration/compare.test.ts`

- [ ] **Step 3: Implement atomic batch credit reservation**

Calculate costs from registry entries once. The operation preflight transaction creates a new conversation when needed, the request message, comparison runs, assistant messages, and generation rows; then `reserveGenerationBatchCredits` conditionally decrements the total and inserts one `credit_transactions` row per planned generation. Throwing 402 rolls back that entire transaction, including a newly created conversation.

- [ ] **Step 4: Implement comparison persistence and worker fan-out**

Create one assistant message/run per model-target pair. Create one comparison run for each logical revision target, or one for a create request. Populate every generation's exact `requestMessageId` before streaming. Start all workers only after source authorization, exact source loading, and the complete preflight transaction succeed.

- [ ] **Step 5: Replace fixed-delay completion with a promise barrier**

Use `Promise.allSettled(workerPromises)` to derive comparison terminal status only after every worker has finalized/refunded. Never allow one rejected worker to cancel sibling workers automatically.

- [ ] **Step 6: Remove full Compare payload logging**

Delete logs that serialize request payloads, prompts, and attachment IDs from `src/server/functions/chat.ts`. Route artifact telemetry through the typed allowlist from Task 6; ordinary Compare logging may retain only generation/comparison IDs and status.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-operations.test.ts tests/integration/artifact-compare.test.ts tests/integration/compare.test.ts tests/unit/validation-compare.test.ts tests/unit/artifact-stream.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit Compare artifacts**

```bash
git add src/server/core/artifact-operations.ts src/lib/ai/artifact-stream.ts src/lib/utils/validation.ts src/server/functions/chat.ts src/lib/chat/skills.ts src/components/chat/SkillSelector.tsx tests/unit/artifact-operations.test.ts tests/integration/artifact-compare.test.ts tests/integration/compare.test.ts
git commit -m "feat(artifacts): add compare generation and forks"
```

---

### Task 8: Add Artifact Hydration and Pure Canvas State

**Files:**
- Create: `src/lib/artifacts/workspace-state.ts`
- Modify: `src/server/core/messages.ts`
- Modify: `src/lib/utils/conversation-hydration.ts`
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/components/chat/CompareGrid.tsx`
- Modify: `src/components/chat/ModelColumn.tsx`
- Test: `tests/unit/artifact-workspace-state.test.ts`
- Test: `tests/unit/conversation-hydration.test.ts`

**Interfaces:**
- Produces:

```ts
type ArtifactWorkspaceState = {
  openArtifactIds: string[]
  activeArtifactId: string | null
  activeVersionByArtifactId: Record<string, string>
  scrollTopByVersionKey: Record<string, number>
  isArtifactPanelOpen: boolean
}
```

- Produces pure functions: `openArtifact`, `selectArtifactVersion`, `rememberArtifactScroll`, `closeArtifactTab`, `closeArtifactPanel`, and `resetArtifactWorkspace`.
- Expands hydrated `ChatMessage.artifact` and Compare generation artifact descriptors to the shared safe contract.

- [ ] **Step 1: Write failing reducer tests**

Cover open, dedupe, focus, version selection, version-keyed scroll state, neighbor selection on close, last-tab panel close, panel close without tab loss, and conversation reset.

- [ ] **Step 2: Write failing hydration tests**

Prove persisted PRD, Agent Skill, Checklist, and Compare artifact descriptors hydrate with logical/version identity. Prove historical Checklist chat JSON remains ordinary content.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-workspace-state.test.ts tests/unit/conversation-hydration.test.ts`

- [ ] **Step 4: Implement pure workspace transitions**

Keep this module free of React and browser APIs. Key scroll positions as `${artifactId}:${versionId}`. Opening the same artifact updates active version when explicitly requested without appending a duplicate tab.

- [ ] **Step 5: Extend safe message DTOs and hydration**

Join artifact/version data by generation ID in `getMessagesCore`. For completed artifact runs, set hydrated `generationRuns.content` to null and return only the safe artifact descriptor; never serialize R2 locators or artifact bodies. Compare groups must carry each successful generation's artifact descriptor and preserve failed siblings.

- [ ] **Step 6: Thread open callbacks through message UI**

Add `onOpenArtifact(artifact)` and `onOpenArtifacts(artifacts)` props without opening or downloading inside leaf renderers. `FileCard` changes in Task 10.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-workspace-state.test.ts tests/unit/conversation-hydration.test.ts tests/unit/compare-card-layout.test.tsx tests/unit/artifact-progress.test.tsx
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit hydration and state**

```bash
git add src/lib/artifacts/workspace-state.ts src/server/core/messages.ts src/lib/utils/conversation-hydration.ts src/components/chat/MessageList.tsx src/components/chat/CompareGrid.tsx src/components/chat/ModelColumn.tsx tests/unit/artifact-workspace-state.test.ts tests/unit/conversation-hydration.test.ts
git commit -m "feat(artifacts): hydrate canvas state"
```

---

### Task 9: Build Canvas Tabs, Header, Exact Preview, and Responsive Surface

**Files:**
- Create: `src/components/artifacts/useArtifactContent.ts`
- Create: `src/components/artifacts/ArtifactTabs.tsx`
- Create: `src/components/artifacts/ArtifactHeader.tsx`
- Create: `src/components/artifacts/ArtifactCanvas.tsx`
- Test: `tests/unit/artifact-canvas.test.tsx`
- Test: `tests/unit/artifact-content.test.tsx`

**Interfaces:**
- `useArtifactContent({ artifactId, versionId, enabled })` returns `{ source, isPending, error, refetch }` through TanStack Query.
- `ArtifactCanvas` consumes summaries, workspace state, state callbacks, `onBackToChat`, `onCopy`, and no implicit Composer-context callback until the Mention plan.
- Header emits `onVersionChange`, `onCloseTab`, and `onClosePanel`; Download uses the selected version attachment descriptor.

- [ ] **Step 1: Write failing content hook tests**

Mock `fetch` and prove exact version URL, response text caching by artifact/version query key, non-OK safe errors, Retry, and obsolete request cancellation when IDs change.

- [ ] **Step 2: Write failing Canvas behavior tests**

Render the real Canvas components and assert semantic behavior:

- active tab exposes selected artifact name;
- selecting a tab/version emits exact IDs;
- Copy receives exact loaded source;
- Download action does not emit open/focus;
- preview loading/error/Retry states are isolated;
- mobile Back emits `onBackToChat`;
- keyboard tab navigation and close controls have accessible labels.

Do not assert class names or document layout structure.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-content.test.tsx tests/unit/artifact-canvas.test.tsx`

- [ ] **Step 4: Implement the exact content hook**

Use query key `['artifact-content', artifactId, versionId]` and the exact file route. Validate text content type and map 401/403/404/network errors to safe messages. Do not read `attachments.extractedText`.

- [ ] **Step 5: Implement accessible tabs and header**

Use semantic tab roles and buttons. Resolve model display from `useModelCatalog`; use persisted model IDs only as lookup inputs. Keep Copy and Download separate. The version selector shows immutable ordered versions.

- [ ] **Step 6: Implement the Canvas surface**

Use paper/white surfaces and hairline borders only. Keep tab/header regions non-scrolling and give preview one independent `.zona-scroll` owner. Render source through shared `MarkdownContent`; Mermaid remains a code block.

- [ ] **Step 7: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-content.test.tsx tests/unit/artifact-canvas.test.tsx tests/unit/markdown.test.ts tests/unit/markdown-sanitize.test.tsx
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 8: Commit Canvas components**

```bash
git add src/components/artifacts tests/unit/artifact-content.test.tsx tests/unit/artifact-canvas.test.tsx
git commit -m "feat(artifacts): add tabbed canvas preview"
```

---

### Task 10: Integrate File Cards, Compare Results, and Conversation Layout

**Files:**
- Create: `src/components/artifacts/ConversationArtifactLayout.tsx`
- Modify: `src/components/chat/FileCard.tsx`
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/components/chat/CompareGrid.tsx`
- Modify: `src/components/chat/ModelColumn.tsx`
- Modify: `src/routes/chat/$conversationId.tsx`
- Test: `tests/unit/artifact-file-card.test.tsx`
- Test: `tests/unit/chat-artifact-layout.test.tsx`
- Test: `tests/unit/compare-loading.test.tsx`

**Interfaces:**
- `FileCard` accepts `onOpen(artifact)` and keeps a separate Download control.
- `CompareGrid` accepts `onOpenArtifact` and `onOpenArtifacts`; Open All receives only successful artifact descriptors.
- Conversation route owns `ArtifactWorkspaceState`, artifact metadata queries, and all Canvas state transitions.
- `ConversationArtifactLayout` keeps both panes mounted and accepts `{ canvasOpen, chatPane, canvasPane }`; at wide viewports it renders an approximately 55/45 split, while narrow viewports expose exactly one pane without losing child state.

- [ ] **Step 1: Write failing open/download separation tests**

Click the card/name and assert `onOpen` receives the exact descriptor. Click Download and assert `onOpen` is not called. Verify keyboard activation opens the card. Test behavior, not anchor markup.

- [ ] **Step 2: Write failing route layout behavior tests**

Render `ConversationArtifactLayout` with stateful test children. Prove opening an artifact keeps MessageList and Composer mounted, closing returns normal chat mode, and mobile back preserves a draft value. Do not assert exact utility strings or percentage classes.

- [ ] **Step 3: Run tests and verify failures**

Run: `bun x vitest run tests/unit/artifact-file-card.test.tsx tests/unit/chat-artifact-layout.test.tsx tests/unit/compare-loading.test.tsx`

- [ ] **Step 4: Separate FileCard actions**

Make the content area a button that opens Canvas. Keep Download as an independent link/button with event propagation stopped. Use a hairline boundary without adding heavy card shadows.

- [ ] **Step 5: Integrate route-local workspace state**

Implement `ConversationArtifactLayout`, then wrap the current scroll area and absolute Composer in its relative `ChatPane`. Use a wide-viewport `minmax(0, 11fr) minmax(0, 9fr)` grid with one hairline separator. On narrow viewports hide the inactive pane visually while keeping it mounted. Reset workspace state on `conversationId` changes.

- [ ] **Step 6: Open successful streaming results automatically**

When an `artifact-created` event arrives, merge its descriptor into persisted/query state, open/focus its tab, and select its version. On Compare completion, expose each successful file card and Open All; failed generations retain their existing error state.

- [ ] **Step 7: Preserve independent scrolling**

Keep `scrollRef` connected only to chat. Canvas manages its own scroll element and records scroll state before tab/version switches. The Composer's absolute positioning context must remain `ChatPane`, never the whole chat-plus-Canvas row.

- [ ] **Step 8: Run affected verification**

Run:

```bash
bun x vitest run tests/unit/artifact-file-card.test.tsx tests/unit/chat-artifact-layout.test.tsx tests/unit/compare-loading.test.tsx tests/unit/message-list-scroll-owner.test.tsx tests/unit/message-list-virtual.test.tsx tests/unit/single-loading.test.tsx
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 9: Commit conversation integration**

```bash
git add src/components/artifacts/ConversationArtifactLayout.tsx src/components/chat/FileCard.tsx src/components/chat/MessageList.tsx src/components/chat/CompareGrid.tsx src/components/chat/ModelColumn.tsx 'src/routes/chat/$conversationId.tsx' tests/unit/artifact-file-card.test.tsx tests/unit/chat-artifact-layout.test.tsx tests/unit/compare-loading.test.tsx
git commit -m "feat(artifacts): integrate canvas with chat"
```

---

### Task 11: Harden Artifact Deletion and Conversation R2 Cleanup

**Files:**
- Modify: `src/server/functions/files.ts`
- Modify: `src/server/core/conversations.ts`
- Test: `tests/integration/files.test.ts`
- Test: `tests/integration/conversations.test.ts`

**Interfaces:**
- Generic attachment deletion rejects any `attachmentId` referenced by `artifactVersions` with a safe conflict error.
- Conversation deletion loads persisted `{ bucket, key }` locators, deletes each idempotently, and deletes the DB conversation only after all object deletions succeed.
- `deleteAllConversationsCore` applies the same cleanup contract for every owned conversation.

- [ ] **Step 1: Write failing deletion tests**

Prove:

- generic delete rejects an artifact-backed attachment and leaves object/rows intact;
- ordinary upload attachment deletion still works;
- deleting a conversation deletes every R2 object before its database row;
- one storage failure prevents DB deletion and retains locators for Retry;
- repeated deletion of an already missing R2 key is safe;
- cross-user deletion remains forbidden.

- [ ] **Step 2: Run tests and verify failures**

Run: `bun x vitest run tests/integration/files.test.ts tests/integration/conversations.test.ts`

- [ ] **Step 3: Protect artifact-backed attachments**

Query `artifactVersions` before generic metadata deletion and throw `AppError` 409 when referenced. Do not cascade a version by deleting its file.

- [ ] **Step 4: Implement synchronous fail-closed conversation cleanup**

Authorize first, select all attachment locators for the conversation, call bucket-aware `deleteObject` for each, and delete the conversation only after all calls succeed. Treat provider not-found as idempotent success only when the adapter can identify that exact condition; propagate network/auth failures.

- [ ] **Step 5: Run affected verification**

Run:

```bash
bun x vitest run tests/integration/files.test.ts tests/integration/conversations.test.ts tests/integration/artifact-workspace.test.ts
bun x tsc --noEmit
bun x biome check ./src
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
```

- [ ] **Step 6: Commit lifecycle cleanup**

```bash
git add src/server/functions/files.ts src/server/core/conversations.ts tests/integration/files.test.ts tests/integration/conversations.test.ts
git commit -m "fix(artifacts): preserve versioned file lifecycle"
```

---

### Task 12: Add Real Artifact Canvas E2E Journeys and Complete Phase A Verification

**Files:**
- Create: `tests/e2e/artifact-canvas.spec.ts`
- Modify: `tests/e2e/agent-skill.spec.ts`
- Modify: `tests/e2e/compare.spec.ts`

**Interfaces:**
- Uses real authenticated routes and seeded DB/R2 fixtures.
- Covers the complete Phase A user surface without `page.setContent` stand-ins.

- [ ] **Step 1: Add seeded artifact helpers scoped by Playwright project**

Create test data with unique user/conversation/artifact/version/attachment/generation IDs and register all R2 keys for cleanup. Do not embed user-provided private content; use neutral synthetic Markdown.

- [ ] **Step 2: Write failing desktop journeys**

Cover:

- file card opens Canvas rather than downloading;
- separate Download returns exact stored bytes;
- PRD, Agent Skill, and Checklist previews render;
- multiple artifacts open, dedupe, switch, select versions, and close;
- a seeded artifact with v1 and v2 opens current v2 while v1 remains selectable and downloadable; server-side revision creation is already proven by Task 6 integration tests, while the chat-driven revision journey begins in Phase B;
- refreshing closes ephemeral tabs but persisted file cards and complete version history reopen correctly;
- chat remains scrollable and Composer can submit while Canvas is open;
- Compare exposes four independent successful artifact cards;
- one failed Compare generation leaves successful siblings openable.

- [ ] **Step 3: Write failing mobile journey**

On the configured mobile project, open Canvas, verify the chat view is replaced rather than split, return to chat, and assert the Composer draft remains. Use accessible roles/test IDs only for interaction, not style assertions.

- [ ] **Step 4: Run the focused E2E suite**

Run: `bun x playwright test tests/e2e/artifact-canvas.spec.ts tests/e2e/agent-skill.spec.ts tests/e2e/compare.spec.ts`

Expected before final fixes: new journeys expose any route/layout integration gaps.

- [ ] **Step 5: Treat any focused E2E failure as a blocking defect**

If a journey fails, stop this task, invoke `systematic-debugging`, fix the owning production boundary with a failing unit/integration regression test, run that boundary's full verification gate, and commit the fix separately before rerunning E2E. Do not weaken assertions, add arbitrary waits, or replace real routes with synthetic markup.

- [ ] **Step 6: Run Phase A final gate**

Run:

```bash
bun x tsc --noEmit
bun x biome check ./src
bun x vitest run --maxWorkers=1
bun x playwright test
bun run build
rg -n "as never|as any|\\bas any\\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g "!routeTree.gen.ts"
rg -n "shadow-lg|shadow-xl|shadow-2xl|bg-gradient|text-transparent" src/components/artifacts src/components/chat/FileCard.tsx
```

Expected: all commands pass; both scans print no forbidden new matches in the changed feature surface.

- [ ] **Step 7: Run live Phase A browser review**

Start `bun run dev`, then use the `agent-browser` and `webapp-testing` skills at desktop and mobile viewports. Verify no console errors or horizontal overflow, independent chat/Canvas scrolling, preserved Composer draft, keyboard-visible tab/header controls, and the approved paper/white/hairline visual hierarchy.

- [ ] **Step 8: Review the full diff and commit E2E coverage**

```bash
git status --short
git diff --check
git diff --stat
git add tests/e2e/artifact-canvas.spec.ts tests/e2e/agent-skill.spec.ts tests/e2e/compare.spec.ts
git commit -m "test(artifacts): cover canvas journeys"
```

## Phase A Handoff

Phase A is ready for Phase B only when Task 12 passes and the worktree is clean. Artifact creation, immutable versions, server revision operations, Compare artifacts, exact preview, Download, history reload, and responsive Canvas must be demonstrably functional before Mention work begins.
