# Artifact Canvas and Mentions Design

**Status:** Approved in design review
**Date:** 2026-09-07
**Scope:** Artifact Core and Canvas first, Artifact Mention second

## 1. Summary

Zona.ai will turn generated Markdown files into durable, versioned artifacts that remain attached to their conversation. A file card opens a right-side Canvas instead of downloading the file. Download remains a separate action and returns the exact stored Markdown object.

The system will support three artifact kinds:

- PRD
- Agent Skill
- Checklist

PRD and Agent Skill extend the current generated-file pipeline. Checklist changes from chat JSON to a generated Markdown artifact for new requests. Historical checklist messages remain unchanged.

After Artifact Core and Canvas are stable, the Composer will gain structured `@artifact` mentions. A mention refers to exact persisted IDs, not text parsed from a filename. Mentions can provide read-only context or explicitly request a revision.

## 2. Goals

1. Open generated files in a Canvas while keeping chat usable.
2. Keep opening and downloading as separate interactions.
3. Support several open artifacts through deduplicated tabs.
4. Render stored Markdown safely and accurately.
5. Preserve every successful artifact version as an immutable file.
6. Revise an exact artifact through chat without relying on filename parsing.
7. Produce independent artifacts for every model in Compare Mode.
8. Persist artifacts, versions, provenance, and message mentions.
9. Reconstruct file cards, version history, and mention tokens after reload.
10. Reuse the existing attachment, R2, generation, conversation, and streaming architecture.
11. Keep partial failures isolated by generation.
12. Preserve normal chat behavior and the unified Workspace Shell.

## 3. Non-Goals

This scope does not add:

- an editable source or WYSIWYG editor;
- manual save or autosave;
- public artifact sharing;
- cross-conversation or user-global artifact search;
- artifact survival after its conversation is deleted;
- arbitrary uploaded files as artifacts;
- multi-file artifact bundles;
- PDF or HTML export;
- a dedicated artifact library route;
- persisted open-tab preferences;
- Mermaid diagram rendering;
- version rollback as the current version;
- collaborative editing;
- artifact rename controls.

Old versions can be viewed and downloaded, but remain immutable. A later restore feature must create another version instead of mutating history.

## 4. Verified Current State

The design extends these implemented boundaries:

- `src/server/core/artifacts.ts` already consumes model output on the server, validates it through an artifact profile, stores UTF-8 bytes in R2, inserts an attachment, persists a short chat summary, and compensates an R2 write when the database transaction fails.
- `src/server/core/artifact-profiles.ts` already separates PRD and Agent Skill validation and artifact construction.
- `src/lib/ai/artifact-stream.ts` already defines a Zod-validated artifact SSE protocol with partial-frame parsing.
- `src/server/functions/files.ts` and `src/routes/api/attachments/$attachmentId.tsx` already provide owner-authorized inline reads and downloads from R2.
- `src/server/core/messages.ts` already returns safe attachment descriptors with persisted messages.
- `src/lib/utils/conversation-hydration.ts` already reconstructs PRD and Agent Skill file cards after reload.
- `src/routes/chat/$conversationId.tsx` owns chat state, artifact streaming, Compare streaming, scrolling, and the Composer placement.
- `src/components/chat/FileCard.tsx` currently exposes Download only.
- `src/components/chat/MessageList.tsx` and `src/components/chat/ModelColumn.tsx` currently duplicate sanitized Markdown rendering.
- `src/lib/db/schema.ts` has attachments, generation runs, comparison runs, messages, and conversations, but no logical artifact or version entity.

The following gaps must be resolved by this feature:

- Attachment identity currently doubles as artifact identity.
- Artifact kind is inferred from `generation_runs.skill_id`.
- Artifact source is copied into R2, `attachments.extracted_text`, and `generation_runs.content` without a consistency hash.
- Artifact skills are blocked in Compare Mode.
- Artifact requests have no explicit revision target.
- Compare and artifact retry paths do not reliably retain the original user-message identity.
- The Canvas, tabs, active artifact state, and preview loader do not exist.
- `react-markdown`, the existing rehype plugins, and the AI SDK imports used by source are not declared in the root manifest.
- The current Markdown renderer does not explicitly support GFM tables and task lists.
- Mermaid is requested by the PRD prompt but is not rendered by the current UI pipeline.
- The generic attachment-list endpoint returns more fields than its clients require.
- Conversation deletion removes database rows but does not remove attachment objects from R2.

## 5. Chosen Architecture

The chosen approach introduces a logical artifact entity and immutable artifact-version entities. It does not add another file store or replace attachments.

```text
artifact
  -> current artifact_version
       -> attachment
            -> R2 Markdown object
       -> generation_run
            -> model provenance and lifecycle
```

This separates four concerns:

- `artifacts` identify a document across revisions;
- `artifact_versions` identify immutable snapshots;
- `attachments` identify stored file objects and preserve existing download behavior;
- `generation_runs` identify the model operation that produced a snapshot.

An attachment remains the physical-file record. It must not become the logical artifact record.

## 6. Data Model

### 6.1 Artifacts

Add an `artifacts` table with these fields:

| Field | Contract |
|---|---|
| `id` | Server-generated UUID and stable logical artifact identity |
| `userId` | Authenticated owner; never accepted as authority from the client |
| `conversationId` | Required owning conversation with cascade deletion |
| `kind` | `prd`, `agent-skill`, or `checklist` |
| `title` | Current display title derived from validated artifact output |
| `currentVersionId` | Nullable during the creation transaction, then points to the successful current version |
| `createdAt` | Creation timestamp |
| `updatedAt` | Timestamp of the latest successful version |

Indexes must support owner-and-conversation listing, recent updates, and kind filtering. Application code must derive `userId` from the authenticated session and confirm the conversation has the same owner.

`currentVersionId` starts null only while version 1 is being assembled inside the same transaction. The transaction inserts the artifact, inserts version 1, then sets the current pointer before commit. No successfully committed artifact may retain a null current pointer.

### 6.2 Artifact Versions

Add an `artifact_versions` table with these fields:

| Field | Contract |
|---|---|
| `id` | Server-generated immutable version UUID |
| `artifactId` | Owning logical artifact |
| `version` | Positive integer unique within an artifact |
| `sourceVersionId` | Optional exact source version used for a revision or fork |
| `attachmentId` | Unique attachment containing the exact Markdown bytes |
| `generationRunId` | Unique generation that produced this version |
| `title` | Immutable title snapshot for this version |
| `contentSha256` | SHA-256 of the exact UTF-8 R2 bytes; nullable only for conservatively backfilled legacy rows until first verified read |
| `createdByModelId` | Internal model ID copied from the generation run |
| `createdByRouterModelId` | Resolved router model ID copied from the generation run |
| `changeSummary` | Deterministic short operation summary, not raw model prose |
| `createdAt` | Creation timestamp |

Required constraints:

- unique `(artifactId, version)`;
- unique `(id, artifactId)` to support same-artifact composite references;
- unique `attachmentId`;
- unique `generationRunId`;
- positive version number;
- the artifact current pointer uses `(currentVersionId, artifactId)` to reference `(artifact_versions.id, artifact_versions.artifactId)`, so a version from another artifact cannot become current;
- artifact kind cannot change within one lineage.

For a same-lineage revision, `sourceVersionId` points to the previous version of the same artifact. For a Compare fork, version 1 of the new artifact points to the source version in the original artifact. This relation records fork provenance without mutating the source.

### 6.3 Message Artifact Mentions

Add a `message_artifact_mentions` table with these fields:

| Field | Contract |
|---|---|
| `id` | Server-generated UUID |
| `messageId` | User message containing the mention |
| `artifactId` | Exact logical artifact |
| `versionId` | Exact version selected when the message was sent |
| `mode` | `context` or `revise` |
| `position` | Stable ordering in the message mention tray |
| `titleSnapshot` | Server-derived title shown in historical messages |
| `kindSnapshot` | Server-derived kind shown in historical messages |
| `versionSnapshot` | Server-derived version number shown in historical messages |
| `createdAt` | Creation timestamp |

Required constraints:

- one artifact can be mentioned only once per message;
- mention positions are unique within a message;
- artifact and version must belong to the same current conversation and authenticated user at insertion time;
- a `revise` mention must reference the current version at generation preflight;
- a `context` mention may reference any existing immutable version.

The snapshot fields preserve historical display semantics. They are populated from authorized server data, never from client labels.

### 6.4 Generation Request Identity

Add nullable `requestMessageId` to `generation_runs` for compatibility with existing rows. Every new single, Compare, and artifact generation must populate it with the exact user message that initiated the run.

This removes the current retry ambiguity where a failed artifact retry can accidentally use the most recent user message instead of its original instruction. Retry must reload the original request message and its persisted mentions.

### 6.5 Attachment Relationship

No existing attachment ID or download URL changes. Artifact-backed attachments are protected records:

- generic attachment deletion must reject an attachment referenced by `artifact_versions`;
- an artifact version is never updated to point to another attachment;
- preview and download resolve the same attachment row;
- closing a tab never deletes an attachment or artifact.

## 7. Canonical Content and Consistency

The canonical content chain is:

```text
artifact version
  -> attachment metadata
  -> stored R2 Markdown bytes
  -> preview, Copy, model revision context, and Download
```

The preview DOM is never serialized back into a file. `attachments.extractedText` and `generation_runs.content` remain compatibility or operational copies only. New revision context must read the exact authorized version object from R2.

For every new version:

1. Canonicalize and validate the generated Markdown through the artifact profile.
2. Encode it once as UTF-8 bytes.
3. Compute SHA-256 from those exact bytes.
4. Write those bytes to a new R2 object key.
5. In one database transaction, insert the attachment and version and update the artifact current pointer.
6. Emit a success event only after the transaction commits.
7. Delete the newly written object if the transaction fails or loses a version conflict.

Version objects are never overwritten in place. The R2 adapter must accept the persisted bucket as part of read/delete identity instead of always reading from the current deployment bucket.

## 8. Legacy Backfill

Backfill is conservative and additive.

An existing attachment becomes artifact version 1 only when all these conditions hold:

1. It is Markdown by MIME or filename.
2. It is linked to an assistant message.
3. Exactly one completed generation run for that message has an artifact skill.
4. The generation skill maps unambiguously to PRD or Agent Skill.
5. The attachment and generation belong to the same conversation.

Ambiguous, missing, plain uploaded, and text-only historical records remain ordinary attachments or messages. Historical Checklist JSON is not converted.

The schema migration may create eligible artifact/version rows using persisted database metadata. Legacy `contentSha256` can remain null. On the first successful authorized content read, the server computes and stores the hash without modifying file bytes. Missing legacy R2 objects produce a normal unavailable error and are not silently replaced from a database copy.

Backfill must be idempotent. Unique attachment and generation constraints prevent duplicate artifact versions.

## 9. Artifact Profiles

The profile registry remains the single source for kind-specific behavior. Extend `ArtifactProfile` so each profile can:

- build a create prompt;
- build a revision prompt using one exact source version and the user's instruction;
- validate model output;
- canonicalize output;
- derive title, filename, MIME, byte size, and summary;
- expose only real section progress when the output format supports it.

### 9.1 PRD

PRD continues to produce canonical Markdown. The existing PRD validator and filename builder are reused and strengthened only where deterministic structure is required by the current profile contract.

### 9.2 Agent Skill

Agent Skill continues to normalize YAML frontmatter and canonical Markdown through the existing validator. The artifact title comes from validated frontmatter metadata, not from filename guessing.

### 9.3 Checklist

Checklist becomes `outputMode: artifact` for new generations and supports Compare Mode.

The model may continue producing the existing validated Checklist JSON contract internally. The server converts the validated payload into canonical Markdown:

```markdown
# Checklist Title

- [ ] First action
- [ ] Second action
```

The stored file, preview, revision source, and download are this canonical Markdown, not the model JSON. Filename and summary are derived by a checklist artifact builder. New checklist artifacts no longer use the interactive local-storage completion UI in chat. Historical checklist messages continue to use the existing renderer.

## 10. Request Contracts

### 10.1 Mention Input

All chat and artifact boundaries reuse this logical shape:

```ts
type ArtifactMentionInput = {
  artifactId: string
  versionId: string
  mode: 'context' | 'revise'
}
```

Rules:

- maximum mentions per message comes from a shared product constant and is four for this scope;
- duplicate artifact IDs are rejected;
- all fields are validated with Zod;
- labels, titles, kinds, filenames, and model metadata are resolved on the server;
- unauthorized IDs fail before message creation, generation creation, R2 reads, or credit deduction.

### 10.2 Artifact Operation

Artifact generation uses a discriminated operation instead of inferring intent from text:

```ts
type ArtifactOperation =
  | { type: 'create'; skillId: ArtifactSkillId }
  | { type: 'revise'; targets: ArtifactMentionInput[] }
```

The create operation has exactly one artifact kind and one or more selected models. The revise operation contains one or more mentions whose mode is `revise`, plus optional read-only `context` mentions.

The client dispatch rule is deterministic:

1. If at least one mention is `revise`, call artifact revision regardless of the selected skill.
2. Otherwise, if the selected skill has artifact output, call artifact creation.
3. Otherwise, call normal single or Compare chat with read-only context mentions.

No server path parses `@filename` from prompt text.

## 11. Authorization and Safe Reads

Every artifact operation must authenticate first and verify ownership through both artifact and conversation relations.

Required checks:

- the conversation exists and belongs to the session user;
- the artifact belongs to that conversation and user;
- the version belongs to the artifact;
- the attachment belongs to the same conversation and user;
- the persisted bucket/key are used server-side;
- the version kind matches the artifact profile;
- every revision base is still current before generation starts and before final commit.

Artifact source, attachment keys, bucket names, and internal storage details never appear in list or message DTOs.

## 12. Server APIs

### 12.1 Conversation Artifact List

`listConversationArtifacts(conversationId)` returns only safe picker and tab metadata:

- artifact ID;
- kind;
- current title;
- updated timestamp;
- version count;
- current version ID and number;
- current filename, size, MIME, and attachment ID;
- creator internal model IDs needed for lookup through the canonical model catalog.

It does not return R2 key, bucket, extracted text, or generation content.

### 12.2 Artifact Detail

`getArtifact(artifactId)` returns authorized artifact metadata and an ordered immutable version list. Each version includes its ID, number, title, attachment descriptor, creator model IDs, source-version provenance, change summary, and creation timestamp.

### 12.3 Exact Version Content

Add an authenticated file route equivalent to:

```text
GET /api/artifacts/{artifactId}/versions/{versionId}
```

It returns exact Markdown bytes inline after validating the complete ownership chain. It includes a private cache policy, `nosniff`, UTF-8 Markdown content type, and the content hash as an ETag-compatible validator.

Preview and Copy use this endpoint. Download continues to use:

```text
GET /api/attachments/{attachmentId}?download=1
```

### 12.4 Attachment List Hardening

The existing conversation attachment-list endpoint must return an explicit safe projection. It must not serialize `r2Key`, `r2Bucket`, or `extractedText`.

## 13. Generation and Revision Flows

### 13.1 Single-Model Creation

```text
validated request
  -> authorize conversation and mentions
  -> create user message and persisted mention rows
  -> create assistant message and generation run
  -> deduct model credits
  -> load exact read-only mention sources
  -> stream model output on the server
  -> validate and canonicalize artifact
  -> write immutable R2 object
  -> transaction: attachment + artifact + version 1 + current pointer
  -> emit artifact-created and terminal success
```

### 13.2 Single-Model Revision

For every `revise` target:

1. Resolve the exact artifact and current version.
2. Load exact source bytes from R2.
3. Build a kind-specific revision prompt with the source and instruction.
4. Create a separate assistant message and generation run linked to the same user request.
5. Validate output with the same profile used by creation.
6. Write a new object.
7. Lock the artifact during finalization.
8. Verify `currentVersionId` still equals the requested base.
9. Insert version `current + 1` and update the current pointer.

If two requests revise the same current version concurrently, only the first successful finalization advances the artifact. The other receives a safe conflict, its newly written object is removed, and the old/current versions remain valid.

### 13.3 Compare Creation

One artifact create request with M models produces M independent artifacts. Every model owns:

- its own assistant message;
- generation run;
- abort state;
- credit transaction;
- artifact ID;
- version 1;
- attachment and R2 object;
- error and usage metadata.

The artifacts share one comparison run and the same authorized input context. A model failure does not prevent completed model artifacts from opening or downloading.

### 13.4 Compare Revision Forks

Compare revisions never append competing versions to the source artifact. They fork.

For N revision targets and M models, the system plans N x M independent generations. Each successful result creates a new artifact whose version 1 points through `sourceVersionId` to the exact source version. The source artifacts remain unchanged.

Each target gets one comparison run containing its M model generations. All runs reference the same user request message and persisted mentions. The maximum fan-out is derived from the configured mention and Compare model limits, not duplicated as an inline value.

Credits for the complete fan-out are calculated before generation rows begin streaming. Insufficient credit fails the whole preflight without partial deductions. After start, refunds are generation-scoped.

### 13.5 Multiple Single-Model Targets

N revision targets with one model produce N independent assistant messages and N new versions. Each result is linked to the same request message. One target failure does not roll back another target's committed version.

## 14. Mention Context Semantics

### 14.1 Explicit Modes

A mention defaults to `context`. The user must explicitly change it to `revise` or choose a `Revisi di chat` action. The system does not classify revision intent with regex or an extra AI call.

Consequences:

- `@PRD` in Context mode can be explained, summarized, or compared without creating a version.
- `@PRD` in Revise mode creates a new version in single-model mode or forks in Compare Mode.
- Wording such as "ubah" does not create a version when the mention remains Context.
- A request without a Revise mention cannot mutate an artifact.

This deterministic contract is the safety boundary. For an unmentioned ambiguous artifact request, the ordinary assistant receives only safe artifact catalog labels and an instruction to ask the user to select an artifact with `@`. Tests pin the no-version invariant, not stochastic assistant wording.

### 14.2 Active Canvas

Opening or focusing an artifact in Canvas does not automatically add model context and does not change Composer behavior.

Canvas actions provide explicit bridges:

- `Tambahkan ke context` creates or focuses a Context chip for the displayed version.
- `Revisi di chat` creates or focuses a Revise chip for the current version.

An explicit mention always determines the target. There is no hidden active-artifact fallback.

### 14.3 Exact Version Semantics

Picker selection resolves the artifact's current version at selection time and stores both IDs. If a new version appears before submission:

- Context still reads the selected immutable version.
- Revise fails with a stale-version conflict and asks the user to select the latest version.

Historical mention tokens open the exact version referenced by the original message. File cards open the current version unless the card itself represents a historical version result.

### 14.4 Model History

The current request receives exact source bytes only for its authorized mention rows. Historical mention rows remain available for retry and audit reconstruction, but old artifact bodies are not automatically re-injected into every later turn.

Model history represents mention labels structurally and keeps normal conversation prose. Retry reloads the exact original request message and exact mentioned versions through `requestMessageId`.

## 15. Streaming and Lifecycle

The artifact protocol must support single and Compare output with generation-scoped identity.

Every event includes:

- generation ID;
- model ID;
- artifact kind;
- operation type;
- optional comparison-run ID;
- optional source artifact/version ID;
- real lifecycle payload for that event.

Terminal creation events include:

- artifact ID;
- version ID and number;
- attachment descriptor;
- title;
- creator model IDs;
- summary;
- message and conversation IDs.

Allowed visible lifecycle phases map to real state only:

| Phase | Real signal |
|---|---|
| `preparing` | Request authorized and generation accepted |
| `generating` | First real output delta or detected real section |
| `validating` | Profile validation has started |
| `saving` | Canonical bytes are being finalized to R2 and PostgreSQL |
| `completed` | R2 write and database transaction committed |
| `failed` | Terminal generation or finalization failure |
| `cancelled` | Abort won the terminal-state transition |

No timers generate fake phase changes. A server completion barrier waits for all Compare generation promises and derives comparison status from terminal results. The existing fixed-delay finalization pattern must not be reused.

## 16. Canvas UI

### 16.1 Desktop Layout

The conversation route becomes:

```text
WorkspaceShell main
  -> conversation work area
       -> ChatPane, about 55 percent
            -> existing chat scroll owner
            -> existing Composer overlay
       -> hairline separator
       -> ArtifactCanvas, about 45 percent
            -> tab strip
            -> artifact header
            -> independent preview scroll owner
```

The split is implemented inside `/chat/$conversationId`, not as a new application shell. The existing sidebar remains fixed in the same shell. `ChatPane` owns the current relative positioning context so the Composer never spans under Canvas.

When Canvas closes, ChatPane returns to the existing normal width. Neither pane can cause page-level horizontal overflow.

### 16.2 Responsive Layout

On a narrow tablet or mobile viewport, the system does not render a cramped split. Canvas takes the main workspace width and provides `Kembali ke chat`. Chat remains mounted but visually inactive so Composer draft, streaming state, and scroll state are preserved.

Opening an artifact on mobile switches to Canvas. Closing or going back returns to chat. The mobile sidebar remains independent.

### 16.3 Tab State

Conversation-route UI state is explicit and separate from model or skill preferences:

```ts
openArtifactIds: string[]
activeArtifactId: string | null
activeVersionByArtifactId: Record<string, string>
isArtifactPanelOpen: boolean
```

Tab state is ephemeral. Refresh does not automatically reopen tabs. Persisted file cards and artifact metadata allow any historical artifact to be opened again immediately.

Tab behavior:

- opening an already-open artifact focuses its existing tab;
- opening a new artifact appends one tab and selects it;
- switching tabs does not reload metadata already cached by TanStack Query;
- each `artifactId + versionId` retains its own preview scroll position during the mounted conversation session;
- closing a tab selects a neighboring tab;
- closing the last tab closes Canvas;
- closing Canvas does not delete artifacts or versions;
- changing conversation clears open-tab state.

### 16.4 Artifact Header

The active header shows:

- version-specific title and filename;
- `vN` and latest state;
- creating model display resolved through the canonical model catalog;
- version selector;
- Copy;
- Download;
- `Tambahkan ke context`;
- `Revisi di chat` when the selected version is current;
- close-tab and close-panel controls.

Model names, artifact metadata, and version numbers come from persisted data and the model catalog. They are never hardcoded in the component.

### 16.5 File Cards and Compare Results

A file card has two separate hit targets:

- clicking the card/name opens or focuses Canvas;
- clicking Download starts the existing attachment download and does not open Canvas.

Compare artifact results expose one file card per successful model and preserve failed model states. They also provide `Buka semua` for successful artifacts. Tab labels stay compact while retaining accessible full labels that include artifact title and model.

After a successful revision, Canvas opens or focuses the resulting artifact and selects its newest version. Compare forks can be opened together as separate tabs.

## 17. Markdown Preview

Extract the duplicated Markdown renderer into a shared `MarkdownContent` component used by normal messages, Compare model columns, and Canvas.

Required rendering:

- headings;
- paragraphs;
- bold and italic text;
- bullet and numbered lists;
- fenced and inline code;
- tables;
- blockquotes;
- links;
- GFM task lists.

Use `react-markdown`, the existing sanitization and highlighting pipeline, and an explicitly declared GFM plugin. Raw HTML remains disabled or sanitized and no model-produced script executes.

The current pipeline does not include Mermaid rendering. Mermaid fences therefore render as safe code blocks in this scope. The code-block boundary must remain isolated so a later diagram renderer can catch and localize invalid Mermaid syntax without changing artifact persistence or crashing the whole preview.

Copy uses the exact fetched Markdown source. Download uses the exact version attachment.

## 18. Composer Artifact Mention UX

### 18.1 Picker

Typing `@` in the existing textarea opens a conversation-scoped picker above the Composer. The query after the active `@` filters case-insensitively by:

- artifact title;
- current filename;
- artifact kind;
- creator model display metadata.

The picker never lists artifacts from another conversation. An empty result renders a concise unavailable state.

Keyboard behavior:

- Arrow Down and Arrow Up change the active result;
- Enter selects the active result;
- Escape closes the picker without changing mentions;
- mouse and touch selection remain available;
- Backspace at an empty draft boundary removes the last chip;
- normal Enter submission remains unchanged when the picker is closed.

### 18.2 Chip Tray

Selecting a result removes the active `@query` fragment from the draft and adds a structured chip above the textarea. The textarea remains a native textarea; this scope does not replace it with `contenteditable`.

Each chip retains:

- exact artifact ID;
- exact version ID;
- server-provided title;
- artifact kind;
- version number;
- Context or Revise mode.

Long labels truncate visually while retaining full accessible text and metadata. A selected artifact cannot be added twice. The user can remove a chip or switch its mode.

### 18.3 Historical Mentions

Hydrated user messages render persisted mention tokens separately from plain prompt text. Clicking a historical token opens or focuses the referenced artifact and exact version in Canvas. Missing artifacts render a safe unavailable state instead of leaking an API or database error.

## 19. Error Semantics

### 19.1 Preview

An artifact content failure replaces only the active preview body with a recoverable error and Retry. Tabs, version selection, chat, Composer, and cached previews remain usable.

Changing artifact/version aborts the obsolete content request. A failed Download does not clear a successfully loaded preview.

### 19.2 Creation and Revision

- Invalid model output creates no artifact version.
- R2 failure creates no attachment/version and leaves an existing current version untouched.
- Database failure after R2 write triggers compensating object deletion.
- Stale finalization creates no version and leaves the current pointer unchanged.
- Failed revision preserves every previous version.
- Failed Compare generations do not remove successful sibling artifacts.

### 19.3 Mentions

- Missing, deleted, cross-conversation, or unauthorized mentions fail preflight.
- Raw storage and database errors are mapped to project error codes and safe user messages.
- Context-source read failures do not silently substitute `generation_runs.content` or `attachments.extractedText`.

### 19.4 Conversation Deletion

Artifact lifecycle follows its conversation. Conversation deletion must collect all attachment keys before deleting database metadata and delete the corresponding persisted-bucket objects through the R2 adapter.

Without a durable queue in the locked architecture, deletion is synchronous and idempotent. Any object-deletion failure fails the operation and retains database locators so deletion can be retried. Already deleted R2 keys are safe to delete again. Database conversation deletion occurs only after all object deletions report success.

## 20. Security and Privacy

- 9Router, R2, database, and provider credentials remain server-only.
- Artifact and mention IDs are untrusted client input.
- Every content, list, download, revision, and mention boundary validates ownership.
- Markdown and model output are untrusted content.
- Raw HTML, script, unsafe URL schemes, and executable directives are not rendered.
- Logs include IDs, kind, byte size, status, and timing, not raw prompts or artifact bodies.
- The existing Compare request logging of full payloads must not be reused and should be removed when that boundary is touched.
- Artifact list APIs never expose R2 key, bucket, extracted text, or full generation content.
- No client path receives router credentials or direct R2 access credentials.

## 21. Observability

Record structured metadata for:

- artifact operation type;
- artifact kind;
- generation, comparison, artifact, source-version, and output-version IDs;
- internal and resolved model IDs;
- byte size;
- version number;
- lifecycle status;
- validation and safe error code;
- latency, time to first token, usage, and finalization duration;
- number of context and revision mentions;
- fork fan-out counts.

Never log prompt text, Markdown content, file bytes, or private document extracts by default.

## 22. Testing Strategy

Tests assert deterministic contracts and behavior. They do not assert AI prose, exact class names, Tailwind utilities, HTML snapshots, palette values, font values, anchor markup, or stochastic output.

### 22.1 Unit Tests

- Zod artifact-operation and mention validation;
- maximum mention count and duplicate rejection;
- artifact kind/profile registry consistency;
- Checklist JSON-to-Markdown canonicalization;
- tab open, dedupe, switch, close, active-version, and scroll-key state reducers;
- mention query extraction, search ranking, keyboard navigation, selection, and removal;
- version transition and Compare fork planning;
- SSE variant validation and partial-frame parsing;
- message hydration for artifacts, Compare artifacts, and historical mentions;
- shared Markdown sanitization and GFM behavior;
- no-version behavior for Context-only mentions.

### 22.2 Integration Tests

- owner-authorized artifact list and exact-version reads;
- rejection of cross-user and cross-conversation artifact/version IDs;
- exact R2 bytes equal preview bytes and download bytes;
- content hash generation and legacy lazy hash initialization;
- atomic artifact version 1 finalization;
- successful v1 to v2 revision with immutable v1;
- stale-version conflict with no current-pointer change;
- R2 and database failure compensation;
- conservative and idempotent legacy backfill;
- persisted message mentions and exact retry reconstruction;
- Context-only requests do not create versions;
- single multi-target partial failure;
- Compare creation produces one artifact per model;
- N target x M model fork identity and lineage;
- one failed Compare model leaves other artifacts usable;
- generation-scoped cancellation and refunds;
- attachment list redaction;
- artifact-backed generic attachment deletion rejection;
- conversation deletion removes R2 objects before database rows.

### 22.3 End-to-End Tests

Use the real application route and deterministic mocked model streams where required:

1. Generate and open a PRD.
2. Download the same PRD file.
3. Generate and open an Agent Skill.
4. Generate and open a Checklist artifact.
5. Open several artifacts, switch tabs, and close tabs.
6. Revise an artifact from v1 to v2 and inspect v1 again.
7. Refresh the conversation and reopen persisted artifacts.
8. Generate artifacts with four Compare models and open all successful results.
9. Fail one Compare model while other artifact results remain usable.
10. Open Canvas on desktop without losing chat or Composer behavior.
11. Open Canvas on mobile and return to chat without losing the draft.
12. Scroll chat and Canvas independently.
13. Type `@`, search, navigate by keyboard, select, and remove a mention.
14. Submit multiple Context mentions without creating versions.
15. Submit one or more Revise mentions and verify only the exact targets change or fork.
16. Verify an open Canvas artifact is not implicitly submitted.
17. Click a historical mention to open its exact version.
18. Reject an unauthorized structured mention.
19. Verify normal single and Compare chat regression paths.

## 23. Implementation Order

Implementation follows two dependent phases with atomic verified commits.

### Phase A: Artifact Core and Canvas

1. Repair dependency declarations and extract shared sanitized Markdown rendering.
2. Add artifact/version schema, constraints, migration, and conservative backfill.
3. Add safe artifact repositories, list/detail/content APIs, and R2 bucket-aware reads.
4. Make PRD and Agent Skill finalization create artifact version 1.
5. Add the Checklist artifact profile and change new Checklist output to artifact mode.
6. Add same-lineage single-model revisions and conflict-safe finalization.
7. Add Compare artifact creation and revision forks with a real completion barrier.
8. Add file-card open behavior, Canvas layout, tabs, header, version selector, preview, Copy, Download, and responsive mode.
9. Harden attachment DTOs and conversation/R2 cleanup.

### Phase B: Artifact Mention

1. Add message-mention schema and safe hydration DTOs.
2. Add structured mention inputs to chat and artifact boundaries.
3. Add exact context loading and deterministic Context/Revise dispatch.
4. Add Composer picker, search, keyboard behavior, chip tray, and mode controls.
5. Add Canvas-to-Composer explicit actions.
6. Add historical mention tokens and exact-version Canvas focus.
7. Complete cross-feature integration and E2E regression coverage.

Every commit runs affected tests, TypeScript, Biome, and the forbidden type-bypass scan. The final gate additionally runs the full Vitest suite, Playwright suite, production build, and browser review on desktop and mobile.

## 24. Acceptance Criteria

The feature is complete only when all these statements are true:

1. File-card click opens Canvas and does not download.
2. Download remains a separate action and returns exact stored Markdown bytes.
3. Chat remains usable while Canvas is open on desktop.
4. Chat and Canvas scroll independently.
5. The Composer remains inside the chat pane and does not sit under Canvas.
6. Opening the same artifact focuses one existing tab.
7. Multiple artifacts switch without reload or unexpected scroll loss.
8. PRD, Agent Skill, and new Checklist artifacts render as sanitized Markdown.
9. Tables and task lists render through GFM support.
10. Mermaid fences remain safe code blocks in this scope.
11. Artifact versions are immutable and old versions remain viewable/downloadable.
12. A successful single revision advances the same artifact to the next version.
13. A failed or stale revision leaves the current and old versions unchanged.
14. Compare creation produces an independent artifact for every successful model.
15. Compare revision produces independent forks for every successful target/model pair.
16. One Compare failure does not block sibling artifacts.
17. Refresh preserves file cards, artifact history, version reads, downloads, and historical mention tokens.
18. Typing `@` opens an authorized conversation artifact picker.
19. Mention search is case-insensitive across approved metadata.
20. Mention chips carry exact artifact/version IDs and are not plain-text references.
21. Up to four unique mentions can be sent.
22. Context mentions never create versions.
23. Revise mentions target exact current versions.
24. Canvas state never becomes implicit AI context.
25. Historical mention click opens its exact version without duplicating a tab.
26. Unauthorized artifact or version IDs fail before credits or persistence side effects.
27. Artifact-backed attachments cannot be removed through generic attachment deletion.
28. Conversation deletion cleans up its R2 objects before database deletion.
29. Normal chat and text Compare Mode remain functional.
30. Typecheck, Biome, relevant tests, full Vitest, Playwright, build, and type-bypass scan pass before push.
