import { z } from 'zod'
import { SKILL_IDS } from '../chat/skills'
import {
  COMPARE_MAX_MODELS,
  COMPARE_MIN_MODELS,
  CONVERSATION_TITLE_MAX_LENGTH,
  CONVERSATIONS_MAX_PAGE_SIZE,
  CONVERSATIONS_PAGE_SIZE,
} from './constants'

export const skillIdSchema = z.enum(SKILL_IDS)

// Literal tuple mirrors ARTIFACT_SKILL_IDS; the registry test above pins the
// two lists together so they cannot drift silently.
export const artifactSkillIdSchema = z.enum(['prd-plan', 'agent-skill'])

export const chatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  modelId: z.string().min(1),
  skillId: skillIdSchema.default('none'),
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
  search: z.string().trim().max(CONVERSATION_TITLE_MAX_LENGTH).optional(),
})

export const getConversationSchema = z.object({ id: z.string().uuid() })

export const createConversationSchema = z.object({
  title: z.string().trim().max(CONVERSATION_TITLE_MAX_LENGTH).optional(),
  mode: z.enum(['normal', 'compare']).default('normal'),
  modelId: z.string().trim().min(1).max(120).optional(),
})

export const updateConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(CONVERSATION_TITLE_MAX_LENGTH),
})

export const setConversationModelSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().trim().min(1).max(120),
})

export const setConversationModeSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(['normal', 'compare']),
})

export const deleteConversationSchema = z.object({
  id: z.string().uuid(),
})

export const compareSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    modelIds: z
      .array(z.string().min(1))
      .min(COMPARE_MIN_MODELS)
      .max(COMPARE_MAX_MODELS),
    skillId: skillIdSchema.default('none'),
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

export const artifactSchema = z.object({
  conversationId: z.string().uuid().optional(),
  modelId: z.string().min(1),
  skillId: artifactSkillIdSchema,
  content: z.string().min(1).max(20000),
  attachmentIds: z.array(z.string().uuid()).optional(),
  enableWebSearch: z.boolean().optional().default(false),
})

export type ArtifactInput = z.infer<typeof artifactSchema>
