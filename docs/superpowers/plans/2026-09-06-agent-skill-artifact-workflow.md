# Agent Skill Markdown Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `agent-skill` from raw chat prose into a single-model server-generated Markdown artifact with structural validation, R2 attachment persistence, deterministic summary, real progress phases, authenticated download, and Compare Mode guards.

**Architecture:** Extract the PRD vertical slice into a shared artifact runner (`src/server/core/artifacts.ts`) driven by per-skill profiles; add a canonical skill registry, a Zod-discriminated artifact SSE protocol, an Agent Skill document profile library, skillId-based hydration, generic progress/card UI, and fail-closed guards. No DB migration; `generation_runs.skill_id` is the discriminator.

**Tech Stack:** TanStack Start + Bun, React 19, AI SDK 7 (`streamText`), Drizzle ORM + PostgreSQL, Cloudflare R2 via `@aws-sdk/client-s3`, Zod 4, `yaml` (new, added in Task 3), Vitest (unit + integration), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-09-06-agent-skill-artifact-design.md` — the plan argues from the spec; executors read both.

## Global Constraints

- `bun x tsc --noEmit` returns 0 errors after every task.
- `bun x biome check` on touched files returns 0 errors (single quotes, semicolons asNeeded, 2-space indent).
- Bypass scan returns 0 hits in `src/`: `rg -n "as never|as any|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts'`.
- Tests assert deterministic mechanical invariants only (schemas, transitions, persistence, auth, bytes). Never assert AI prose, exact UI copy, classNames, markup, or colors.
- Component tests use `fireEvent` + `hasAttribute`/`textContent` patterns from `tests/unit/skill-selector.test.tsx`; no jest-dom matchers (no setupFiles in `vitest.config.ts`).
- Integration tests use `/** @vitest-environment node */`, real PG, and the `vi.mock` seam from `tests/unit/../integration/files.test.ts:9-74` (r2/client, auth/session via `x-test-user` header, `ai` streamText).
- New UI strings use Indonesian product voice; tests assert structure/testids, not copy wording.
- App is light-only per `DESIGN.md`; no dark mode. Icons are Hugeicons monochrome; no emoji in UI.
- Server-only modules start with `if (typeof window !== 'undefined') { throw new Error('<path> is server-only') }`.
- Commit per task with Conventional Commits; stage only intended files; never bundle unrelated work.

---

## File Structure

New files and their single responsibility:

- `src/lib/chat/skills.ts` — canonical skill registry: ids, labels, `outputMode`, `supportsCompare`, artifact kind. Client-safe pure data.
- `src/lib/ai/artifact-stream.ts` — generic artifact SSE protocol: Zod-discriminated events, encoder, strict parser, frame-buffered client parser.
- `src/lib/ai/agent-skill.ts` — Agent Skill document profile: normalization, YAML frontmatter validation, structural validation, deterministic summary, filename, system prompt, limits.
- `src/server/core/artifacts.ts` — shared runner: preflight, server-side accumulation, validation, R2 + transactional DB finalization with compensation, terminal guard, ownership-checked cancel helper, artifact retry core.
- `src/server/core/artifact-profiles.ts` — profile adapters: `prdProfile` (reuses `prd-artifact.ts` validators) and `agentSkillProfile` (uses `agent-skill.ts`).
- `src/server/core/history.ts` — `buildModelHistory` with artifact-source substitution inside a byte budget.
- `src/components/chat/ArtifactProgress.tsx` — generic real-phase progress shell with per-kind labels.
- `tests/unit/skills.test.ts`, `tests/unit/artifact-stream.test.ts`, `tests/unit/agent-skill.test.ts`, `tests/unit/artifact-finalize.test.ts`, `tests/unit/artifact-progress.test.tsx`, `tests/integration/artifact.test.ts`, `tests/integration/artifact-download.test.ts`, `tests/e2e/agent-skill.spec.ts` — deterministic coverage.

Modified files: `src/lib/utils/validation.ts`, `src/lib/utils/constants.ts`, `src/lib/chat/skill-preference.ts`, `src/components/chat/SkillSelector.tsx`, `src/components/chat/Composer.tsx`, `src/routes/settings.tsx`, `src/server/functions/chat.ts`, `src/server/core/chat.ts`, `src/server/core/messages.ts`, `src/lib/utils/conversation-hydration.ts`, `src/components/chat/MessageList.tsx`, `src/components/chat/FileCard.tsx`, `src/routes/chat/$conversationId.tsx`, `src/server/functions/files.ts`, `src/routes/api/attachments/$attachmentId.tsx`, `src/server/core/prd.ts` (Task 8 only), plus updates to existing tests that assert the replaced contracts.

Deleted at the end (Task 8 only, after migration): `src/lib/ai/prd-stream.ts`, `src/components/chat/PrdProgress.tsx`, `tests/unit/prd-progress.test.tsx`.

---

### Task 1: Canonical skill registry and request schemas

**Files:**
- Create: `src/lib/chat/skills.ts`
- Create: `tests/unit/skills.test.ts`
- Modify: `src/lib/utils/validation.ts`
- Modify: `src/lib/chat/skill-preference.ts`
- Modify: `src/components/chat/SkillSelector.tsx`
- Modify: `src/components/chat/Composer.tsx` (1 line)
- Modify: `src/routes/settings.tsx` (options list)
- Modify: `tests/unit/skill-selector.test.tsx` (append), `tests/unit/validation.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `SkillId`, `SKILL_IDS`, `SKILL_REGISTRY`, `getSkillDefinition(id: string): SkillDefinition`, `isArtifactSkill(id: string): boolean`, `skillSupportsCompare(id: string): boolean`, `artifactKindForSkill(id: string): ArtifactKind | null`, `skillIdSchema`, `artifactSchema`, `ArtifactInput` — used by Tasks 4, 5, 7, 8.

- [ ] **Step 1: Write the failing test** — create `tests/unit/skills.test.ts`:

```tsx
import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_SKILL_IDS,
  artifactKindForSkill,
  getSkillDefinition,
  isArtifactSkill,
  SKILL_IDS,
  skillSupportsCompare,
} from '../../src/lib/chat/skills'

describe('skill registry', () => {
  it('exposes exactly the four supported skill ids', () => {
    expect([...SKILL_IDS].sort()).toEqual(
      ['agent-skill', 'checklist', 'none', 'prd-plan'].sort(),
    )
  })

  it('exposes exactly the two artifact skill ids', () => {
    expect([...ARTIFACT_SKILL_IDS].sort()).toEqual(
      ['agent-skill', 'prd-plan'].sort(),
    )
  })

  it('marks only prd-plan and agent-skill as artifact skills', () => {
    expect(isArtifactSkill('prd-plan')).toBe(true)
    expect(isArtifactSkill('agent-skill')).toBe(true)
    expect(isArtifactSkill('none')).toBe(false)
    expect(isArtifactSkill('checklist')).toBe(false)
    expect(isArtifactSkill('unknown-id')).toBe(false)
  })

  it('denies compare for artifact skills only', () => {
    expect(skillSupportsCompare('prd-plan')).toBe(false)
    expect(skillSupportsCompare('agent-skill')).toBe(false)
    expect(skillSupportsCompare('none')).toBe(true)
    expect(skillSupportsCompare('checklist')).toBe(true)
  })

  it('maps artifact skills to their kind and others to null', () => {
    expect(artifactKindForSkill('prd-plan')).toBe('prd')
    expect(artifactKindForSkill('agent-skill')).toBe('agent-skill')
    expect(artifactKindForSkill('none')).toBeNull()
  })

  it('falls back to the none definition for unknown ids', () => {
    expect(getSkillDefinition('bogus').id).toBe('none')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/skills.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/lib/chat/skills"

- [ ] **Step 3: Write minimal implementation** — create `src/lib/chat/skills.ts` (client-safe, no server imports):

```ts
export const SKILL_IDS = ['none', 'checklist', 'prd-plan', 'agent-skill'] as const

export type SkillId = (typeof SKILL_IDS)[number]

export type SkillOutputMode = 'chat' | 'artifact'

export type ArtifactKind = 'prd' | 'agent-skill'

export type SkillDefinition = {
  id: SkillId
  label: string
  desc: string
  example: string
  outputMode: SkillOutputMode
  supportsCompare: boolean
  artifactKind: ArtifactKind | null
}

export const SKILL_REGISTRY: Record<SkillId, SkillDefinition> = {
  none: {
    id: 'none',
    label: 'Tanpa skill',
    desc: 'Jawaban natural',
    example: 'Tanyakan apa saja ke Zona.ai...',
    outputMode: 'chat',
    supportsCompare: true,
    artifactKind: null,
  },
  checklist: {
    id: 'checklist',
    label: 'Checklist',
    desc: 'Checklist terstruktur',
    example: 'Buatkan checklist untuk ',
    outputMode: 'chat',
    supportsCompare: true,
    artifactKind: null,
  },
  'prd-plan': {
    id: 'prd-plan',
    label: 'PRD Plan',
    desc: 'Objective → DoD',
    example: 'Buatkan PRD untuk ',
    outputMode: 'artifact',
    supportsCompare: false,
    artifactKind: 'prd',
  },
  'agent-skill': {
    id: 'agent-skill',
    label: 'Agent Skill',
    desc: 'SKILL.md modular',
    example: 'Buatkan SKILL.md untuk ',
    outputMode: 'artifact',
    supportsCompare: false,
    artifactKind: 'agent-skill',
  },
}

export const ARTIFACT_SKILL_IDS = (Object.values(SKILL_REGISTRY) satisfies SkillDefinition[])
  .filter((s) => s.outputMode === 'artifact')
  .map((s) => s.id)

export function getSkillDefinition(id: string): SkillDefinition {
  const found = (SKILL_REGISTRY as Record<string, SkillDefinition>)[id]
  return found ?? SKILL_REGISTRY.none
}

export function isArtifactSkill(id: string): boolean {
  return getSkillDefinition(id).outputMode === 'artifact'
}

export function skillSupportsCompare(id: string): boolean {
  return getSkillDefinition(id).supportsCompare
}

export function artifactKindForSkill(id: string): ArtifactKind | null {
  return getSkillDefinition(id).artifactKind
}
```

- [ ] **Step 4: Derive schemas from the registry** — in `src/lib/utils/validation.ts`, replace both inline enums with the shared schema and add the artifact schema:

```ts
import { z } from 'zod'
import { ARTIFACT_SKILL_IDS, SKILL_IDS } from '../chat/skills'

export const skillIdSchema = z.enum(SKILL_IDS)

// Literal tuple mirrors ARTIFACT_SKILL_IDS; the registry test above pins the
// two lists together so they cannot drift silently.
export const artifactSkillIdSchema = z.enum(['prd-plan', 'agent-skill'])
```

Then in `chatSchema` and `compareSchema` replace `z.enum(['none', 'checklist', 'prd-plan', 'agent-skill'])` with `skillIdSchema`, and append:

```ts
export const artifactSchema = z.object({
  conversationId: z.string().uuid().optional(),
  modelId: z.string().min(1),
  skillId: artifactSkillIdSchema,
  content: z.string().min(1).max(20000),
  attachmentIds: z.array(z.string().uuid()).optional(),
  enableWebSearch: z.boolean().optional().default(false),
})

export type ArtifactInput = z.infer<typeof artifactSchema>
```

`z.enum` with a 2-tuple `as const` keeps the literal union `'prd-plan' | 'agent-skill'`; indexing `ARTIFACT_SKILL_IDS[0]` is safe because the registry guarantees both entries (covered by the Step 1 test asserting exactly four ids including both artifact skills).

- [ ] **Step 5: Tighten skill preference to registry ids** — in `src/lib/chat/skill-preference.ts`, import `getSkillDefinition` and normalize on read and write so corrupt localStorage can never produce an invalid skill:

```ts
import { DEFAULT_SKILL_ID } from './skill-preference' // no — same file; add import of registry only
```

Actual edits: add `import { SKILL_IDS } from './skills'` at top; add helper `function normalizeSkillId(raw: string): string { const trimmed = raw.trim(); return (SKILL_IDS as readonly string[]).includes(trimmed) ? trimmed : DEFAULT_SKILL_ID }`; use it in `initPreference` (`currentSkillPreference = normalizeSkillId(saved)`) and in `setDefaultSkillPreference` (`const normalized = normalizeSkillId(skillId)`).

- [ ] **Step 6: Render selector from the registry** — in `src/components/chat/SkillSelector.tsx`: keep the `SKILLS` export shape (Composer line 24 and 558 depend on `{id,label,icon,desc,example}`) but derive data from the registry with a local icon map:

```tsx
import { getSkillDefinition, SKILL_IDS } from '@/lib/chat/skills'

const SKILL_ICONS = {
  none: Message01Icon,
  checklist: CheckListIcon,
  'prd-plan': File01Icon,
  'agent-skill': SourceCodeIcon,
} as const

export const SKILLS = SKILL_IDS.map((id) => {
  const def = getSkillDefinition(id)
  return { ...def, icon: SKILL_ICONS[def.id] }
})
```

Replace `const isPrdBlocked = s.id === 'prd-plan' && compareEnabled` with `const isBlocked = !skillSupportsCompare(s.id) && compareEnabled` (import `skillSupportsCompare`), rename usages, and change the title to `'Hanya tersedia untuk mode single model'` (keep badge `'Single Only'` and desc override `'Tidak tersedia di Compare Mode'` so existing PRD tests keep passing).

- [ ] **Step 7: Generalize the compare-enable reset** — in `src/components/chat/Composer.tsx` line 573-578, replace `if (enabled && skillId === 'prd-plan')` with `if (enabled && !skillSupportsCompare(skillId))` (import from `@/lib/chat/skills`).

- [ ] **Step 8: Render settings options from the registry** — in `src/routes/settings.tsx`, replace the hardcoded `<option value="prd-plan">` / `<option value="agent-skill">` list (lines 327-330) with `SKILL_IDS.map((id) => { const def = getSkillDefinition(id); return (<option key={def.id} value={def.id}>{def.label}</option>) })`, preserving surrounding select attributes and handlers untouched.

- [ ] **Step 9: Extend existing tests** — append to `tests/unit/skill-selector.test.tsx`:

```tsx
it('blocks agent-skill when compare mode is enabled', () => {
  const onChange = vi.fn()
  render(<SkillSelector value="none" onChange={onChange} compareEnabled={true} />)
  const trigger = screen.getByTestId('skill-selector-trigger')
  fireEvent.click(trigger)
  const skillOption = screen.getByTestId('skill-option-agent-skill')
  expect(skillOption.hasAttribute('disabled')).toBe(true)
  fireEvent.click(skillOption)
  expect(onChange).not.toHaveBeenCalled()
})
```

Append to `tests/unit/validation.test.ts` (read its current imports first; it imports `chatSchema` — mirror its style):

```ts
import { artifactSchema, chatSchema } from '../../src/lib/utils/validation'

it('artifactSchema accepts prd-plan and agent-skill only', () => {
  const base = { modelId: 'auto', content: 'hello', skillId: 'agent-skill' }
  expect(artifactSchema.safeParse(base).success).toBe(true)
  expect(
    artifactSchema.safeParse({ ...base, skillId: 'prd-plan' }).success,
  ).toBe(true)
  expect(artifactSchema.safeParse({ ...base, skillId: 'none' }).success).toBe(
    false,
  )
  expect(
    artifactSchema.safeParse({ ...base, skillId: 'checklist' }).success,
  ).toBe(false)
})

it('chatSchema still accepts all four registry skills', () => {
  for (const skillId of ['none', 'checklist', 'prd-plan', 'agent-skill']) {
    expect(
      chatSchema.safeParse({ modelId: 'auto', content: 'hi', skillId }).success,
    ).toBe(true)
  }
})
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `bun x vitest run tests/unit/skills.test.ts tests/unit/skill-selector.test.tsx tests/unit/validation.test.ts`
Expected: PASS

- [ ] **Step 11: Typecheck and lint**

Run: `bun x tsc --noEmit` (expect 0 errors) and `bun x biome check src/lib/chat/skills.ts src/lib/utils/validation.ts src/lib/chat/skill-preference.ts src/components/chat/SkillSelector.tsx src/components/chat/Composer.tsx src/routes/settings.tsx tests/unit/skills.test.ts tests/unit/skill-selector.test.tsx tests/unit/validation.test.ts` (expect clean).

- [ ] **Step 12: Commit**

```bash
git add src/lib/chat/skills.ts tests/unit/skills.test.ts src/lib/utils/validation.ts src/lib/chat/skill-preference.ts src/components/chat/SkillSelector.tsx src/components/chat/Composer.tsx src/routes/settings.tsx tests/unit/skill-selector.test.tsx tests/unit/validation.test.ts
git commit -m "feat(skills): add canonical skill registry and artifact request schema" -m "Single source of truth for skill ids, output mode, and compare eligibility. Selector, composer reset, settings, preference storage, and chat/compare Zod schemas derive from it. Adds artifactSchema narrowed to prd-plan and agent-skill."
```

### Task 2: Generic artifact stream protocol

**Files:**
- Create: `src/lib/ai/artifact-stream.ts`
- Create: `tests/unit/artifact-stream.test.ts`

**Interfaces:**
- Consumes: `ArtifactKind` from Task 1 (`src/lib/chat/skills.ts`).
- Produces: `ArtifactPhase`, `ArtifactStreamEvent`, `artifactStreamEventSchema`, `parseArtifactStreamEvent(raw: unknown): ArtifactStreamEvent`, `encodeArtifactSseEvent(event: ArtifactStreamEvent): string`, `createArtifactSseParser(handlers): { push(chunk: string): void; flush(): void }` — used by Tasks 4 and 7.

- [ ] **Step 1: Write the failing test** — create `tests/unit/artifact-stream.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  createArtifactSseParser,
  encodeArtifactSseEvent,
  parseArtifactStreamEvent,
} from '../../src/lib/ai/artifact-stream'

const GEN_ID = '11111111-1111-4111-8111-111111111111'

describe('artifact stream protocol', () => {
  it('parses a full valid event sequence', () => {
    const created = parseArtifactStreamEvent({
      type: 'artifact-created',
      generationId: GEN_ID,
      kind: 'agent-skill',
      summary: 'Skill `X` selesai dibuat.',
      artifact: {
        attachmentId: GEN_ID,
        fileName: 'x.md',
        fileSize: 12,
        mimeType: 'text/markdown',
      },
    })
    expect(created.type).toBe('artifact-created')
  })

  it('rejects events with missing generationId, bad kind, or negative size', () => {
    expect(() =>
      parseArtifactStreamEvent({ type: 'artifact-status', phase: 'preparing' }),
    ).toThrow()
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-status',
        generationId: GEN_ID,
        kind: 'prd',
        phase: 'generating',
      }),
    ).not.toThrow()
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-created',
        generationId: GEN_ID,
        kind: 'agent-skill',
        summary: 's',
        artifact: {
          attachmentId: GEN_ID,
          fileName: 'x.md',
          fileSize: -1,
          mimeType: 'text/markdown',
        },
      }),
    ).toThrow()
  })

  it('rejects terminal regression completed -> generating', () => {
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-done',
        generationId: GEN_ID,
        kind: 'prd',
        status: 'streaming',
        messageId: GEN_ID,
        conversationId: GEN_ID,
      }),
    ).toThrow()
  })

  it('round-trips through the SSE encoder', () => {
    const event = {
      type: 'artifact-status',
      generationId: GEN_ID,
      kind: 'agent-skill',
      phase: 'validating',
    } as const
    const line = encodeArtifactSseEvent(event)
    expect(line.startsWith('data: ')).toBe(true)
    expect(line.endsWith('\n\n')).toBe(true)
    expect(parseArtifactStreamEvent(JSON.parse(line.slice(6).trim()))).toEqual(
      event,
    )
  })

  it('buffers partial SSE frames across pushes and reports malformed frames', () => {
    const seen: string[] = []
    const errors: Error[] = []
    const parser = createArtifactSseParser({
      onEvent: (e) => {
        seen.push(e.type)
      },
      onError: (e) => {
        errors.push(e)
      },
    })
    const valid = `data: ${JSON.stringify({ type: 'artifact-status', generationId: GEN_ID, kind: 'prd', phase: 'preparing' })}`
    parser.push(`${valid.slice(0, 20)}`)
    expect(seen).toEqual([])
    parser.push(`${valid.slice(20)}\n\n`)
    expect(seen).toEqual(['artifact-status'])
    parser.push('data: {broken json}\n\n')
    expect(errors.length).toBe(1)
    expect(seen).toEqual(['artifact-status'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/artifact-stream.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/lib/ai/artifact-stream"

- [ ] **Step 3: Write minimal implementation** — create `src/lib/ai/artifact-stream.ts`:

```ts
import { z } from 'zod'
import type { ArtifactKind } from '../chat/skills'

export const ARTIFACT_PHASES = [
  'preparing',
  'generating',
  'validating',
  'creating_file',
  'completed',
  'error',
  'cancelled',
] as const

export type ArtifactPhase = (typeof ARTIFACT_PHASES)[number]

const generationIdSchema = z.string().uuid()

const artifactDescriptorSchema = z.object({
  attachmentId: z.string().uuid(),
  fileName: z.string().min(1).max(120),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(120),
})

export type ArtifactDescriptor = z.infer<typeof artifactDescriptorSchema>

const baseEventSchema = z.object({
  generationId: generationIdSchema,
  kind: z.enum(['prd', 'agent-skill']),
})

export const artifactStatusEventSchema = baseEventSchema.extend({
  type: z.literal('artifact-status'),
  phase: z.enum(ARTIFACT_PHASES),
  section: z.string().min(1).max(64).optional(),
  message: z.string().min(1).max(500).optional(),
})

export const artifactCreatedEventSchema = baseEventSchema.extend({
  type: z.literal('artifact-created'),
  summary: z.string().min(1).max(2000),
  artifact: artifactDescriptorSchema,
})

export const artifactErrorEventSchema = baseEventSchema.extend({
  type: z.literal('artifact-error'),
  code: z.string().min(1).max(32),
  retryable: z.boolean(),
})

export const artifactDoneEventSchema = baseEventSchema.extend({
  type: z.literal('artifact-done'),
  status: z.enum(['completed', 'cancelled', 'failed']),
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
})

export const artifactStreamEventSchema = z.discriminatedUnion('type', [
  artifactStatusEventSchema,
  artifactCreatedEventSchema,
  artifactErrorEventSchema,
  artifactDoneEventSchema,
])

export type ArtifactStreamEvent = z.infer<typeof artifactStreamEventSchema>

export function parseArtifactStreamEvent(raw: unknown): ArtifactStreamEvent {
  return artifactStreamEventSchema.parse(raw)
}

export function encodeArtifactSseEvent(event: ArtifactStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export function createArtifactSseParser(handlers: {
  onEvent: (event: ArtifactStreamEvent) => void
  onError: (error: Error) => void
}): { push(chunk: string): void; flush(): void } {
  let buffer = ''
  const handleFrame = (frame: string) => {
    const dataLines = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
    if (dataLines.length === 0) return
    const payload = dataLines
      .map((line) => line.slice(5).trim())
      .join('\n')
    if (!payload || payload === '[DONE]') return
    try {
      handlers.onEvent(parseArtifactStreamEvent(JSON.parse(payload)))
    } catch (err) {
      handlers.onError(
        err instanceof Error ? err : new Error('Invalid artifact event'),
      )
    }
  }
  return {
    push(chunk: string) {
      buffer += chunk
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) handleFrame(part)
    },
    flush() {
      if (buffer.trim()) handleFrame(buffer)
      buffer = ''
    },
  }
}
```

The unused `ArtifactKind` import would fail Biome; remove it — the `kind` field uses the inline `z.enum(['prd', 'agent-skill'])`. To keep the single source of truth, derive from the registry instead: import `SKILL_REGISTRY`? `kind` values equal artifact skill kinds. Simplest honest link: `z.enum(['prd', 'agent-skill'])` with a comment that kinds mirror `ArtifactKind` in `src/lib/chat/skills.ts`, plus a type check `satisfies` — add in test: `expect(['prd','agent-skill'].sort()).toEqual(...)`? Skip; keep inline enum and export `ArtifactKind` re-export: `export type { ArtifactKind } from '../chat/skills'`. That keeps the import used and the contract linked. Add that line at top and drop the unused-import problem.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun x vitest run tests/unit/artifact-stream.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `bun x tsc --noEmit` and `bun x biome check src/lib/ai/artifact-stream.ts tests/unit/artifact-stream.test.ts`. Expect clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/artifact-stream.ts tests/unit/artifact-stream.test.ts
git commit -m "feat(artifacts): add generic artifact SSE protocol with strict parsing" -m "Zod-discriminated artifact-status/created/error/done events carrying generationId and kind, SSE encoder, and a frame-buffered client parser that surfaces malformed frames as recoverable errors."
```

### Task 3: Agent Skill document profile library

**Files:**
- Create: `src/lib/ai/agent-skill.ts`
- Create: `tests/unit/agent-skill.test.ts`

**Interfaces:**
- Consumes: `yaml` package (added here), Zod.
- Produces: limits (`SKILL_MIME_TYPE`, `SKILL_MIN_BODY_CHARS`, `SKILL_MIN_SECTIONS`, `SKILL_MAX_BYTES`, `SKILL_MAX_SLUG`, `SKILL_MAX_DESCRIPTION`, `ARTIFACT_HISTORY_BUDGET_BYTES`), `slugifySkillName`, `normalizeSkillMarkdown`, `validateSkillDocument`, `ValidatedSkillDocument`, `buildSkillSummary`, `buildSkillFilename`, `buildAgentSkillSystemPrompt` — used by Tasks 4 and 5.

- [ ] **Step 1: Add the yaml dependency**

Run: `bun add yaml`
Expected: `package.json` gains `"yaml"` in dependencies. Verify with `bun x tsc --noEmit` still clean (types ship with the package).

- [ ] **Step 2: Write the failing test** — create `tests/unit/agent-skill.test.ts` with two domain-shaped fixtures (frontend + TDD, different section names/order) plus failure cases. Full content:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildSkillFilename,
  buildSkillSummary,
  SKILL_MAX_BYTES,
  slugifySkillName,
  validateSkillDocument,
} from '../../src/lib/ai/agent-skill'

const FRONTEND_SKILL = `---
name: frontend-design
description: Use when creating distinctive visual direction, typography, and interface styling.
---

# Frontend Design

## When to Use
Use this skill when a product surface needs a distinctive visual identity rather than a default component look.

## Principles
Spend boldness in one place. Let one signature visual element carry the identity, and keep surrounding decoration restrained.

## Process
Start from the emotion of the page, collect references, critique against the principles, then build.

## Constraints
Follow the project design tokens. Do not introduce new fonts or neon colors.

## Anti-patterns
Avoid generic gradient hero sections and pill-upon-pill button stacks.

## Verification Checklist
- [ ] One signature element carries the identity
- [ ] Typography follows the type scale
- [ ] No generic template patterns remain
`

const TDD_SKILL = `---
name: tdd-workflow
description: Use when implementing any feature or bugfix, before writing production code.
license: MIT
---

# TDD Workflow

## Red
Write the failing test first. Confirm it fails for the expected reason before writing production code.

## Green
Write the minimal production code that makes the failing test pass. Resist the urge to generalize early.

## Refactor
Clean up duplication with both test suites green. Each refactor step stays verifiable.

## Test Boundaries
Cover the contract, the failure mode, and one boundary case. Do not assert stochastic output.

## Common Mistakes
Do not write the implementation first and backfill tests. Do not mock the unit under test.
`

describe('agent skill document profile', () => {
  it('accepts a frontend-design skill with adapted sections', () => {
    const result = validateSkillDocument(FRONTEND_SKILL)
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.document.name).toBe('frontend-design')
    expect(result.document.displayName).toBe('Frontend Design')
    expect(result.document.fileName).toBe('frontend-design.md')
    expect(buildSkillFilename(result.document)).toBe('frontend-design.md')
  })

  it('accepts a TDD skill with different sections and optional license', () => {
    const result = validateSkillDocument(TDD_SKILL)
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.document.license).toBe('MIT')
    expect(result.document.headings.length).toBeGreaterThanOrEqual(3)
  })

  it('builds a deterministic summary from validated metadata', () => {
    const result = validateSkillDocument(FRONTEND_SKILL)
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const summary = buildSkillSummary(result.document)
    expect(summary.startsWith('Skill `Frontend Design` selesai dibuat.')).toBe(
      true,
    )
    expect(
      summary.includes(
        'Use when creating distinctive visual direction, typography, and interface styling.',
      ),
    ).toBe(true)
    const bullets = summary.split('\n').filter((l) => l.startsWith('- '))
    expect(bullets.length).toBeGreaterThanOrEqual(3)
    expect(bullets.length).toBeLessThanOrEqual(5)
    expect(summary.length).toBeLessThanOrEqual(2000)
  })

  it('rejects missing frontmatter, shallow body, and missing H1 with stable codes', () => {
    const missing = validateSkillDocument('# No Frontmatter\n\nBody here.\n')
    expect(missing.valid).toBe(false)
    if (missing.valid) return
    expect(missing.issues).toContain('missing-frontmatter')

    const shallow = validateSkillDocument(
      '---\nname: tiny\ndescription: Use for tiny things.\n---\n\n# Tiny\n\n## Only\n\nShort.\n',
    )
    expect(shallow.valid).toBe(false)
  })

  it('rejects malformed YAML, non-mapping frontmatter, and bad slugs', () => {
    const badYaml = validateSkillDocument(
      '---\nname: [unclosed\ndescription: x\n---\n\n# T\n\n## A\n\nBody text that is long enough to pass the length gate comfortably here.\n\n## B\n\nMore body text that is long enough to pass the length gate comfortably here.\n\n## C\n\nEven more body text that is long enough to pass the length gate comfortably here.\n',
    )
    expect(badYaml.valid).toBe(false)

    const badSlug = validateSkillDocument(
      '---\nname: "!!!"\ndescription: Use when testing slugs.\n---\n\n# T\n\n## A\n\nBody text that is long enough to pass the length gate comfortably here.\n\n## B\n\nMore body text that is long enough to pass the length gate comfortably here.\n\n## C\n\nEven more body text that is long enough to pass the length gate comfortably here.\n',
    )
    expect(badSlug.valid).toBe(false)
    if (badSlug.valid) return
    expect(badSlug.issues).toContain('invalid-slug')
  })

  it('rejects oversized output', () => {
    const big = `# Big\n\n${'x'.repeat(SKILL_MAX_BYTES + 1)}\n`
    const result = validateSkillDocument(
      `---\nname: big\ndescription: Use for big things.\n---\n\n${big}## A\n\nText.\n\n## B\n\nText.\n\n## C\n\nText.\n`,
    )
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.issues).toContain('oversized')
  })

  it('slugifies names deterministically', () => {
    expect(slugifySkillName('Frontend Design!')).toBe('frontend-design')
    expect(slugifySkillName('  TDD_Workflow  ')).toBe('tdd-workflow')
    expect(slugifySkillName('!!!')).toBe('')
  })

  it('strips one outer code fence during normalization', () => {
    const fenced = `\`\`\`markdown\n${FRONTEND_SKILL}\n\`\`\`\n`
    const result = validateSkillDocument(fenced)
    expect(result.valid).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun x vitest run tests/unit/agent-skill.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/lib/ai/agent-skill"

- [ ] **Step 4: Write minimal implementation** — create `src/lib/ai/agent-skill.ts` (client-safe pure functions; no server imports):

```ts
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'

export const SKILL_MIME_TYPE = 'text/markdown'
export const SKILL_MIN_BODY_CHARS = 600
export const SKILL_MIN_SECTIONS = 3
export const SKILL_MIN_SECTION_CHARS = 40
export const SKILL_MAX_BYTES = 64 * 1024
export const SKILL_MAX_SLUG = 64
export const SKILL_MAX_DESCRIPTION = 500
export const ARTIFACT_HISTORY_BUDGET_BYTES = 64 * 1024

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const H1_RE = /^#[ \t].*$/gm
const H2_RE = /^##[ \t](.*)$/gm
const SLUG_KEY_RE = /^[a-z0-9-]+$/

export type ValidatedSkillDocument = {
  name: string
  displayName: string
  description: string
  license?: string
  extensions: Record<string, unknown>
  headings: string[]
  summary: string
  markdown: string
  fileName: string
  fileSize: number
}

export type SkillValidationResult =
  | { valid: true; document: ValidatedSkillDocument }
  | { valid: false; issues: string[] }

export function slugifySkillName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_MAX_SLUG)
}

export function normalizeSkillMarkdown(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const trimmed = text.trim()
  if (trimmed.startsWith('```')) {
    const firstBreak = trimmed.indexOf('\n')
    const lastFence = trimmed.lastIndexOf('```')
    if (firstBreak !== -1 && lastFence > firstBreak) {
      text = `${trimmed.slice(firstBreak + 1, lastFence).trim()}\n`
    }
  }
  const lines = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
  return `${lines.join('\n').trim()}\n`
}

const frontmatterValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(frontmatterValueSchema),
    z.record(z.string(), frontmatterValueSchema),
  ]),
)

const skillFrontmatterSchema = z
  .object({
    name: z.string().min(1).max(SKILL_MAX_SLUG),
    description: z.string().min(1).max(SKILL_MAX_DESCRIPTION),
    license: z.string().min(1).max(200).optional(),
  })
  .catchall(frontmatterValueSchema)

function isJsonCompatible(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true
  if (Array.isArray(value)) return value.every(isJsonCompatible)
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).every(
      ([key, entry]) => SLUG_KEY_RE.test(key) && isJsonCompatible(entry),
    )
  }
  return false
}

function stripInlineMarkdown(heading: string): string {
  return heading
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function sectionIsSubstantive(section: string): boolean {
  if (/```/.test(section)) return true
  if (/^\s*[-*+] /m.test(section)) return true
  return section.replace(/\s/g, '').length >= SKILL_MIN_SECTION_CHARS
}

export function validateSkillDocument(
  raw: string,
): SkillValidationResult {
  const issues: string[] = []
  if (!raw || !raw.trim()) return { valid: false, issues: ['empty-output'] }

  const normalized = normalizeSkillMarkdown(raw)
  if (Buffer.byteLength(normalized, 'utf8') > SKILL_MAX_BYTES)
    return { valid: false, issues: ['oversized'] }

  const fenceMatch = /^---[ \t]*\r?\n/.test(normalized)
    ? FRONTMATTER_RE.exec(normalized)
    : null
  if (!fenceMatch) return { valid: false, issues: ['missing-frontmatter'] }

  let parsed: unknown
  try {
    parsed = parseYaml(fenceMatch[1], { maxAliasCount: 50 }) as unknown
  } catch {
    return { valid: false, issues: ['invalid-yaml'] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return { valid: false, issues: ['invalid-frontmatter'] }

  const frontmatter = skillFrontmatterSchema.safeParse(parsed)
  if (!frontmatter.success)
    return { valid: false, issues: ['invalid-frontmatter'] }

  const name = slugifySkillName(frontmatter.data.name)
  if (!name) return { valid: false, issues: ['invalid-slug'] }

  const rawKeys = Object.keys(parsed as Record<string, unknown>)
  const seen = new Set<string>()
  const extensions: Record<string, unknown> = {}
  for (const key of rawKeys) {
    if (['name', 'description', 'license'].includes(key)) continue
    if (!SLUG_KEY_RE.test(key)) {
      issues.push('invalid-extension-key')
      continue
    }
    const lowered = key.toLowerCase()
    if (seen.has(lowered) || ['name', 'description', 'license'].includes(lowered)) {
      issues.push('duplicate-extension-key')
      continue
    }
    seen.add(lowered)
    const value = (parsed as Record<string, unknown>)[key]
    if (!isJsonCompatible(value)) {
      issues.push('invalid-extension-value')
      continue
    }
    extensions[key] = value
  }
  if (issues.length > 0) return { valid: false, issues }

  const body = normalized.slice(fenceMatch[0].length)
  const h1Matches = body.match(H1_RE) ?? []
  if (h1Matches.length !== 1)
    return {
      valid: false,
      issues: [h1Matches.length === 0 ? 'missing-h1' : 'multiple-h1'],
    }

  const headingMatches = [...body.matchAll(H2_RE)]
  const sections = body.split(/^##[ \t].*$/gm).slice(1)
  const headings: string[] = []
  for (let i = 0; i < headingMatches.length; i++) {
    const title = stripInlineMarkdown(headingMatches[i][1] ?? '')
    if (title && sectionIsSubstantive(sections[i] ?? ''))
      headings.push(title)
  }
  if (headings.length < SKILL_MIN_SECTIONS)
    return { valid: false, issues: ['too-few-sections'] }

  const bodyChars = body.replace(/\s/g, '').length
  if (bodyChars < SKILL_MIN_BODY_CHARS)
    return { valid: false, issues: ['body-too-short'] }

  const displayName = stripInlineMarkdown(
    (h1Matches[0].replace(/^#[ \t]/, '') ?? '').trim(),
  )
  const canonicalFrontmatter = stringifyYaml({
    name,
    description: frontmatter.data.description,
    ...(frontmatter.data.license
      ? { license: frontmatter.data.license }
      : {}),
    ...extensions,
  })
  const markdown = `---\n${canonicalFrontmatter}---\n\n${body.trim()}\n`
  const fileSize = Buffer.byteLength(markdown, 'utf8')
  if (fileSize > SKILL_MAX_BYTES)
    return { valid: false, issues: ['oversized'] }

  const fileName = `${name}.md`
  const summaryHeadings = headings.slice(0, 5)
  const summary = [
    `Skill \`${displayName}\` selesai dibuat.`,
    '',
    `Tujuan: ${frontmatter.data.description}`,
    '',
    'Isinya mencakup:',
    ...summaryHeadings.map((heading) => `- ${heading}`),
  ].join('\n')

  return {
    valid: true,
    document: {
      name,
      displayName,
      description: frontmatter.data.description,
      ...(frontmatter.data.license
        ? { license: frontmatter.data.license }
        : {}),
      extensions,
      headings: summaryHeadings,
      summary,
      markdown,
      fileName,
      fileSize,
    },
  }
}

export function buildSkillSummary(document: ValidatedSkillDocument): string {
  return document.summary
}

export function buildSkillFilename(
  document: ValidatedSkillDocument,
): string {
  return document.fileName
}

export function buildAgentSkillSystemPrompt(): string {
  return [
    'You generate exactly one portable Markdown skill document for an AI coding agent.',
    'Return ONLY the Markdown document: no preamble, no explanation, no JSON wrapper, no trailing commentary.',
    'Match the language of the user request for the document body; frontmatter name stays an ASCII slug.',
    'Frontmatter must be a YAML mapping with required `name` (lowercase ASCII slug) and `description` (when to invoke this skill).',
    'Include `license` only when the user supplied or requested real license information. Never invent metadata.',
    'Use exactly one H1 title and at least three substantive H2 sections with real paragraphs, lists, or code.',
    'Adapt the structure to the domain instead of reusing a fixed template: testing skills center red-green-refactor and test boundaries; debugging skills center evidence and hypothesis testing; migration skills center compatibility, rollback, and sequencing; design skills center visual direction, critique, and anti-generic checks.',
    'Write concrete decision rules and instructions, not filler or generic best-practice slogans.',
    'Consider purpose, usage boundaries, principles, workflow, constraints, examples when useful, anti-patterns, and verification; combine or rename sections when the domain is clearer another way.',
    'A shallow brief is unacceptable: the body must be thorough enough to guide real work.',
  ].join('\n')
}
```

Notes for the executor: `parseYaml` returns `any`; assigning to `parsed: unknown` keeps the bypass scan clean. `Buffer` is available because this module is imported only by server code and unit tests (node/jsdom both provide Buffer in vitest). Duplicate YAML keys throw inside `parseYaml` by default (`uniqueKeys: true`), surfacing as `invalid-yaml`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun x vitest run tests/unit/agent-skill.test.ts`
Expected: PASS. If the fenced fixture fails, check fence slicing indices before touching the test.

- [ ] **Step 6: Typecheck and lint**

Run: `bun x tsc --noEmit` and `bun x biome check src/lib/ai/agent-skill.ts tests/unit/agent-skill.test.ts package.json`. Expect clean.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock src/lib/ai/agent-skill.ts tests/unit/agent-skill.test.ts
git commit -m "feat(skills): add Agent Skill document validation and summary profile" -m "YAML frontmatter contract (name+description required, safe extensions), structural validation with stable issue codes, deterministic summary builder, slug filename, and domain-adaptive generation prompt. Adds the yaml dependency."
```

### Task 4: Shared artifact runner and server function

**Files:**
- Create: `src/server/core/artifacts.ts`
- Create: `src/server/core/artifact-profiles.ts`
- Create: `tests/integration/artifact.test.ts`
- Create: `tests/unit/artifact-finalize.test.ts`
- Modify: `src/server/functions/chat.ts` (add `generateArtifact`)
- Modify: `src/server/core/chat.ts` (fail-closed guards in `sendMessageCore` + `sendCompareMessageCore`)
- Modify: `src/lib/utils/constants.ts` (add `RATE_LIMIT_AGENT_SKILL_PER_MINUTE`)

**Interfaces:**
- Consumes: `ArtifactInput` (Task 1), artifact protocol (Task 2), agent-skill profile lib (Task 3), existing `prd-artifact.ts` validators for the PRD profile, `db.transaction` pattern from `src/server/core/payments.ts:43`, `controllers` + `autoTitleConversation` from `./chat`, `env.R2_BUCKET_NAME` from `@/lib/env.server`.
- Produces: `generateArtifactCore({data, request}): Promise<Response>`, `retryArtifactGenerationCore({generationId, request})`, `finalizeTerminalRun({genId, status, error}): Promise<boolean>`, `runFinalizeWithCompensation(...)`, `ArtifactProfile`, `buildModelHistory` comes in Task 5 (this task uses a plain history query mirroring `src/server/core/prd.ts:219-224`; Task 5 swaps all three call sites).

- [ ] **Step 1: Add the rate-limit constant** — in `src/lib/utils/constants.ts` append:

```ts
export const RATE_LIMIT_AGENT_SKILL_PER_MINUTE = Number(
  getEnv(['RATE_LIMIT', 'AGENT', 'SKILL', 'PER', 'MINUTE'].join('_')) ?? 5,
)
```

- [ ] **Step 2: Write the pure-helper failing test** — create `tests/unit/artifact-finalize.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { runFinalizeWithCompensation } from '../../src/server/core/artifacts'

describe('runFinalizeWithCompensation', () => {
  it('commits without deleting when the DB transaction succeeds', async () => {
    const writeR2 = vi.fn(async () => {})
    const commitDb = vi.fn(async () => {})
    const deleteR2 = vi.fn(async () => {})
    await runFinalizeWithCompensation({ writeR2, commitDb, deleteR2 })
    expect(writeR2).toHaveBeenCalledTimes(1)
    expect(commitDb).toHaveBeenCalledTimes(1)
    expect(deleteR2).not.toHaveBeenCalled()
  })

  it('deletes the R2 object when the DB transaction fails', async () => {
    const deleteR2 = vi.fn(async () => {})
    await expect(
      runFinalizeWithCompensation({
        writeR2: async () => {},
        commitDb: async () => {
          throw new Error('db down')
        },
        deleteR2,
      }),
    ).rejects.toThrow('db down')
    expect(deleteR2).toHaveBeenCalledTimes(1)
  })

  it('surfaces cleanup failure without hiding the original error', async () => {
    await expect(
      runFinalizeWithCompensation({
        writeR2: async () => {},
        commitDb: async () => {
          throw new Error('db down')
        },
        deleteR2: async () => {
          throw new Error('r2 down')
        },
      }),
    ).rejects.toThrow('db down')
  })

  it('does not touch R2 when the write itself fails', async () => {
    const deleteR2 = vi.fn(async () => {})
    await expect(
      runFinalizeWithCompensation({
        writeR2: async () => {
          throw new Error('r2 down')
        },
        commitDb: async () => {},
        deleteR2,
      }),
    ).rejects.toThrow('r2 down')
    expect(deleteR2).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun x vitest run tests/unit/artifact-finalize.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/server/core/artifacts"

- [ ] **Step 4: Write the profiles module** — create `src/server/core/artifact-profiles.ts` (server-only guard at top, mirroring `prd.ts:46-48`):

```ts
import {
  buildAgentSkillSystemPrompt,
  SKILL_MAX_BYTES,
  SKILL_MIME_TYPE,
  validateSkillDocument,
} from '../../lib/ai/agent-skill'
import {
  generatePrdFilename,
  PRD_MIME_TYPE,
  sanitizeFilename as sanitizePrdFilename,
  validatePrdContent,
} from '../../lib/ai/prd-artifact'
import type { ArtifactKind } from '../../lib/chat/skills'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifact-profiles.ts is server-only')
}

export type ValidatedArtifact = {
  markdown: string
  fileName: string
  fileSize: number
  summary: string
}

export type ArtifactProfile = {
  kind: ArtifactKind
  skillId: 'prd-plan' | 'agent-skill'
  rateLimitKey: string
  rateLimitPerMinute: number
  maxBytes: number
  mimeType: string
  buildSystemPrompt: (input: {
    userContent: string
    ragSuffix: string
  }) => string
  detectSection: (fullText: string) => string | undefined
  validate: (fullText: string) => { valid: boolean; issues: string[] }
  buildArtifact: (
    fullText: string,
    userContent: string,
  ) => ValidatedArtifact | null
  validationErrorMessage: string
  cancelledMessage: string
  failureMessage: string
}
```

Then the two profiles. PRD profile reuses existing helpers and messages from `prd.ts:395-396`, `prd.ts:451`, `prd.ts:357`, `prd.ts:519`:

```ts
import {
  RATE_LIMIT_AGENT_SKILL_PER_MINUTE,
  RATE_LIMIT_PRD_PER_MINUTE,
} from '../../lib/utils/constants'
import { buildSystemPrompt } from '../../lib/ai/system-prompt'
import {
  detectCurrentSection,
} from '../../lib/ai/prd-artifact'

export const prdProfile: ArtifactProfile = {
  kind: 'prd',
  skillId: 'prd-plan',
  rateLimitKey: 'prd',
  rateLimitPerMinute: RATE_LIMIT_PRD_PER_MINUTE,
  maxBytes: 256 * 1024,
  mimeType: PRD_MIME_TYPE,
  buildSystemPrompt: ({ userContent: _userContent, ragSuffix }) =>
    buildSystemPrompt({ skillId: 'prd-plan', hasWebSources: false }) + ragSuffix,
  detectSection: (fullText) => detectCurrentSection(fullText) ?? undefined,
  validate: (fullText) => validatePrdContent(fullText),
  buildArtifact: (fullText, userContent) => {
    const validation = validatePrdContent(fullText)
    if (!validation.valid) return null
    const fileName = sanitizePrdFilename(generatePrdFilename(userContent))
    const fileSize = Buffer.byteLength(fullText, 'utf8')
    return {
      markdown: fullText,
      fileName,
      fileSize,
      summary: 'PRD selesai dibuat.',
    }
  },
  validationErrorMessage: 'Format PRD tidak valid atau tidak lengkap dari model AI.',
  cancelledMessage: 'Pembuatan PRD dibatalkan.',
  failureMessage: 'Gagal menghasilkan PRD.',
}

export const agentSkillProfile: ArtifactProfile = {
  kind: 'agent-skill',
  skillId: 'agent-skill',
  rateLimitKey: 'artifact-agent-skill',
  rateLimitPerMinute: RATE_LIMIT_AGENT_SKILL_PER_MINUTE,
  maxBytes: SKILL_MAX_BYTES,
  mimeType: SKILL_MIME_TYPE,
  buildSystemPrompt: ({ ragSuffix }) =>
    `${buildAgentSkillSystemPrompt()}${ragSuffix}`,
  detectSection: () => undefined,
  validate: (fullText) => {
    const result = validateSkillDocument(fullText)
    return result.valid
      ? { valid: true, issues: [] }
      : { valid: false, issues: result.issues }
  },
  buildArtifact: (fullText) => {
    const result = validateSkillDocument(fullText)
    if (!result.valid) return null
    return {
      markdown: result.document.markdown,
      fileName: result.document.fileName,
      fileSize: result.document.fileSize,
      summary: result.document.summary,
    }
  },
  validationErrorMessage:
    'Format skill tidak valid atau belum lengkap dari model AI.',
  cancelledMessage: 'Pembuatan skill dibatalkan.',
  failureMessage: 'Gagal menghasilkan skill.',
}

export const ARTIFACT_PROFILES: Record<ArtifactKind, ArtifactProfile> = {
  prd: prdProfile,
  'agent-skill': agentSkillProfile,
}
```

`_userContent` unused param: Biome may flag unused args — prefix with underscore is the repo convention for intentionally unused (`_userMsg` in prd.ts:138). Keep the underscore and verify lint passes; if flagged, drop the field from the signature and adjust the call.

- [ ] **Step 5: Write the runner** — create `src/server/core/artifacts.ts`. Structure mirrors `src/server/core/prd.ts:55-268` (preflight) and `prd.ts:270-566` (stream/finalize), parameterized by profile. Full content:

```ts
import type { ModelMessage } from 'ai'
import { streamText } from 'ai'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { nineRouter } from '../../lib/ai/9router'
import { encodeArtifactSseEvent } from '../../lib/ai/artifact-stream'
import type { ArtifactStreamEvent } from '../../lib/ai/artifact-stream'
import { deductCredits, refundCredits } from '../../lib/ai/credits'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db/index'
import {
  attachments,
  conversations,
  generationRuns,
  messages,
  usageRecords,
} from '../../lib/db/schema'
import { env } from '../../lib/env.server'
import { getModelById, isVisionCapable } from '../../lib/models/registry'
import { resolveAutoModel } from '../../lib/models/router'
import { deleteObject, putObject } from '../../lib/r2/client'
import { retrieveContext } from '../../lib/rag/retrieve'
import { enforceRateLimit } from '../../lib/security/rate-limit'
import { RATE_LIMIT_WINDOW_MS } from '../../lib/utils/constants'
import {
  AppError,
  throwZonaError,
  type UsageLike,
} from '../../lib/utils/errors'
import type { ArtifactInput } from '../../lib/utils/validation'
import { artifactKindForSkill } from '../../lib/chat/skills'
import { ARTIFACT_PROFILES, type ArtifactProfile } from './artifact-profiles'
import { autoTitleConversation, controllers } from './chat'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifacts.ts is server-only')
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows
}

export async function runFinalizeWithCompensation({
  writeR2,
  commitDb,
  deleteR2,
}: {
  writeR2: () => Promise<void>
  commitDb: () => Promise<void>
  deleteR2: () => Promise<void>
}): Promise<void> {
  await writeR2()
  try {
    await commitDb()
  } catch (dbError) {
    try {
      await deleteR2()
    } catch (cleanupError) {
      console.error('Artifact R2 compensation failed', cleanupError)
    }
    throw dbError
  }
}

export async function finalizeTerminalRun({
  genId,
  status,
  error,
}: {
  genId: string
  status: 'completed' | 'failed' | 'cancelled'
  error?: { message: string; code?: string }
}): Promise<boolean> {
  const rows = await db
    .update(generationRuns)
    .set({ status, error, completedAt: new Date() })
    .where(
      and(eq(generationRuns.id, genId), eq(generationRuns.status, 'streaming')),
    )
    .returning({ id: generationRuns.id })
  return rows.length === 1
}

async function refundOnce({
  userId,
  genId,
  modelId,
  amount,
  status,
}: {
  userId: string
  genId: string
  modelId: string
  amount: number
  status: 'failed' | 'cancelled'
}): Promise<void> {
  const won = await finalizeTerminalRun({ genId, status })
  if (!won) return
  await refundCredits({ userId, generationRunId: genId, modelId, amount })
}
```

Preflight + execution. The preflight duplicates `prd.ts:62-243` with profile-driven rate limit/skill/prompt. Include the input-attachment block verbatim in shape (ownership, vision check, file parts, link to user message). Then `executeArtifactStream` holds the SSE pipeline. Then `generateArtifactCore` ties them and returns the Response with headers `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Generation-Id`, `X-Conversation-Id`, `X-Router-Model-Id`, optional `X-Routing-Reason`, plus `X-Artifact-Kind`. Then `retryArtifactGenerationCore` (mirrors `retryGenerationCore` lines 1234-1300 for load/ownership/failed-only/model/cost/newMsg/newGen, then runs `executeArtifactStream` with the original user content — load the latest user message content from history for the prompt filename: reuse `gen` conversation history; userContent = last user message before newMsg).

Because this file is large (~450 lines), write it in one go following `prd.ts` line by line with these substitutions:
- `skillId: profile.skillId` in the generation run insert.
- Rate limit key `profile.rateLimitKey`, limit `profile.rateLimitPerMinute`.
- System prompt from `profile.buildSystemPrompt({ userContent: input.content, ragSuffix })`.
- Section detection via `profile.detectSection(fullText)`; emit `{ type: 'artifact-status', generationId: genId, kind: profile.kind, phase: 'generating', section }` only when a new section string appears, else a single generating event once (mirror prd.ts:318-331).
- After stream ends: abort check → cancelled path (finalizeTerminalRun cancelled + guarded refund + `{type:'artifact-status', phase:'error', message: profile.cancelledMessage}` — note: protocol has no cancelled status event; cancellation surfaces as error-phase status event plus terminal `artifact-done` with status cancelled; document this mapping in a comment).
- Emit `{type:'artifact-status', phase:'validating'}` then `profile.validate`; on invalid → failed run with `content: null`, `error: { message: profile.validationErrorMessage, code: 'ERR-016' }`, guarded refund, error event `{type:'artifact-error', code:'ERR-016', retryable:true}`, close.
- Byte cap: during accumulation, if `Buffer.byteLength(fullText, 'utf8') > profile.maxBytes` → break accumulation and treat as oversize failure (same path as invalid with issue; error code ERR-012? ERR-012 is file-too-large 413 non-retryable with upload copy — wrong semantics. Use ERR-016 retryable. Keep validationErrorMessage.).
- `profile.buildArtifact(fullText, input.content)` → null is unreachable after validate passed (defensive: treat as invalid).
- `runFinalizeWithCompensation({ writeR2: () => putObject({ key: r2Key, body: fileBuffer, contentType: mime }), commitDb: () => db.transaction(async (tx) => { insert attachment; update assistant message content=summary; update generation run content/usage/status completed via finalizeTerminalRun? No — inside tx use plain tx.update without guard (guard already won by construction? The stop endpoint could have cancelled mid-flight. Inside tx, first re-check status via tx.select ... then proceed or throw to trigger compensation. Implement: const current = await tx.select({status}).from(generationRuns).where(eq(id)); if current[0]?.status !== 'streaming' throw new AppError('Generation no longer active', 409, 'ERR-003') → compensation deletes R2, error surfaces as failure event. }), deleteR2: () => deleteObject(r2Key) })`.
- MIME: `profile.mimeType` for the R2 `contentType`, attachment row, and event descriptor.
- R2 key: `users/${userId}/attachments/${attachmentId}/${fileName}`; bucket metadata: `env.R2_BUCKET_NAME`.
- Usage capture + usageRecords insert mirror prd.ts:458-492.
- Events after commit: `artifact-created` (summary + descriptor), `artifact-status completed`, `artifact-done` (status completed, messageId, conversationId).
- Catch: isAbort → cancelled path with guarded refund; else failed path with guarded refund; safe messages only (`profile.failureMessage`), error code ERR-016 retryable true, ERR-008 non-retryable for user-cancelled? Cancellation by user: retryable false, code 'ERR-008' ('Generation stopped.'). Use that for abort path.
- `finally`: `controllers.delete(genId)`, `controller.close()` in try/catch (mirror prd.ts:546-551).

`retryArtifactGenerationCore({generationId, request})`: load gen + conversation ownership (mirror retry lines 1234-1247), require `gen.status === 'failed'`, resolve profile by `artifactKindForSkill(gen.skillId ?? 'none')` (throw AppError 400 ERR-003 when null), model/cost/credit check (mirror 1248-1258), load message (mirror 1260-1264), create newMsg + newGen with `skillId: gen.skillId` (mirror 1266-1291), deduct, then `executeArtifactStream` with userContent = original user prompt: query the user message preceding... simplest deterministic: use the conversation's most recent user message content before newMsg (`db.select from messages where conversationId and role='user' orderBy desc limit 1`). Return the SSE Response.

- [ ] **Step 6: Add the server function and fail-closed guards** — in `src/server/functions/chat.ts` add:

```ts
import { artifactSchema } from '../../lib/utils/validation'
import { generateArtifactCore } from '../core/artifacts'

export const generateArtifact = createServerFn({ method: 'POST' })
  .validator((data: unknown) => artifactSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return generateArtifactCore({
      data: data as z.infer<typeof artifactSchema>,
      request,
    })
  })
```

In `src/server/core/chat.ts`: at the top of `sendMessageCore` after session/rate-limit (mirror the compare guard at line 506-512), add:

```ts
if (isArtifactSkill(data.skillId)) {
  throw new AppError(
    'Skill artifact hanya tersedia melalui pembuatan artifact.',
    400,
    'ERR-003',
  )
}
```

(import `isArtifactSkill` from '../../lib/chat/skills'). In `sendCompareMessageCore`, replace `if (data.skillId === 'prd-plan')` with `if (!skillSupportsCompare(data.skillId))` and generalize the message to `'Skill ini hanya tersedia untuk mode single model.'` (import `skillSupportsCompare`).

- [ ] **Step 7: Write the integration test** — create `tests/integration/artifact.test.ts` starting with the exact mock seam from `tests/integration/files.test.ts:1-74` (`/** @vitest-environment node */`, drizzle imports, r2 mock, session mock with `x-test-user`, `ai` mock) with this `mockStreamText` variant that serves deterministic per-test output:

```ts
let nextOutput = ''
let nextUsage = { inputTokens: 5, outputTokens: 10, totalTokens: 15 }

export function __setNextArtifactOutput(text: string) {
  nextOutput = text
}

const mockStreamText = vi.fn(() => {
  const textStream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(nextOutput)
      controller.close()
    },
  })
  ;(globalThis as unknown as Record<string, unknown>).__lastStreamMessages = []
  return {
    textStream,
    usage: Promise.resolve(nextUsage),
  }
})

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return { ...actual, streamText: mockStreamText }
})
```

Then DB setup mirroring `files.test.ts:76+` beforeEach (read that block at implementation time: it creates users/conversations and cleans tables; copy the pattern exactly — users table columns come from `src/lib/db/schema.ts:16-26`).

Test cases (all with a unique `x-test-user` per test to isolate rate limits, and `resetRateLimitForTest()` in beforeEach — import from `src/lib/security/rate-limit.ts:44`):

1. `creates an agent-skill artifact end to end`: seed user + conversation, `__setNextArtifactOutput(FRONTEND_SKILL)` (reuse a valid fixture string, self-contained in this file), call `generateArtifactCore({ data: { modelId: 'auto', skillId: 'agent-skill', content: 'Buatkan skill untuk frontend design' }, request: new Request('http://localhost/', { headers: { 'x-test-user': USER } }) })`, read SSE text, parse frames with `parseArtifactStreamEvent`, assert sequence types `['artifact-status', ..., 'artifact-created', 'artifact-status', 'artifact-done']` without asserting copy; capture `putObject` mock args and assert `body.toString('utf8')` contains `name: frontend-design` and key starts with `users/${USER}/attachments/`; query `attachments` row: `messageId` equals assistant message, `mimeType` `text/markdown`, `fileSize` equals byte length; query assistant message content starts with `'Skill \`'`; query generation run content equals canonical markdown and `skillId` `agent-skill`.
2. `rejects invalid output without creating a file`: output `'Just some prose, not a skill.'` → SSE contains `artifact-error` with `retryable: true`, `putObject` not called, attachments count 0, generation status `failed`, user credits unchanged (read before/after).
3. `fails closed when R2 upload throws`: `putObject` mockRejectedValueOnce → `artifact-error`, no attachment row, credits unchanged.
4. `sendMessageCore rejects artifact skills`: call with `skillId: 'agent-skill'` → rejects with status 400; `sendCompareMessageCore` with `skillId: 'agent-skill'` → rejects 400 (compare needs modelIds + conversation seed; mirror `tests/integration/compare.test.ts` payload shape — read its setup block at implementation time).
5. `retry routes artifact generations back to the artifact runner`: run case 2 to get a failed gen id, call `retryGenerationCore({ generationId, request })`, set valid output first, assert new `artifact-created` event and attachment row exists.

Model `auto` resolution: `resolveAutoModel` is real (no mock) — with real registry it returns some routerModelId; streamText is mocked so no network. Credit cost for auto comes from resolved cost; seed user credits high (e.g. 1000 — check users schema default; set explicitly in seed).

- [ ] **Step 8: Run tests**

Run: `bun x vitest run tests/unit/artifact-finalize.test.ts tests/integration/artifact.test.ts`
Expected: PASS. If the SSE response body is empty, check that `executeArtifactStream` enqueues via the same `controller.enqueue(encoder.encode(...))` shape as `prd.ts:274-278`.

- [ ] **Step 9: Typecheck, lint, bypass scan**

Run: `bun x tsc --noEmit`; `bun x biome check` on all touched files; bypass `rg` scan. Expect clean.

- [ ] **Step 10: Commit**

```bash
git add src/server/core/artifacts.ts src/server/core/artifact-profiles.ts tests/integration/artifact.test.ts tests/unit/artifact-finalize.test.ts src/server/functions/chat.ts src/server/core/chat.ts src/lib/utils/constants.ts
git commit -m "feat(artifacts): add shared artifact runner with agent-skill profile" -m "Profile-driven generation pipeline: preflight, server-side accumulation with byte cap, structural validation, R2 plus transactional DB finalization with compensation, guarded terminal transitions, artifact retry core, generateArtifact server function, and fail-closed guards in single/compare chat cores."
```

### Task 5: Server history substitution, owned cancel, artifact retry wiring

**Files:**
- Create: `src/server/core/history.ts`
- Create: `tests/integration/artifact-history.test.ts` (or append describes to `tests/integration/artifact.test.ts` — append, to reuse its seam)
- Modify: `src/server/core/artifacts.ts` (use `buildModelHistory`)
- Modify: `src/server/core/chat.ts` (`sendMessageCore`, `retryGenerationCore` history + `stopGenerationCore` ownership/refund)

**Interfaces:**
- Consumes: `ARTIFACT_HISTORY_BUDGET_BYTES` (Task 3), `ARTIFACT_SKILL_IDS` (Task 1), `finalizeTerminalRun` + `retryArtifactGenerationCore` (Task 4).
- Produces: `buildModelHistory(conversationId: string, budgetBytes?: number): Promise<ModelMessage[]>` used by all three generation paths.

- [ ] **Step 1: Write the failing test** — append to `tests/integration/artifact.test.ts`:

```ts
describe('artifact conversation history', () => {
  it('substitutes completed artifact source for follow-up generations', async () => {
    // seed user+conversation, run a successful agent-skill generation (reuse case-1 helper),
    // then send a normal chat message and capture the model input via
    // (globalThis as ...).__lastStreamMessages — extend the ai mock in this file
    // to record opts.messages like files.test.ts:52-53 does.
    // Assert one assistant entry contains 'name: frontend-design' while the
    // persisted assistant message content remains the short summary.
  })

  it('falls back to summaries beyond the byte budget', async () => {
    // call buildModelHistory(convId, 10) directly and assert the artifact
    // assistant entry equals the summary, not the source.
  })
})

describe('stop generation ownership', () => {
  it('rejects cancel for a generation owned by another user', async () => {
    // seed two users; create a streaming run for user A (insert generationRuns directly);
    // call stopGenerationCore with x-test-user: B → expect 403; status stays streaming.
  })
})
```

For the model-input capture, the Task 4 mock must record `opts.messages`. Amend the Task 4 mock in this task (edit `mockStreamText` to accept `opts` and store `opts.messages`) — allowed: same file, same task chain; do it as Step 1 edit with the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/artifact.test.ts -t "substitutes completed artifact"`
Expected: FAIL with "buildModelHistory is not defined" (import it in the test first).

- [ ] **Step 3: Implement history builder** — create `src/server/core/history.ts`:

```ts
import type { ModelMessage } from 'ai'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../lib/db/index'
import { generationRuns, messages } from '../../lib/db/schema'
import { ARTIFACT_HISTORY_BUDGET_BYTES } from '../../lib/ai/agent-skill'
import { ARTIFACT_SKILL_IDS } from '../../lib/chat/skills'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/history.ts is server-only')
}

export async function buildModelHistory(
  conversationId: string,
  budgetBytes: number = ARTIFACT_HISTORY_BUDGET_BYTES,
): Promise<ModelMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
  const runs = await db
    .select({
      messageId: generationRuns.messageId,
      skillId: generationRuns.skillId,
      status: generationRuns.status,
      content: generationRuns.content,
    })
    .from(generationRuns)
    .where(eq(generationRuns.conversationId, conversationId))
  const sourceByMessage = new Map<string, string>()
  const candidates: Array<{ messageId: string; bytes: number; source: string }> = []
  for (const run of runs) {
    if (
      run.status !== 'completed' ||
      !run.content ||
      !(ARTIFACT_SKILL_IDS as readonly string[]).includes(run.skillId ?? '')
    )
      continue
    candidates.push({
      messageId: run.messageId,
      bytes: Buffer.byteLength(run.content, 'utf8'),
      source: run.content,
    })
  }
  let remaining = budgetBytes
  const chosen = new Set<string>()
  const sortedByMessage = new Map<string, (typeof candidates)[number]>()
  for (const c of candidates) {
    if (!sortedByMessage.has(c.messageId)) sortedByMessage.set(c.messageId, c)
  }
  const messageOrder = new Map(rows.map((m, i) => [m.id, i]))
  const ranked = [...sortedByMessage.values()].sort(
    (a, b) =>
      (messageOrder.get(b.messageId) ?? 0) -
      (messageOrder.get(a.messageId) ?? 0),
  )
  for (const c of ranked) {
    if (c.bytes <= remaining) {
      remaining -= c.bytes
      chosen.add(c.messageId)
      sourceByMessage.set(c.messageId, c.source)
    }
  }
  return rows.map(
    (m) =>
      ({
        role: m.role as 'user' | 'assistant' | 'system',
        content:
          m.role === 'assistant' && chosen.has(m.id)
            ? (sourceByMessage.get(m.id) ?? m.content)
            : m.content,
      }) as ModelMessage,
  )
}
```

Remove the dead `ordered`/`byRecency` lines before committing (they are leftover scaffolding — delete them in the final edit; the real logic is `ranked` newest-first fill). Final function keeps: load, candidates, dedupe by message, newest-first budget fill, chronological map.

- [ ] **Step 4: Wire history into all three paths** — in `src/server/core/artifacts.ts` replace the plain messages query + map with `const aiMessages = await buildModelHistory(convId)`. In `src/server/core/chat.ts`, replace the history-building query blocks in `sendMessageCore` and `retryGenerationCore` (same `db.select().from(messages)...orderBy` + `.map((m) => ({ role: m.role as ..., content: m.content }))` shape seen in `prd.ts:248-254` and `chat.ts:1306-1311`) with `await buildModelHistory(convId)` / `await buildModelHistory(gen.conversationId)`. Remove now-unused `asc` import only if unused elsewhere in the file (check with grep; `chat.ts` uses `asc` in other queries — keep the import).

- [ ] **Step 5: Harden stop and wire retry** — in `src/server/core/chat.ts` replace `stopGenerationCore` (lines 1426-1442) with:

```ts
export async function stopGenerationCore({
  generationId,
  request,
}: {
  generationId: string
  request: Request
}) {
  const session = await getAuthSession(request)
  const [gen] = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.id, generationId))
  if (!gen) throw new AppError('Not Found', 404, 'ERR-003')
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, gen.conversationId))
  if (!conv || conv.userId !== session.user.id)
    throw new AppError('Forbidden', 403, 'ERR-003')
  const ctrl = controllers.get(generationId)
  if (ctrl) ctrl.abort()
  const modelEntry = getModelById(gen.modelId)
  const cost =
    typeof modelEntry.creditCost === 'number'
      ? modelEntry.creditCost
      : modelEntry.creditCost.max
  const won = await finalizeTerminalRun({
    genId: generationId,
    status: 'cancelled',
  })
  if (won) {
    await refundCredits({
      userId: session.user.id,
      generationRunId: generationId,
      modelId: gen.modelId,
      amount: cost,
    })
  }
  controllers.delete(generationId)
  return { ok: true as const }
}
```

Cost resolution mirrors `retryGenerationCore:1248-1252` exactly (`typeof modelEntry.creditCost === 'number' ? ... : .max`; `auto` uses resolved? For stop, modelId may be 'auto' — `getModelById('auto')` must exist in the registry; retry calls `getModelById(gen.modelId)` directly, so mirror that). Import `finalizeTerminalRun` from './artifacts' and `refundCredits` (already imported in chat.ts — verify; prd.ts imports it, chat.ts uses refundCredits per audit in compare finish paths, so the import exists).

In `retryGenerationCore`, after the ownership/status checks (after line 1247), insert:

```ts
if (isArtifactSkill(gen.skillId ?? 'none')) {
  return retryArtifactGenerationCore({ generationId, request })
}
```

(import both from their modules; `retryArtifactGenerationCore` from './artifacts'). This keeps the existing generic retry path untouched for chat/compare skills.

- [ ] **Step 6: Run tests**

Run: `bun x vitest run tests/integration/artifact.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, bypass scan; run affected suites** (`tests/integration/chat.test.ts`, `tests/integration/compare.test.ts` — retry/stop/history touch them).

- [ ] **Step 8: Commit**

```bash
git add src/server/core/history.ts src/server/core/artifacts.ts src/server/core/chat.ts tests/integration/artifact.test.ts
git commit -m "feat(artifacts): budgeted history substitution, owned cancel, artifact retry" -m "Follow-up generations see completed artifact source within a 64 KiB newest-first budget. stopGeneration verifies ownership and refunds once via guarded terminal transitions. Retrying a failed artifact generation re-enters the artifact runner instead of generic chat."
```

### Task 6: Skill-based hydration and browser DTO redaction

**Files:**
- Modify: `src/lib/utils/conversation-hydration.ts`
- Modify: `src/components/chat/MessageList.tsx` (type only: add new optional fields)
- Modify: `src/server/core/messages.ts` (redact completed artifact run content)
- Modify: `tests/unit/conversation-hydration.test.ts` (update PRD expectations + add cases)

**Interfaces:**
- Consumes: `artifactKindForSkill` (Task 1), `ArtifactDescriptor`-shaped object.
- Produces: `ChatMessage.artifact?`, `ChatMessage.artifactStatus?`, `ChatMessage.artifactSection?` populated by hydration; completed artifact run content redacted from browser DTOs. Consumed by Task 7 UI.

- [ ] **Step 1: Update the hydration tests first** — read `tests/unit/conversation-hydration.test.ts:145-194` (PRD reload test), then update expectations: PRD attachment hydrates `artifact: { kind: 'prd', ... }` and `artifactStatus: 'completed'`; add cases: agent-skill markdown attachment hydrates `kind: 'agent-skill'` (not PRD); historical agent-skill text without attachment stays ordinary content with no `artifact` field; compare branch unchanged. Keep all other cases green.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun x vitest run tests/unit/conversation-hydration.test.ts`
Expected: FAIL on the new/changed expectations.

- [ ] **Step 3: Implement skill-based classification** — in `src/lib/utils/conversation-hydration.ts`, replace lines 67-72 heuristic:

```ts
const markdownAttachment = message.attachments?.find(
  (a) => a.mimeType === 'text/markdown' || a.fileName.endsWith('.md'),
)
const artifactKind = artifactKindForSkill(run?.skillId ?? 'none')
const hasArtifact = Boolean(markdownAttachment) && artifactKind !== null
```

Replace `isPrd` usages: failure check `(!hasContent && !hasArtifact && run?.status === 'completed')`; error branch `isFailed && !hasArtifact`; artifact attach block:

```ts
...(hasArtifact && markdownAttachment && artifactKind
  ? {
      artifactStatus: 'completed' as const,
      artifactKind,
      artifact: {
        kind: artifactKind,
        attachmentId: markdownAttachment.id,
        fileName: markdownAttachment.fileName,
        fileSize: markdownAttachment.fileSize,
        mimeType: markdownAttachment.mimeType,
      },
    }
  : {}),
```

- [ ] **Step 4: Extend the ChatMessage type additively** — in `src/components/chat/MessageList.tsx` after the `prdArtifact` field (lines 42-49), add:

```ts
artifactStatus?: ArtifactPhase
artifactSection?: string
artifactKind?: ArtifactKind
artifact?: {
  kind: ArtifactKind
  attachmentId: string
  fileName: string
  fileSize: number
  mimeType: string
}
```

with imports `import type { ArtifactPhase } from '@/lib/ai/artifact-stream'` and `import type { ArtifactKind } from '@/lib/chat/skills'`. Keep the `prd*` fields untouched in this task (removed in Task 7).

- [ ] **Step 5: Redact completed artifact source from the browser DTO** — in `src/server/core/messages.ts`, transform `runRows` immediately after the `Promise.all` (before the `runsByMessage` grouping loop at lines 87-101): `const redactedRunRows = runRows.map((run) => (run.status === 'completed' && (ARTIFACT_SKILL_IDS as readonly string[]).includes(run.skillId ?? '') ? { ...run, content: null } : run))` and use `redactedRunRows` in the grouping loop. Import `ARTIFACT_SKILL_IDS` from `'../../lib/chat/skills'`. Server-side history (Task 5) reads the DB directly, unaffected.

- [ ] **Step 6: Run tests**

Run: `bun x vitest run tests/unit/conversation-hydration.test.ts tests/unit/message-list-virtual.test.tsx tests/unit/message-actions.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, bypass scan.**

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils/conversation-hydration.ts src/components/chat/MessageList.tsx src/server/core/messages.ts tests/unit/conversation-hydration.test.ts
git commit -m "feat(artifacts): classify hydrated artifacts by skill id" -m "Assistant markdown attachments map to an explicit artifact descriptor via generation skill id instead of extension sniffing, so agent-skill files never hydrate as PRD. Completed artifact source is redacted from browser DTOs; server history still reads full source from the database."
```

### Task 7: Generic client dispatch, progress, card, and guards

**Files:**
- Create: `src/components/chat/ArtifactProgress.tsx`
- Create: `tests/unit/artifact-progress.test.tsx`
- Modify: `src/routes/chat/$conversationId.tsx` (generalize `handleSendPrd` → artifact dispatch + reducer)
- Modify: `src/components/chat/MessageList.tsx` (render `artifact*` fields, drop `prd*`)
- Modify: `src/components/chat/FileCard.tsx` (generic props + testids + `?download=1`)
- Modify: `tests/unit/skill-selector.test.tsx` (already extended in Task 1 — no change here)
- Delete: `tests/unit/prd-progress.test.tsx` (replaced; its FileCard assertions move to the new FileCard tests in this task)

**Interfaces:**
- Consumes: `createArtifactSseParser` (Task 2), `isArtifactSkill` (Task 1), `generateArtifact` server fn (Task 4), `artifact*` message fields (Task 6).
- Produces: working single-model artifact UX for both profiles. Task 8 migrates the PRD server onto the runner and deletes legacy modules.

- [ ] **Step 1: Write the component tests first** — create `tests/unit/artifact-progress.test.tsx` (structural only, no copy assertions):

```tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArtifactProgress } from '../../src/components/chat/ArtifactProgress'
import { FileCard } from '../../src/components/chat/FileCard'

describe('ArtifactProgress', () => {
  afterEach(() => {
    cleanup()
  })

  it.each([
    ['prd', 'preparing'],
    ['prd', 'generating'],
    ['prd', 'validating'],
    ['prd', 'creating_file'],
    ['agent-skill', 'preparing'],
    ['agent-skill', 'generating'],
    ['agent-skill', 'validating'],
    ['agent-skill', 'creating_file'],
  ] as const)('renders live phase %s/%s with progress marker', (kind, phase) => {
    render(<ArtifactProgress kind={kind} phase={phase} />)
    const root = screen.getByTestId('artifact-progress')
    expect(root.getAttribute('data-phase')).toBe(phase)
    expect(screen.getByTestId('artifact-progress-text').textContent?.length).toBeGreaterThan(0)
  })

  it('renders completed and error states', () => {
    const { unmount } = render(<ArtifactProgress kind="prd" phase="completed" />)
    expect(screen.getByTestId('artifact-progress').getAttribute('data-phase')).toBe('completed')
    unmount()
    render(
      <ArtifactProgress kind="agent-skill" phase="error" errorMessage="boom" />,
    )
    expect(screen.getByTestId('artifact-progress-text').textContent).toContain('boom')
  })
})

describe('FileCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('links to the authenticated download endpoint with filename', () => {
    render(
      <FileCard
        artifact={{
          kind: 'agent-skill',
          attachmentId: '11111111-1111-4111-8111-111111111111',
          fileName: 'frontend-design.md',
          fileSize: 2048,
          mimeType: 'text/markdown',
        }}
      />,
    )
    expect(screen.getByTestId('artifact-file-card')).toBeTruthy()
    expect(screen.getByTestId('artifact-file-name').textContent).toBe('frontend-design.md')
    const link = screen.getByTestId('artifact-download-btn')
    expect(link.getAttribute('href')).toBe(
      '/api/attachments/11111111-1111-4111-8111-111111111111?download=1',
    )
    expect(link.getAttribute('download')).toBe('frontend-design.md')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun x vitest run tests/unit/artifact-progress.test.tsx`
Expected: FAIL with missing module.

- [ ] **Step 3: Create ArtifactProgress** — copy `src/components/chat/PrdProgress.tsx` structure with: props `{ kind: ArtifactKind; phase: ArtifactPhase; section?: string; errorMessage?: string }`; label function `getArtifactStatusText(kind, phase, section)` where PRD labels are byte-identical to the current PRD strings (overview→'Menulis overview...', etc., default 'Menulis dokumen...', preparing 'Menyiapkan PRD...', creating_file 'Menyiapkan file Markdown...', completed 'PRD selesai dibuat.', error 'Pembuatan PRD gagal.') and agent-skill labels map to spec §12.1 intents ('Menyiapkan skill...', 'Menulis instruksi...', 'Memvalidasi format...', 'Menyiapkan file Markdown...', completed uses the summary line rendered separately so completed label is 'Skill selesai dibuat.', error 'Pembuatan skill gagal.'); section badge renders only when `section` is set; testids `artifact-progress`, `artifact-progress-text`, `artifact-progress-badge`; `data-phase`, `data-section`, `data-kind` attributes; same layout/classes as PrdProgress (no visual change).

- [ ] **Step 4: Generalize FileCard** — modify `src/components/chat/FileCard.tsx`: props gain `kind: ArtifactKind`; badge label `artifact.mimeType === 'text/markdown' ? 'Markdown' : artifact.fileName.split('.').pop()?.toUpperCase() ?? 'File'`; href `` `/api/attachments/${artifact.attachmentId}?download=1` ``; testids renamed `artifact-file-card`, `artifact-file-name`, `artifact-file-size`, `artifact-download-btn`; all classes unchanged.

- [ ] **Step 5: Generalize the client dispatch** — in `src/routes/chat/$conversationId.tsx`:
  1. Replace `import { generatePrdArtifact }` with `import { generateArtifact }`; replace `parsePrdStreamEvent` import with `createArtifactSseParser` from `@/lib/ai/artifact-stream`; import `isArtifactSkill`, `getSkillDefinition` from `@/lib/chat/skills`.
  2. Rename `handleSendPrd` to `handleSendArtifact(content, modelId, skillId, attachmentIds?, enableWebSearch?)` with body identical except: optimistic message uses `{ streaming: true, artifactStatus: 'preparing', artifactKind: kind }` where `const kind = artifactKindForSkill(skillId) ?? 'prd'` (import `artifactKindForSkill` alongside `isArtifactSkill`; `artifactKind` is on the ChatMessage type since Task 6). Server call becomes `generateArtifact({ data: { conversationId, modelId, skillId, content, attachmentIds, enableWebSearch } })` (skillId now variable instead of hardcoded `'prd-plan'`).
  3. Replace the manual `buffer.split('\n\n')` loop (lines 223-316) with:

```ts
const parser = createArtifactSseParser({
  onEvent: (event) => {
    if (event.type === 'artifact-status') {
      if (event.phase === 'error') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, artifactStatus: 'error', errorMessage: event.message, streaming: false }
              : m,
          ),
        )
      } else if (event.phase === 'cancelled') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, artifactStatus: 'cancelled' as const, streaming: false } : m,
          ),
        )
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  artifactStatus: event.phase,
                  ...(event.phase === 'generating' && event.section
                    ? { artifactSection: event.section }
                    : {}),
                }
              : m,
          ),
        )
      }
    } else if (event.type === 'artifact-created') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, artifact: event.artifact, content: event.summary }
            : m,
        ),
      )
    } else if (event.type === 'artifact-error') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                artifactStatus: 'error',
                errorMessage: event.code,
                streaming: false,
              }
            : m,
        ),
      )
    } else if (event.type === 'artifact-done') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, artifactStatus: event.status, streaming: false }
            : m,
        ),
      )
    }
  },
  onError: () => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? { ...m, artifactStatus: 'error' as const, streaming: false }
          : m,
      ),
    )
  },
})

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  parser.push(decoder.decode(value, { stream: true }))
}
parser.flush()
```

  Note: `artifactStatus` type is `ArtifactPhase` which includes 'cancelled' and 'validating' — no cast needed except where the object literal widens; keep the `as const` markers shown. The `artifact-created` event carries `kind` — store it on the message too (`artifactKind: event.kind`) so progress/card render per-kind labels after reload-independent optimistic update. But `event.artifact` (Task 2 schema) has no `kind` — the message `artifact` field (Task 6) requires `kind`. Set message artifact as `{ kind: event.kind, ...event.artifact }`.
  4. Keep the post-EOF `getMessages` re-fetch, `refreshConversationList`, `refreshCredits`, and the 402 upgrade branch (replace `prdStatus: undefined` reset with `artifactStatus: undefined`, and error branch `prdStatus: 'error'` with `artifactStatus: 'error'`).
  5. Change dispatch (line 368): `if (isArtifactSkill(skillId)) return handleSendArtifact(content, modelId, skillId, attachmentIds, enableWebSearch)`.
  6. The old `prd-status generating → prdSection` mapping is replaced by `artifactSection` (string, no PrdSection type).

- [ ] **Step 6: Swap MessageList rendering to the generic fields** — in `src/components/chat/MessageList.tsx`: import `ArtifactProgress` instead of `PrdProgress`; replace `message.prdStatus`/`message.prdSection`/`message.prdArtifact` reads with `message.artifactStatus`/`message.artifactSection`/`message.artifact` (lines 268-274, 311, 322); pass `kind={message.artifactKind ?? message.artifact?.kind ?? 'prd'}` to progress and card; add `artifactKind?: ArtifactKind` to the `ChatMessage` type; delete the `prdStatus`/`prdSection`/`prdArtifact` fields and the `PrdPhase`/`PrdSection` imports. In `conversation-hydration.ts`, populate `artifactKind` alongside `artifact` (kind value). Update the Task 6 tests accordingly (append `artifactKind` to expected objects — do this edit in this step before running).

- [ ] **Step 7: Delete replaced tests, run suites**

```bash
git rm tests/unit/prd-progress.test.tsx
bun x vitest run tests/unit/artifact-progress.test.tsx tests/unit/conversation-hydration.test.ts tests/unit/message-list-virtual.test.tsx tests/unit/message-actions.test.tsx tests/unit/skill-selector.test.tsx
```

Expected: PASS. (PRD still works end to end because `generatePrdArtifact` server + `prd.ts` still emit `prd-*` events — wait, NO: the client no longer parses `prd-*` after this task, so PRD generation breaks until Task 8 migrates the server. This task deliberately breaks PRD live generation; integration coverage for PRD server does not exist (verified: no test calls `generatePrdArtifactCore`), and Task 8 immediately restores it on the shared runner. To keep `main` committable-but-degraded surface minimal, Tasks 7 and 8 must land back-to-back; the plan notes this ordering constraint explicitly. Alternative ordering (migrate server first) would break the old client instead — same single-task gap either way. Accept the gap, land Task 8 next.)

- [ ] **Step 8: Typecheck, lint, bypass scan.**

- [ ] **Step 9: Commit**

```bash
git add src/components/chat/ArtifactProgress.tsx tests/unit/artifact-progress.test.tsx src/routes/chat/$conversationId.tsx src/components/chat/MessageList.tsx src/components/chat/FileCard.tsx src/lib/utils/conversation-hydration.ts tests/unit/conversation-hydration.test.ts tests/unit/prd-progress.test.tsx
git commit -m "feat(artifacts): generic client dispatch, progress, and file card" -m "Single artifact SSE reducer, per-kind progress labels, generic file card with download disposition link, and skill-derived dispatch. PRD live generation is re-pointed to the shared runner in the next commit."
```

### Task 8: Migrate PRD onto the shared runner, remove legacy modules

**Files:**
- Modify: `src/server/core/prd.ts` (thin wrapper over the runner)
- Delete: `src/lib/ai/prd-stream.ts`, `src/components/chat/PrdProgress.tsx`
- Modify: any remaining `prd-stream`/`PrdProgress` importers found by grep
- Modify: `tests/unit/prd-artifact.test.ts` (only if it imports prd-stream — check; validators stay)

**Interfaces:**
- Consumes: runner + `prdProfile` (Task 4), generic client (Task 7).
- Produces: one protocol, zero PRD-only stream modules. Restores PRD live generation broken by Task 7.

- [ ] **Step 1: Confirm remaining legacy importers**

Run: `rg -n "prd-stream|PrdProgress|parsePrdStreamEvent|encodePrdSseEvent|PrdPhase|PrdSection" src tests --glob '!**/routeTree.gen.ts'`
Expected: hits only in `src/server/core/prd.ts` (types), `src/lib/ai/prd-artifact.ts` (imports `PrdSection` type), `src/components/chat/PrdProgress.tsx`, `src/lib/ai/prd-stream.ts` itself, and possibly `tests/unit/prd-artifact.test.ts`.

- [ ] **Step 2: Rewrite `generatePrdArtifactCore` as a profile thin wrapper** — replace the body of `src/server/core/prd.ts` (keep its exported signature `{ data: z.infer<typeof chatSchema>; request: Request } => Promise<Response>`) with delegation:

```ts
import type { z } from 'zod'
import type { chatSchema } from '../../lib/utils/validation'
import { generateArtifactCore } from './artifacts'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/prd.ts is server-only')
}

export async function generatePrdArtifactCore({
  data,
  request,
}: {
  data: z.infer<typeof chatSchema>
  request: Request
}): Promise<Response> {
  return generateArtifactCore({
    data: {
      conversationId: data.conversationId,
      modelId: data.modelId,
      skillId: 'prd-plan',
      content: data.content,
      attachmentIds: data.attachmentIds,
      enableWebSearch: data.enableWebSearch,
    },
    request,
  })
}
```

`generateArtifactCore` must therefore accept the narrowed input at runtime even when called with `skillId: 'prd-plan'` — it already validates membership in `ARTIFACT_SKILL_IDS`. Keep `generatePrdArtifact` server fn untouched (same route, same shape).

- [ ] **Step 3: Re-point the PRD type import** — in `src/lib/ai/prd-artifact.ts` line 1, `import type { PrdSection } from './prd-stream'` breaks once prd-stream is deleted. Replace with a local union (copy the 7 literals verbatim) named `PrdSection` and exported:

```ts
export type PrdSection =
  | 'overview'
  | 'requirements'
  | 'features'
  | 'userflow'
  | 'architecture'
  | 'schema'
  | 'techstack'
```

(ArtifactProgress receives section as plain `string`, so no other type change is needed.)

- [ ] **Step 4: Delete legacy modules**

```bash
git rm src/lib/ai/prd-stream.ts src/components/chat/PrdProgress.tsx
```

- [ ] **Step 5: Run the full unit + integration suites**

Run: `bun x vitest run tests/unit tests/integration`
Expected: all PASS. If `tests/unit/prd-artifact.test.ts` imported parser helpers, update those imports to the new modules without weakening assertions.

- [ ] **Step 6: Typecheck, lint, bypass scan.**

- [ ] **Step 7: Commit**

```bash
git add src/server/core/prd.ts src/lib/ai/prd-artifact.ts src/lib/ai/prd-stream.ts src/components/chat/PrdProgress.tsx tests/unit/prd-artifact.test.ts
git commit -m "refactor(artifacts): run PRD generation on the shared runner" -m "generatePrdArtifactCore delegates to generateArtifactCore with the prd profile. Removes prd-stream protocol and PrdProgress; both skills share one typed event contract, one progress shell, and one file card."
```

### Task 9: Authenticated download disposition

**Files:**
- Modify: `src/server/functions/files.ts` (`getAttachmentCore`)
- Modify: `src/routes/api/attachments/$attachmentId.tsx` (pass `download` flag)
- Create: `tests/integration/artifact-download.test.ts`

**Interfaces:**
- Consumes: existing download route + FileCard `?download=1` link (Task 7).
- Produces: `Content-Disposition: attachment` downloads with exact bytes, MIME, length, and nosniff.

- [ ] **Step 1: Write the failing test** — create `tests/integration/artifact-download.test.ts` with the `/** @vitest-environment node */` header and the r2/session mock seam copied from `tests/integration/files.test.ts:9-27` (mock `getObject` to return `Buffer.from('# Skill\n\nBody')` with `text/markdown`):

```ts
/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/r2/client', () => ({
  putObject: vi.fn(async () => {}),
  getObject: vi.fn(async () => ({
    body: Buffer.from('# Skill\n\nBody'),
    contentType: 'text/markdown',
  })),
  deleteObject: vi.fn(async () => {}),
}))

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async () => ({
    user: { id: 'test-user-download', email: 'dl@example.com' },
  })),
}))

import { getAttachmentCore } from '../../src/server/functions/files'

describe('artifact download', () => {
  it('serves attachment disposition with exact bytes when download is set', async () => {
    // seed: insert user, conversation, message, attachment rows via db
    // (mirror tests/integration/files.test.ts seeding; users columns per schema.ts:16-26)
    const res = await getAttachmentCore({
      data: { id: attachmentId, download: true },
      request: new Request('http://localhost/'),
    })
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toContain('attachment;')
    expect(res.headers.get('Content-Disposition')).toContain('.md"')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.toString('utf8')).toBe('# Skill\n\nBody')
    expect(res.headers.get('Content-Length')).toBe(String(bytes.length))
  })

  it('keeps inline disposition by default', async () => {
    const res = await getAttachmentCore({
      data: { id: attachmentId },
      request: new Request('http://localhost/'),
    })
    expect(res.headers.get('Content-Disposition')).toContain('inline;')
  })

  it('denies other users', async () => {
    await expect(
      getAttachmentCore({
        data: { id: attachmentId },
        request: new Request('http://localhost/', {
          headers: { 'x-test-user': 'someone-else' },
        }),
      }),
    ).rejects.toThrow()
  })
})
```

Note: the session mock above returns a fixed user; extend it with the `x-test-user` header pattern from `files.test.ts:19-27` so the third case works (copy that block verbatim).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/artifact-download.test.ts`
Expected: FAIL (data schema rejects unknown `download` key — Zod strips it by default so `download` is undefined; first case fails on `attachment;`).

- [ ] **Step 3: Implement disposition support** — in `src/server/functions/files.ts`, extend the `getAttachmentCore` data schema inline (`z.object({ id: z.string().uuid() })` at line 139) to `{ id: z.string().uuid(), download: z.boolean().optional().default(false) }`, and build headers:

```ts
const buffer = body // Buffer from getObject
const disposition = parsed.data.download ? 'attachment' : 'inline'
return new Response(new Uint8Array(buffer), {
  headers: {
    'Content-Type':
      att.mimeType === 'text/markdown'
        ? 'text/markdown; charset=utf-8'
        : contentType || att.mimeType,
    'Content-Disposition': `${disposition}; filename="${att.fileName}"`,
    'Content-Length': String(buffer.length),
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  },
})
```

`att.fileName` is produced by server-side sanitizers (upload validator / artifact profiles), so header injection via quotes is already neutralized at write time.

In `src/routes/api/attachments/$attachmentId.tsx` GET handler, parse the flag and pass through:

```ts
const url = new URL(request.url)
const download = url.searchParams.get('download') === '1'
const result = await getAttachmentCore({
  data: { id: params.attachmentId, download },
  request,
})
```

- [ ] **Step 4: Run tests**

Run: `bun x vitest run tests/integration/artifact-download.test.ts tests/integration/files.test.ts`
Expected: PASS (existing inline image-preview behavior preserved).

- [ ] **Step 5: Typecheck, lint, bypass scan.**

- [ ] **Step 6: Commit**

```bash
git add src/server/functions/files.ts src/routes/api/attachments/$attachmentId.tsx tests/integration/artifact-download.test.ts
git commit -m "feat(files): attachment download disposition for artifacts" -m "getAttachmentCore serves Content-Disposition attachment with exact UTF-8 bytes, markdown charset, content length, and nosniff when download is set. Default inline preview behavior unchanged."
```

### Task 10: E2E journeys and full regression gates

**Files:**
- Create: `tests/e2e/agent-skill.spec.ts`
- Modify: none (fix failures only; never weaken existing tests)

**Interfaces:**
- Consumes: everything above.
- Produces: green gates + manual live-quality checklist (prose quality stays human-reviewed per AGENTS.md).

- [ ] **Step 1: Study the existing E2E auth/seeding pattern** — read `tests/e2e/persistence.spec.ts` (real app + DB usage) and mirror its login/session and DB-seeding approach exactly. Do not invent a new auth harness.

- [ ] **Step 2: Write the journey spec** — create `tests/e2e/agent-skill.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('compare mode blocks agent-skill submit with clear validation', async ({
  page,
}) => {
  // mirror persistence.spec.ts login, open a conversation, enable compare,
  // select Agent Skill is disabled: assert skill-option-agent-skill is disabled
  // and enabling compare while agent-skill selected resets to none.
})

test('seeded artifact survives reload and downloads intact', async ({
  page,
}) => {
  // seed via drizzle (users, conversations, messages, generationRuns skillId
  // 'agent-skill' completed, attachments row pointing at the assistant message)
  // following the persistence.spec.ts seeding pattern; mock R2 is NOT available
  // in E2E, so point the test env at the real local R2/MinIO substitute used by
  // the E2E environment, or upload the bytes through the running server first.
  // Then: open conversation, expect artifact file card with the seeded filename,
  // reload, expect the card again, click download, assert filename + content.
})

test('failed generation shows recoverable error and no empty file', async ({
  page,
}) => {
  // seed a failed agent-skill generation run; open conversation;
  // expect error state and zero file cards.
})
```

If the E2E environment has no writable R2, seed the attachment bytes by calling the running app's own upload path is for user uploads only — instead seed the DB row and serve bytes by temporarily pointing the test to the local stack's R2 (check `.env.example` R2 vars and the E2E setup docs first; keep whatever the repo already does for upload E2E).

- [ ] **Step 3: Run the new spec**

Run: `bun x playwright test tests/e2e/agent-skill.spec.ts`
Expected: PASS. Triage failures as product bugs, not spec edits.

- [ ] **Step 4: Run the full gates**

Run: `bun x tsc --noEmit`; `bun x biome check ./src`; `bun x vitest run`; bypass `rg` scan; `bun x playwright test` (full suite, or at minimum the chat/compare/persistence/upload specs if the full run is environment-blocked — record which suites ran).

- [ ] **Step 5: Live model quality check (manual, not automated)** — with 9Router running, submit `Buatkan skill untuk frontend design`, `Buat skill untuk test-driven development`, and one short ambiguous request. Confirm each artifact is actionable, domain-adapted, non-shallow, downloads as valid UTF-8 `<slug>.md`, and the chat shows only the summary. Record results in the handoff message; do not encode prose judgments into tests.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/agent-skill.spec.ts
git commit -m "test(e2e): cover agent-skill artifact journeys" -m "Compare-mode guard, seeded artifact reload persistence with real download, and failed-generation empty-file guard."
```

---

## Self-Review

**Spec coverage:** every spec section has a task — contracts (§6) Task 3; summary (§7) Tasks 3-4; dispatch/compare (§8) Tasks 1, 4, 7; lifecycle/events (§9) Tasks 2, 4; finalization (§10) Task 4; hydration/history (§11) Tasks 5-6; UI/download (§12) Tasks 7, 9; errors/retry (§13) Tasks 4-5; tests (§14) all tasks; boundaries (§15) as listed; compatibility (§16) via additive-then-remove ordering; non-goals (§17) excluded (no install/edit UI, no versioning, no multi-file, no compare artifacts, no new infra, no dark mode, no backfill).

**Placeholder scan:** no TBD/TODO; every step names exact files, functions, commands, and expected outputs. Two steps reference reading an existing block first (`validation.test.ts` imports, `files.test.ts` seeding, `persistence.spec.ts` E2E pattern) — these point at verified-existing files, not open design.

**Type consistency:** `ArtifactStreamEvent` shapes match producer (Task 4) and consumer (Task 7) field by field (`generationId`, `kind`, `summary`/`artifact`/`code`/`retryable`/`status`/`messageId`/`conversationId`). `ChatMessage.artifact.kind` is populated from `event.kind` (Task 7 Step 5) and from hydration `artifactKind` (Task 6). `ValidatedArtifact` produced by profiles is consumed by the runner finalizer. `artifactSchema`/`ArtifactInput` shared by server fn and runner. `SKILL_IDS` tuple feeds `z.enum` in Task 1.

**Ordering risk:** Task 7 breaks PRD live generation until Task 8 lands — flagged in-task; land them back-to-back with no other commits between.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-06-agent-skill-artifact-workflow.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task with review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
