import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  getModelSettingsCore,
  updateModelAvailabilityCore,
} from '../core/admin-models'

export const updateModelAvailabilitySchema = z.object({
  modelId: z.string().min(1),
  isActive: z.boolean(),
  disabledReason: z.string().nullable().optional(),
})

export const getModelSettingsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const request = getRequest()
    return getModelSettingsCore({ request })
  },
)

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
