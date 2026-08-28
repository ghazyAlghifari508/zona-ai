/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { deductCredits } from '../../src/lib/ai/credits'

describe('deductCredits', () => {
  it('throws 402 if insufficient', async () => {
    await expect(
      deductCredits({
        userId: 'nonexistent-user-credits-test',
        generationRunId: crypto.randomUUID(),
        modelId: 'gpt-5.6-sol',
        amount: 15,
      }),
    ).rejects.toThrow(/402|INSUFFICIENT/)
  })
})
