/**
 * Server-only conversation helpers.
 * NEVER import from client code — pulls db/postgres into the browser bundle.
 */
import { and, asc, desc, eq, gt, ilike, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db'
import { conversations } from '../../lib/db/schema'
import type {
  createConversationSchema,
  deleteConversationSchema,
  getConversationSchema,
  getConversationsSchema,
  updateConversationSchema,
} from '../../lib/utils/validation'

type Session = { user: { id: string } }
type ConversationCursor = { updatedAt: Date; id: string }

const cursorSchema = z.object({
  updatedAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  id: z.string().uuid(),
})

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

function encodeCursor(cursor: ConversationCursor) {
  return Buffer.from(
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url')
}

function decodeCursor(cursor: string): ConversationCursor {
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    )
  } catch {
    throw httpError(400, 'Invalid cursor')
  }
}

async function sessionUserId(request: Request) {
  const session = (await getAuthSession(request)) as Session
  return session.user.id
}

async function ownedConversation(id: string, userId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
  if (!conversation) throw httpError(404, 'Not Found')
  if (conversation.userId !== userId) throw httpError(403, 'Forbidden')
  return conversation
}

export async function getConversationsCore({
  data,
  request,
}: {
  data: z.infer<typeof getConversationsSchema>
  request: Request
}) {
  const userId = await sessionUserId(request)
  const cursor = data.cursor ? decodeCursor(data.cursor) : undefined
  const search = data.search?.trim()
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        search ? ilike(conversations.title, `%${search}%`) : undefined,
        cursor
          ? or(
              lt(conversations.updatedAt, cursor.updatedAt),
              and(
                eq(conversations.updatedAt, cursor.updatedAt),
                gt(conversations.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(conversations.updatedAt), asc(conversations.id))
    .limit(data.limit + 1)

  const hasMore = rows.length > data.limit
  const page = rows.slice(0, data.limit)
  const last = page.at(-1)
  return {
    conversations: page,
    nextCursor:
      hasMore && last?.updatedAt
        ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
        : undefined,
  }
}

export async function getConversationCore({
  data,
  request,
}: {
  data: z.infer<typeof getConversationSchema>
  request: Request
}) {
  return ownedConversation(data.id, await sessionUserId(request))
}

export async function createConversationCore({
  data,
  request,
}: {
  data: z.infer<typeof createConversationSchema>
  request: Request
}) {
  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: await sessionUserId(request),
      title: data.title?.trim() || 'New Chat',
      mode: data.mode,
    })
    .returning()
  return conversation
}

export async function updateConversationCore({
  data,
  request,
}: {
  data: z.infer<typeof updateConversationSchema>
  request: Request
}) {
  const userId = await sessionUserId(request)
  await ownedConversation(data.id, userId)
  const [updated] = await db
    .update(conversations)
    .set({ title: data.title, updatedAt: new Date() })
    .where(and(eq(conversations.id, data.id), eq(conversations.userId, userId)))
    .returning()
  return updated
}

export async function deleteConversationCore({
  data,
  request,
}: {
  data: z.infer<typeof deleteConversationSchema>
  request: Request
}) {
  const userId = await sessionUserId(request)
  await ownedConversation(data.id, userId)
  await db
    .delete(conversations)
    .where(and(eq(conversations.id, data.id), eq(conversations.userId, userId)))
  return { success: true as const }
}

export async function deleteAllConversationsCore({
  request,
}: {
  request: Request
}) {
  const userId = await sessionUserId(request)
  await db.delete(conversations).where(eq(conversations.userId, userId))
  return { success: true as const }
}
