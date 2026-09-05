import { describe, expect, it } from 'vitest'
import { humanizeGenerationError } from '../../src/lib/utils/error-display'

describe('humanizeGenerationError', () => {
  it('returns required keys with correct types', () => {
    const r = humanizeGenerationError({
      message: 'Error code: 402 - insufficient credits in provider account',
    })
    expect(typeof r.userMessage).toBe('string')
    expect(r.userMessage.length).toBeGreaterThan(0)
    expect(
      typeof r.technicalDetail === 'string' || r.technicalDetail === null,
    ).toBe(true)
  })

  it('passes the raw message through as technicalDetail untouched', () => {
    const raw = 'Error code: 402 - Insufficient credits in provider account.'
    expect(humanizeGenerationError({ message: raw }).technicalDetail).toBe(raw)
  })

  it('never echoes a long raw error into userMessage', () => {
    const sentinel = 'XqTwZvLkRawApiDump'.repeat(8)
    const r = humanizeGenerationError({ message: sentinel })
    expect(r.userMessage).not.toContain(sentinel)
    expect(r.technicalDetail).toBe(sentinel)
  })

  it('classifies by mechanism: variants of the same mechanism share one message', () => {
    const a = humanizeGenerationError({
      message: 'Error code: 402 - Insufficient credits in provider account',
    })
    const b = humanizeGenerationError({
      message: 'provider balance exhausted, please top up',
    })
    expect(a.userMessage).toBe(b.userMessage)
    expect(a.userMessage.length).toBeGreaterThan(0)
  })

  it('distinct failure mechanisms yield distinct messages', () => {
    const msg = (m: string) =>
      humanizeGenerationError({ message: m }).userMessage
    const distinct = new Set([
      msg('Error code: 402 - insufficient credits'),
      msg('Error code: 429 - too many requests'),
      msg('request timed out after 90000ms'),
      msg('Error code: 401 - invalid api key'),
      msg('model not found for this account'),
      msg('maximum context length exceeded'),
      msg('fetch failed: ECONNREFUSED'),
      msg('Error code: 503 - service unavailable'),
    ])
    expect(distinct.size).toBe(8)
  })

  it('classifies by mechanism, never by model name', () => {
    const a = humanizeGenerationError({
      message: 'ModelA says: insufficient credits in provider account',
    })
    const b = humanizeGenerationError({
      message: 'ModelB says: insufficient credits in provider account',
    })
    expect(a.userMessage).toBe(b.userMessage)
  })

  it('falls back consistently for unrecognized mechanisms', () => {
    const a = humanizeGenerationError({
      message: 'ModelA request failed with some unknown glitch',
    })
    const b = humanizeGenerationError({
      message: 'completely unparseable provider output',
    })
    expect(a.userMessage).toBe(b.userMessage)
    expect(a.userMessage.length).toBeGreaterThan(0)
  })

  it('falls back safely with no technical detail on empty input', () => {
    for (const input of [null, undefined, {}, { message: '   ' }, '']) {
      const r = humanizeGenerationError(input)
      expect(r.userMessage.length).toBeGreaterThan(0)
      expect(r.technicalDetail).toBeNull()
    }
  })

  it('is deterministic for identical input', () => {
    const raw = { message: 'Error code: 402 - insufficient credits' }
    expect(humanizeGenerationError(raw)).toEqual(humanizeGenerationError(raw))
  })

  it('accepts Error instances and plain strings', () => {
    expect(
      humanizeGenerationError(new Error('fetch failed')).technicalDetail,
    ).toBe('fetch failed')
    expect(
      humanizeGenerationError('request timeout while streaming')
        .technicalDetail,
    ).toBe('request timeout while streaming')
  })
})
