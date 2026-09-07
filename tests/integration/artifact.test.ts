/**
 * @vitest-environment node
 */
import { createHash } from 'node:crypto'
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
import { buildModelHistory } from '../../src/server/core/history'

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
let nextFinishReason: unknown = 'stop'
let nextStreamGate: Promise<void> | null = null

function __setNextFinishReason(reason: unknown) {
  nextFinishReason = reason
}

function __setNextArtifactOutput(text: string) {
  nextOutput = text
}

function __setNextStreamGate(gate: Promise<void> | null) {
  nextStreamGate = gate
}

const mockStreamText = vi.fn((opts: Record<string, unknown>) => {
  const onChunk = opts.onChunk as (() => void) | undefined
  const onFinish = opts.onFinish as ((o: unknown) => Promise<void>) | undefined
  if (onChunk) onChunk()
  if (onFinish) {
    setTimeout(() => {
      void onFinish({
        text: 'Hello mocked response',
        usage: nextUsage,
        finishReason: 'stop',
        reasoningText: undefined,
      })
    }, 20)
  }
  const textStream = new ReadableStream<string>({
    start(controller) {
      const release = async () => {
        if (nextStreamGate) await nextStreamGate
        controller.enqueue(nextOutput)
        controller.close()
      }
      void release()
    },
  })
  const chatStream = new ReadableStream({
    start(controller) {
      controller.enqueue('Hello mocked ')
      controller.enqueue('response')
      controller.close()
    },
  })
  ;(globalThis as unknown as Record<string, unknown>).__lastStreamMessages =
    opts.messages
  return {
    text: Promise.resolve(nextOutput),
    stream: chatStream,
    textStream,
    usage: Promise.resolve(nextUsage),
    finishReason: Promise.resolve(nextFinishReason),
    toUIMessageStreamResponse: (init?: { headers?: Record<string, string> }) =>
      new Response('Hello mocked response', { headers: init?.headers }),
    toTextStreamResponse: () => new Response('Hello mocked response'),
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
  'artifact-user-6',
  'artifact-user-7',
  'artifact-user-8',
  'artifact-user-9',
  'artifact-user-10',
]

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
    nextFinishReason = 'stop'
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
    expect(putArg.bucket).toBe(process.env.R2_BUCKET_NAME)
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

  it('treats a length finish reason as an incomplete retryable failure with a readable message', async () => {
    const USER = 'artifact-user-5'
    const { generateArtifactCore } = await import(
      '../../src/server/core/artifacts'
    )
    const r2 = await import('../../src/lib/r2/client')
    const creditsBefore = await getCredits(USER)
    __setNextArtifactOutput(FRONTEND_SKILL)
    __setNextFinishReason('length')
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
    const events = await readArtifactEvents(res)
    const errEvent = events.find((e) => e.type === 'artifact-error')
    if (errEvent?.type !== 'artifact-error') throw new Error('missing error')
    expect(errEvent.code).toBe('ERR-016')
    expect(errEvent.retryable).toBe(true)
    expect(typeof errEvent.message).toBe('string')
    expect(errEvent.message?.length).toBeGreaterThan(0)
    expect(errEvent.message).not.toContain('ERR-016')
    expect(events.some((e) => e.type === 'artifact-created')).toBe(false)
    expect(r2.putObject).not.toHaveBeenCalled()
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, genId))
    expect(run.status).toBe('failed')
    expect(await getCredits(USER)).toBe(creditsBefore)
  })

  it('carries the profile failure message on validation errors and keeps retries failing until output is valid', async () => {
    const USER = 'artifact-user-5'
    const { generateArtifactCore, retryArtifactGenerationCore } = await import(
      '../../src/server/core/artifacts'
    )
    const creditsBefore = await getCredits(USER)
    __setNextFinishReason('stop')
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
    const events = await readArtifactEvents(first)
    const errEvent = events.find((e) => e.type === 'artifact-error')
    if (errEvent?.type !== 'artifact-error') throw new Error('missing error')
    expect(typeof errEvent.message).toBe('string')
    expect(errEvent.message?.length).toBeGreaterThan(0)

    __setNextArtifactOutput('Still not a valid skill document.')
    const retryRes = await retryArtifactGenerationCore({
      generationId: failedGenId,
      request: userRequest(USER),
    })
    const retryEvents = await readArtifactEvents(retryRes)
    expect(
      retryEvents.some((e) => e.type === 'artifact-error' && e.retryable),
    ).toBe(true)
    expect(
      retryEvents.some((e) => e.type === 'artifact-created'),
    ).toBe(false)
    expect(await getCredits(USER)).toBe(creditsBefore)
  })
})

describe('artifact conversation history', () => {
  const HISTORY_USERS = ['artifact-user-6', 'artifact-user-7']

  beforeEach(async () => {
    resetRateLimitForTest()
    for (const id of HISTORY_USERS) {
      await cleanUser(id)
    }
    for (const id of HISTORY_USERS) {
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
    for (const id of HISTORY_USERS) {
      await cleanUser(id)
    }
  })

  it('substitutes completed artifact source for follow-up generations', async () => {
    const USER = 'artifact-user-6'
    const { generateArtifactCore } = await import(
      '../../src/server/core/artifacts'
    )
    const { sendMessageCore } = await import('../../src/server/core/chat')
    __setNextArtifactOutput(FRONTEND_SKILL)
    const first = await generateArtifactCore({
      data: {
        modelId: 'auto',
        skillId: 'agent-skill',
        content: 'Buatkan skill untuk frontend design',
        enableWebSearch: false,
      },
      request: userRequest(USER),
    })
    const convId = first.headers.get('X-Conversation-Id') as string
    const events = await readArtifactEvents(first)
    const done = events.find((e) => e.type === 'artifact-done')
    if (done?.type !== 'artifact-done') throw new Error('missing done')
    expect(done.status).toBe('completed')

    const [assistantMsg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, done.messageId))
    expect(assistantMsg.content.startsWith('Skill `')).toBe(true)
    expect(assistantMsg.content).not.toContain('name: frontend-design')

    const followUp = (await sendMessageCore({
      data: {
        modelId: 'auto',
        skillId: 'none',
        content: 'jelaskan bagian verifikasi',
        conversationId: convId,
      },
      request: userRequest(USER),
    })) as unknown as Response
    await followUp.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 200))

    const seen = (globalThis as unknown as Record<string, unknown>)
      .__lastStreamMessages as Array<{ role: string; content: unknown }>
    expect(Array.isArray(seen)).toBe(true)
    const assistantEntries = seen.filter((m) => m.role === 'assistant')
    expect(
      assistantEntries.some(
        (m) =>
          typeof m.content === 'string' &&
          (m.content as string).includes('name: frontend-design'),
      ),
    ).toBe(true)

    const [persisted] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, done.messageId))
    expect(persisted.content.startsWith('Skill `')).toBe(true)
    expect(persisted.content).not.toContain('name: frontend-design')
  })

  it('falls back to summaries beyond the byte budget', async () => {
    const USER = 'artifact-user-7'
    const { generateArtifactCore } = await import(
      '../../src/server/core/artifacts'
    )
    __setNextArtifactOutput(FRONTEND_SKILL)
    const first = await generateArtifactCore({
      data: {
        modelId: 'auto',
        skillId: 'agent-skill',
        content: 'Buatkan skill untuk frontend design',
        enableWebSearch: false,
      },
      request: userRequest(USER),
    })
    const convId = first.headers.get('X-Conversation-Id') as string
    await readArtifactEvents(first)

    const tiny = await buildModelHistory(convId, 10)
    const tinyAssistants = tiny.filter((m) => m.role === 'assistant')
    expect(tinyAssistants.length).toBeGreaterThan(0)
    for (const entry of tinyAssistants) {
      expect(String(entry.content)).not.toContain('name: frontend-design')
    }

    const full = await buildModelHistory(convId)
    expect(
      full.some(
        (m) =>
          m.role === 'assistant' &&
          typeof m.content === 'string' &&
          m.content.includes('name: frontend-design'),
      ),
    ).toBe(true)
  })
})

describe('stop generation ownership', () => {
  const STOP_USERS = ['artifact-user-8', 'artifact-user-9', 'artifact-user-10']

  beforeEach(async () => {
    resetRateLimitForTest()
    for (const id of STOP_USERS) {
      await cleanUser(id)
    }
    for (const id of STOP_USERS) {
      await db.insert(users).values({
        id,
        email: `${id}@example.com`,
        name: id,
        credits: 1000,
      })
    }
    vi.clearAllMocks()
  })

  afterAll(async () => {
    for (const id of STOP_USERS) {
      await cleanUser(id)
    }
  })

  async function seedStreamingRun(
    userId: string,
    modelId = 'auto',
  ): Promise<{ convId: string; genId: string }> {
    const [conv] = await db
      .insert(conversations)
      .values({ userId, title: 'Stop test', mode: 'normal' })
      .returning()
    const [userMsg] = await db
      .insert(messages)
      .values({ conversationId: conv.id, role: 'user', content: 'halo' })
      .returning()
    void userMsg
    const [assistantMsg] = await db
      .insert(messages)
      .values({ conversationId: conv.id, role: 'assistant', content: '' })
      .returning()
    const genId = crypto.randomUUID()
    await db.insert(generationRuns).values({
      id: genId,
      messageId: assistantMsg.id,
      conversationId: conv.id,
      modelId,
      routerModelId: modelId,
      skillId: 'none',
      status: 'streaming',
      startedAt: new Date(),
    })
    return { convId: conv.id, genId }
  }

  it('rejects cancel for a generation owned by another user', async () => {
    const { stopGenerationCore } = await import('../../src/server/core/chat')
    const { genId } = await seedStreamingRun('artifact-user-8')
    await expect(
      stopGenerationCore({
        generationId: genId,
        request: userRequest('artifact-user-9'),
      }),
    ).rejects.toMatchObject({ status: 403, code: 'ERR-003' })
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, genId))
    expect(run.status).toBe('streaming')
  })

  it('owner stop cancels once with exactly one refund row', async () => {
    const USER = 'artifact-user-10'
    const { deductCredits } = await import('../../src/lib/ai/credits')
    const { getModelById } = await import('../../src/lib/models/registry')
    const { stopGenerationCore } = await import('../../src/server/core/chat')
    const { genId } = await seedStreamingRun(USER)
    const entry = getModelById('auto')
    const cost =
      typeof entry.creditCost === 'number'
        ? entry.creditCost
        : entry.creditCost.max
    const before = await getCredits(USER)
    await deductCredits({
      userId: USER,
      generationRunId: genId,
      modelId: 'auto',
      amount: cost,
    })
    expect(await getCredits(USER)).toBe(before - cost)

    const res = await stopGenerationCore({
      generationId: genId,
      request: userRequest(USER),
    })
    expect(res.ok).toBe(true)
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, genId))
    expect(run.status).toBe('cancelled')
    expect(await getCredits(USER)).toBe(before)

    const refundRows = (
      await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.generationRunId, genId))
    ).filter((r) => r.type === 'refund')
    expect(refundRows.length).toBe(1)
    expect(refundRows[0].amount).toBe(cost)

    const res2 = await stopGenerationCore({
      generationId: genId,
      request: userRequest(USER),
    })
    expect(res2.ok).toBe(true)
    const refundRows2 = (
      await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.generationRunId, genId))
    ).filter((r) => r.type === 'refund')
    expect(refundRows2.length).toBe(1)
    expect(await getCredits(USER)).toBe(before)
  })
})

describe('artifact finalization boundary', () => {
  const FINALIZE_USERS = [
    'artifact-user-11',
    'artifact-user-12',
    'artifact-user-13',
    'artifact-user-14',
    'artifact-user-15',
    'artifact-user-16',
  ]

  const FINALIZE_BYTES = new TextEncoder().encode(
    '# Finalize fixture\n\nExact canonical bytes.\n',
  )
  const FINALIZE_SHA = createHash('sha256').update(FINALIZE_BYTES).digest('hex')

  async function seedConversation(userId: string): Promise<string> {
    const [conv] = await db
      .insert(conversations)
      .values({ userId, title: 'Finalize fixture', mode: 'normal' })
      .returning()
    await db
      .insert(messages)
      .values({ conversationId: conv.id, role: 'user', content: 'Buatkan artefak' })
    return conv.id
  }

  async function seedStreamingGeneration(
    userId: string,
    convId?: string,
  ): Promise<{ convId: string; assistantMsgId: string; genId: string }> {
    const id = convId ?? (await seedConversation(userId))
    const [assistantMsg] = await db
      .insert(messages)
      .values({ conversationId: id, role: 'assistant', content: '' })
      .returning()
    const genId = crypto.randomUUID()
    await db.insert(generationRuns).values({
      id: genId,
      messageId: assistantMsg.id,
      conversationId: id,
      modelId: 'auto',
      routerModelId: 'auto',
      skillId: 'agent-skill',
      status: 'streaming',
      startedAt: new Date(),
    })
    return { convId: id, assistantMsgId: assistantMsg.id, genId }
  }

  function createInput(
    userId: string,
    seed: { convId: string; assistantMsgId: string; genId: string },
  ) {
    return {
      userId,
      conversationId: seed.convId,
      messageId: seed.assistantMsgId,
      generationId: seed.genId,
      kind: 'agent-skill' as const,
      title: 'Finalize Fixture',
      modelId: 'auto',
      routerModelId: 'auto',
      fileName: 'finalize-fixture.md',
      mimeType: 'text/markdown' as const,
      bytes: FINALIZE_BYTES,
      summary: 'Skill `Finalize Fixture` selesai dibuat.',
      usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
      timing: { latencyMs: 42, timeToFirstTokenMs: 7 },
      finalizationMode: 'create' as const,
    }
  }

  beforeEach(async () => {
    resetRateLimitForTest()
    nextFinishReason = 'stop'
    nextStreamGate = null
    for (const id of FINALIZE_USERS) {
      await cleanUser(id)
    }
    for (const id of FINALIZE_USERS) {
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
    for (const id of FINALIZE_USERS) {
      await cleanUser(id)
    }
  })

  it('creates version 1 with the SHA-256 of the exact bytes', async () => {
    const USER = 'artifact-user-11'
    const { finalizeArtifactVersion } = await import(
      '../../src/server/core/artifact-finalization'
    )
    const r2 = await import('../../src/lib/r2/client')
    const seed = await seedStreamingGeneration(USER)

    const descriptor = await finalizeArtifactVersion(createInput(USER, seed))

    expect(descriptor.version).toBe(1)
    expect(descriptor.kind).toBe('agent-skill')
    expect(descriptor.title).toBe('Finalize Fixture')
    expect(descriptor.generationId).toBe(seed.genId)
    expect(descriptor.fileSize).toBe(FINALIZE_BYTES.length)

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, descriptor.artifactId))
    expect(artifact.currentVersionId).toBe(descriptor.versionId)
    expect(artifact.title).toBe('Finalize Fixture')

    const [version] = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.id, descriptor.versionId))
    expect(version.version).toBe(1)
    expect(version.contentSha256).toBe(FINALIZE_SHA)
    expect(version.sourceVersionId).toBeNull()
    expect(version.changeSummary).toBe('Created artifact')

    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, descriptor.attachmentId))
    expect(attachment.extractedText).toBeNull()
    expect(attachment.r2Key).toContain(descriptor.attachmentId)
    expect(attachment.messageId).toBe(seed.assistantMsgId)

    const [assistantMsg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, seed.assistantMsgId))
    expect(assistantMsg.content).toBe('Skill `Finalize Fixture` selesai dibuat.')

    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, seed.genId))
    expect(run.status).toBe('completed')
    expect(run.promptTokens).toBe(5)
    expect(run.completionTokens).toBe(10)
    expect(run.totalTokens).toBe(15)
    expect(run.latencyMs).toBe(42)
    expect(run.timeToFirstTokenMs).toBe(7)

    expect(r2.putObject).toHaveBeenCalledTimes(1)
    expect(r2.deleteObject).not.toHaveBeenCalled()
    const putArg = vi.mocked(r2.putObject).mock.calls[0][0]
    expect(putArg.key).toContain(descriptor.attachmentId)
  })

  it('revises to version 2 and moves the current pointer', async () => {
    const USER = 'artifact-user-12'
    const { finalizeArtifactVersion } = await import(
      '../../src/server/core/artifact-finalization'
    )
    const seed = await seedStreamingGeneration(USER)
    const created = await finalizeArtifactVersion(createInput(USER, seed))

    const next = await seedStreamingGeneration(USER, seed.convId)
    const revisedBytes = new TextEncoder().encode('# Finalize fixture\n\nRevised bytes.\n')
    const revised = await finalizeArtifactVersion({
      userId: USER,
      conversationId: next.convId,
      messageId: next.assistantMsgId,
      generationId: next.genId,
      kind: 'agent-skill',
      title: 'Finalize Fixture Revised',
      modelId: 'auto',
      routerModelId: 'auto',
      fileName: 'finalize-fixture.md',
      mimeType: 'text/markdown',
      bytes: revisedBytes,
      summary: 'Skill `Finalize Fixture` direvisi.',
      usage: null,
      timing: { latencyMs: 30, timeToFirstTokenMs: null },
      finalizationMode: 'revise',
      artifactId: created.artifactId,
      sourceArtifactId: created.artifactId,
      sourceVersionId: created.versionId,
      expectedCurrentVersionId: created.versionId,
    })

    expect(revised.artifactId).toBe(created.artifactId)
    expect(revised.version).toBe(2)
    expect(revised.versionId).not.toBe(created.versionId)

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, created.artifactId))
    expect(artifact.currentVersionId).toBe(revised.versionId)
    expect(artifact.title).toBe('Finalize Fixture Revised')

    const [version] = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.id, revised.versionId))
    expect(version.sourceVersionId).toBe(created.versionId)
    expect(version.contentSha256).toBe(
      createHash('sha256').update(revisedBytes).digest('hex'),
    )
  })

  it('forks a new artifact at version 1 with the exact external source', async () => {
    const USER = 'artifact-user-13'
    const { finalizeArtifactVersion } = await import(
      '../../src/server/core/artifact-finalization'
    )
    const seed = await seedStreamingGeneration(USER)
    const source = await finalizeArtifactVersion(createInput(USER, seed))

    const forkSeed = await seedStreamingGeneration(USER, seed.convId)
    const forked = await finalizeArtifactVersion({
      ...createInput(USER, forkSeed),
      title: 'Forked Fixture',
      finalizationMode: 'fork',
      sourceArtifactId: source.artifactId,
      sourceVersionId: source.versionId,
      expectedCurrentVersionId: source.versionId,
    })

    expect(forked.artifactId).not.toBe(source.artifactId)
    expect(forked.version).toBe(1)

    const [version] = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.id, forked.versionId))
    expect(version.sourceVersionId).toBe(source.versionId)

    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, forkSeed.genId))
    expect(run.sourceArtifactId).toBe(source.artifactId)
    expect(run.sourceVersionId).toBe(source.versionId)
  })

  it('rejects a stale expected current version with 409 and compensates R2', async () => {
    const USER = 'artifact-user-14'
    const { finalizeArtifactVersion } = await import(
      '../../src/server/core/artifact-finalization'
    )
    const r2 = await import('../../src/lib/r2/client')
    const seed = await seedStreamingGeneration(USER)
    const created = await finalizeArtifactVersion(createInput(USER, seed))
    vi.mocked(r2.putObject).mockClear()
    vi.mocked(r2.deleteObject).mockClear()

    const stale = await seedStreamingGeneration(USER, seed.convId)
    await expect(
      finalizeArtifactVersion({
        ...createInput(USER, stale),
        finalizationMode: 'revise',
        artifactId: created.artifactId,
        sourceArtifactId: created.artifactId,
        sourceVersionId: created.versionId,
        expectedCurrentVersionId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 })

    expect(r2.putObject).toHaveBeenCalledTimes(1)
    expect(r2.deleteObject).toHaveBeenCalledTimes(1)
    const putKey = vi.mocked(r2.putObject).mock.calls[0][0].key
    expect(vi.mocked(r2.deleteObject).mock.calls[0][0].key).toBe(putKey)

    const versions = await db
      .select({ id: artifactVersions.id })
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, created.artifactId))
    expect(versions).toHaveLength(1)
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, created.artifactId))
    expect(artifact.currentVersionId).toBe(created.versionId)
  })

  it('rejects a fork whose source moved during generation with 409 and compensates R2', async () => {
    const USER = 'artifact-user-15'
    const { finalizeArtifactVersion } = await import(
      '../../src/server/core/artifact-finalization'
    )
    const r2 = await import('../../src/lib/r2/client')
    const seed = await seedStreamingGeneration(USER)
    const source = await finalizeArtifactVersion(createInput(USER, seed))

    const reviseSeed = await seedStreamingGeneration(USER, seed.convId)
    const revised = await finalizeArtifactVersion({
      ...createInput(USER, reviseSeed),
      finalizationMode: 'revise',
      artifactId: source.artifactId,
      sourceArtifactId: source.artifactId,
      sourceVersionId: source.versionId,
      expectedCurrentVersionId: source.versionId,
    })
    expect(revised.version).toBe(2)

    vi.mocked(r2.putObject).mockClear()
    vi.mocked(r2.deleteObject).mockClear()
    const forkSeed = await seedStreamingGeneration(USER, seed.convId)
    await expect(
      finalizeArtifactVersion({
        ...createInput(USER, forkSeed),
        finalizationMode: 'fork',
        sourceArtifactId: source.artifactId,
        sourceVersionId: source.versionId,
        expectedCurrentVersionId: source.versionId,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(r2.putObject).toHaveBeenCalledTimes(1)
    expect(r2.deleteObject).toHaveBeenCalledTimes(1)
  })

  it('preserves old rows and deletes only the new object when the commit fails', async () => {
    const USER = 'artifact-user-16'
    const { finalizeArtifactVersion } = await import(
      '../../src/server/core/artifact-finalization'
    )
    const r2 = await import('../../src/lib/r2/client')
    const seed = await seedStreamingGeneration(USER)
    const created = await finalizeArtifactVersion(createInput(USER, seed))
    await db
      .update(generationRuns)
      .set({ status: 'streaming' })
      .where(eq(generationRuns.id, seed.genId))
    vi.mocked(r2.putObject).mockClear()
    vi.mocked(r2.deleteObject).mockClear()

    const retrySeed = await seedStreamingGeneration(USER, seed.convId)
    await expect(
      finalizeArtifactVersion({
        ...createInput(USER, retrySeed),
        generationId: seed.genId,
      }),
    ).rejects.toThrow()
    expect(r2.putObject).toHaveBeenCalledTimes(1)
    expect(r2.deleteObject).toHaveBeenCalledTimes(1)

    const versionRows = await db
      .select({ id: artifactVersions.id })
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, created.artifactId))
    expect(versionRows).toHaveLength(1)
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, created.artifactId))
    expect(artifact.currentVersionId).toBe(created.versionId)
  })

  it('emits expanded identity on every stream event with real saving phases', async () => {
    const USER = 'artifact-user-11'
    const { generateArtifactCore } = await import(
      '../../src/server/core/artifacts'
    )
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
    const events = await readArtifactEvents(res)
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(event.generationId).toBe(genId)
      expect(event.modelId).toBe('auto')
      expect(event.operation).toBe('create')
    }
    const phases = events
      .filter((e) => e.type === 'artifact-status')
      .map((e) => (e.type === 'artifact-status' ? e.phase : ''))
    expect(phases).toContain('saving')
    expect(phases).not.toContain('creating_file')
    expect(phases).not.toContain('error')
    const created = events.find((e) => e.type === 'artifact-created')
    if (created?.type !== 'artifact-created') throw new Error('missing created')
    expect(created.artifactId).toBeTruthy()
    expect(created.versionId).toBeTruthy()
    expect(created.version).toBe(1)
    expect(created.title).toBeTruthy()
    expect(created.messageId).toBeTruthy()
    expect(created.conversationId).toBeTruthy()
    expect(created.routerModelId).toBeTruthy()
  })

  it('emits cancelled as a real terminal phase when generation stops mid-stream', async () => {
    const USER = 'artifact-user-12'
    const { generateArtifactCore } = await import(
      '../../src/server/core/artifacts'
    )
    const { stopGenerationCore } = await import('../../src/server/core/chat')
    let releaseGate!: () => void
    __setNextStreamGate(new Promise<void>((resolve) => { releaseGate = resolve }))
    __setNextArtifactOutput(FRONTEND_SKILL)
    try {
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
      const stopped = await stopGenerationCore({
        generationId: genId,
        request: userRequest(USER),
      })
      expect(stopped.ok).toBe(true)
      releaseGate()
      const events = await readArtifactEvents(res)
      const phases = events
        .filter((e) => e.type === 'artifact-status')
        .map((e) => (e.type === 'artifact-status' ? e.phase : ''))
      expect(phases).toContain('cancelled')
      expect(phases).not.toContain('error')
      expect(events.some((e) => e.type === 'artifact-error')).toBe(false)
      const done = events.find((e) => e.type === 'artifact-done')
      if (done?.type !== 'artifact-done') throw new Error('missing done')
      expect(done.status).toBe('cancelled')
      const refundRows = (
        await db
          .select()
          .from(creditTransactions)
          .where(eq(creditTransactions.generationRunId, genId))
      ).filter((r) => r.type === 'refund')
      expect(refundRows.length).toBe(1)
    } finally {
      __setNextStreamGate(null)
    }
  })
})

describe('checklist artifact generation', () => {
  const CHECKLIST_USERS = ['artifact-checklist-1', 'artifact-checklist-2']
  const CHECKLIST_JSON = JSON.stringify({
    type: 'checklist',
    title: 'Checklist puasa',
    items: [
      { id: 'task-1', text: 'Sahur', completed: false },
      { id: 'task-2', text: 'Sholat subuh', completed: false },
    ],
  })

  beforeEach(async () => {
    resetRateLimitForTest()
    nextFinishReason = 'stop'
    nextStreamGate = null
    for (const id of CHECKLIST_USERS) {
      await cleanUser(id)
    }
    for (const id of CHECKLIST_USERS) {
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
    for (const id of CHECKLIST_USERS) {
      await cleanUser(id)
    }
  })

  it('creates a checklist markdown artifact without persisting model JSON', async () => {
    const USER = 'artifact-checklist-1'
    const { generateArtifactCore } = await import(
      '../../src/server/core/artifacts'
    )
    const r2 = await import('../../src/lib/r2/client')
    __setNextArtifactOutput(CHECKLIST_JSON)
    const res = await generateArtifactCore({
      data: {
        modelId: 'auto',
        skillId: 'checklist',
        content: 'Buatkan checklist puasa',
        enableWebSearch: false,
      },
      request: userRequest(USER),
    })
    expect(res.headers.get('X-Artifact-Kind')).toBe('checklist')
    const events = await readArtifactEvents(res)
    const created = events.find((e) => e.type === 'artifact-created')
    if (created?.type !== 'artifact-created') throw new Error('missing created')
    expect(created.kind).toBe('checklist')
    expect(created.title).toBe('Checklist puasa')
    expect(created.artifact.mimeType).toBe('text/markdown')
    expect(created.artifact.fileName.endsWith('.md')).toBe(true)
    expect(created.summary).toContain('Checklist puasa')

    const done = events.find((e) => e.type === 'artifact-done')
    if (done?.type !== 'artifact-done') throw new Error('missing done')
    expect(done.status).toBe('completed')

    expect(r2.putObject).toHaveBeenCalledTimes(1)
    const putArg = vi.mocked(r2.putObject).mock.calls[0][0]
    const persisted = (putArg.body as Buffer).toString('utf8')
    expect(persisted.startsWith('# Checklist puasa\n')).toBe(true)
    expect(
      persisted.split('\n').filter((line) => line.startsWith('- [ ] ')),
    ).toHaveLength(2)
    expect(persisted).not.toContain('"type"')
    expect(putArg.contentType).toBe('text/markdown')

    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, res.headers.get('X-Generation-Id') as string))
    expect(run.skillId).toBe('checklist')
    expect(run.content?.startsWith('# Checklist puasa')).toBe(true)
  })

  it('rejects checklist in single chat but accepts it in compare', async () => {
    const USER = 'artifact-checklist-2'
    const { sendCompareMessageCore, sendMessageCore } = await import(
      '../../src/server/core/chat'
    )
    await expect(
      sendMessageCore({
        data: {
          modelId: 'auto',
          skillId: 'checklist',
          content: 'halo',
        },
        request: userRequest(USER),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'ERR-003' })

    const compareRes = (await sendCompareMessageCore({
      data: {
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        skillId: 'checklist',
        content: 'buatkan checklist puasa',
      },
      request: userRequest(USER),
    })) as unknown as Response
    expect(compareRes).toBeInstanceOf(Response)
    expect(compareRes.headers.get('Content-Type')).toContain(
      'text/event-stream',
    )
    await compareRes.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 500))
  })
})
