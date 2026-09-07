/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_SKILL_IDS,
  artifactKindForSkill,
  isArtifactSkill,
  skillSupportsCompare,
} from '../../src/lib/chat/skills'
import { artifactSchema } from '../../src/lib/utils/validation'

const VALID_JSON = JSON.stringify({
  type: 'checklist',
  title: 'Checklist puasa',
  items: [
    { id: 'task-1', text: 'Sahur', completed: false },
    { id: 'task-2', text: 'Sholat subuh', completed: false },
  ],
})

describe('checklist artifact conversion', () => {
  it('exposes a markdown mime type', async () => {
    const { CHECKLIST_MIME_TYPE } = await import(
      '../../src/lib/ai/checklist-artifact'
    )
    expect(CHECKLIST_MIME_TYPE).toBe('text/markdown')
  })

  it('converts valid checklist JSON to canonical markdown with metadata', async () => {
    const { buildChecklistArtifact } = await import(
      '../../src/lib/ai/checklist-artifact'
    )
    const result = buildChecklistArtifact(VALID_JSON)
    expect(result).not.toBeNull()
    expect(result?.mimeType).toBe('text/markdown')
    expect(result?.fileName.endsWith('.md')).toBe(true)
    expect(result?.markdown.split('\n').filter((line) => line.startsWith('- [ ] '))).toHaveLength(2)
    expect(result?.markdown.startsWith('# Checklist puasa\n')).toBe(true)
    expect(result?.markdown.endsWith('\n')).toBe(true)
    expect(result?.markdown).not.toContain('\r')
    expect(result?.markdown).not.toContain('"type"')
    expect(result?.title).toBe('Checklist puasa')
    expect(result?.fileSize).toBe(Buffer.byteLength(result?.markdown ?? '', 'utf8'))
    expect(result?.summary).toContain('Checklist puasa')
    expect(result?.summary).toContain('2')
  })

  it('is deterministic for the same input', async () => {
    const { buildChecklistArtifact } = await import(
      '../../src/lib/ai/checklist-artifact'
    )
    const first = buildChecklistArtifact(VALID_JSON)
    const second = buildChecklistArtifact(VALID_JSON)
    expect(first).toEqual(second)
  })

  it('sanitizes the filename without unsafe segments', async () => {
    const { buildChecklistArtifact } = await import(
      '../../src/lib/ai/checklist-artifact'
    )
    const result = buildChecklistArtifact(VALID_JSON)
    expect(result?.fileName).not.toContain(' ')
    expect(result?.fileName).not.toContain('/')
    expect(result?.fileName).not.toContain('\\')
    expect(result?.fileName).not.toContain(':')
    expect(result?.fileName.length).toBeGreaterThan(3)
  })

  it('returns null for invalid JSON', async () => {
    const { buildChecklistArtifact } = await import(
      '../../src/lib/ai/checklist-artifact'
    )
    expect(buildChecklistArtifact('not json at all')).toBeNull()
    expect(buildChecklistArtifact('')).toBeNull()
    expect(buildChecklistArtifact(null as unknown as string)).toBeNull()
  })

  it('returns null when no valid items remain', async () => {
    const { buildChecklistArtifact } = await import(
      '../../src/lib/ai/checklist-artifact'
    )
    expect(
      buildChecklistArtifact('{"type":"checklist","items":[]}'),
    ).toBeNull()
    expect(
      buildChecklistArtifact(
        JSON.stringify({
          type: 'checklist',
          title: 'Empty tasks',
          items: [
            { id: 'task-1', text: '   ', completed: false },
            { id: 'task-2', text: '', completed: false },
          ],
        }),
      ),
    ).toBeNull()
  })

  it('returns null for missing, empty, or unsafe titles', async () => {
    const { buildChecklistArtifact } = await import(
      '../../src/lib/ai/checklist-artifact'
    )
    expect(
      buildChecklistArtifact(
        JSON.stringify({
          type: 'checklist',
          items: [{ id: 'task-1', text: 'Sahur', completed: false }],
        }),
      ),
    ).toBeNull()
    expect(
      buildChecklistArtifact(
        JSON.stringify({
          type: 'checklist',
          title: '   ',
          items: [{ id: 'task-1', text: 'Sahur', completed: false }],
        }),
      ),
    ).toBeNull()
    expect(
      buildChecklistArtifact(
        JSON.stringify({
          type: 'checklist',
          title: 'Line one\nLine two',
          items: [{ id: 'task-1', text: 'Sahur', completed: false }],
        }),
      ),
    ).toBeNull()
    expect(
      buildChecklistArtifact(
        JSON.stringify({
          type: 'checklist',
          title: '<>:"/\\|?*',
          items: [{ id: 'task-1', text: 'Sahur', completed: false }],
        }),
      ),
    ).toBeNull()
  })

  it('returns null for byte overrun input', async () => {
    const { buildChecklistArtifact } = await import(
      '../../src/lib/ai/checklist-artifact'
    )
    const { MAX_ARTIFACT_VERSION_BYTES } = await import(
      '../../src/lib/utils/constants'
    )
    const padded = `${' '.repeat(MAX_ARTIFACT_VERSION_BYTES + 1)}${VALID_JSON}`
    expect(buildChecklistArtifact(padded)).toBeNull()
  })
})

describe('checklist artifact registry', () => {
  it('is listed as an artifact skill with compare support', () => {
    expect((ARTIFACT_SKILL_IDS as readonly string[]).includes('checklist')).toBe(
      true,
    )
    expect(isArtifactSkill('checklist')).toBe(true)
    expect(skillSupportsCompare('checklist')).toBe(true)
    expect(artifactKindForSkill('checklist')).toBe('checklist')
  })

  it('is accepted by the artifact validation schema', () => {
    const base = { modelId: 'auto', content: 'hello', skillId: 'checklist' }
    expect(artifactSchema.safeParse(base).success).toBe(true)
  })

  it('registers a checklist profile with markdown output', async () => {
    const { ARTIFACT_PROFILES } = await import(
      '../../src/server/core/artifact-profiles'
    )
    const profile = ARTIFACT_PROFILES.checklist
    expect(profile.kind).toBe('checklist')
    expect(profile.skillId).toBe('checklist')
    expect(profile.mimeType).toBe('text/markdown')
    const built = profile.buildArtifact(VALID_JSON, 'buatkan checklist puasa')
    expect(built).not.toBeNull()
    expect(built?.fileName.endsWith('.md')).toBe(true)
    expect(
      built?.markdown
        .split('\n')
        .filter((line) => line.startsWith('- [ ] ')),
    ).toHaveLength(2)
    expect(profile.validate(VALID_JSON).valid).toBe(true)
    expect(profile.validate('not json').valid).toBe(false)
  })
})
