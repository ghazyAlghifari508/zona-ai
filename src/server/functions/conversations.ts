import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/start-server-core'
import { and, asc, desc, eq, gt, ilike, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db'
import { conversations } from '../../lib/db/schema'
import {
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
        data.includeArchived ? undefined : eq(conversations.isArchived, false),
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
  const ownership = and(
    eq(conversations.id, data.id),
    eq(conversations.userId, userId),
  )
  if (data.hard) await db.delete(conversations).where(ownership)
  else
    await db
      .update(conversations)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(ownership)
  return { success: true as const }
}

export async function archiveConversationCore({
  data,
  request,
}: {
  data: z.infer<typeof getConversationSchema>
  request: Request
}) {
  return deleteConversationCore({ data: { ...data, hard: false }, request })
}

export const getConversations = createServerFn({ method: 'GET' })
  .validator((data: unknown) => getConversationsSchema.parse(data))
  .handler(({ data }) =>
    getConversationsCore({ data, request: getRequest() as Request }),
  )

export const getConversation = createServerFn({ method: 'GET' })
  .validator((data: unknown) => getConversationSchema.parse(data))
  .handler(({ data }) =>
    getConversationCore({ data, request: getRequest() as Request }),
  )

export const createConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => createConversationSchema.parse(data))
  .handler(({ data }) =>
    createConversationCore({ data, request: getRequest() as Request }),
  )

export const updateConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => updateConversationSchema.parse(data))
  .handler(({ data }) =>
    updateConversationCore({ data, request: getRequest() as Request }),
  )

export const deleteConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => deleteConversationSchema.parse(data))
  .handler(({ data }) =>
    deleteConversationCore({ data, request: getRequest() as Request }),
  )

export const archiveConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => getConversationSchema.parse(data))
  .handler(({ data }) =>
    archiveConversationCore({ data, request: getRequest() as Request }),
  )
