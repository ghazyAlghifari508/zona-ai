import { z } from 'zod'
import {
  artifactMentionInputSchema,
  artifactMentionsSchema,
  assertUniqueMentionArtifacts,
} from '../artifacts/mentions'
import { SKILL_IDS } from '../chat/skills'
import {
  COMPARE_MAX_MODELS,
  COMPARE_MIN_MODELS,
  CONVERSATION_TITLE_MAX_LENGTH,
  CONVERSATIONS_MAX_PAGE_SIZE,
  CONVERSATIONS_PAGE_SIZE,
  MAX_ARTIFACT_MENTIONS,
} from './constants'

export const skillIdSchema = z.enum(SKILL_IDS)

// Literal tuple mirrors ARTIFACT_SKILL_IDS; the registry test pins the
// two lists together so they cannot drift silently.
export const artifactSkillIdSchema = z.enum([
  'prd-plan',
  'agent-skill',
  'checklist',
])

export const chatSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    modelId: z.string().min(1),
    skillId: skillIdSchema.default('none'),
    content: z.string().min(1).max(20000),
    attachmentIds: z.array(z.string().uuid()).optional(),
    enableWebSearch: z.boolean().optional().default(false),
    artifactMentions: artifactMentionsSchema.optional(),
  })
  .refine((d) => !d.artifactMentions?.length || Boolean(d.conversationId), {
    message: 'Mentions require an existing conversation',
    path: ['artifactMentions'],
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
    artifactMentions: artifactMentionsSchema.optional(),
  })
  .refine((d) => !d.modelIds.includes('auto'), {
    message: 'Auto tidak tersedia di Compare',
    path: ['modelIds'],
  })
  .refine((d) => new Set(d.modelIds).size === d.modelIds.length, {
    message: 'Model tidak boleh duplikat',
    path: ['modelIds'],
  })
  .refine((d) => !d.artifactMentions?.length || Boolean(d.conversationId), {
    message: 'Mentions require an existing conversation',
    path: ['artifactMentions'],
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

export const artifactOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create'),
    skillId: artifactSkillIdSchema,
    context: z
      .array(artifactMentionInputSchema.extend({ mode: z.literal('context') }))
      .max(MAX_ARTIFACT_MENTIONS)
      .optional()
      .default([])
      .superRefine((mentions, ctx) => {
        assertUniqueMentionArtifacts(mentions, ctx)
      }),
  }),
  z
    .object({
      type: z.literal('revise'),
      targets: z
        .array(
          z.object({
            artifactId: z.string().uuid(),
            versionId: z.string().uuid(),
            mode: z.literal('revise').optional().default('revise'),
          }),
        )
        .min(1)
        .max(MAX_ARTIFACT_MENTIONS),
      context: z
        .array(
          artifactMentionInputSchema.extend({ mode: z.literal('context') }),
        )
        .max(MAX_ARTIFACT_MENTIONS)
        .optional()
        .default([]),
    })
    .superRefine((data, ctx) => {
      const targetIds = new Set<string>()
      for (const t of data.targets) {
        if (targetIds.has(t.artifactId)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Duplicate artifact ID in targets',
          })
          break
        }
        targetIds.add(t.artifactId)
      }
      const seenContext = new Set<string>()
      for (const c of data.context) {
        if (targetIds.has(c.artifactId)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Duplicate artifact ID in targets and context',
          })
          break
        }
        if (seenContext.has(c.artifactId)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Duplicate artifact ID in context',
          })
          break
        }
        seenContext.add(c.artifactId)
      }
      if (data.targets.length + data.context.length > MAX_ARTIFACT_MENTIONS) {
        ctx.addIssue({
          code: 'custom',
          message: 'Combined targets and context exceed max mentions',
        })
      }
    }),
])

export type ArtifactOperation = z.infer<typeof artifactOperationSchema>

export const compareArtifactSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    modelIds: z
      .array(z.string().min(1))
      .min(COMPARE_MIN_MODELS)
      .max(COMPARE_MAX_MODELS),
    content: z.string().min(1).max(20000),
    operation: artifactOperationSchema,
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

export type CompareArtifactInput = z.infer<typeof compareArtifactSchema>
