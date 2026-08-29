/**
 * @vitest-environment node
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/index'
import {
  conversations,
  creditTransactions,
  generationRuns,
  messages,
  users,
} from '../../src/lib/db/schema'

describe('deductCompareCredits', () => {
  const userId = 'test-compare-credits-user'
  let convId: string
  let _userMsgId: string

  async function setupGenerationRuns(genIds: string[]) {
    const convRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
    if (convRows.length > 0) {
      convId = convRows[0].id
    } else {
      const [c] = await db
        .insert(conversations)
        .values({ userId, title: 'test conv' } as never)
        .returning()
      convId = c.id
    }
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: convId,
        role: 'user',
        content: 'hello',
      })
      .returning()
    _userMsgId = msg.id
    for (let i = 0; i < genIds.length; i++) {
      const [am] = await db
        .insert(messages)
        .values({
          conversationId: convId,
          role: 'assistant',
          content: '',
        })
        .returning()
      await db.insert(generationRuns).values({
        id: genIds[i],
        messageId: am.id,
        conversationId: convId,
        modelId: `model-${i}`,
        routerModelId: `router-${i}`,
        skillId: 'none',
        status: 'streaming',
      })
    }
  }

  async function cleanup() {
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
    for (const c of convs) {
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
  }

  beforeEach(async () => {
    await cleanup()
    await db.delete(users).where(eq(users.id, userId))
    await db.insert(users).values({
      id: userId,
      email: 'compare@test.com',
      name: 'Compare',
      credits: 100,
    } as never)
  })
  afterAll(async () => {
    await cleanup()
    await db.delete(users).where(eq(users.id, userId))
  })

  it('deducts total 19 for 4+15', async () => {
    const { deductCompareCredits } = await import('../../src/lib/ai/credits')
    const genIds = [crypto.randomUUID(), crypto.randomUUID()]
    await setupGenerationRuns(genIds)
    const balanceAfter = await deductCompareCredits({
      userId,
      generationRunIds: genIds,
      modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
      costs: [4, 15],
    })
    expect(balanceAfter).toBe(81)
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    expect(user.credits).toBe(81)
    const txs = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
    expect(txs.length).toBe(2)
    expect(txs.find((t) => t.amount === -4)).toBeDefined()
    expect(txs.find((t) => t.amount === -15)).toBeDefined()
  })

  it('throws 402 if insufficient', async () => {
    await db.update(users).set({ credits: 10 }).where(eq(users.id, userId))
    const { deductCompareCredits } = await import('../../src/lib/ai/credits')
    const genIds = [crypto.randomUUID(), crypto.randomUUID()]
    await expect(
      deductCompareCredits({
        userId,
        generationRunIds: genIds,
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        costs: [4, 15],
      }),
    ).rejects.toMatchObject({ status: 402, code: 'ERR-019' })
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    expect(user.credits).toBe(10)
  })

  it('refund single failed restores credit', async () => {
    const { deductCompareCredits, refundCredits } = await import(
      '../../src/lib/ai/credits'
    )
    const genIds = [crypto.randomUUID(), crypto.randomUUID()]
    await setupGenerationRuns(genIds)
    await deductCompareCredits({
      userId,
      generationRunIds: genIds,
      modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
      costs: [4, 15],
    })
    // simulate failed model gpt-5.6-sol refund
    await refundCredits({
      userId,
      generationRunId: genIds[1],
      modelId: 'gpt-5.6-sol',
      amount: 15,
    })
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    expect(user.credits).toBe(96) // 100-19+15
    const txs = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
    expect(
      txs.find((t) => t.type === 'refund' && t.amount === 15),
    ).toBeDefined()
  })
})
