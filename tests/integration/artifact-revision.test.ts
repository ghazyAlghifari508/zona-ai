/**
 * @vitest-environment node
 */
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ArtifactStreamEvent,
  parseArtifactStreamEvent,
} from '../../src/lib/ai/artifact-stream'
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
import { resetRateLimitForTest } from '../../src/lib/security/rate-limit'

vi.mock('../../src/lib/r2/client', () => ({
  putObject: vi.fn(async () => {}),
  getObject: vi.fn(async () => ({
    body: Buffer.from('seed-bytes'),
    contentType: 'text/markdown',
  })),
  deleteObject: vi.fn(async () => {}),
}))

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async (req: Request) => {
    const testUser = (req as unknown as { headers: Headers })?.headers?.get(
      'x-test-user',
    )
    if (testUser)
      return { user: { id: testUser, email: `${testUser}@example.com` } }
    return { user: { id: 'revision-user-default', email: 'rev@example.com' } }
  }),
}))

let nextOutput = ''
const nextUsage = { inputTokens: 5, outputTokens: 10, totalTokens: 15 }
let nextFinishReason: unknown = 'stop'

function __setNextRevisionOutput(text: string) {
  nextOutput = text
}

function __setNextFinishReason(reason: unknown) {
  nextFinishReason = reason
}

const mockStreamText = vi.fn((opts: Record<string, unknown>) => {
  const onChunk = opts.onChunk as (() => void) | undefined
  if (onChunk) onChunk()
  const textStream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(nextOutput)
      controller.close()
    },
  })
  ;(globalThis as unknown as Record<string, unknown>).__lastRevisionMessages =
    opts.messages
  ;(globalThis as unknown as Record<string, unknown>).__lastRevisionSystem =
    opts.system
  return {
    text: Promise.resolve(nextOutput),
    stream: new ReadableStream({
      start(controller) {
        controller.close()
      },
    }),
    textStream,
    usage: Promise.resolve(nextUsage),
    finishReason: Promise.resolve(nextFinishReason),
  }
})

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return { ...actual, generateText: vi.fn(async () => ({ text: '' })), streamText: mockStreamText }
})

const REVISION_USERS = [
  'revision-user-1',
  'revision-user-2',
  'revision-user-3',
  'revision-user-4',
  'revision-user-5',
]

const CHECKLIST_V1 = JSON.stringify({
  type: 'checklist',
  title: 'Checklist rev',
  items: [
    { id: 'task-1', text: 'Sahur', completed: false },
    { id: 'task-2', text: 'Subuh', completed: false },
  ],
})

const CHECKLIST_V2 = JSON.stringify({
  type: 'checklist',
  title: 'Checklist rev',
  items: [
    { id: 'task-1', text: 'Sahur', completed: false },
    { id: 'task-2', text: 'Subuh', completed: false },
    { id: 'task-3', text: 'Tadarus', completed: false },
  ],
})

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

async function readArtifactEvents(res: Response): Promise<ArtifactStreamEvent[]> {
  const text = await res.text()
  const events: ArtifactStreamEvent[] = []
  for (const frame of text.split('\n\n')) {
    const line = frame.split('\n').find((l) => l.startsWith('data:'))
    if (!line) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    events.push(parseArtifactStreamEvent(JSON.parse(payload)))
  }
  return events
}

function userRequest(userId: string): Request {
  return new Request('http://localhost/', {
    headers: { 'x-test-user': userId },
  })
}

async function seedChecklistV1(
  userId: string,
  targetConvId?: string,
): Promise<{
  convId: string
  artifactId: string
  versionId: string
  attachmentId: string
  r2Key: string
}> {
  const { generateArtifactCore } = await import(
    '../../src/server/core/artifacts'
  )
  const r2 = await import('../../src/lib/r2/client')
  __setNextRevisionOutput(CHECKLIST_V1)
  __setNextFinishReason('stop')
  vi.mocked(r2.getObject).mockResolvedValue({
    body: Buffer.from('seed-bytes'),
    contentType: 'text/markdown',
  })
  const res = await generateArtifactCore({
    data: {
      ...(targetConvId ? { conversationId: targetConvId } : {}),
      modelId: 'auto',
      skillId: 'checklist',
      content: 'Buatkan checklist rev',
      enableWebSearch: false,
    },
    request: userRequest(userId),
  })
  const convId = res.headers.get('X-Conversation-Id') as string
  const events = await readArtifactEvents(res)
  const created = events.find((e) => e.type === 'artifact-created')
  if (created?.type !== 'artifact-created') throw new Error('seed missing created')
  const [version] = await db
    .select()
    .from(artifactVersions)
    .where(eq(artifactVersions.id, created.versionId))
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, created.artifact.attachmentId))
  return {
    convId,
    artifactId: created.artifactId,
    versionId: created.versionId,
    attachmentId: created.artifact.attachmentId,
    r2Key: attachment.r2Key,
  }
  void version
}

describe('artifact revision', () => {
  beforeEach(async () => {
    resetRateLimitForTest()
    nextFinishReason = 'stop'
    for (const id of REVISION_USERS) {
      await cleanUser(id)
    }
    for (const id of REVISION_USERS) {
      await db.insert(users).values({
        id,
        email: `${id}@example.com`,
        name: id,
        credits: 1000,
      })
    }
    vi.clearAllMocks()
    const r2 = await import('../../src/lib/r2/client')
    vi.mocked(r2.putObject).mockResolvedValue(undefined)
    vi.mocked(r2.deleteObject).mockResolvedValue(undefined)
  })

  afterAll(async () => {
    for (const id of REVISION_USERS) {
      await cleanUser(id)
    }
  })

  it('loads exact v1 bytes into the revision prompt', async () => {
    const USER = 'revision-user-1'
    const seed = await seedChecklistV1(USER)
    const r2 = await import('../../src/lib/r2/client')
    const { generateArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    const exactV1 = '# Checklist rev\n\n- [ ] Sahur\n- [ ] Subuh\n'
    vi.mocked(r2.getObject).mockImplementation(async () => ({
      body: Buffer.from(exactV1, 'utf8'),
      contentType: 'text/markdown',
    }))
    __setNextRevisionOutput(CHECKLIST_V2)
    const res = await generateArtifactsCore({
      data: {
        conversationId: seed.convId,
        modelId: 'auto',
        content: 'Tambahkan tadarus',
        operation: {
          type: 'revise',
          targets: [{ artifactId: seed.artifactId, versionId: seed.versionId }],
        },
      },
      request: userRequest(USER),
    })
    await readArtifactEvents(res)
    const seenSystem = (globalThis as unknown as Record<string, unknown>)
      .__lastRevisionSystem as string
    const seenMessages = (globalThis as unknown as Record<string, unknown>)
      .__lastRevisionMessages as Array<{ role: string; content: unknown }>
    const serialized = `${seenSystem}\n${JSON.stringify(seenMessages)}`
    expect(serialized).toContain(exactV1)
    expect(serialized).toContain('Tambahkan tadarus')
  })

  it('creates v2 on the same artifact and leaves v1 rows unchanged', async () => {
    const USER = 'revision-user-2'
    const seed = await seedChecklistV1(USER)
    const r2 = await import('../../src/lib/r2/client')
    const { generateArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    const [v1AttachmentBefore] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, seed.attachmentId))
    const exactV1 = '# Checklist rev\n\n- [ ] Sahur\n- [ ] Subuh\n'
    vi.mocked(r2.getObject).mockImplementation(async (locator) => {
      if (locator.key === v1AttachmentBefore.r2Key) {
        return { body: Buffer.from(exactV1, 'utf8'), contentType: 'text/markdown' }
      }
      return { body: Buffer.from('seed-bytes'), contentType: 'text/markdown' }
    })
    __setNextRevisionOutput(CHECKLIST_V2)
    const res = await generateArtifactsCore({
      data: {
        conversationId: seed.convId,
        modelId: 'auto',
        content: 'Tambahkan tadarus',
        operation: {
          type: 'revise',
          targets: [{ artifactId: seed.artifactId, versionId: seed.versionId }],
        },
      },
      request: userRequest(USER),
    })
    const genId = res.headers.get('X-Generation-Id') as string
    const events = await readArtifactEvents(res)
    const created = events.find((e) => e.type === 'artifact-created')
    if (created?.type !== 'artifact-created') throw new Error('missing created')
    expect(created.operation).toBe('revise')
    expect(created.artifactId).toBe(seed.artifactId)
    expect(created.version).toBe(2)
    expect(created.kind).toBe('checklist')
    expect(created.title).toBe('Checklist rev')

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, seed.artifactId))
    expect(artifact.currentVersionId).toBe(created.versionId)
    const versions = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, seed.artifactId))
    expect(versions).toHaveLength(2)
    const [v1AttachmentAfter] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, seed.attachmentId))
    expect(v1AttachmentAfter.r2Key).toBe(v1AttachmentBefore.r2Key)
    expect(v1AttachmentAfter.fileSize).toBe(v1AttachmentBefore.fileSize)

    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, genId))
    expect(run.sourceArtifactId).toBe(seed.artifactId)
    expect(run.sourceVersionId).toBe(seed.versionId)
    expect(run.requestMessageId).toBeTruthy()
    const [requestMsg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, run.requestMessageId as string))
    expect(requestMsg.content).toBe('Tambahkan tadarus')
  })

  it('leaves v1 current when model output is invalid', async () => {
    const USER = 'revision-user-3'
    const seed = await seedChecklistV1(USER)
    const r2 = await import('../../src/lib/r2/client')
    const { generateArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    vi.mocked(r2.getObject).mockResolvedValue({
      body: Buffer.from('# Checklist rev\n\n- [ ] Sahur\n- [ ] Subuh\n', 'utf8'),
      contentType: 'text/markdown',
    })
    __setNextRevisionOutput('bukan checklist valid')
    const res = await generateArtifactsCore({
      data: {
        conversationId: seed.convId,
        modelId: 'auto',
        content: 'Ubah semuanya',
        operation: {
          type: 'revise',
          targets: [{ artifactId: seed.artifactId, versionId: seed.versionId }],
        },
      },
      request: userRequest(USER),
    })
    const events = await readArtifactEvents(res)
    expect(events.some((e) => e.type === 'artifact-error')).toBe(true)
    expect(events.some((e) => e.type === 'artifact-created')).toBe(false)
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, seed.artifactId))
    expect(artifact.currentVersionId).toBe(seed.versionId)
  })

  it('returns 409 before a new generation when the base is stale', async () => {
    const USER = 'revision-user-4'
    const seed = await seedChecklistV1(USER)
    const r2 = await import('../../src/lib/r2/client')
    const { generateArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    vi.mocked(r2.getObject).mockResolvedValue({
      body: Buffer.from('# Checklist rev\n\n- [ ] Sahur\n- [ ] Subuh\n', 'utf8'),
      contentType: 'text/markdown',
    })
    __setNextRevisionOutput(CHECKLIST_V2)
    const first = await generateArtifactsCore({
      data: {
        conversationId: seed.convId,
        modelId: 'auto',
        content: 'Tambahkan tadarus',
        operation: {
          type: 'revise',
          targets: [{ artifactId: seed.artifactId, versionId: seed.versionId }],
        },
      },
      request: userRequest(USER),
    })
    await readArtifactEvents(first)
    const runsBefore = await db
      .select({ id: generationRuns.id })
      .from(generationRuns)
      .where(eq(generationRuns.conversationId, seed.convId))
    await expect(
      generateArtifactsCore({
        data: {
          conversationId: seed.convId,
          modelId: 'auto',
          content: 'Coba revisi basi',
          operation: {
            type: 'revise',
            targets: [{ artifactId: seed.artifactId, versionId: seed.versionId }],
          },
        },
        request: userRequest(USER),
      }),
    ).rejects.toMatchObject({ status: 409 })
    const runsAfter = await db
      .select({ id: generationRuns.id })
      .from(generationRuns)
      .where(eq(generationRuns.conversationId, seed.convId))
    expect(runsAfter).toHaveLength(runsBefore.length)
  })

  it('retries a failed revision from its own persisted source ids', async () => {
    const USER = 'revision-user-5'
    const seed = await seedChecklistV1(USER)
    const r2 = await import('../../src/lib/r2/client')
    const { generateArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    const { retryArtifactGenerationCore } = await import(
      '../../src/server/core/artifacts'
    )
    vi.mocked(r2.getObject).mockResolvedValue({
      body: Buffer.from('# Checklist rev\n\n- [ ] Sahur\n- [ ] Subuh\n', 'utf8'),
      contentType: 'text/markdown',
    })
    __setNextRevisionOutput('bukan checklist valid')
    const failed = await generateArtifactsCore({
      data: {
        conversationId: seed.convId,
        modelId: 'auto',
        content: 'Ubah semuanya',
        operation: {
          type: 'revise',
          targets: [{ artifactId: seed.artifactId, versionId: seed.versionId }],
        },
      },
      request: userRequest(USER),
    })
    const failedGenId = failed.headers.get('X-Generation-Id') as string
    await readArtifactEvents(failed)
    const [failedRun] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, failedGenId))
    expect(failedRun.status).toBe('failed')

    __setNextRevisionOutput(CHECKLIST_V2)
    const retryRes = await retryArtifactGenerationCore({
      generationId: failedGenId,
      request: userRequest(USER),
    })
    const events = await readArtifactEvents(retryRes)
    expect(events.some((e) => e.type === 'artifact-created')).toBe(true)
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, seed.artifactId))
    expect(artifact.currentVersionId).not.toBe(seed.versionId)
  })

  it('creates two independent same-lineage versions for two revise mentions in single mode', async () => {
    const USER = 'revision-user-5'
    const seed1 = await seedChecklistV1(USER)
    const seed2 = await seedChecklistV1(USER, seed1.convId)
    const r2 = await import('../../src/lib/r2/client')
    const { generateArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    vi.mocked(r2.getObject).mockResolvedValue({
      body: Buffer.from(
        '# Checklist rev\n\n- [ ] Sahur\n- [ ] Subuh\n',
        'utf8',
      ),
      contentType: 'text/markdown',
    })
    __setNextRevisionOutput(CHECKLIST_V2)
    const res = await generateArtifactsCore({
      data: {
        conversationId: seed1.convId,
        modelId: 'auto',
        content: 'Revisi kedua checklist',
        operation: {
          type: 'revise',
          targets: [
            {
              artifactId: seed1.artifactId,
              versionId: seed1.versionId,
              mode: 'revise',
            },
            {
              artifactId: seed2.artifactId,
              versionId: seed2.versionId,
              mode: 'revise',
            },
          ],
        },
      },
      request: userRequest(USER),
    })
    const events = await readArtifactEvents(res)
    const created = events.filter((e) => e.type === 'artifact-created')
    expect(created).toHaveLength(2)
    for (const c of created) {
      if (c.type !== 'artifact-created') throw new Error('wrong event')
      expect(c.version).toBe(2)
      expect(c.operation).toBe('revise')
    }

    const [art1] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, seed1.artifactId))
    const [art2] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, seed2.artifactId))
    expect(art1.currentVersionId).not.toBe(seed1.versionId)
    expect(art2.currentVersionId).not.toBe(seed2.versionId)
  })
})
