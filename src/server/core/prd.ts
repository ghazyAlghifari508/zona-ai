import type { z } from 'zod'
import type { chatSchema } from '../../lib/utils/validation'
import { generateArtifactCore } from './artifacts'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/prd.ts is server-only')
}

export async function generatePrdArtifactCore({
  data,
  request,
}: {
  data: z.infer<typeof chatSchema>
  request: Request
}): Promise<Response> {
  return generateArtifactCore({
    data: {
      conversationId: data.conversationId,
      modelId: data.modelId,
      skillId: 'prd-plan',
      content: data.content,
      attachmentIds: data.attachmentIds,
      enableWebSearch: data.enableWebSearch,
    },
    request,
  })
}
