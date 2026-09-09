import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  banUserCore,
  deleteUserCore,
  listUsersCore,
  unbanUserCore,
} from '../core/admin-users'

export const listUsersSchema = z.object({
  search: z.string().optional().nullable(),
  role: z.enum(['all', 'admin', 'user']).optional().nullable(),
  status: z.enum(['all', 'active', 'banned']).optional().nullable(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
})

export const banUserSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().optional().nullable(),
  expiresAt: z.union([z.string(), z.date()]).optional().nullable(),
})

export const unbanUserSchema = z.object({
  userId: z.string().min(1),
})

export const deleteUserSchema = z.object({
  userId: z.string().min(1),
})

export const listUsersFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => listUsersSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const request = getRequest()
    return listUsersCore({
      request,
      search: data.search,
      role: data.role,
      status: data.status,
      page: data.page,
      limit: data.limit,
    })
  })

export const banUserFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => banUserSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return banUserCore({
      request,
      data,
    })
  })

export const unbanUserFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => unbanUserSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return unbanUserCore({
      request,
      data,
    })
  })

export const deleteUserFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => deleteUserSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return deleteUserCore({
      request,
      data,
    })
  })
