/**
 * @vitest-environment node
 */
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/index'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  creditTransactions,
  generationRuns,
  messages,
  usageRecords,
  users,
} from '../../src/lib/db/schema'
import { artifactOperationSchema } from '../../src/lib/utils/validation'

vi.mock('../../src/lib/r2/client', () => ({
  putObject: vi.fn(async () => {}),
  getObject: vi.fn(async () => ({
    body: Buffer.from('seed-bytes'),
    contentType: 'text/markdown',
  })),
  deleteObject: vi.fn(async () => {}),
}))

const OP_USER = 'artifact-ops-user'

async function cleanUser(userId: string) {
  await db.delete(usageRecords).where(eq(usageRecords.userId, userId))
  await db
    .delete(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
  await db.execute(
    sql`UPDATE generation_runs SET source_artifact_id = NULL, source_version_id = NULL WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${userId})`,
  )
  await db.execute(
    sql`UPDATE artifact_versions SET source_version_id = NULL WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${userId})`,
  )
  await db.execute(
    sql`UPDATE artifacts SET current_version_id = NULL WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${userId})`,
  )
  await db.execute(
    sql`DELETE FROM artifact_versions WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${userId})`,
  )
  await db.execute(
    sql`DELETE FROM artifacts WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${userId})`,
  )
  await db.execute(
    sql`DELETE FROM generation_runs WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${userId})`,
  )
  await db.execute(
    sql`DELETE FROM attachments WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${userId})`,
  )
  await db.execute(
    sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${userId})`,
  )
  await db.delete(conversations).where(eq(conversations.userId, userId))
  await db.delete(users).where(eq(users.id, userId))
}

async function seedVersion({
  userId,
  kind,
}: {
  userId: string
  kind: 'prd' | 'agent-skill' | 'checklist'
}): Promise<{
  convId: string
  artifactId: string
  versionId: string
}> {
  const { finalizeArtifactVersion } = await import(
    '../../src/server/core/artifact-finalization'
  )
  const [conv] = await db
    .insert(conversations)
    .values({ userId, title: 'Ops fixture', mode: 'normal' })
    .returning()
  const [assistantMsg] = await db
    .insert(messages)
    .values({ conversationId: conv.id, role: 'assistant', content: '' })
    .returning()
  const genId = crypto.randomUUID()
  await db.insert(generationRuns).values({
    id: genId,
    messageId: assistantMsg.id,
    conversationId: conv.id,
    modelId: 'auto',
    routerModelId: 'auto',
    skillId: 'agent-skill',
    status: 'streaming',
    startedAt: new Date(),
  })
  const bytes = new TextEncoder().encode(`# Ops ${kind}\n\nSeed bytes.\n`)
  const descriptor = await finalizeArtifactVersion({
    userId,
    conversationId: conv.id,
    messageId: assistantMsg.id,
    generationId: genId,
    kind,
    title: `Ops ${kind}`,
    modelId: 'auto',
    routerModelId: 'auto',
    fileName: `ops-${kind}.md`,
    mimeType: 'text/markdown',
    bytes,
    summary: `Summary ${kind}.`,
    usage: null,
    timing: { latencyMs: 5, timeToFirstTokenMs: null },
    finalizationMode: 'create',
  })
  return {
    convId: conv.id,
    artifactId: descriptor.artifactId,
    versionId: descriptor.versionId,
  }
}

describe('artifactOperationSchema', () => {
  it('accepts create with an artifact skill', () => {
    const parsed = artifactOperationSchema.parse({
      type: 'create',
      skillId: 'checklist',
    })
    expect(parsed.type).toBe('create')
  })

  it('accepts revise with one to four targets', () => {
    const one = artifactOperationSchema.parse({
      type: 'revise',
      targets: [
        {
          artifactId: crypto.randomUUID(),
          versionId: crypto.randomUUID(),
        },
      ],
    })
    if (one.type !== 'revise') throw new Error('wrong variant')
    expect(one.targets).toHaveLength(1)
  })

  it('rejects revise with zero targets', () => {
    expect(() =>
      artifactOperationSchema.parse({ type: 'revise', targets: [] }),
    ).toThrow()
  })
})

describe('planArtifactOperations', () => {
  beforeEach(async () => {
    await cleanUser(OP_USER)
    await db.insert(users).values({
      id: OP_USER,
      email: `${OP_USER}@example.com`,
      name: OP_USER,
      credits: 1000,
    })
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await cleanUser(OP_USER)
  })

  it('plans one target for one create model', async () => {
    const { planArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    const planned = await planArtifactOperations({
      userId: OP_USER,
      operation: { type: 'create', skillId: 'checklist' },
    })
    expect(planned).toHaveLength(1)
    expect(planned[0].type).toBe('create')
    if (planned[0].type !== 'create') throw new Error('wrong plan')
    expect(planned[0].kind).toBe('checklist')
  })

  it('plans one generation per revision target', async () => {
    const first = await seedVersion({ userId: OP_USER, kind: 'checklist' })
    const secondSeed = await seedVersion({ userId: OP_USER, kind: 'prd' })
    const { planArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    const planned = await planArtifactOperations({
      userId: OP_USER,
      operation: {
        type: 'revise',
        targets: [
          { artifactId: first.artifactId, versionId: first.versionId },
          {
            artifactId: secondSeed.artifactId,
            versionId: secondSeed.versionId,
          },
        ],
      },
    })
    expect(planned).toHaveLength(2)
    expect(planned.every((p) => p.type === 'revise')).toBe(true)
  })

  it('rejects duplicate artifact targets', async () => {
    const seeded = await seedVersion({ userId: OP_USER, kind: 'prd' })
    const { planArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    await expect(
      planArtifactOperations({
        userId: OP_USER,
        operation: {
          type: 'revise',
          targets: [
            { artifactId: seeded.artifactId, versionId: seeded.versionId },
            { artifactId: seeded.artifactId, versionId: seeded.versionId },
          ],
        },
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('chooses each revision profile from the persisted source kind', async () => {
    const checklist = await seedVersion({ userId: OP_USER, kind: 'checklist' })
    const prd = await seedVersion({ userId: OP_USER, kind: 'prd' })
    const { planArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    const planned = await planArtifactOperations({
      userId: OP_USER,
      operation: {
        type: 'revise',
        targets: [
          { artifactId: checklist.artifactId, versionId: checklist.versionId },
          { artifactId: prd.artifactId, versionId: prd.versionId },
        ],
      },
    })
    const kinds = planned
      .map((p) => (p.type === 'revise' ? p.kind : 'create'))
      .sort()
    expect(kinds).toEqual(['checklist', 'prd'])
  })

  it('never infers revision from prompt words', async () => {
    const { planArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    const created = await planArtifactOperations({
      userId: OP_USER,
      operation: { type: 'create', skillId: 'prd-plan' },
      content: 'please revise the previous document completely',
    })
    expect(created).toHaveLength(1)
    expect(created[0].type).toBe('create')

    const seeded = await seedVersion({ userId: OP_USER, kind: 'prd' })
    const revised = await planArtifactOperations({
      userId: OP_USER,
      operation: {
        type: 'revise',
        targets: [
          { artifactId: seeded.artifactId, versionId: seeded.versionId },
        ],
      },
      content: 'buatkan dokumen baru yang segar',
    })
    expect(revised).toHaveLength(1)
    expect(revised[0].type).toBe('revise')
  })
})

describe('planCompareArtifactOperations', () => {
  beforeEach(async () => {
    await cleanUser(OP_USER)
    await db.insert(users).values({
      id: OP_USER,
      email: `${OP_USER}@example.com`,
      name: OP_USER,
      credits: 1000,
    })
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await cleanUser(OP_USER)
  })

  const FOUR_MODELS = [
    'gemini-3.7-flash-high',
    'gpt-5.6-sol',
    'qwen3.8-flash',
    'mimo-v2.5',
  ]

  it('expands one create target across four models into four generations and one comparison run', async () => {
    const { planCompareArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    const plan = await planCompareArtifactOperations({
      userId: OP_USER,
      operation: { type: 'create', skillId: 'checklist' },
      modelIds: FOUR_MODELS,
    })
    expect(plan.targets).toHaveLength(1)
    expect(plan.generations).toHaveLength(4)
    expect(plan.comparisonRunCount).toBe(1)
    const pairs = plan.generations.map((g) => `${g.targetIndex}:${g.modelId}`)
    expect(new Set(pairs).size).toBe(4)
  })

  it('expands two revision targets across four models into eight generations and two comparison runs', async () => {
    const first = await seedVersion({ userId: OP_USER, kind: 'checklist' })
    const second = await seedVersion({ userId: OP_USER, kind: 'checklist' })
    const { planCompareArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    const plan = await planCompareArtifactOperations({
      userId: OP_USER,
      operation: {
        type: 'revise',
        targets: [
          { artifactId: first.artifactId, versionId: first.versionId },
          { artifactId: second.artifactId, versionId: second.versionId },
        ],
      },
      modelIds: FOUR_MODELS,
    })
    expect(plan.targets).toHaveLength(2)
    expect(plan.generations).toHaveLength(8)
    expect(plan.comparisonRunCount).toBe(2)
  })

  it('rejects fewer than two models', async () => {
    const { planCompareArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    await expect(
      planCompareArtifactOperations({
        userId: OP_USER,
        operation: { type: 'create', skillId: 'checklist' },
        modelIds: ['gemini-3.7-flash-high'],
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects more than four models', async () => {
    const { planCompareArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    await expect(
      planCompareArtifactOperations({
        userId: OP_USER,
        operation: { type: 'create', skillId: 'checklist' },
        modelIds: [...FOUR_MODELS, 'glm-5.3-flash'],
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects auto in compare', async () => {
    const { planCompareArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    await expect(
      planCompareArtifactOperations({
        userId: OP_USER,
        operation: { type: 'create', skillId: 'checklist' },
        modelIds: ['auto', 'gemini-3.7-flash-high'],
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects duplicate models', async () => {
    const { planCompareArtifactOperations } = await import(
      '../../src/server/core/artifact-operations'
    )
    await expect(
      planCompareArtifactOperations({
        userId: OP_USER,
        operation: { type: 'create', skillId: 'checklist' },
        modelIds: ['gemini-3.7-flash-high', 'gemini-3.7-flash-high'],
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
