// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  correlateProvenance,
  provenanceKey,
  totalGatewayCost,
  verifyRouteProvenance,
  type GatewayUsage,
} from '../../src/lib/models/p3-provenance.server'

const usage = (
  at: string,
  model: string,
  overrides: Partial<GatewayUsage> = {},
): GatewayUsage => ({
  at,
  provider: 'github',
  model,
  cost: 0.01,
  promptTokens: 100,
  completionTokens: 10,
  status: 'ok',
  ...overrides,
})

describe('gateway provenance correlation', () => {
  it('matches each completed attempt to one earlier unused usage row', () => {
    const rows = [
      usage('2026-01-01T00:00:00.000Z', 'gpt-4.1'),
      usage('2026-01-01T00:00:05.030Z', 'gpt-4o'),
    ]
    const correlated = correlateProvenance(
      [
        { route: 'gh/gpt-4.1', at: '2026-01-01T00:00:00.020Z' },
        { route: 'gh/gpt-4o', at: '2026-01-01T00:00:05.042Z' },
      ],
      rows,
    )
    expect(correlated.size).toBe(2)
    expect(
      correlated.get(
        provenanceKey('gh/gpt-4.1', '2026-01-01T00:00:00.020Z'),
      ),
    ).toMatchObject({ model: 'gpt-4.1', deltaMs: 20 })
    expect(
      correlated.get(
        provenanceKey('gh/gpt-4o', '2026-01-01T00:00:05.042Z'),
      ),
    ).toMatchObject({ model: 'gpt-4o', deltaMs: 12 })
  })
  it('rejects attempts before a usage row and claims each row once', () => {
    const correlated = correlateProvenance(
      [
        { route: 'test/late', at: '2026-01-01T00:00:01.000Z' },
        { route: 'test/early', at: '2026-01-01T00:00:00.050Z' },
        { route: 'test/duplicate', at: '2026-01-01T00:00:01.010Z' },
      ],
      [usage('2026-01-01T00:00:00.100Z', 'model-a')],
      1000,
    )
    expect(correlated.size).toBe(1)
    expect(
      correlated.get(provenanceKey('test/late', '2026-01-01T00:00:01.000Z')),
    ).toMatchObject({ model: 'model-a' })
    expect(
      correlated.get(
        provenanceKey('test/duplicate', '2026-01-01T00:00:01.010Z'),
      ),
    ).toBeUndefined()
  })

  it('sums only reported provider cost', () => {
    expect(
      totalGatewayCost([
        usage('2026-01-01T00:00:00.000Z', 'a', { cost: 0.5 }),
        usage('2026-01-01T00:00:01.000Z', 'b', { cost: null }),
      ]),
    ).toBe(0.5)
  })
})

describe('exact-route provenance verification', () => {
  const at = '2026-01-01T00:00:00.000Z'
  const confirmed = (model: string, overrides: Partial<GatewayUsage> = {}) =>
    correlateProvenance(
      [{ route: 'gh/gpt-4.1', at: '2026-01-01T00:00:00.020Z' }],
      [usage(at, model, overrides)],
    ).get(provenanceKey('gh/gpt-4.1', '2026-01-01T00:00:00.020Z'))
  const assertVerified = (
    provenance: ReturnType<typeof confirmed>,
    reported: string | null,
  ) => {
    if (!provenance) throw new Error('Missing provenance fixture')
    return verifyRouteProvenance('gh/gpt-4.1', reported, provenance)
  }

  it('accepts a stream alias when the gateway resolved the exact route', () => {
    expect(assertVerified(confirmed('gpt-4.1'), 'gpt-4.1-2025-04-14')).toEqual({
      verified: true,
      reason: 'gateway-exact-route',
    })
  })

  it('rejects a gateway row that resolved a different model', () => {
    expect(assertVerified(confirmed('gpt-4o'), 'gpt-4.1')).toEqual({
      verified: false,
      reason: 'gateway-model-mismatch',
    })
  })

  it('rejects an unsuccessful gateway row', () => {
    expect(
      assertVerified(
        confirmed('gpt-4.1', { status: 'error' }),
        'gpt-4.1-2025-04-14',
      ),
    ).toEqual({ verified: false, reason: 'gateway-status-not-ok' })
  })

  it('rejects a reported model unrelated to the resolved route', () => {
    expect(assertVerified(confirmed('gpt-4.1'), 'claude-opus-5-5')).toEqual({
      verified: false,
      reason: 'reported-model-unrelated',
    })
  })

  it('rejects a missing reported identity', () => {
    expect(assertVerified(confirmed('gpt-4.1'), null)).toEqual({
      verified: false,
      reason: 'identity-unreported',
    })
  })
})
