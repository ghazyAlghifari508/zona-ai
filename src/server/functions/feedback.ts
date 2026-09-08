import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  getFeedbackDetailCore,
  listFeedbackCore,
  submitFeedbackCore,
  updateFeedbackStatusCore,
} from '../core/feedback'

export const submitFeedbackSchema = z.object({
  type: z.enum(['general', 'feature', 'bug']),
  title: z
    .string()
    .min(1, 'Judul wajib diisi')
    .max(200, 'Judul maksimal 200 karakter'),
  description: z
    .string()
    .min(1, 'Deskripsi wajib diisi')
    .max(5000, 'Deskripsi maksimal 5000 karakter'),
  stepsToReproduce: z.string().max(3000).optional().nullable(),
  expectedBehavior: z.string().max(2000).optional().nullable(),
  actualBehavior: z.string().max(2000).optional().nullable(),
  attachmentR2Key: z.string().optional().nullable(),
  attachmentFileName: z.string().optional().nullable(),
  attachmentMimeType: z.string().optional().nullable(),
  attachmentFileSize: z.number().int().nonnegative().optional().nullable(),
})

export const listFeedbackSchema = z.object({
  status: z
    .enum(['all', 'new', 'in_progress', 'resolved', 'rejected'])
    .optional()
    .nullable(),
  type: z.enum(['all', 'general', 'feature', 'bug']).optional().nullable(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
})

export const updateFeedbackStatusSchema = z.object({
  feedbackId: z.string().min(1),
  status: z.enum(['new', 'in_progress', 'resolved', 'rejected']),
  adminNotes: z.string().max(5000).optional().nullable(),
})

export const getFeedbackDetailSchema = z.object({
  feedbackId: z.string().min(1),
})

export const submitFeedbackFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => submitFeedbackSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return submitFeedbackCore({
      request,
      data,
    })
  })

export const listFeedbackFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => listFeedbackSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const request = getRequest()
    return listFeedbackCore({
      request,
      status: data.status,
      type: data.type,
      page: data.page,
      limit: data.limit,
    })
  })

export const updateFeedbackStatusFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => updateFeedbackStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return updateFeedbackStatusCore({
      request,
      data,
    })
  })

export const getFeedbackDetailFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => getFeedbackDetailSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return getFeedbackDetailCore({
      request,
      feedbackId: data.feedbackId,
    })
  })
