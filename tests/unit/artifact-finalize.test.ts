/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { runFinalizeWithCompensation } from '../../src/server/core/artifacts'

describe('runFinalizeWithCompensation', () => {
  it('commits without deleting when the DB transaction succeeds', async () => {
    const writeR2 = vi.fn(async () => {})
    const commitDb = vi.fn(async () => {})
    const deleteR2 = vi.fn(async () => {})
    await runFinalizeWithCompensation({ writeR2, commitDb, deleteR2 })
    expect(writeR2).toHaveBeenCalledTimes(1)
    expect(commitDb).toHaveBeenCalledTimes(1)
    expect(deleteR2).not.toHaveBeenCalled()
  })

  it('deletes the R2 object when the DB transaction fails', async () => {
    const deleteR2 = vi.fn(async () => {})
    await expect(
      runFinalizeWithCompensation({
        writeR2: async () => {},
        commitDb: async () => {
          throw new Error('db down')
        },
        deleteR2,
      }),
    ).rejects.toThrow('db down')
    expect(deleteR2).toHaveBeenCalledTimes(1)
  })

  it('surfaces cleanup failure without hiding the original error', async () => {
    await expect(
      runFinalizeWithCompensation({
        writeR2: async () => {},
        commitDb: async () => {
          throw new Error('db down')
        },
        deleteR2: async () => {
          throw new Error('r2 down')
        },
      }),
    ).rejects.toThrow('db down')
  })

  it('does not touch R2 when the write itself fails', async () => {
    const deleteR2 = vi.fn(async () => {})
    await expect(
      runFinalizeWithCompensation({
        writeR2: async () => {
          throw new Error('r2 down')
        },
        commitDb: async () => {},
        deleteR2,
      }),
    ).rejects.toThrow('r2 down')
    expect(deleteR2).not.toHaveBeenCalled()
  })
})
