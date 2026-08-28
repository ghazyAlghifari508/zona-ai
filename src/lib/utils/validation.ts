import { z } from 'zod'

export const chatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  modelId: z.string().min(1),
  skillId: z
    .enum(['none', 'checklist', 'prd-plan', 'agent-skill'])
    .default('none'),
  content: z.string().min(1).max(20000),
  attachmentIds: z.array(z.string().uuid()).optional(),
  enableWebSearch: z.boolean().optional(),
})

export type ChatInput = z.infer<typeof chatSchema>
