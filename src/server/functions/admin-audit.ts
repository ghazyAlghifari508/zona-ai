import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { listAuditLogsCore } from '../core/admin-audit'

export const listAuditLogsSchema = z.object({
  action: z.string().optional().nullable(),
  adminId: z.string().optional().nullable(),
  targetType: z.string().optional().nullable(),
  targetId: z.string().optional().nullable(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
})

export const listAuditLogsFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => listAuditLogsSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const request = getRequest()
    return listAuditLogsCore({
      request,
      action: data.action,
      adminId: data.adminId,
      targetType: data.targetType,
      targetId: data.targetId,
      page: data.page,
      limit: data.limit,
    })
  })
