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
    body: Buffer.from('file-content'),
    contentType: 'application/pdf',
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
    return {
      user: { id: 'artifact-user-default', email: 'artifact@example.com' },
    }
  }),
}))

let nextOutput = ''
const nextUsage = { inputTokens: 5, outputTokens: 10, totalTokens: 15 }

function __setNextArtifactOutput(text: string) {
  nextOutput = text
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
  return {
    text: Promise.resolve(nextOutput),
    textStream,
    usage: Promise.resolve(nextUsage),
  }
})

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: vi.fn(async () => ({ text: '' })),
    streamText: mockStreamText,
  }
})

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

const ARTIFACT_USERS = [
  'artifact-user-1',
  'artifact-user-2',
  'artifact-user-3',
  'artifact-user-4',
  'artifact-user-5',
]

async function cleanUser(userId: string) {
  await db.delete(usageRecords).where(eq(usageRecords.userId, userId))
  await db
    .delete(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
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

async function getCredits(userId: string): Promise<number> {
  const rows = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, userId))
  return rows[0]?.credits ?? 0
}

async function readArtifactEvents(
  res: Response,
): Promise<ArtifactStreamEvent[]> {
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

describe('artifact generation', () => {
  beforeEach(async () => {
    resetRateLimitForTest()
    for (const id of ARTIFACT_USERS) {
      await cleanUser(id)
    }
    for (const id of ARTIFACT_USERS) {
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
    for (const id of ARTIFACT_USERS) {
      await cleanUser(id)
    }
  })

  it('creates an agent-skill artifact end to end', async () => {
    const USER = 'artifact-user-1'
    const { generateArtifactCore } = await import(
      '../../src/server/core/artifacts'
    )
    const r2 = await import('../../src/lib/r2/client')
    __setNextArtifactOutput(FRONTEND_SKILL)
    const res = await generateArtifactCore({
      data: {
        modelId: 'auto',
        skillId: 'agent-skill',
        content: 'Buatkan skill untuk frontend design',
        enableWebSearch: false,
      },
      request: userRequest(USER),
    })
    expect(res.headers.get('X-Artifact-Kind')).toBe('agent-skill')
    const genId = res.headers.get('X-Generation-Id') as string
    const convId = res.headers.get('X-Conversation-Id') as string
    expect(genId).toBeTruthy()
    expect(convId).toBeTruthy()

    const events = await readArtifactEvents(res)
    const types = events.map((e) => e.type)
    expect(types[0]).toBe('artifact-status')
    expect(types).toContain('artifact-created')
    expect(types[types.length - 1]).toBe('artifact-done')

    const created = events.find((e) => e.type === 'artifact-created')
    if (created?.type !== 'artifact-created') throw new Error('missing created')
    expect(created.kind).toBe('agent-skill')
    expect(created.artifact.mimeType).toBe('text/markdown')
    expect(created.artifact.fileName).toBe('frontend-design.md')

    const done = events.find((e) => e.type === 'artifact-done')
    if (done?.type !== 'artifact-done') throw new Error('missing done')
    expect(done.status).toBe('completed')

    expect(r2.putObject).toHaveBeenCalledTimes(1)
    const putArg = vi.mocked(r2.putObject).mock.calls[0][0]
    expect(putArg.key.startsWith(`users/${USER}/attachments/`)).toBe(true)
    expect((putArg.body as Buffer).toString('utf8')).toContain(
      'name: frontend-design',
    )
    expect(putArg.contentType).toBe('text/markdown')

    const attRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.conversationId, convId))
    expect(attRows.length).toBe(1)
    expect(attRows[0].messageId).toBe(done.messageId)
    expect(attRows[0].mimeType).toBe('text/markdown')
    expect(attRows[0].fileName).toBe('frontend-design.md')

    const [assistantMsg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, done.messageId))
    expect(assistantMsg.content.startsWith('Skill `')).toBe(true)
    expect(assistantMsg.content).toBe(created.summary)

    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, genId))
    expect(run.status).toBe('completed')
    expect(run.skillId).toBe('agent-skill')
    expect(run.content).toContain('name: frontend-design')
    expect(attRows[0].fileSize).toBe(
      Buffer.byteLength(run.content as string, 'utf8'),
    )
  })

  it('rejects invalid output without creating a file', async () => {
    const USER = 'artifact-user-2'
    const { generateArtifactCore } = await import(
      '../../src/server/core/artifacts'
    )
    const r2 = await import('../../src/lib/r2/client')
    const creditsBefore = await getCredits(USER)
    __setNextArtifactOutput('Just some prose, not a skill.')
    const res = await generateArtifactCore({
      data: {
        modelId: 'auto',
        skillId: 'agent-skill',
        content: 'Buatkan skill untuk testing',
        enableWebSearch: false,
      },
      request: userRequest(USER),
    })
    const genId = res.headers.get('X-Generation-Id') as string
    const convId = res.headers.get('X-Conversation-Id') as string
    const events = await readArtifactEvents(res)
    const errEvent = events.find((e) => e.type === 'artifact-error')
    if (errEvent?.type !== 'artifact-error') throw new Error('missing error')
    expect(errEvent.code).toBe('ERR-016')
    expect(errEvent.retryable).toBe(true)
    expect(events.some((e) => e.type === 'artifact-created')).toBe(false)

    expect(r2.putObject).not.toHaveBeenCalled()
    const attRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.conversationId, convId))
    expect(attRows.length).toBe(0)
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, genId))
    expect(run.status).toBe('failed')
    expect(await getCredits(USER)).toBe(creditsBefore)
  })

  it('fails closed when R2 upload throws', async () => {
    const USER = 'artifact-user-3'
    const { generateArtifactCore } = await import(
      '../../src/server/core/artifacts'
    )
    const r2 = await import('../../src/lib/r2/client')
    vi.mocked(r2.putObject).mockImplementationOnce(async () => {
      throw new Error('r2 down')
    })
    const creditsBefore = await getCredits(USER)
    __setNextArtifactOutput(FRONTEND_SKILL)
    const res = await generateArtifactCore({
      data: {
        modelId: 'auto',
        skillId: 'agent-skill',
        content: 'Buatkan skill untuk frontend design',
        enableWebSearch: false,
      },
      request: userRequest(USER),
    })
    const genId = res.headers.get('X-Generation-Id') as string
    const convId = res.headers.get('X-Conversation-Id') as string
    const events = await readArtifactEvents(res)
    const errEvent = events.find((e) => e.type === 'artifact-error')
    if (errEvent?.type !== 'artifact-error') throw new Error('missing error')
    expect(errEvent.retryable).toBe(true)
    expect(events.some((e) => e.type === 'artifact-created')).toBe(false)

    const attRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.conversationId, convId))
    expect(attRows.length).toBe(0)
    expect(r2.deleteObject).not.toHaveBeenCalled()
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, genId))
    expect(run.status).toBe('failed')
    expect(await getCredits(USER)).toBe(creditsBefore)
  })

  it('sendMessageCore and sendCompareMessageCore reject artifact skills', async () => {
    const USER = 'artifact-user-4'
    const { sendCompareMessageCore, sendMessageCore } = await import(
      '../../src/server/core/chat'
    )
    await expect(
      sendMessageCore({
        data: {
          modelId: 'auto',
          skillId: 'agent-skill',
          content: 'halo',
        },
        request: userRequest(USER),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'ERR-003' })
    await expect(
      sendCompareMessageCore({
        data: {
          modelIds: ['model-a', 'model-b'],
          skillId: 'agent-skill',
          content: 'halo',
        },
        request: userRequest(USER),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'ERR-003' })
  })

  it('retry routes artifact generations back to the artifact runner', async () => {
    const USER = 'artifact-user-5'
    const { generateArtifactCore, retryArtifactGenerationCore } = await import(
      '../../src/server/core/artifacts'
    )
    __setNextArtifactOutput('Just some prose, not a skill.')
    const first = await generateArtifactCore({
      data: {
        modelId: 'auto',
        skillId: 'agent-skill',
        content: 'Buatkan skill untuk frontend design',
        enableWebSearch: false,
      },
      request: userRequest(USER),
    })
    const failedGenId = first.headers.get('X-Generation-Id') as string
    const convId = first.headers.get('X-Conversation-Id') as string
    await readArtifactEvents(first)
    const [failedRun] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, failedGenId))
    expect(failedRun.status).toBe('failed')

    __setNextArtifactOutput(FRONTEND_SKILL)
    const retryRes = await retryArtifactGenerationCore({
      generationId: failedGenId,
      request: userRequest(USER),
    })
    const events = await readArtifactEvents(retryRes)
    expect(events.some((e) => e.type === 'artifact-created')).toBe(true)
    const attRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.conversationId, convId))
    expect(attRows.length).toBe(1)
    expect(attRows[0].mimeType).toBe('text/markdown')
  })
})
