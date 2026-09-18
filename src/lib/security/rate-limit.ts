/**
 * In-memory rate limiting — per-user/IP keyed counters.
 * TODO Redis: replace Map store with Redis INCR + EXPIRE when distributed.
 */
import { ZonaApiError } from '../utils/errors'

type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export type RateLimitResult = {
  allowed: boolean
  retryAfter?: number
}

function sweepExpired(now: number): void {
  if (store.size < 100) return
  for (const [k, v] of store.entries()) {
    if (now >= v.resetAt) {
      store.delete(k)
    }
  }
}

export function checkRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string
  limit: number
  windowMs: number
}): RateLimitResult {
  const now = Date.now()
  sweepExpired(now)
  const entry = store.get(key)
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }
  if (entry.count < limit) {
    entry.count++
    return { allowed: true }
  }
  return {
    allowed: false,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  }
}

export function resetRateLimitForTest(key?: string): void {
  if (key) store.delete(key)
  else store.clear()
}

/** Throws 429 ERR-017 with Retry-After (seconds) when limit exceeded. */
export function enforceRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string
  limit: number
  windowMs: number
}): void {
  const result = checkRateLimit({ key, limit, windowMs })
  if (!result.allowed) {
    const err = new ZonaApiError(
      `ERR-017: Too many requests. Please wait a moment and try again. Retry-After: ${result.retryAfter ?? 60}s`,
      'ERR-017',
      429,
      true,
    )
    err.retryAfterSeconds = result.retryAfter ?? 60
    throw err
  }
}
