/**
 * @vitest-environment node
 */
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'
import { conversations, users } from '../../src/lib/db/schema'
import { setConversationModelSchema } from '../../src/lib/utils/validation'

const ownerId = 'conv-model-owner'
const otherId = 'conv-model-other'

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async (request: Request) => ({
    user: { id: request.headers.get('x-test-user') ?? ownerId },
  })),
}))

const requestFor = (userId: string) =>
  new Request('http://localhost', { headers: { 'x-test-user': userId } })

async function cleanup() {
  await db
    .delete(conversations)
    .where(inArray(conversations.userId, [ownerId, otherId]))
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]))
}

describe('per-conversation model persistence', () => {
  beforeAll(async () => {
    await cleanup()
    await db.insert(users).values([
      { id: ownerId, email: 'conv-model-owner@example.com', name: 'Owner' },
      { id: otherId, email: 'conv-model-other@example.com', name: 'Other' },
    ])
  })

  afterAll(cleanup)

  it('stores the selected model at conversation creation', async () => {
    const { createConversationCore, getConversationCore } = await import(
      '../../src/server/core/conversations'
    )
    const created = await createConversationCore({
      data: { mode: 'normal', modelId: 'ag/mimo-v2.5' },
      request: requestFor(ownerId),
    })
    const fetched = await getConversationCore({
      data: { id: created.id },
      request: requestFor(ownerId),
    })
    expect(fetched.modelId).toBe('ag/mimo-v2.5')
  })

  it('leaves model unset when creation omits it', async () => {
    const { createConversationCore, getConversationCore } = await import(
      '../../src/server/core/conversations'
    )
    const created = await createConversationCore({
      data: { mode: 'normal' },
      request: requestFor(ownerId),
    })
    const fetched = await getConversationCore({
      data: { id: created.id },
      request: requestFor(ownerId),
    })
    expect(fetched.modelId).toBeNull()
  })

  it('updates the stored model for the owning user', async () => {
    const { createConversationCore, setConversationModelCore } = await import(
      '../../src/server/core/conversations'
    )
    const created = await createConversationCore({
      data: { mode: 'normal', modelId: 'ag/mimo-v2.5' },
      request: requestFor(ownerId),
    })
    const updated = await setConversationModelCore({
      data: { id: created.id, modelId: 'ag/qwen3.8-flash' },
      request: requestFor(ownerId),
    })
    expect(updated.modelId).toBe('ag/qwen3.8-flash')
  })

  it('rejects model updates from a non-owner', async () => {
    const { createConversationCore, setConversationModelCore } = await import(
      '../../src/server/core/conversations'
    )
    const created = await createConversationCore({
      data: { mode: 'normal', modelId: 'ag/mimo-v2.5' },
      request: requestFor(ownerId),
    })
    await expect(
      setConversationModelCore({
        data: { id: created.id, modelId: 'ag/qwen3.8-flash' },
        request: requestFor(otherId),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects model updates for an unknown conversation', async () => {
    const { setConversationModelCore } = await import(
      '../../src/server/core/conversations'
    )
    await expect(
      setConversationModelCore({
        data: {
          id: '20000000-0000-4000-8000-000000000001',
          modelId: 'ag/mimo-v2.5',
        },
        request: requestFor(ownerId),
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('rejects blank and overlong model ids at the boundary', () => {
    expect(() =>
      setConversationModelSchema.parse({
        id: '20000000-0000-4000-8000-000000000001',
        modelId: '   ',
      }),
    ).toThrow()
    expect(() =>
      setConversationModelSchema.parse({
        id: '20000000-0000-4000-8000-000000000001',
        modelId: 'x'.repeat(121),
      }),
    ).toThrow()
    expect(
      setConversationModelSchema.parse({
        id: '20000000-0000-4000-8000-000000000001',
        modelId: 'auto',
      }).modelId,
    ).toBe('auto')
  })
})
