import { describe, expect, it } from 'vitest'
import { resolveAutoModel } from '../../src/lib/models/router'

describe('resolveAutoModel', () => {
  it('lightweight greeting -> ag/gemini-3.7-flash-low cost 1', () => {
    expect(resolveAutoModel('halo')).toMatchObject({
      cost: 1,
      reason: 'lightweight',
    })
  })
  it('heavy reasoning -> ag/gemini-3.7-flash-high cost 6', () => {
    expect(
      resolveAutoModel('selesaikan persamaan x^2+3x=10 langkah demi langkah'),
    ).toMatchObject({ routerModelId: 'ag/gemini-3.7-flash-high', cost: 6 })
  })
  it('code block -> cx/gpt-5.6-sol cost 15', () => {
    expect(
      resolveAutoModel('refactor this:\n```ts\nconst x=1\n```'),
    ).toMatchObject({
      routerModelId: 'cx/gpt-5.6-sol',
      cost: 15,
    })
  })
  it('SQL keyword -> coding tier', () => {
    expect(resolveAutoModel('buatkan schema SQL untuk users')).toMatchObject({
      cost: 15,
    })
  })
  it('low-credit fallback: coding but credits 2 -> 6', () => {
    expect(resolveAutoModel('refactor code', { credits: 2 })).toMatchObject({
      cost: 6,
    })
  })
})
