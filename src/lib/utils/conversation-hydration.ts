import type { ChatMessage } from '../../components/chat/MessageList'
import type { ArtifactDescriptor } from '../artifacts/contracts'
import { artifactKindForSkill } from '../chat/skills'

type PersistedMessage = {
  id: string
  role: string
  content: string
  attachments?: Array<{
    id: string
    fileName: string
    fileSize: number
    mimeType: string
    processingStatus?: string
  }>
  generationRuns: Array<{
    id: string
    modelId: string
    routerModelId: string
    skillId?: string | null
    status: string
    content?: string | null
    reasoningContent?: string | null
    comparisonRunId?: string | null
    messageId?: string
    promptTokens?: number | null
    completionTokens?: number | null
    totalTokens?: number | null
    latencyMs?: number | null
    timeToFirstTokenMs?: number | null
    error?: unknown
    artifact?: ArtifactDescriptor
    webSources?: Array<{
      url: string
      title: string | null
      snippet: string | null
      position: number
      score?: number | null
    }>
  }>
}

export function hydrateMessages(messages: PersistedMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  let i = 0

  while (i < messages.length) {
    const message = messages[i]

    if (message.role !== 'assistant') {
      const run = message.generationRuns[0]
      result.push({
        id: message.id,
        role: message.role as ChatMessage['role'],
        content: message.content,
        ...(run
          ? {
              modelId: run.modelId,
              routerModelId: run.routerModelId,
              webSources: run.webSources ?? undefined,
            }
          : {}),
      })
      i++
      continue
    }

    const run = message.generationRuns[0]
    const compRunId = run?.comparisonRunId
    const markdownAttachment = message.attachments?.find(
      (a) => a.mimeType === 'text/markdown' || a.fileName.endsWith('.md'),
    )
    const artifactKind = artifactKindForSkill(run?.skillId ?? 'none')
    const hasAttachmentArtifact =
      Boolean(markdownAttachment) && artifactKind !== null
    const safeArtifact = run?.status === 'completed' ? run?.artifact : undefined
    const hasSafeArtifact = Boolean(safeArtifact)
    const hasArtifact = hasSafeArtifact || hasAttachmentArtifact

    if (!compRunId) {
      const rawContent = hasSafeArtifact
        ? (message.content ?? '')
        : (message.content ?? run?.content ?? '')
      const hasContent = Boolean(rawContent && rawContent.trim().length > 0)
      const isFailed =
        run?.status === 'failed' ||
        (!hasContent && !hasArtifact && run?.status === 'completed')

      result.push({
        id: message.id,
        role: 'assistant',
        content: isFailed && !hasContent ? '' : rawContent,
        ...(run
          ? {
              modelId: run.modelId,
              routerModelId: run.routerModelId,
              webSources: run.webSources ?? undefined,
            }
          : {}),
        ...(run?.id ? { generationRunId: run.id } : {}),
        ...(isFailed && !hasArtifact
          ? {
              errorCode:
                typeof run?.error === 'object' &&
                run?.error &&
                'code' in run.error
                  ? String((run.error as { code: unknown }).code)
                  : 'ERR-001',
              errorMessage:
                typeof run?.error === 'object' &&
                run?.error &&
                'message' in run.error
                  ? String((run.error as { message: unknown }).message)
                  : 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
            }
          : {}),
        ...(hasSafeArtifact && safeArtifact
          ? {
              artifactStatus: 'completed' as const,
              artifactKind: safeArtifact.kind,
              artifact: safeArtifact,
            }
          : hasAttachmentArtifact && markdownAttachment && artifactKind
            ? {
                artifactStatus: 'completed' as const,
                artifactKind,
                artifact: {
                  kind: artifactKind,
                  attachmentId: markdownAttachment.id,
                  fileName: markdownAttachment.fileName,
                  fileSize: markdownAttachment.fileSize,
                  mimeType: markdownAttachment.mimeType,
                },
              }
            : {}),
      })
      i++
      continue
    }

    const compareGenerations: NonNullable<ChatMessage['compareGenerations']> =
      []
    const groupId = message.id
    while (i < messages.length) {
      const m = messages[i]
      const r = m.generationRuns[0]
      if (m.role !== 'assistant' || r?.comparisonRunId !== compRunId) break

      const runArtifact = r.status === 'completed' ? r.artifact : undefined
      const hasRunArtifact = Boolean(runArtifact)
      const rawContent = hasRunArtifact
        ? (m.content ?? '')
        : (r.content ?? m.content ?? '')
      const hasContent = Boolean(rawContent && rawContent.trim().length > 0)
      const isFailed =
        r.status === 'failed' ||
        (!hasContent && !hasRunArtifact && r.status === 'completed')
      const finalStatus = isFailed ? 'failed' : r.status
      const finalError =
        isFailed && !r.error
          ? {
              message: 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
              code: 'ERR-001',
            }
          : r.error

      compareGenerations.push({
        id: r.id,
        modelId: r.modelId,
        status: finalStatus,
        content: isFailed && !hasContent ? '' : rawContent,
        reasoningContent: r.reasoningContent,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.totalTokens,
        latencyMs: r.latencyMs,
        timeToFirstTokenMs: r.timeToFirstTokenMs,
        comparisonRunId: r.comparisonRunId,
        messageId: m.id,
        error: finalError,
        webSources: r.webSources,
        ...(hasRunArtifact && runArtifact ? { artifact: runArtifact } : {}),
      })
      i++
    }

    result.push({
      id: groupId,
      role: 'assistant',
      content: '',
      compareGenerations,
    })
  }

  return result
}
