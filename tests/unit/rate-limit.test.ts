import { describe, expect, it } from 'vitest'
import {
  checkRateLimit,
  resetRateLimitForTest,
} from '../../src/lib/security/rate-limit'

describe('rate limit', () => {
  it('allows under limit, blocks over, returns retryAfter', () => {
    resetRateLimitForTest()
    const key = 'test:user1'
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit({ key, limit: 20, windowMs: 60000 }).allowed).toBe(
        true,
      )
    }
    const blocked = checkRateLimit({ key, limit: 20, windowMs: 60000 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeDefined()
    expect(blocked.retryAfter).toBeGreaterThan(0)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  it('independent keys have independent limits', () => {
    resetRateLimitForTest()
    const a = 'rate-test:userA'
    const b = 'rate-test:userB'
    for (let i = 0; i < 5; i++) {
      expect(
        checkRateLimit({ key: a, limit: 5, windowMs: 60000 }).allowed,
      ).toBe(true)
    }
    expect(checkRateLimit({ key: a, limit: 5, windowMs: 60000 }).allowed).toBe(
      false,
    )
    expect(checkRateLimit({ key: b, limit: 5, windowMs: 60000 }).allowed).toBe(
      true,
    )
  })

  it('window resets after expiry', () => {
    resetRateLimitForTest()
    const key = 'rate-test:expiry'
    for (let i = 0; i < 3; i++) {
      checkRateLimit({ key, limit: 3, windowMs: 10 })
    }
    expect(checkRateLimit({ key, limit: 3, windowMs: 10 }).allowed).toBe(false)
    // wait past window
    const start = Date.now()
    while (Date.now() - start < 25) {
      /* busy wait */
    }
    expect(checkRateLimit({ key, limit: 3, windowMs: 10 }).allowed).toBe(true)
  })

  it('resetRateLimitForTest clears store', () => {
    resetRateLimitForTest()
    const key = 'rate-test:reset'
    for (let i = 0; i < 3; i++) {
      checkRateLimit({ key, limit: 3, windowMs: 60000 })
    }
    resetRateLimitForTest(key)
    expect(checkRateLimit({ key, limit: 3, windowMs: 60000 }).allowed).toBe(
      true,
    )
  })
})
