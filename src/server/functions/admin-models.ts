import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { listAdminModelsSchema } from '../../lib/admin/model-list-contract'
import {
  adminModelIdSchema,
  createAdminModelInputSchema,
  publishAdminModelInputSchema,
  retireAdminModelInputSchema,
  updateAdminModelInputSchema,
} from '../../lib/models/admin-model-input'
import { p3Manifest } from '../../lib/models/p3-manifest'
import {
  cutoverP3CatalogCore,
  discoverAdminGatewayModelsCore,
  getModelSettingsCore,
  importAdminModelCore,
  listAdminModelsCore,
  probeAdminModelCore,
  publishAdminModelCore,
  retireAdminModelCore,
  stageP3CatalogCore,
  updateAdminModelCore,
  updateModelAvailabilityCore,
} from '../core/admin-models'

export const updateModelAvailabilitySchema = z.object({
  modelId: z.string().min(1),
  isActive: z.boolean(),
  disabledReason: z.string().nullable().optional(),
})

export const probeAdminModelSchema = z.object({ modelId: adminModelIdSchema })

export const getModelSettingsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const request = getRequest()
    return getModelSettingsCore({ request })
  },
)

export const getAdminModelsFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => listAdminModelsSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const request = getRequest()
    return listAdminModelsCore({ request, ...data })
  })

export const discoverAdminGatewayModelsFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const request = getRequest()
  return discoverAdminGatewayModelsCore({ request })
})

export const importAdminModelFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => createAdminModelInputSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return importAdminModelCore({ request, input: data })
  })

export const updateAdminModelFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => updateAdminModelInputSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return updateAdminModelCore({ request, input: data })
  })

export const retireAdminModelFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => retireAdminModelInputSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return retireAdminModelCore({ request, modelId: data.modelId })
  })

export const probeAdminModelFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => probeAdminModelSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return probeAdminModelCore({ request, modelId: data.modelId })
  })

export const updateModelAvailabilityFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => updateModelAvailabilitySchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return updateModelAvailabilityCore({
      modelId: data.modelId,
      isActive: data.isActive,
      disabledReason: data.disabledReason,
      request,
    })
  })

export const publishAdminModelFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => publishAdminModelInputSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return publishAdminModelCore({ ...data, request })
  })

export const stageP3CatalogFn = createServerFn({ method: 'POST' }).handler(() =>
  stageP3CatalogCore(getRequest()),
)

export const cutoverP3CatalogFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => z.literal(p3Manifest.version).parse(data))
  .handler(({ data }) => cutoverP3CatalogCore(getRequest(), data))
