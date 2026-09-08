import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_MENTION_MODES,
  artifactMentionInputSchema,
  artifactMentionsSchema,
} from '../../src/lib/artifacts/mentions'
import {
  MAX_ARTIFACT_MENTIONS,
  MAX_ARTIFACT_MENTION_CONTEXT_BYTES,
  MAX_ARTIFACT_VERSION_BYTES,
} from '../../src/lib/utils/constants'
import {
  artifactOperationSchema,
  chatSchema,
  compareSchema,
} from '../../src/lib/utils/validation'

const ARTIFACT_A = '10000000-0000-4000-8000-0000000000a1'
const VERSION_A = '10000000-0000-4000-8000-0000000000a2'
const ARTIFACT_B = '10000000-0000-4000-8000-0000000000b1'
const VERSION_B = '10000000-0000-4000-8000-0000000000b2'
const CONVERSATION_ID = '10000000-0000-4000-8000-0000000000c1'

function mentionPair(suffix: string, mode: 'context' | 'revise' = 'context') {
  return {
    artifactId: `10000000-0000-4000-8000-000000000${suffix}a`,
    versionId: `10000000-0000-4000-8000-000000000${suffix}b`,
    mode,
  }
}

describe('artifact mention input contracts', () => {
  it('exposes exactly the context and revise modes', () => {
    expect(ARTIFACT_MENTION_MODES).toEqual(['context', 'revise'])
  })

  it('accepts valid context and revise mentions', () => {
    expect(
      artifactMentionInputSchema.parse({
        artifactId: ARTIFACT_A,
        versionId: VERSION_A,
        mode: 'context',
      }),
    ).toEqual({ artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' })
    expect(
      artifactMentionInputSchema.parse({
        artifactId: ARTIFACT_A,
        versionId: VERSION_A,
        mode: 'revise',
      }).mode,
    ).toBe('revise')
  })

  it('rejects invalid UUIDs and modes', () => {
    expect(() =>
      artifactMentionInputSchema.parse({
        artifactId: 'not-a-uuid',
        versionId: VERSION_A,
        mode: 'context',
      }),
    ).toThrow()
    expect(() =>
      artifactMentionInputSchema.parse({
        artifactId: ARTIFACT_A,
        versionId: 'not-a-uuid',
        mode: 'context',
      }),
    ).toThrow()
    expect(() =>
      artifactMentionInputSchema.parse({
        artifactId: ARTIFACT_A,
        versionId: VERSION_A,
        mode: 'delete',
      }),
    ).toThrow()
  })

  it('rejects client display labels in the submitted shape', () => {
    expect(() =>
      artifactMentionInputSchema.parse({
        artifactId: ARTIFACT_A,
        versionId: VERSION_A,
        mode: 'context',
        title: 'Release plan',
      }),
    ).toThrow()
  })
})

describe('artifactMentionsSchema', () => {
  it('accepts an empty list and up to four unique mentions', () => {
    expect(artifactMentionsSchema.parse([])).toEqual([])
    const four = [
      mentionPair('01'),
      mentionPair('02'),
      mentionPair('03'),
      mentionPair('04', 'revise'),
    ]
    expect(artifactMentionsSchema.parse(four)).toHaveLength(4)
  })

  it('rejects more than four mentions', () => {
    const five = [
      mentionPair('01'),
      mentionPair('02'),
      mentionPair('03'),
      mentionPair('04'),
      mentionPair('05'),
    ]
    expect(() => artifactMentionsSchema.parse(five)).toThrow()
    expect(MAX_ARTIFACT_MENTIONS).toBe(4)
  })

  it('rejects duplicate artifact IDs', () => {
    const duplicate = [
      { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
      { artifactId: ARTIFACT_A, versionId: VERSION_B, mode: 'revise' },
    ]
    expect(() => artifactMentionsSchema.parse(duplicate)).toThrow()
  })
})

describe('artifact operation mention partitions', () => {
  it('accepts create with context-only mentions', () => {
    const parsed = artifactOperationSchema.parse({
      type: 'create',
      skillId: 'prd-plan',
      context: [
        { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
      ],
    })
    expect(parsed.type).toBe('create')
  })

  it('rejects revise mentions inside create context', () => {
    expect(() =>
      artifactOperationSchema.parse({
        type: 'create',
        skillId: 'prd-plan',
        context: [
          { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'revise' },
        ],
      }),
    ).toThrow()
  })

  it('accepts revise with revise targets and context companions', () => {
    const parsed = artifactOperationSchema.parse({
      type: 'revise',
      targets: [
        { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'revise' },
      ],
      context: [
        { artifactId: ARTIFACT_B, versionId: VERSION_B, mode: 'context' },
      ],
    })
    expect(parsed.type).toBe('revise')
  })

  it('rejects context mentions inside revise targets', () => {
    expect(() =>
      artifactOperationSchema.parse({
        type: 'revise',
        targets: [
          { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
        ],
        context: [],
      }),
    ).toThrow()
  })

  it('rejects duplicate IDs across targets and context', () => {
    expect(() =>
      artifactOperationSchema.parse({
        type: 'revise',
        targets: [
          { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'revise' },
        ],
        context: [
          { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
        ],
      }),
    ).toThrow()
  })

  it('rejects combined targets and context beyond the mention cap', () => {
    expect(() =>
      artifactOperationSchema.parse({
        type: 'revise',
        targets: [
          mentionPair('11', 'revise'),
          mentionPair('12', 'revise'),
          mentionPair('13', 'revise'),
        ],
        context: [mentionPair('14'), mentionPair('15')],
      }),
    ).toThrow()
  })
})

describe('chat and compare mention wiring', () => {
  it('accepts mentions on chat only with a conversation ID', () => {
    const parsed = chatSchema.parse({
      conversationId: CONVERSATION_ID,
      modelId: 'model-internal',
      content: 'Explain this',
      artifactMentions: [
        { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
      ],
    })
    expect(parsed.artifactMentions).toHaveLength(1)
  })

  it('rejects mentions when the conversation does not exist yet', () => {
    expect(() =>
      chatSchema.parse({
        modelId: 'model-internal',
        content: 'Explain this',
        artifactMentions: [
          { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
        ],
      }),
    ).toThrow()
  })

  it('rejects duplicate mention artifact IDs on chat', () => {
    expect(() =>
      chatSchema.parse({
        conversationId: CONVERSATION_ID,
        modelId: 'model-internal',
        content: 'Explain this',
        artifactMentions: [
          { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
          { artifactId: ARTIFACT_A, versionId: VERSION_B, mode: 'context' },
        ],
      }),
    ).toThrow()
  })

  it('accepts mentions on compare only with a conversation ID', () => {
    const parsed = compareSchema.parse({
      conversationId: CONVERSATION_ID,
      modelIds: ['model-a', 'model-b'],
      content: 'Compare these',
      artifactMentions: [
        { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
        { artifactId: ARTIFACT_B, versionId: VERSION_B, mode: 'context' },
      ],
    })
    expect(parsed.artifactMentions).toHaveLength(2)
  })

  it('rejects mentions without a conversation ID on compare', () => {
    expect(() =>
      compareSchema.parse({
        modelIds: ['model-a', 'model-b'],
        content: 'Compare these',
        artifactMentions: [
          { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
        ],
      }),
    ).toThrow()
  })

  it('preserves prompt text without parsing mention references', () => {
    const parsed = chatSchema.parse({
      conversationId: CONVERSATION_ID,
      modelId: 'model-internal',
      content: 'Summarize @release-plan.md for me',
    })
    expect(parsed.content).toBe('Summarize @release-plan.md for me')
    expect(parsed.artifactMentions).toBeUndefined()
  })
})

describe('mention context budget', () => {
  it('derives the aggregate context budget from configured limits', () => {
    expect(MAX_ARTIFACT_MENTION_CONTEXT_BYTES).toBe(
      MAX_ARTIFACT_MENTIONS * MAX_ARTIFACT_VERSION_BYTES,
    )
  })
})
