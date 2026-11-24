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
  comparisonRuns,
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
    return { user: { id: 'compare-artifact-default', email: 'ca@example.com' } }
  }),
}))

const CHECKLIST_VALID = JSON.stringify({
  type: 'checklist',
  title: 'Checklist compare',
  items: [
    { id: 'task-1', text: 'Sahur', completed: false },
    { id: 'task-2', text: 'Subuh', completed: false },
  ],
})

let outputQueue: string[] = []
let delayQueue: number[] = []
const nextUsage = { inputTokens: 5, outputTokens: 10, totalTokens: 15 }

function __setOutputs(outputs: string[]) {
  outputQueue = [...outputs]
}

function __setDelays(delays: number[]) {
  delayQueue = [...delays]
}

const mockStreamText = vi.fn((opts: Record<string, unknown>) => {
  const callIndex = mockStreamText.mock.calls.length - 1
  const output = outputQueue[callIndex] ?? CHECKLIST_VALID
  const delayMs = delayQueue[callIndex] ?? 0
  const onChunk = opts.onChunk as (() => void) | undefined
  if (onChunk) onChunk()
  const textStream = new ReadableStream<string>({
    start(controller) {
      const release = async () => {
        if (delayMs > 0)
          await new Promise((r) => setTimeout(r, delayMs))
        controller.enqueue(output)
        controller.close()
      }
      void release()
    },
  })
  return {
    text: Promise.resolve(output),
    stream: new ReadableStream({
      start(controller) {
        controller.close()
      },
    }),
    textStream,
    usage: Promise.resolve(nextUsage),
    finishReason: Promise.resolve('stop'),
  }
})

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return { ...actual, generateText: vi.fn(async () => ({ text: '' })), streamText: mockStreamText }
})

const COMPARE_USERS = ['compare-artifact-1', 'compare-artifact-2', 'compare-artifact-3', 'compare-artifact-4']

const FOUR_MODELS = [
  'cent-ai/qwen3.8-flash',
  'cx/gpt-6.2-sol',
  'gh/gpt-4.1',
  'tokenharbor/mimo-v2.6-flash:free',
]
const FOUR_MODEL_COST = 6 + 15 + 3 + 3

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
    sql`DELETE FROM comparison_runs WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${userId})`,
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

async function pollComparisonTerminal(
  runIds: string[],
  timeoutMs = 10000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const rows = await db
      .select()
      .from(comparisonRuns)
      .where(eq(comparisonRuns.conversationId, runIds[0]))
      .catch(() => [])
    void rows
    const all = await db.select().from(comparisonRuns)
    const targets = all.filter((r) => runIds.includes(r.id))
    if (
      targets.length === runIds.length &&
      targets.every((r) => r.status !== 'running')
    )
      return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('comparison runs did not reach terminal in time')
}

async function seedChecklistPair(userId: string): Promise<{
  convId: string
  first: { artifactId: string; versionId: string }
  second: { artifactId: string; versionId: string }
}> {
  const { finalizeArtifactVersion } = await import(
    '../../src/server/core/artifact-finalization'
  )
  const [conv] = await db
    .insert(conversations)
    .values({ userId, title: 'Compare seed', mode: 'normal' })
    .returning()
  const seeds: Array<{ artifactId: string; versionId: string }> = []
  const seedBytes = new TextEncoder().encode(
    '# Seed\n\n- [ ] Sahur\n- [ ] Subuh\n',
  )
  for (let i = 0; i < 2; i++) {
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
      skillId: 'checklist',
      status: 'streaming',
      startedAt: new Date(),
    })
    const bytes = seedBytes
    const descriptor = await finalizeArtifactVersion({
      userId,
      conversationId: conv.id,
      messageId: assistantMsg.id,
      generationId: genId,
      kind: 'checklist',
      title: `Seed ${i}`,
      modelId: 'auto',
      routerModelId: 'auto',
      fileName: `seed-${i}.md`,
      mimeType: 'text/markdown',
      bytes,
      summary: `Summary ${i}.`,
      usage: null,
      timing: { latencyMs: 5, timeToFirstTokenMs: null },
      finalizationMode: 'create',
    })
    seeds.push({
      artifactId: descriptor.artifactId,
      versionId: descriptor.versionId,
    })
  }
  return { convId: conv.id, first: seeds[0], second: seeds[1] }
}

describe('compareArtifactSchema', () => {
  it('constrains modelIds by COMPARE_MIN/MAX and rejects auto and duplicates', async () => {
    const { compareArtifactSchema } = await import(
      '../../src/lib/utils/validation'
    )
    expect(() =>
      compareArtifactSchema.parse({
        modelIds: ['cent-ai/qwen3.8-flash'],
        content: 'hi',
        operation: { type: 'create', skillId: 'checklist' },
      }),
    ).toThrow()
    expect(() =>
      compareArtifactSchema.parse({
        modelIds: [...FOUR_MODELS, 'glm-5.3-flash'],
        content: 'hi',
        operation: { type: 'create', skillId: 'checklist' },
      }),
    ).toThrow()
    expect(() =>
      compareArtifactSchema.parse({
        modelIds: ['auto', 'cent-ai/qwen3.8-flash'],
        content: 'hi',
        operation: { type: 'create', skillId: 'checklist' },
      }),
    ).toThrow()
    expect(() =>
      compareArtifactSchema.parse({
        modelIds: ['cent-ai/qwen3.8-flash', 'cent-ai/qwen3.8-flash'],
        content: 'hi',
        operation: { type: 'create', skillId: 'checklist' },
      }),
    ).toThrow()
    const parsed = compareArtifactSchema.parse({
      modelIds: ['cent-ai/qwen3.8-flash', 'cx/gpt-6.2-sol'],
      content: 'hi',
      operation: { type: 'create', skillId: 'checklist' },
    })
    expect(parsed.modelIds).toHaveLength(2)
  })
})

describe.sequential('generateCompareArtifactsCore', () => {
  beforeEach(async () => {
    resetRateLimitForTest()
    outputQueue = []
    delayQueue = []
    for (const id of COMPARE_USERS) {
      await cleanUser(id)
    }
    for (const id of COMPARE_USERS) {
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
    vi.mocked(r2.getObject).mockResolvedValue({
      body: Buffer.from('seed-bytes'),
      contentType: 'text/markdown',
    })
  })

  afterAll(async () => {
    for (const id of COMPARE_USERS) {
      await cleanUser(id)
    }
  })

  it('four models creating one checklist produce four distinct artifact/version/attachment IDs', async () => {
    const USER = COMPARE_USERS[0]
    const { generateCompareArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    __setOutputs([CHECKLIST_VALID, CHECKLIST_VALID, CHECKLIST_VALID, CHECKLIST_VALID])
    const res = await generateCompareArtifactsCore({
      data: {
        modelIds: FOUR_MODELS,
        content: 'Buatkan checklist compare',
        operation: { type: 'create', skillId: 'checklist' },
      },
      request: userRequest(USER),
    })
    expect(res.headers.get('X-Conversation-Id')).toBeTruthy()
    const runHeader = res.headers.get('X-Comparison-Run-Ids')
    expect(runHeader).toBeTruthy()
    expect(res.headers.get('X-Generation-Id')).toBeNull()
    expect(res.headers.get('X-Router-Model-Id')).toBeNull()
    const events = await readArtifactEvents(res)
    const created = events.filter((e) => e.type === 'artifact-created')
    expect(created).toHaveLength(4)
    const artifactIds = new Set(
      created.map((e) => (e.type === 'artifact-created' ? e.artifactId : '')),
    )
    const versionIds = new Set(
      created.map((e) => (e.type === 'artifact-created' ? e.versionId : '')),
    )
    const attachmentIds = new Set(
      created.map((e) =>
        e.type === 'artifact-created' ? e.artifact.attachmentId : '',
      ),
    )
    expect(artifactIds.size).toBe(4)
    expect(versionIds.size).toBe(4)
    expect(attachmentIds.size).toBe(4)
    for (const e of created) {
      if (e.type !== 'artifact-created') throw new Error('wrong event')
      expect(e.version).toBe(1)
      expect(e.kind).toBe('checklist')
      expect(e.comparisonRunId).toBe(runHeader?.split(',')[0])
    }
    const runIds = (runHeader as string).split(',')
    expect(runIds).toHaveLength(1)
    await pollComparisonTerminal(runIds)
    const [run] = await db
      .select()
      .from(comparisonRuns)
      .where(eq(comparisonRuns.id, runIds[0]))
    expect(run.status).toBe('completed')
    const gens = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.comparisonRunId, runIds[0]))
    expect(gens).toHaveLength(4)
    const requestIds = new Set(gens.map((g) => g.requestMessageId))
    expect(requestIds.size).toBe(1)
    expect(gens.every((g) => g.status === 'completed')).toBe(true)
    const [user] = await db.select().from(users).where(eq(users.id, USER))
    expect(user.credits).toBe(1000 - FOUR_MODEL_COST)
  })

  it('two revision targets across four models plan eight generations and two comparison runs with fork lineage', async () => {
    const USER = COMPARE_USERS[1]
    const seed = await seedChecklistPair(USER)
    const r2 = await import('../../src/lib/r2/client')
    vi.mocked(r2.getObject).mockResolvedValue({
      body: Buffer.from('# Seed\n\n- [ ] Sahur\n- [ ] Subuh\n', 'utf8'),
      contentType: 'text/markdown',
    })
    const { generateCompareArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    __setOutputs(Array(8).fill(CHECKLIST_VALID))
    const res = await generateCompareArtifactsCore({
      data: {
        conversationId: seed.convId,
        modelIds: FOUR_MODELS,
        content: 'Revisi compare',
        operation: {
          type: 'revise',
          targets: [
            { artifactId: seed.first.artifactId, versionId: seed.first.versionId },
            { artifactId: seed.second.artifactId, versionId: seed.second.versionId },
          ],
        },
      },
      request: userRequest(USER),
    })
    const runHeader = res.headers.get('X-Comparison-Run-Ids') as string
    const runIds = runHeader.split(',')
    expect(runIds).toHaveLength(2)
    const events = await readArtifactEvents(res)
    const created = events.filter((e) => e.type === 'artifact-created')
    expect(created).toHaveLength(8)
    for (const e of created) {
      if (e.type !== 'artifact-created') throw new Error('wrong event')
      expect(e.version).toBe(1)
      expect(e.operation).toBe('fork')
    }
    const versions = await db.select().from(artifactVersions)
    const forks = versions.filter((v) => v.version === 1 && v.sourceVersionId !== null)
    expect(forks.length).toBeGreaterThanOrEqual(8)
    await pollComparisonTerminal(runIds)
    for (const runId of runIds) {
      const gens = await db
        .select()
        .from(generationRuns)
        .where(eq(generationRuns.comparisonRunId, runId))
      expect(gens).toHaveLength(4)
    }
    const [firstSource] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, seed.first.artifactId))
    expect(firstSource.currentVersionId).toBe(seed.first.versionId)
    const [secondSource] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, seed.second.artifactId))
    expect(secondSource.currentVersionId).toBe(seed.second.versionId)
  })

  it('one model failure leaves siblings completed and comparison partial_failure with generation-scoped refund', async () => {
    const USER = COMPARE_USERS[2]
    const { generateCompareArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    __setOutputs([CHECKLIST_VALID, 'bukan checklist valid', CHECKLIST_VALID, CHECKLIST_VALID])
    const res = await generateCompareArtifactsCore({
      data: {
        modelIds: FOUR_MODELS,
        content: 'Partial failure compare',
        operation: { type: 'create', skillId: 'checklist' },
      },
      request: userRequest(USER),
    })
    const runIds = (res.headers.get('X-Comparison-Run-Ids') as string).split(',')
    const events = await readArtifactEvents(res)
    expect(events.filter((e) => e.type === 'artifact-created')).toHaveLength(3)
    expect(events.some((e) => e.type === 'artifact-error')).toBe(true)
    await pollComparisonTerminal(runIds)
    const [run] = await db
      .select()
      .from(comparisonRuns)
      .where(eq(comparisonRuns.id, runIds[0]))
    expect(run.status).toBe('partial_failure')
    const gens = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.comparisonRunId, runIds[0]))
    expect(gens.filter((g) => g.status === 'completed')).toHaveLength(3)
    expect(gens.filter((g) => g.status === 'failed')).toHaveLength(1)
    const txs = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, USER))
    const failed = gens.find((g) => g.status === 'failed')
    expect(
      txs.filter((t) => t.generationRunId === failed?.id && t.type === 'refund'),
    ).toHaveLength(1)
    for (const ok of gens.filter((g) => g.status === 'completed')) {
      expect(
        txs.filter((t) => t.generationRunId === ok.id && t.type === 'refund'),
      ).toHaveLength(0)
    }
  })

  it('comparison status finalizes only after every worker is terminal', async () => {
    const USER = COMPARE_USERS[3]
    const { generateCompareArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    __setOutputs([CHECKLIST_VALID, CHECKLIST_VALID])
    __setDelays([0, 1200])
    const res = await generateCompareArtifactsCore({
      data: {
        modelIds: ['cent-ai/qwen3.8-flash', 'cx/gpt-6.2-sol'],
        content: 'Barrier compare',
        operation: { type: 'create', skillId: 'checklist' },
      },
      request: userRequest(USER),
    })
    const runIds = (res.headers.get('X-Comparison-Run-Ids') as string).split(',')
    const [early] = await db
      .select()
      .from(comparisonRuns)
      .where(eq(comparisonRuns.id, runIds[0]))
    expect(early.status).toBe('running')
    await new Promise((r) => setTimeout(r, 400))
    const [mid] = await db
      .select()
      .from(comparisonRuns)
      .where(eq(comparisonRuns.id, runIds[0]))
    expect(mid.status).toBe('running')
    await readArtifactEvents(res)
    await pollComparisonTerminal(runIds)
    const [late] = await db
      .select()
      .from(comparisonRuns)
      .where(eq(comparisonRuns.id, runIds[0]))
    expect(late.status).toBe('completed')
  })

  it('insufficient credits creates no conversation, generations, comparison runs, deductions, messages, or R2 writes', async () => {
    const USER = COMPARE_USERS[0]
    await db.update(users).set({ credits: 5 }).where(eq(users.id, USER))
    const r2 = await import('../../src/lib/r2/client')
    const convsBefore = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.userId, USER))
    const { generateCompareArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    await expect(
      generateCompareArtifactsCore({
        data: {
          modelIds: FOUR_MODELS,
          content: 'Too expensive',
          operation: { type: 'create', skillId: 'checklist' },
        },
        request: userRequest(USER),
      }),
    ).rejects.toMatchObject({ status: 402 })
    const convsAfter = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.userId, USER))
    expect(convsAfter.length).toBe(convsBefore.length)
    expect(vi.mocked(r2.putObject).mock.calls.length).toBe(0)
    const txs = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, USER))
    expect(txs).toHaveLength(0)
    const [user] = await db.select().from(users).where(eq(users.id, USER))
    expect(user.credits).toBe(5)
  })

  it('rejects non-compare artifact skills in compare', async () => {
    const USER = COMPARE_USERS[1]
    const { generateCompareArtifactsCore } = await import(
      '../../src/server/core/artifact-generation'
    )
    await expect(
      generateCompareArtifactsCore({
        data: {
          modelIds: ['cent-ai/qwen3.8-flash', 'cx/gpt-6.2-sol'],
          content: 'PRD compare blocked',
          operation: { type: 'create', skillId: 'prd-plan' },
        },
        request: userRequest(USER),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
