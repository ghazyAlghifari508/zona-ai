import type { ModelMessage } from 'ai'
import { asc, desc, eq } from 'drizzle-orm'
import { ARTIFACT_HISTORY_BUDGET_BYTES } from '../../lib/ai/agent-skill'
import { ARTIFACT_SKILL_IDS } from '../../lib/chat/skills'
import { db } from '../../lib/db/index'
import { generationRuns, messages } from '../../lib/db/schema'

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
    .orderBy(desc(generationRuns.completedAt), desc(generationRuns.createdAt))
  const sourceByMessage = new Map<string, string>()
  const candidates: Array<{
    messageId: string
    bytes: number
    source: string
  }> = []
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
