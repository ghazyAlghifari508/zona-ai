# Agent Skill Markdown Artifact - Design Spec

> **Status:** Draft for user review
> **Date:** 2026-09-06
> **Scope:** Upgrade the existing `agent-skill` preset into a single-model, server-generated Markdown artifact workflow with structural validation, durable attachment persistence, a concise chat summary, real progress states, and authenticated download. Preserve normal chat, Compare Mode text generation, uploads, checklist, and existing PRD behavior.

---

## 1. Goal

When a user selects `Agent Skill`, Zona.ai must create a reusable instruction document for an AI coding agent, not render the model's complete Markdown as ordinary chat prose.

The completed response has two persisted parts:

1. A concise assistant summary describing the skill's name, purpose, and major areas.
2. One real UTF-8 Markdown file named from the validated skill slug, for example `frontend-design.md`, linked to the assistant message and downloadable through Zona.ai's authenticated attachment endpoint.

The full Markdown source is generated and validated on the server. The browser never scrapes rendered chat, constructs a temporary `Blob`, or fabricates an attachment card.

## 2. Approved Product Decisions

| Decision | Value |
|---|---|
| Filename convention | `<frontmatter-name>.md`, for example `frontend-design.md` |
| Skill dialect | Portable across coding agents; no vendor-specific metadata is required |
| Required frontmatter | `name` and `description` |
| Optional frontmatter | `license` plus other YAML-safe extension metadata, only when supplied or relevant to the user's request |
| Body language | Follow the language of the user's request; the slug remains ASCII |
| Chat response | Deterministic short summary plus one file card; never duplicate the complete file in chat |
| Compare Mode | Unsupported for Agent Skill artifacts in this phase; guard in both UI and server |
| Follow-up context | Server-side model history can use completed artifact source so the user can revise the generated skill later |
| Persistence | Reuse R2 plus the existing `attachments` table; no database migration in this phase |
| Installation | Out of scope; generated skills are downloadable untrusted documents and are never auto-installed or executed |
| Theme | Zona.ai remains light-only per `DESIGN.md`; this feature does not introduce dark mode |

## 3. Verified Current State

The existing `Agent Skill` option is a normal prompt preset:

```text
SkillSelector (`agent-skill`)
  -> Composer submits `skillId`
  -> normal single/compare chat endpoint
  -> `buildSystemPrompt()` adds one short Agent Skill instruction
  -> model Markdown streams into ordinary assistant content
  -> full Markdown persists in `messages.content`
  -> ReactMarkdown renders it as chat prose
```

There is no Agent Skill-specific output schema, Markdown validation, R2 write, attachment row, artifact progress event, summary/file split, or reload-aware artifact classification.

The existing PRD Plan flow proves the required physical pipeline:

```text
server accumulates model output
  -> validates generated Markdown
  -> creates UTF-8 bytes
  -> writes an R2 object
  -> inserts an attachment linked to the assistant message
  -> stores a short assistant message
  -> emits persisted artifact metadata
  -> client re-fetches PostgreSQL state
  -> FileCard downloads through /api/attachments/$attachmentId
```

That implementation is currently PRD-specific. Its hydration logic treats any assistant `.md` attachment as a PRD, its stream protocol validates only event type names, and its orchestration duplicates normal chat preflight. Adding a second Markdown artifact by copying that flow would preserve these defects and create a third orchestration path.

## 4. Selected Architecture

Extract the PRD vertical slice into a small generated-artifact runner with skill-specific profiles.

```text
                        Canonical skill registry
                         /                    \
             ordinary chat skill       artifact skill profile
                                               |
User request -> artifact server function -> shared artifact runner
                                               |
                    +--------------------------+--------------------------+
                    |                          |                          |
              model preflight          profile generation         finalization
              auth/ownership           prompt + validator         R2 + DB transaction
              model/credits            filename + summary         typed SSE events
                    |                          |                          |
                    +--------------------------+--------------------------+
                                               |
                            persisted summary + attachment descriptor
                                               |
                                  generic progress and file card
```

The shared runner owns mechanics that must be identical for PRD and Agent Skill:

- request authentication and conversation ownership;
- model registry resolution and credit lifecycle;
- user/assistant message and generation-run creation;
- input attachment ownership and context preparation;
- server-side model-output accumulation and byte limits;
- abort and terminal-state coordination;
- typed lifecycle events;
- R2 persistence, DB finalization, and compensation;
- safe artifact metadata returned to the browser.

Each artifact profile owns semantics that must not be generalized blindly:

- canonical `skillId` and artifact kind;
- generation prompt;
- content normalization and structural validator;
- filename builder;
- summary builder;
- progress labels or genuine section markers;
- input context and web-search policy;
- Compare Mode eligibility.

Agent Skill and PRD remain distinct profiles. Agent Skill validation must never reuse PRD headings or marker rules.

## 5. Canonical Skill Registry

Skill definitions are currently repeated across the selector, settings, Zod schemas, prompts, and Compare Mode guards. Introduce one typed skill registry in the chat domain.

Each entry contains only stable product metadata:

```ts
type SkillOutputMode = 'chat' | 'artifact'

type SkillDefinition = {
  id: SkillId
  label: string
  description: string
  placeholder: string
  outputMode: SkillOutputMode
  supportsCompare: boolean
  artifactKind?: ArtifactKind
}
```

The registry provides:

- `SKILL_IDS` for the shared Zod enum;
- selector and settings options;
- `isArtifactSkill(skillId)` for dispatch and server guards;
- `supportsCompare` for UI and server validation;
- artifact-kind lookup without filename or MIME heuristics.

The registry does not contain model IDs, provider IDs, R2 configuration, or generation logic.

## 6. Agent Skill Document Contract

### 6.1 Model output

The Agent Skill profile instructs the selected model to return exactly one Markdown document. It must not include a preamble, explanatory chat response, JSON wrapper, or trailing commentary.

Canonical shape:

```markdown
---
name: frontend-design
description: Use when creating distinctive visual direction, typography, and interface styling.
---

# Frontend Design

## When to Use
...

## Principles
...

## Process
...

## Constraints
...

## Anti-patterns
...

## Verification Checklist
...
```

The headings above are illustrative, not a fixed template. The prompt requires the model to adapt the document to the domain:

- a TDD skill centers decision rules around red, green, refactor, test boundaries, and failure confirmation;
- a debugging skill centers evidence gathering, hypothesis testing, isolation, and verification;
- a database migration skill centers compatibility, locking, rollback, data integrity, and deployment sequencing;
- a frontend design skill centers visual direction, typography, hierarchy, critique, implementation constraints, and anti-generic checks.

The document should consider purpose, usage boundaries, principles, workflow, constraints, examples when useful, anti-patterns, and verification. It may combine, rename, reorder, or omit sections when the domain makes another structure clearer.

### 6.2 Frontmatter

The final persisted frontmatter is a YAML mapping with:

- `name`: required, canonical lowercase ASCII slug;
- `description`: required, concise instruction describing when the skill should be invoked;
- `license`: optional non-empty string;
- additional metadata: optional, preserved only when it uses YAML-safe values and was relevant to the user's request.

The portable profile does not require vendor-specific keys, but validation does not reject an otherwise valid skill merely because the user requested compatible extension metadata. Additional keys must use slug-style names, must not duplicate required keys with alternate casing, and must contain JSON-compatible scalar, array, or mapping values without YAML custom tags. The generation prompt instructs the model to omit optional metadata unless it follows from the user's request. The server never invents a license value.

The server parses YAML with a standards-compliant YAML parser, validates it with Zod, normalizes `name` to a safe slug, and serializes canonical frontmatter back into the final file. A name that cannot produce a non-empty ASCII slug is invalid.

### 6.3 Structural quality validation

Validation is intentionally structural and moderate. It prevents empty or shallow artifacts without forcing exact prose or a universal section template.

Named constants in the artifact domain define these limits:

| Invariant | Value |
|---|---:|
| Minimum Markdown body length, excluding frontmatter | 600 Unicode characters |
| Minimum substantive H2 sections | 3 |
| Required H1 count | Exactly 1 |
| Maximum final UTF-8 artifact size | 64 KiB |
| Maximum slug length | 64 characters |
| Maximum description length | 500 characters |

A substantive H2 section contains at least one non-empty paragraph, list item, or code block before the next H2. No exact section name or wording is required.

The normalizer may safely:

- remove a UTF-8 BOM;
- normalize CRLF/CR to LF;
- remove one outer Markdown code fence only when it wraps the complete document;
- trim trailing whitespace;
- ensure exactly one final newline;
- canonicalize validated frontmatter and slug.

It must reject:

- empty output or whitespace-only output;
- malformed, non-mapping, duplicate, or missing frontmatter;
- missing/invalid required metadata;
- an empty slug after normalization;
- no H1, multiple H1 headings, or too few substantive sections;
- output below the minimum body length;
- truncated or oversized output;
- prose outside the single Markdown document;
- provider failures that do not satisfy the document contract.

Validation failure creates no attachment and never persists an empty file.

## 7. Summary Contract

The chat summary is generated deterministically from the validated document. It does not require a second model call and is never scraped from rendered DOM.

Summary inputs:

- display name from the single H1;
- purpose from frontmatter `description`;
- the first three to five substantive H2 headings, stripped of inline Markdown/HTML and length-bounded.

Summary shape:

```text
Skill `<display name>` selesai dibuat.

Tujuan: <frontmatter description>

Isinya mencakup:
- <section heading>
- <section heading>
- <section heading>
```

The summary has a bounded length, contains no full section bodies, and uses Zona.ai's current Indonesian product voice. Headings and description remain in the artifact's language, so an English request may produce English content inside the Indonesian UI wrapper.

The same summary string is:

- persisted to `messages.content`;
- included in the post-persistence completion event for immediate optimistic rendering;
- returned after conversation reload.

The complete Markdown remains outside chat prose.

## 8. Request Dispatch and Compare Policy

Add an artifact-specific request schema derived from the existing chat request fields but narrowed to supported artifact skills:

```ts
skillId: 'prd-plan' | 'agent-skill'
```

Single-model dispatch becomes:

```text
skill.outputMode === 'artifact'
  -> generateArtifact(...)

otherwise
  -> sendMessage(...)
```

Trust-boundary rules:

- the normal chat core rejects artifact skill IDs instead of silently returning raw artifact text;
- the artifact core rejects ordinary chat skill IDs instead of silently choosing PRD behavior;
- Compare Mode rejects every skill whose registry entry has `supportsCompare: false`;
- the selector disables Agent Skill and PRD Plan while Compare Mode is active;
- enabling Compare Mode while either artifact skill is selected resets the selection to `none` and displays the existing clear validation pattern;
- home-to-conversation pending state preserves the selected artifact skill and follows the same dispatch after navigation.

No artifact events are added to the multiplex Compare protocol in this phase. Zona.ai never silently creates one file per compared model.

## 9. Server Generation Lifecycle

### 9.1 Real phases

The shared artifact protocol uses only phases backed by actual server events:

```text
preparing
  -> generating
  -> validating
  -> creating_file
  -> completed

or any non-terminal phase -> error
or any cancellable phase  -> cancelled
```

Phase boundaries:

- `preparing`: request accepted; auth, ownership, request validation, model resolution, and generation records are being prepared;
- `generating`: the model stream has been obtained and the server is consuming real deltas;
- `validating`: the provider stream ended and the profile normalizer/validator is processing the complete source;
- `creating_file`: validation passed and the server is persisting UTF-8 bytes plus metadata;
- `completed`: R2 and the DB transaction have succeeded;
- `error`: a typed failure won the terminal transition;
- `cancelled`: an authorized cancellation won the terminal transition.

There are no timers, percentages, rotating fake steps, or inferred provider reasoning.

### 9.2 Typed events

Replace PRD-only event casts with Zod-discriminated artifact event schemas. Every event carries:

- `type`;
- `generationId`;
- `artifactKind`;
- phase-specific validated fields.

The protocol includes:

- `artifact-status` with a valid phase and optional profile-owned section key;
- `artifact-created` with summary plus a validated attachment descriptor;
- `artifact-error` with a safe error code and retryability flag;
- `artifact-done` with the final terminal status.

The attachment descriptor contains only:

```ts
{
  kind: ArtifactKind
  attachmentId: string
  fileName: string
  fileSize: number
  mimeType: string
}
```

It never exposes `r2Key`, bucket, extracted source, user ID, or provider payload.

The client parser retains incomplete SSE frames between network chunks and ignores no malformed event silently. An invalid event terminates the local artifact request with a recoverable protocol error and then re-fetches persisted state.

### 9.3 Output accumulation

Raw model deltas are consumed on the server and are not forwarded as chat text. The runner tracks UTF-8 byte size while accumulating. It aborts and fails before persistence when the configured maximum is exceeded, then enforces the limit again after normalization.

The Agent Skill profile uses a dedicated system prompt rather than the ordinary chat base prompt's fixed Indonesian response rule. It instructs the model to infer the request language and write the document body in that language while preserving ASCII slug metadata.

Input attachments retain the existing ownership and RAG validation path. Web search is used only when the user explicitly enabled it and the profile allows it; results remain untrusted context and citations are not fabricated. Existing PRD context behavior must remain unchanged during extraction.

## 10. Durable File Finalization

After profile validation succeeds:

1. Build `fileName` as `${validatedFrontmatter.name}.md`.
2. Encode canonical Markdown with `Buffer.from(markdown, 'utf8')`.
3. Derive `fileSize` from the actual buffer length.
4. Generate a server-owned attachment UUID and user-scoped R2 key.
5. Upload with content type `text/markdown` through the existing R2 adapter.
6. In one database transaction:
   - insert the `attachments` row linked to the persisted assistant message;
   - set `processingStatus` to `completed`;
   - store canonical source in `attachments.extractedText`;
   - persist deterministic summary in `messages.content`;
   - persist canonical source and final usage/timing in `generation_runs`;
   - complete the generation's guarded terminal transition and usage record.
7. Emit `artifact-created` and `completed` only after the transaction commits.

The attachment record uses:

```text
userId           authenticated session user
conversationId   authorized conversation
messageId        persisted assistant message
fileName         validated <slug>.md
fileSize         actual UTF-8 byte length
mimeType         text/markdown
r2Key            server-generated user-scoped key
r2Bucket         validated server configuration
processingStatus completed
extractedText    canonical Markdown source
```

R2 and PostgreSQL cannot share one transaction. If the R2 upload succeeds and DB finalization fails, the runner performs best-effort compensating `deleteObject`. Cleanup failure is recorded as a structured server error without logging source content or secrets; no successful artifact event is emitted.

Terminal state transitions are monotonic. Completion, failure, and cancellation race through a guarded update so only one path may finalize usage or refund credits. A losing path cannot overwrite a terminal status or issue a second refund.

## 11. Persistence, Hydration, and Follow-up Context

### 11.1 Reload classification

Do not infer artifact kind from `.md` or `text/markdown`.

For a single-model assistant message, hydration uses its generation run's `skillId` and the attachment linked to the same message:

```text
skillId === 'prd-plan'    -> kind: 'prd'
skillId === 'agent-skill' -> kind: 'agent-skill'
otherwise                 -> ordinary attachment/message behavior
```

This makes existing PRD attachments reload correctly and prevents `frontend-design.md` from being labeled as a PRD. Historical Agent Skill responses that have no attachment remain ordinary Markdown chat messages; no data migration rewrites old conversations.

The client message shape replaces PRD-only attachment fields with one optional generated artifact descriptor. This phase supports exactly one generated artifact per assistant message. Database support for multiple attachments does not imply a new multi-artifact UI.

### 11.2 Browser payload

Conversation hydration returns the summary, run metadata required by the UI, and safe attachment descriptors. For completed artifact runs, it does not return `generation_runs.content` to the browser. Ordinary single and Compare text generations retain their existing content behavior.

The browser therefore cannot accidentally render or copy the full skill source from message state. The downloadable object remains the complete source of truth presented to the user.

### 11.3 Server-side model history

Follow-up generation history is built on the server. For completed artifact assistant messages, it uses the latest completed artifact generation's canonical `generation_runs.content` instead of the short `messages.content` summary.

Artifact source participates in a named per-request byte budget. Newest completed artifacts are selected first; older artifact messages fall back to their summaries when the budget is exhausted. Included messages are restored to chronological order before calling the model. This preserves common follow-ups such as "revise the constraints in the previous skill" without allowing an unbounded series of artifacts to consume the model context.

The initial budget is 64 KiB and lives in shared artifact constants, not inline orchestration code.

## 12. UI

### 12.1 Progress

Replace the PRD-only progress shell with a generic `ArtifactProgress` that receives real phase data and profile-specific labels.

Agent Skill labels map to actual phases:

| Phase | Label intent |
|---|---|
| `preparing` | Menyiapkan skill |
| `generating` | Menulis instruksi |
| `validating` | Memvalidasi format |
| `creating_file` | Menyiapkan file Markdown |

The component uses the existing restrained chat visual language: paper/white surfaces, hairline borders, neutral text, and a Lucide loading icon. It introduces no emoji, heavy shadows, neon, glassmorphism, percentages, or fake timed animation.

### 12.2 Completed response

After durable completion, `MessageList` renders:

1. The normal concise assistant summary.
2. A generic `FileCard` for the persisted attachment.

The card displays:

- `fileName`;
- type label derived from validated MIME (`Markdown` for `text/markdown`);
- formatted real `fileSize`;
- an accessible Download action using a Lucide icon.

It does not contain the complete Markdown source, a client-generated URL, or fake metadata.

The same card is reconstructed after refresh and after navigating away and reopening the conversation.

### 12.3 Download

Reuse the authenticated attachment route. The FileCard requests a download disposition explicitly so image-preview behavior on the same endpoint remains inline.

The download response must:

- authenticate the current user;
- verify attachment ownership;
- read only the persisted server-owned R2 key;
- return the exact UTF-8 bytes;
- use `text/markdown; charset=utf-8`;
- set a safe attachment filename matching the stored slug filename;
- provide `Content-Length` and `X-Content-Type-Options: nosniff`;
- never expose R2 credentials or a public bucket URL.

## 13. Error, Cancellation, and Retry

Failure categories include:

- invalid request or unsupported artifact skill;
- unauthorized conversation or attachment;
- insufficient credits/rate limit;
- model/provider failure;
- cancellation;
- oversized or structurally invalid generated content;
- R2 write failure;
- database finalization failure;
- malformed artifact stream event.

For every failure before durable completion:

- no empty attachment row is created;
- no completed file card is shown;
- raw provider error text is not persisted as Markdown;
- generation terminal state and safe error code are persisted;
- credit refund follows the guarded existing policy exactly once;
- the UI shows a recoverable error or cancellation state.

Cancellation must verify generation ownership through its message/conversation relationship before touching the abort registry or database. Knowing a generation UUID is never sufficient authorization.

Retry resolves the original generation's `skillId`. Retrying an Agent Skill or PRD artifact calls the artifact runner with the same profile; it never falls back to generic chat text. A successful retry creates the one real attachment for that assistant response and follows the same validation/finalization path.

## 14. Tests

Tests follow `AGENTS.md`: assert deterministic schemas, transitions, persistence, authorization, and file boundaries. They do not assert stochastic model wording, exact UI copy, class names, HTML structure, anchor attributes, palette values, or generated source snapshots.

### 14.1 Unit tests

Agent Skill document contract:

- valid frontend-oriented and TDD-oriented fixtures both pass despite different section names/order;
- valid ambiguous-purpose fixture passes the same structural contract;
- YAML mapping requires `name` and `description`;
- optional `license` and requested YAML-safe extension metadata are accepted;
- custom YAML tags, aliases beyond the parser's bounded safety limit, and duplicate keys are rejected;
- name canonicalizes to an ASCII slug and produces `<slug>.md`;
- missing/multiple H1, too few substantive H2 sections, short body, malformed YAML, full prose wrapper, and oversized bytes fail;
- one complete outer code fence and newline/BOM normalization produce canonical Markdown;
- summary output contains required structured fields and a bounded set of section labels without section bodies.

Artifact stream contract:

- every event variant requires valid `generationId`, `artifactKind`, phase, and descriptor fields;
- malformed or partial payloads fail Zod parsing;
- terminal transitions cannot return to a non-terminal phase;
- SSE parser retains partial frames across chunks.

Hydration/history:

- `agent-skill` plus Markdown attachment hydrates as Agent Skill, not PRD;
- `prd-plan` remains PRD;
- historical Agent Skill text without an attachment remains ordinary chat content;
- artifact run content is redacted from browser DTOs;
- server history substitutes completed artifact source within the byte budget and falls back to summaries beyond it.

### 14.2 Integration tests

With deterministic model/R2 adapters:

- a valid Agent Skill request writes exact canonical UTF-8 bytes to R2;
- attachment metadata has the real filename, MIME, byte size, owner, conversation, and assistant-message link;
- assistant message stores only the deterministic summary;
- generation run stores full canonical source;
- completion event occurs only after persistence succeeds;
- invalid generated output creates no attachment and follows one terminal refund path;
- R2 failure creates no attachment;
- DB failure after R2 success invokes compensating object deletion;
- owner download returns exact bytes and safe headers; another user is denied;
- crafted normal-chat and Compare requests with an artifact skill fail closed;
- stop/retry require ownership and preserve artifact semantics.

### 14.3 E2E and manual quality checks

Playwright journeys run against deterministic provider output and real application routes:

1. Select Agent Skill, submit a frontend-design request, wait for real completion, observe summary and file card, download the file.
2. Reload the conversation and confirm the same persisted attachment remains available.
3. Navigate away, reopen the conversation, and download again.
4. Exercise a generation failure and confirm no empty file card appears.
5. Verify the journey at project mobile and desktop viewports using role/state assertions.
6. Enable Compare Mode and confirm Agent Skill cannot be submitted; call the server directly and confirm it rejects the mode.

Actual model quality remains a live/manual acceptance gate because stochastic prose is prohibited in automated assertions. Smoke prompts:

- `Buatkan skill untuk frontend design`
- `Buat skill untuk test-driven development`
- one short ambiguous skill request

Review that each live artifact is actionable, domain-adapted, non-shallow, and free of filler. Do not turn those prose judgments into brittle unit snapshots.

Dark-mode E2E is not added: `DESIGN.md` explicitly locks Zona.ai to a light editorial theme and forbids generic dark mode. The new UI is verified against the existing light theme only.

### 14.4 Regression gates

- normal single-model chat streaming;
- checklist rendering;
- existing PRD artifact generation, reload, and download;
- ordinary Compare Mode streaming and partial failures;
- user upload, attachment ownership, RAG, and image preview;
- TypeScript, Biome, Vitest unit/integration, affected Playwright journeys, and forbidden type-bypass scan.

## 15. Expected Code Boundaries

Exact file changes are finalized in the implementation plan after current-library documentation is checked. Expected domains are:

- `src/lib/chat/`: canonical skill definitions and predicates;
- `src/lib/ai/`: generic artifact event schemas, Agent Skill profile, normalization/validation, summary, limits;
- `src/server/core/`: shared artifact orchestration and server-side history assembly;
- `src/server/functions/`: narrowed artifact server function and trust-boundary validation;
- `src/lib/utils/conversation-hydration.ts`: explicit skill-based artifact classification and browser redaction;
- `src/components/chat/`: generic progress/card/message rendering and Compare Mode selector guard;
- `src/routes/chat/$conversationId.tsx`: artifact dispatch and typed SSE reducer;
- `tests/unit`, `tests/integration`, `tests/e2e`: deterministic coverage described above.

The existing `attachments` and `generation_runs` schema is sufficient. No migration or new storage provider is introduced.

## 16. Compatibility and Rollout

- Existing PRD files continue to use their current filename/profile and remain downloadable.
- Existing Agent Skill responses already stored as chat Markdown remain readable as ordinary historical messages.
- New Agent Skill submissions use artifact generation exclusively.
- No object is backfilled and no historical message is rewritten.
- No client-side artifact cache becomes a source of truth; every completion re-fetches persisted conversation state.
- The implementation lands in atomic, verified commits: contracts/validators, shared runner, persistence/hydration, client UI, Compare/retry guards, and tests.

## 17. Non-goals

- Agent Skill installation, activation, registry publishing, or execution;
- editing the file in-browser;
- artifact version history or diff UI;
- multiple generated files per assistant message;
- Agent Skill artifacts in Compare Mode;
- arbitrary binary/code archive generation;
- public sharing or unauthenticated download;
- new queue, worker, Redis, microservice, or storage provider;
- dark mode;
- retroactive conversion of old chat responses into attachments.

## 18. Acceptance Criteria

The feature is complete when:

1. Selecting Agent Skill in single-model mode always routes to the artifact endpoint.
2. Valid model output becomes one canonical portable Markdown file named `<slug>.md`.
3. The file has valid YAML frontmatter, one H1, several substantive domain-adapted sections, and passes moderate structural validation.
4. The assistant message contains a concise summary, not the complete Markdown.
5. The attachment is linked to the assistant message, stored in R2, and survives refresh/navigation/reopen.
6. Download returns authorized, intact UTF-8 Markdown with the correct filename, MIME, and byte size.
7. Progress reflects only real lifecycle transitions.
8. Invalid/provider/storage/database failures produce no empty artifact and expose a proper recoverable state.
9. Retry preserves artifact behavior and cancellation enforces ownership.
10. Agent Skill is disabled in Compare Mode in both UI and server.
11. Follow-up requests can use completed artifact source server-side within the configured context budget.
12. Existing PRD, normal chat, checklist, compare, upload, RAG, and download flows remain operational.
13. All required typecheck, lint, deterministic tests, E2E journeys, and type-bypass scans pass.
