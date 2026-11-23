import { expect, it } from 'vitest'
import { buildLegacyCatalogSeed } from '../../src/lib/models/legacy-seed'
import { planP3Cutover } from '../../src/lib/models/p3-cutover'
import { p3Manifest } from '../../src/lib/models/p3-manifest'

it('retires only the approved set when exact verified candidates remain', () => {
  const baseline = buildLegacyCatalogSeed()
  const template = baseline.find((r) => !r.isVirtual)
  if (!template) throw new Error('No physical fixture')
  const candidates = p3Manifest.added.map(({ routerModelId: id }) => ({
    ...template,
    id,
    routerModelId: id,
    evaluationStatus: 'pending' as const,
  }))
  const unready = [...baseline, ...candidates]
  expect(() => planP3Cutover(unready)).toThrow()
  const ready = unready.map((r) =>
    r.id === candidates[0].id
      ? {
          ...r,
          evaluationStatus: 'verified' as const,
          routingProfile: 'general' as const,
          creditCostMax: 3,
        }
      : r,
  )
  expect(planP3Cutover(ready).retire.map((r) => r.routerModelId)).toEqual(
    p3Manifest.retire.map((r) => r.routerModelId),
  )
  expect(() =>
    planP3Cutover([
      ...ready,
      { ...template, id: 'extra/route', routerModelId: 'extra/route' },
    ]),
  ).toThrow('extra/route')
  expect(() =>
    planP3Cutover(
      ready.map((r) =>
        r.id === candidates[0].id ? { ...r, status: 'inactive' } : r,
      ),
    ),
  ).toThrow()
})
