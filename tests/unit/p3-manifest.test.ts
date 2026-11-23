import { describe, expect, it } from 'vitest'
import { buildLegacyCatalogSeed } from '../../src/lib/models/legacy-seed'
import { inspectP3Scope, p3Manifest } from '../../src/lib/models/p3-manifest'

const baseline = buildLegacyCatalogSeed()
const final = [
  ...baseline.filter(
    (row) => row.isVirtual || p3Manifest.retained.includes(row.routerModelId),
  ),
  ...p3Manifest.added.map(({ routerModelId }) => ({
    id: routerModelId,
    routerModelId,
  })),
]

describe('P3 exact catalog scope', () => {
  it('partitions all legacy physical routes without changing canonical identity', () => {
    expect(p3Manifest.retained).toHaveLength(4)
    expect(p3Manifest.retire).toHaveLength(21)
    expect(
      new Set([
        ...p3Manifest.retained,
        ...p3Manifest.retire.map((row) => row.routerModelId),
      ]),
    ).toEqual(
      new Set(
        baseline
          .filter((row) => !row.isVirtual)
          .map((row) => row.routerModelId),
      ),
    )
    expect(
      p3Manifest.retire.find((row) => row.legacyId === 'gpt-5.6-sol')
        ?.routerModelId,
    ).toBe('cx/gpt-5.6-sol')
  })

  it('rejects missing and substituted routes, reports unrelated additions separately', () => {
    expect(final).toHaveLength(19)
    expect(inspectP3Scope(final)).toEqual({
      missing: [],
      drift: [],
      conflicts: [],
    })
    const changed = final.map((row) =>
      row.id.startsWith('cor-prod/')
        ? { ...row, routerModelId: 'cor-prod/replaced' }
        : row,
    )
    const scope = inspectP3Scope([
      ...changed,
      { id: 'test/extra', routerModelId: 'test/extra' },
    ])
    expect(scope.conflicts).toEqual(['cor-prod/deepseek-v4-1-flash-1017'])
    expect(scope.drift).toEqual(['test/extra'])
    expect(
      inspectP3Scope(
        final.filter((row) => row.id.startsWith('zro-prod/') === false),
      ).missing,
    ).toEqual(['zro-prod/zro/deepseek-v4.1-flash'])
  })
})
