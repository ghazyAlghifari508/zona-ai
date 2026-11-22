import { describe, expect, it } from 'vitest'
import {
  type AutoCandidate,
  AUTO_ROUTING_THRESHOLDS,
  selectAutoCandidate,
} from '../../src/lib/models/auto-policy'

const candidates: AutoCandidate[] = [
  {
    id: 'cheap',
    routerModelId: 'route/cheap',
    credit: 1,
    tier: 'economy',
    profile: 'lightweight',
    score: 60,
    vision: true,
    files: true,
  },
  {
    id: 'balanced',
    routerModelId: 'route/balanced',
    credit: 6,
    tier: 'balanced',
    profile: 'reasoning',
    score: 88,
    vision: true,
    files: true,
  },
  {
    id: 'coder',
    routerModelId: 'route/coder',
    credit: 15,
    tier: 'premium',
    profile: 'coding',
    score: 96,
    vision: true,
    files: true,
  },
  {
    id: 'unavailable-for-vision',
    routerModelId: 'route/no-vision',
    credit: 3,
    tier: 'economy',
    profile: 'lightweight',
    score: 70,
    vision: false,
    files: false,
  },
]

describe('catalog-driven Auto policy', () => {
  it('follows thresholds defined in one place', () => {
    expect(AUTO_ROUTING_THRESHOLDS.shortPromptWords).toBe(20)
    expect(AUTO_ROUTING_THRESHOLDS.longPromptWords).toBe(100)
    expect(AUTO_ROUTING_THRESHOLDS.lowCredit).toBe(15)
  })

  it('routes short prompts to an affordable lightweight candidate', () => {
    const picked = selectAutoCandidate({
      prompt: 'halo',
      credits: 10,
      candidates,
    })
    expect(picked?.id).toBe('cheap')
    expect(picked).toMatchObject({ credit: 1, reason: 'lightweight' })
  })

  it('routes code prompts to the coding candidate when affordable', () => {
    const picked = selectAutoCandidate({
      prompt: 'refactor this function\n```ts\nconst x = 1\n```',
      credits: 20,
      candidates,
    })
    expect(picked?.id).toBe('coder')
    expect(picked?.reason).toBe('coding')
  })

  it('drops to an affordable reasoning candidate on low credit', () => {
    const picked = selectAutoCandidate({
      prompt: 'refactor this function',
      credits: 8,
      candidates,
    })
    expect(picked?.id).toBe('balanced')
    expect(picked?.credit).toBeLessThanOrEqual(8)
  })

  it('routes long analytical prompts to reasoning', () => {
    const picked = selectAutoCandidate({
      prompt: `jelaskan ${'analisis langkah demi langkah '.repeat(20)}`,
      credits: 20,
      candidates,
    })
    expect(picked?.id).toBe('balanced')
    expect(picked?.reason).toBe('reasoning')
  })

  it('returns null instead of a static fallback when nothing is eligible', () => {
    expect(
      selectAutoCandidate({
        prompt: 'refactor code',
        credits: 0,
        candidates,
      }),
    ).toBeNull()
    expect(
      selectAutoCandidate({
        prompt: 'halo',
        credits: 10,
        candidates: [],
      }),
    ).toBeNull()
  })

  it('applies capability requirements from the request', () => {
    expect(
      selectAutoCandidate({
        prompt: 'halo',
        credits: 10,
        candidates,
        requireVision: true,
      })?.id,
    ).toBe('cheap')
    expect(
      selectAutoCandidate({
        prompt: 'halo',
        credits: 10,
        candidates,
        requireFiles: true,
      })?.id,
    ).toBe('cheap')
  })

  it('uses the lightweight profile for title generation', () => {
    expect(
      selectAutoCandidate({
        prompt: '',
        candidates,
        purpose: 'title',
      })?.id,
    ).toBe('cheap')
  })
})
