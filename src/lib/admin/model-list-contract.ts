import { z } from 'zod'
import type { CatalogEntryDto } from '../models/catalog-contract'
import { catalogEntryDtoSchema } from '../models/catalog-contract'
import {
  ADMIN_MODEL_DEFAULT_PAGE_SIZE,
  ADMIN_MODEL_FILTER_MAX_LENGTH,
  ADMIN_MODEL_MAX_PAGE,
  ADMIN_MODEL_PAGE_SIZES,
} from '../utils/constants'

const optionalFilter = z
  .string()
  .max(ADMIN_MODEL_FILTER_MAX_LENGTH)
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))

export const listAdminModelsSchema = z
  .object({
    page: z.number().int().min(1).max(ADMIN_MODEL_MAX_PAGE).default(1),
    pageSize: z
      .union([
        z.literal(ADMIN_MODEL_PAGE_SIZES[0]),
        z.literal(ADMIN_MODEL_PAGE_SIZES[1]),
        z.literal(ADMIN_MODEL_PAGE_SIZES[2]),
      ])
      .default(ADMIN_MODEL_DEFAULT_PAGE_SIZE),
    search: optionalFilter,
    provider: optionalFilter,
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict()

export type ListAdminModelsInput = z.infer<typeof listAdminModelsSchema>

export interface AdminModelListItem extends CatalogEntryDto {
  lastCheckedAt: string | null
}

export interface AdminModelPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
  start: number
  end: number
}

export interface AdminModelListResponse {
  items: AdminModelListItem[]
  pagination: AdminModelPagination
  providers: string[]
}

export const adminModelPaginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.union([
    z.literal(ADMIN_MODEL_PAGE_SIZES[0]),
    z.literal(ADMIN_MODEL_PAGE_SIZES[1]),
    z.literal(ADMIN_MODEL_PAGE_SIZES[2]),
  ]),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
})

export const adminModelListResponseSchema = z.object({
  items: z.array(
    catalogEntryDtoSchema.extend({ lastCheckedAt: z.string().nullable() }),
  ),
  pagination: adminModelPaginationSchema,
  providers: z.array(z.string()),
})
