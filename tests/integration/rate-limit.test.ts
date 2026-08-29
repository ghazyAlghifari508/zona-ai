/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest'
import {
  checkRateLimit,
  enforceRateLimit,
  resetRateLimitForTest,
} from '../../src/lib/security/rate-limit'

const mockUserId = 'ratelimit-test-user'

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async () => ({
    user: { id: mockUserId, email: 'ratelimit@example.com' },
  })),
}))

describe('enforceRateLimit', () => {
  it('throws 429 ERR-017 with Retry-After when limit exceeded', () => {
    resetRateLimitForTest()
    const key = 'enforce-test:user'
    for (let i = 0; i < 5; i++) {
      expect(() =>
        enforceRateLimit({ key, limit: 5, windowMs: 60000 }),
      ).not.toThrow()
    }
    try {
      enforceRateLimit({ key, limit: 5, windowMs: 60000 })
      expect.unreachable('should have thrown')
    } catch (err) {
      const e = err as {
        status: number
        code: string
        retryAfterSeconds?: number
      }
      expect(e.status).toBe(429)
      expect(e.code).toBe('ERR-017')
      expect(e.retryAfterSeconds).toBeGreaterThan(0)
      expect(e.retryAfterSeconds).toBeLessThanOrEqual(60)
    }
  })

  it('does not count other users toward a limit', () => {
    resetRateLimitForTest()
    const a = 'enforce-test:userA'
    const b = 'enforce-test:userB'
    for (let i = 0; i < 3; i++) {
      enforceRateLimit({ key: a, limit: 3, windowMs: 60000 })
    }
    expect(() =>
      enforceRateLimit({ key: b, limit: 3, windowMs: 60000 }),
    ).not.toThrow()
  })
})

describe('sendMessage rate limit (429 after limit)', () => {
  it('chat core rejects with ERR-017 once the chat key is exhausted', async () => {
    resetRateLimitForTest()
    const { sendMessageCore } = await import('../../src/server/core/chat')
    // Exhaust the chat rate limit key for the mocked user first
    for (let i = 0; i < 20; i++) {
      checkRateLimit({ key: `chat:${mockUserId}`, limit: 20, windowMs: 60000 })
    }
    await expect(
      sendMessageCore({
        data: { modelId: 'auto', content: 'hello again', skillId: 'none' },
        request: new Request('http://localhost:3000'),
      }),
    ).rejects.toMatchObject({ status: 429, code: 'ERR-017' })
    resetRateLimitForTest()
  })
})
