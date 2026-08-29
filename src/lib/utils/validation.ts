import { z } from 'zod'
import {
  COMPARE_MAX_MODELS,
  COMPARE_MIN_MODELS,
  CONVERSATION_TITLE_MAX_LENGTH,
  CONVERSATIONS_MAX_PAGE_SIZE,
  CONVERSATIONS_PAGE_SIZE,
} from './constants'

export const chatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  modelId: z.string().min(1),
  skillId: z
    .enum(['none', 'checklist', 'prd-plan', 'agent-skill'])
    .default('none'),
  content: z.string().min(1).max(20000),
  attachmentIds: z.array(z.string().uuid()).optional(),
  enableWebSearch: z.boolean().optional().default(false),
})

export type ChatInput = z.infer<typeof chatSchema>

export const getConversationsSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(CONVERSATIONS_MAX_PAGE_SIZE)
    .default(CONVERSATIONS_PAGE_SIZE),
  includeArchived: z.boolean().default(false),
  search: z.string().trim().max(CONVERSATION_TITLE_MAX_LENGTH).optional(),
})

export const getConversationSchema = z.object({ id: z.string().uuid() })

export const createConversationSchema = z.object({
  title: z.string().trim().max(CONVERSATION_TITLE_MAX_LENGTH).optional(),
  mode: z.enum(['normal', 'compare']).default('normal'),
})

export const updateConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(CONVERSATION_TITLE_MAX_LENGTH),
})

export const deleteConversationSchema = z.object({
  id: z.string().uuid(),
  hard: z.boolean().default(false),
})

export const compareSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    modelIds: z
      .array(z.string().min(1))
      .min(COMPARE_MIN_MODELS)
      .max(COMPARE_MAX_MODELS),
    skillId: z
      .enum(['none', 'checklist', 'prd-plan', 'agent-skill'])
      .default('none'),
    content: z.string().min(1).max(20000),
    attachmentIds: z.array(z.string().uuid()).optional(),
    enableWebSearch: z.boolean().optional().default(false),
  })
  .refine((d) => !d.modelIds.includes('auto'), {
    message: 'Auto tidak tersedia di Compare',
    path: ['modelIds'],
  })
  .refine((d) => new Set(d.modelIds).size === d.modelIds.length, {
    message: 'Model tidak boleh duplikat',
    path: ['modelIds'],
  })

export type CompareInput = z.infer<typeof compareSchema>
