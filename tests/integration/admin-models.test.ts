/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../../src/lib/auth/auth'
import { db } from '../../src/lib/db/index'
import { resolveAutoModel } from '../../src/lib/models/router'
import { AppError } from '../../src/lib/utils/errors'
import {
  getModelOverridesMap,
  isModelAvailable,
  resetModelOverridesInMemory,
  updateModelAvailabilityCore,
  updateModelOverrideInMemory,
} from '../../src/server/core/admin-models'
import {
  sendCompareMessageCore,
  sendMessageCore,
} from '../../src/server/core/chat'

describe('Admin Model Availability Enforcement', () => {
  beforeEach(() => {
    resetModelOverridesInMemory()
    vi.restoreAllMocks()
  })

  it('should report model as active by default', () => {
    expect(isModelAvailable('cx/gpt-5.6-terra')).toBe(true)
  })

  it('should report model as inactive after being disabled', () => {
    updateModelOverrideInMemory('cx/gpt-5.6-terra', false, 'Maintenance')
    expect(isModelAvailable('cx/gpt-5.6-terra')).toBe(false)
  })

  it('should resolve model availability across canonical and short model IDs', () => {
    updateModelOverrideInMemory('cx/gpt-5.6-terra', false, 'Maintenance')
    expect(isModelAvailable('cx/gpt-5.6-terra')).toBe(false)
    expect(isModelAvailable('gpt-5.6-terra')).toBe(false)
  })

  it('should return cached overrides map from getModelOverridesMap', async () => {
    updateModelOverrideInMemory('cx/gpt-5.6-luna', false, 'Overload')
    const map = await getModelOverridesMap()
    expect(map.get('cx/gpt-5.6-luna')).toEqual({
      isActive: false,
      disabledReason: 'Overload',
    })
  })

  it('should avoid disabled models in resolveAutoModel when isAvailable is supplied', () => {
    updateModelOverrideInMemory('cx/gpt-5.6-sol', false, 'Outage')
    const resolved = resolveAutoModel(
      'refactor code:\n```ts\nconst a = 1\n```',
      {
        isAvailable: isModelAvailable,
      },
    )
    expect(resolved.routerModelId).not.toBe('cx/gpt-5.6-sol')
    expect(resolved.routerModelId).toBe('ag/gemini-3.7-flash-high')
  })

  it('should reject sendMessageCore with 400 ERR-MODEL-DISABLED if requested model is disabled', async () => {
    updateModelOverrideInMemory('cx/gpt-5.6-terra', false, 'Maintenance')

    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
      session: {
        id: 'sess-chat',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-chat-1',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-chat',
      },
      user: {
        id: 'user-chat-1',
        email: 'user1@example.com',
        name: 'User One',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'user',
        banned: false,
      },
    })

    const request = new Request('http://localhost:3000/api/chat')

    try {
      await sendMessageCore({
        data: {
          modelId: 'cx/gpt-5.6-terra',
          content: 'Hello world',
        },
        request,
      })
      expect.fail('sendMessageCore should have thrown')
    } catch (e) {
      const err = e as AppError
      expect(err).toBeInstanceOf(AppError)
      expect(err.status).toBe(400)
      expect(err.code).toBe('ERR-MODEL-DISABLED')
      expect(err.message).toBe(
        'Model ini sedang dinonaktifkan oleh administrator.',
      )
    }
  })

  it('should reject sendCompareMessageCore with 400 ERR-MODEL-DISABLED if any model is disabled', async () => {
    updateModelOverrideInMemory('cx/gpt-5.6-terra', false, 'Maintenance')

    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
      session: {
        id: 'sess-compare',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-compare-1',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-compare',
      },
      user: {
        id: 'user-compare-1',
        email: 'compare@example.com',
        name: 'Compare User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'user',
        banned: false,
      },
    })

    const request = new Request('http://localhost:3000/api/compare')

    try {
      await sendCompareMessageCore({
        data: {
          modelIds: ['ag/gemini-3.7-flash-high', 'cx/gpt-5.6-terra'],
          content: 'Bandingkan dua model',
        },
        request,
      })
      expect.fail('sendCompareMessageCore should have thrown')
    } catch (e) {
      const err = e as AppError
      expect(err).toBeInstanceOf(AppError)
      expect(err.status).toBe(400)
      expect(err.code).toBe('ERR-MODEL-DISABLED')
      expect(err.message).toBe(
        'Model ini sedang dinonaktifkan oleh administrator.',
      )
    }
  })

  it('should require admin session in updateModelAvailabilityCore and persist overrides', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
      session: {
        id: 'sess-non-admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-regular',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-reg',
      },
      user: {
        id: 'user-regular',
        email: 'regular@example.com',
        name: 'Regular User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'user',
        banned: false,
      },
    })

    const request = new Request('http://localhost:3000/api/admin/models')

    await expect(
      updateModelAvailabilityCore({
        modelId: 'cx/gpt-5.6-terra',
        isActive: false,
        disabledReason: 'Emergency maintenance',
        request,
      }),
    ).rejects.toThrowError(AppError)

    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
      session: {
        id: 'sess-admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'admin-1',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-adm',
      },
      user: {
        id: 'admin-1',
        email: 'admin@zona.ai',
        name: 'Admin User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'admin',
        banned: false,
      },
    })

    const insertSpy = vi.spyOn(db, 'insert').mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue({}),
      }),
    } as unknown as ReturnType<typeof db.insert>)

    const result = await updateModelAvailabilityCore({
      modelId: 'cx/gpt-5.6-terra',
      isActive: false,
      disabledReason: 'Emergency maintenance',
      request,
    })

    expect(result.success).toBe(true)
    expect(result.isActive).toBe(false)
    expect(isModelAvailable('cx/gpt-5.6-terra')).toBe(false)
    expect(insertSpy).toHaveBeenCalled()
  })

  it('should reflect disabled status in getModelCatalog', async () => {
    updateModelOverrideInMemory('cx/gpt-5.6-terra', false, 'Routine Upgrade')
    const overrides = await getModelOverridesMap()
    const { getModelCatalog } = await import('../../src/lib/models/registry')
    const catalog = getModelCatalog(overrides)

    const entry = catalog.find((c) => c.id === 'cx/gpt-5.6-terra')
    expect(entry).toBeDefined()
    expect(entry?.isActive).toBe(false)
    expect(entry?.disabledReason).toBe('Routine Upgrade')

    const activeEntry = catalog.find((c) => c.id === 'auto')
    expect(activeEntry).toBeDefined()
    expect(activeEntry?.isActive).toBe(true)
  })

  it('should validate compare models availability with validateCompareModelsAvailability', async () => {
    const { validateCompareModelsAvailability } = await import(
      '../../src/server/core/compare'
    )
    expect(() =>
      validateCompareModelsAvailability([
        'ag/gemini-3.7-flash-high',
        'cx/gpt-5.6-sol',
      ]),
    ).not.toThrow()

    updateModelOverrideInMemory('cx/gpt-5.6-sol', false, 'Maintenance')
    expect(() =>
      validateCompareModelsAvailability([
        'ag/gemini-3.7-flash-high',
        'cx/gpt-5.6-sol',
      ]),
    ).toThrowError(AppError)
  })

  it('should validate updateModelAvailabilitySchema properly', async () => {
    const { updateModelAvailabilitySchema } = await import(
      '../../src/server/functions/admin-models'
    )
    const valid = updateModelAvailabilitySchema.safeParse({
      modelId: 'cx/gpt-5.6-sol',
      isActive: false,
      disabledReason: 'Upgrading cluster',
    })
    expect(valid.success).toBe(true)

    const invalid = updateModelAvailabilitySchema.safeParse({
      modelId: '',
      isActive: 'not-a-boolean',
    })
    expect(invalid.success).toBe(false)
  })
})
