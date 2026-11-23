import { describe, expect, it } from 'vitest'
import { resolveAutoModel } from '../../src/lib/models/router'
import type { AutoCandidate } from '../../src/lib/models/auto-policy'

const candidates: AutoCandidate[] = [
  {
    id: 'fixture/light',
    routerModelId: 'fixture/light',
    credit: 1,
    tier: 'economy',
    profile: 'lightweight',
    score: 70,
    vision: false,
    files: false,
  },
  {
    id: 'fixture/code',
    routerModelId: 'fixture/code',
    credit: 15,
    tier: 'premium',
    profile: 'coding',
    score: 96,
    vision: true,
    files: true,
  },
  {
    id: 'fixture/reason',
    routerModelId: 'fixture/reason',
    credit: 6,
    tier: 'balanced',
    profile: 'reasoning',
    score: 85,
    vision: true,
    files: false,
  },
  {
    id: 'fixture/cheap-reason',
    routerModelId: 'fixture/cheap-reason',
    credit: 2,
    tier: 'economy',
    profile: 'reasoning',
    score: 60,
    vision: false,
    files: false,
  },
]

describe('resolveAutoModel catalog policy', () => {
  it('picks the cheapest lightweight candidate for greetings', () => {
    expect(resolveAutoModel('halo', { candidates })).toMatchObject({
      id: 'fixture/light',
      cost: 1,
      reason: 'lightweight',
    })
  })

  it('picks a coding candidate by classification', () => {
    expect(resolveAutoModel('refactor code', { candidates })).toMatchObject({
      id: 'fixture/code',
      cost: 15,
      reason: 'coding',
    })
  })

  it('picks a reasoning candidate for multi-step prompts', () => {
    expect(
      resolveAutoModel('jelaskan langkah demi langkah', { candidates }),
    ).toMatchObject({ id: 'fixture/reason', reason: 'reasoning' })
  })

  it('respects the credit budget before choosing a profile', () => {
    const resolved = resolveAutoModel('refactor code', {
      candidates,
      credits: 2,
    })
    expect(resolved?.cost).toBeLessThanOrEqual(2)
  })

  it('honours input capability requirements', () => {
    expect(
      resolveAutoModel('refactor code', { candidates, requireVision: true }),
    ).toMatchObject({ id: 'fixture/code' })
    expect(
      resolveAutoModel('halo', { candidates, requireVision: true }),
    ).toBeNull()
    expect(
      resolveAutoModel('halo', { candidates, requireFiles: true, credits: 2 }),
    ).toBeNull()
  })

  it('fails closed when no candidate is eligible', () => {
    expect(resolveAutoModel('halo', { candidates: [] })).toBeNull()
    expect(resolveAutoModel('halo', { candidates, credits: 0 })).toBeNull()
  })
})
