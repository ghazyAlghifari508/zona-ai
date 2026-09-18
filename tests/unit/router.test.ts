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
  it('falls back to available model when primary candidates are unavailable', () => {
    const result = resolveAutoModel('halo', {
      isAvailable: (modelId) => modelId === 'ag/gemini-3.7-flash-high',
    })
    expect(result.routerModelId).toBe('ag/gemini-3.7-flash-high')
  })
  it('falls back to registry model when all rule candidates are unavailable', () => {
    const result = resolveAutoModel('halo', {
      isAvailable: (modelId) => modelId === 'bai/qwen3.8-flash',
    })
    expect(result.routerModelId).toBe('bai/qwen3.8-flash')
    expect(result.reason).toBe('registry-fallback')
  })
})
