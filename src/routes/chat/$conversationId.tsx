import { ZapIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { ArtifactCanvas } from '@/components/artifacts/ArtifactCanvas'
import { ConversationArtifactLayout } from '@/components/artifacts/ConversationArtifactLayout'
import { Composer } from '@/components/chat/Composer'
import { InsufficientCreditsDialog } from '@/components/chat/InsufficientCreditsDialog'
import { type ChatMessage, MessageList } from '@/components/chat/MessageList'
import { GlobalNav } from '@/components/layout/GlobalNav'
import { WorkspaceShell } from '@/components/layout/WorkspaceShell'
import {
  type ArtifactStreamEvent,
  createArtifactSseParser,
} from '@/lib/ai/artifact-stream'
import { parseStreamEvent } from '@/lib/ai/multiplex'
import {
  consumeArtifactEventResponse,
  stopConfirmedCompareGenerations,
  updateArtifactGenerationFromEvent,
} from '@/lib/artifacts/compare-stream'
import type {
  ArtifactDescriptor,
  ArtifactDetail,
  ArtifactSummary,
} from '@/lib/artifacts/contracts'
import { artifactDescriptorSchema } from '@/lib/artifacts/contracts'
import {
  type ArtifactMentionDraft,
  type ArtifactMentionInput,
  addOrFocusArtifactMention,
  resolveArtifactDispatch,
} from '@/lib/artifacts/mentions'
import {
  closeArtifactPanel,
  closeArtifactTab,
  createInitialArtifactWorkspace,
  openArtifact,
  rememberArtifactScroll,
  selectArtifactVersion,
} from '@/lib/artifacts/workspace-state'
import {
  COMPARE_GUTTER_CLASS,
  COMPARE_MAX_WIDTH_CLASS,
} from '@/lib/chat/compare-card-width'
import { isCompareSelectionValid } from '@/lib/chat/compare-selection'
import { resolveConversationModelId } from '@/lib/chat/conversation-model'
import {
  type PendingMessage,
  takePendingMessageForConversation,
} from '@/lib/chat/guest-draft'
import { getDefaultSkillPreference } from '@/lib/chat/skill-preference'
import { artifactKindForSkill, buildArtifactAck } from '@/lib/chat/skills'
import { getDefaultModelPreference } from '@/lib/models/preference'
import { hydrateMessages } from '@/lib/utils/conversation-hydration'
import {
  getArtifact,
  listConversationArtifacts,
} from '@/server/functions/artifacts'
import {
  generateArtifact,
  generateArtifacts,
  generateCompareArtifacts,
  retryGeneration,
  sendCompareMessage,
  sendMessage,
  stopGeneration,
} from '@/server/functions/chat'
import {
  getConversation,
  setConversationMode,
  setConversationModel,
} from '@/server/functions/conversations'
import {
  getCreditBalanceFn,
  resetDevCreditsFn,
} from '@/server/functions/credits'
import { getMessages } from '@/server/functions/messages'
import { getCurrentSession } from '@/server/functions/session'

export const Route = createFileRoute('/chat/$conversationId')({
  staleTime: 30_000,
  beforeLoad: async () => {
    try {
      const session = await getCurrentSession()
      return { session }
    } catch {
      throw redirect({ to: '/auth/sign-in' })
    }
  },
  loader: async ({
    params,
    context,
  }: {
    params: { conversationId: string }
    context?: { session?: Awaited<ReturnType<typeof getCurrentSession>> }
  }) => {
    const [conversation, persistedMessages, credit, session] =
      await Promise.all([
        getConversation({ data: { id: params.conversationId } }),
        getMessages({ data: { conversationId: params.conversationId } }),
        getCreditBalanceFn(),
        context?.session
          ? Promise.resolve(context.session)
          : getCurrentSession(),
      ])
    return {
      conversation,
      persistedMessages,
      creditBalance: credit.balance,
      user: session.user,
    }
  },
  errorComponent: ConversationError,
  component: ConversationRoute,
})

function ConversationRoute() {
  const { conversationId } = Route.useParams()

  return <ChatThread key={conversationId} />
}

function ConversationError() {
  return (
    <WorkspaceShell>
      <div className="flex min-h-[60vh] items-center justify-center text-center">
        <div>
          <h1 className="text-[30px] font-medium text-ink">
            Percakapan tidak ditemukan
          </h1>
          <p className="mt-2 text-[15px] text-stone">
            Percakapan ini tidak tersedia atau tidak dapat diakses.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-md border border-hairline-strong bg-pure-white px-4 py-2 text-[14px] font-medium text-ink hover:bg-ink/5"
          >
            Kembali ke chat
          </Link>
        </div>
      </div>
    </WorkspaceShell>
  )
}

function ChatThread() {
  const { conversationId } = Route.useParams()
  const { conversation, persistedMessages, creditBalance, user } =
    Route.useLoaderData()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [artifactWorkspace, setArtifactWorkspace] = useState(() =>
    createInitialArtifactWorkspace(),
  )
  const artifactSummariesQuery = useQuery({
    queryKey: ['conversation-artifacts', conversationId],
    queryFn: () => listConversationArtifacts({ data: { conversationId } }),
    staleTime: 30_000,
  })
  const artifactDetailQueries = useQueries({
    queries: artifactWorkspace.openArtifactIds.map((artifactId) => ({
      queryKey: ['artifact', artifactId],
      queryFn: () => getArtifact({ data: { artifactId } }),
      staleTime: 30_000,
    })),
  })
  const artifactDetailsById: Record<string, ArtifactDetail> = {}
  for (
    let index = 0;
    index < artifactWorkspace.openArtifactIds.length;
    index++
  ) {
    const artifactId = artifactWorkspace.openArtifactIds[index]
    const detail = artifactDetailQueries[index]?.data
    if (detail) artifactDetailsById[artifactId] = detail
  }
  const artifactSummaries = artifactSummariesQuery.data ?? []
  const refreshConversationList = () => {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }
  const refreshCredits = async () => {
    const res = await getCreditBalanceFn()
    setCredits(res.balance)
  }
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const typed = persistedMessages as Parameters<typeof hydrateMessages>[0]
    return hydrateMessages(typed)
  })
  const [isStreaming, setIsStreaming] = useState(false)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [webSearchToast, setWebSearchToast] = useState(false)
  const [credits, setCredits] = useState(creditBalance)
  const [resettingCredits, setResettingCredits] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [composerMentions, setComposerMentions] = useState<
    ArtifactMentionDraft[]
  >([])

  const handleOpenArtifact = (
    artifact: ArtifactDescriptor | { artifactId: string; versionId: string },
  ) => {
    setArtifactWorkspace((current) =>
      openArtifact(current, {
        artifactId: artifact.artifactId,
        versionId: artifact.versionId,
      }),
    )
  }

  const handleOpenArtifacts = (artifacts: ArtifactDescriptor[]) => {
    setArtifactWorkspace((current) =>
      artifacts.reduce(
        (workspace, artifact) =>
          openArtifact(workspace, {
            artifactId: artifact.artifactId,
            versionId: artifact.versionId,
          }),
        current,
      ),
    )
  }

  const handleAddMentionFromCanvas = (input: {
    artifactId: string
    versionId: string
    mode: 'context' | 'revise'
  }) => {
    const summary = artifactSummaries.find(
      (s) => s.artifactId === input.artifactId,
    )
    if (!summary) return
    const candidate = {
      artifact: summary,
      kindLabel:
        summary.kind === 'prd'
          ? 'PRD'
          : summary.kind === 'agent-skill'
            ? 'Agent Skill'
            : 'Checklist',
      modelDisplayName: summary.modelId,
    }
    const nextState = addOrFocusArtifactMention(
      {
        mentions: composerMentions,
        activeQuery: null,
        selectedIndex: 0,
        feedback: null,
      },
      candidate,
      input.mode,
    )
    setComposerMentions(nextState.mentions)
  }

  const mergeCreatedArtifact = (
    event: Extract<ArtifactStreamEvent, { type: 'artifact-created' }>,
  ) => {
    const descriptor = artifactDescriptorSchema.parse({
      artifactId: event.artifactId,
      versionId: event.versionId,
      attachmentId: event.artifact.attachmentId,
      generationId: event.generationId,
      kind: event.kind,
      title: event.title,
      fileName: event.artifact.fileName,
      fileSize: event.artifact.fileSize,
      mimeType: event.artifact.mimeType,
      version: event.version,
      modelId: event.modelId,
      routerModelId: event.routerModelId,
    })
    queryClient.setQueryData<ArtifactSummary[]>(
      ['conversation-artifacts', conversationId],
      (current = []) => {
        const previous = current.find(
          (summary) => summary.artifactId === descriptor.artifactId,
        )
        const summary: ArtifactSummary = {
          artifactId: descriptor.artifactId,
          kind: descriptor.kind,
          title: descriptor.title,
          attachmentId: descriptor.attachmentId,
          fileName: descriptor.fileName,
          fileSize: descriptor.fileSize,
          mimeType: descriptor.mimeType,
          modelId: descriptor.modelId,
          routerModelId: descriptor.routerModelId,
          currentVersionId: descriptor.versionId,
          currentVersion: descriptor.version,
          versionCount: Math.max(
            previous?.versionCount ?? 0,
            descriptor.version,
          ),
          updatedAt: new Date(),
        }
        return previous
          ? current.map((item) =>
              item.artifactId === descriptor.artifactId ? summary : item,
            )
          : [summary, ...current]
      },
    )
    void queryClient.invalidateQueries({
      queryKey: ['artifact', descriptor.artifactId],
    })
    handleOpenArtifact(descriptor)
    return descriptor
  }

  const applyCompareArtifactEvent = (
    event: ArtifactStreamEvent,
    updateGeneration: (
      event: Pick<ArtifactStreamEvent, 'generationId' | 'modelId'>,
      update: (
        generation: NonNullable<ChatMessage['compareGenerations']>[number],
      ) => NonNullable<ChatMessage['compareGenerations']>[number],
    ) => void,
  ) => {
    if (event.type === 'artifact-status') {
      updateGeneration(event, (generation) =>
        event.phase === 'failed' || event.phase === 'cancelled'
          ? {
              ...generation,
              status: event.phase,
              error:
                event.phase === 'failed'
                  ? { message: event.message, code: 'ERR-016' }
                  : undefined,
            }
          : generation,
      )
    } else if (event.type === 'artifact-created') {
      const descriptor = mergeCreatedArtifact(event)
      updateGeneration(event, (generation) => ({
        ...generation,
        content: event.summary,
        artifact: descriptor,
      }))
    } else if (event.type === 'artifact-error') {
      updateGeneration(event, (generation) => ({
        ...generation,
        status: 'failed',
        error: { message: event.message ?? event.code, code: event.code },
      }))
    } else if (event.type === 'artifact-done') {
      updateGeneration(event, (generation) => ({
        ...generation,
        status: event.status,
        error:
          event.status === 'failed' && !generation.error
            ? { message: 'Artifact generation failed.', code: 'ERR-016' }
            : generation.error,
      }))
    }
  }

  const handleResetCredits = async () => {
    if (resettingCredits) return
    setResettingCredits(true)
    try {
      const res = await resetDevCreditsFn()
      if (res && typeof res.newBalance === 'number') {
        setCredits(res.newBalance)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setResettingCredits(false)
    }
  }

  const hasUsedCompareInitially =
    conversation.mode === 'compare' ||
    messages.some((m) =>
      Boolean(m.compareGenerations && m.compareGenerations.length > 0),
    ) ||
    (
      persistedMessages as Array<{
        generationRuns?: Array<{ comparisonRunId?: string | null }>
      }>
    ).some((m) => m.generationRuns?.some((r) => r.comparisonRunId != null))

  const [mode, setMode] = useState<'normal' | 'compare'>(() =>
    hasUsedCompareInitially ? 'compare' : 'normal',
  )
  const [compareModelIds, setCompareModelIds] = useState<string[]>([])
  const [modelId, setModelId] = useState<string>(() =>
    resolveConversationModelId({
      conversationModelId: conversation.modelId,
      persistedMessages,
      defaultModelId: getDefaultModelPreference(),
    }),
  )
  const handleModelChange = (id: string) => {
    setModelId(id)
    void setConversationModel({
      data: { id: conversationId, modelId: id },
    }).catch(() => {})
  }
  const [skillId, setSkillId] = useState<string>(() =>
    getDefaultSkillPreference(),
  )

  const compareEnabled = mode === 'compare'
  const setCompareEnabled = (enabled: boolean) => {
    const nextMode = enabled ? 'compare' : 'normal'
    setMode(nextMode)
    void setConversationMode({
      data: { id: conversationId, mode: nextMode },
    }).catch(() => {})
  }

  const hasUsedCompareMode =
    mode === 'compare' ||
    conversation.mode === 'compare' ||
    messages.some((m) =>
      Boolean(m.compareGenerations && m.compareGenerations.length > 0),
    ) ||
    hasUsedCompareInitially

  const handleSendArtifact = async (
    content: string,
    modelId: string,
    skillId: string,
    attachmentIds?: string[],
    enableWebSearch?: boolean,
  ) => {
    const kind = artifactKindForSkill(skillId) ?? 'prd'
    const ack = buildArtifactAck(kind, content)
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }
    const assistantId = crypto.randomUUID()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      modelId,
      streaming: true,
      artifactStatus: 'preparing',
      artifactKind: kind,
      artifactAck: ack,
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    try {
      const response = (await generateArtifact({
        data: {
          conversationId,
          modelId,
          skillId,
          content,
          attachmentIds,
          enableWebSearch: enableWebSearch ?? false,
        },
      })) as Response

      const genId = response.headers.get('X-Generation-Id')
      const routerModelId = response.headers.get('X-Router-Model-Id')
      const routingReason = response.headers.get('X-Routing-Reason')
      if (genId) {
        setGenerationId(genId)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, generationRunId: genId } : m,
          ),
        )
      }

      refreshConversationList()
      setTimeout(refreshConversationList, 3000)

      if (routerModelId && modelId === 'auto') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  routerModelId,
                  routingReason: routingReason ?? undefined,
                }
              : m,
          ),
        )
      }

      const reader = response.body?.getReader()
      if (!reader) {
        setIsStreaming(false)
        setGenerationId(null)
        void refreshCredits()
        return
      }

      const decoder = new TextDecoder()
      const parser = createArtifactSseParser({
        onEvent: (event) => {
          if (event.type === 'artifact-status') {
            if (event.phase === 'failed') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        artifactStatus: 'failed',
                        errorMessage: event.message,
                        streaming: false,
                      }
                    : m,
                ),
              )
            } else if (event.phase === 'cancelled') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        artifactStatus: 'cancelled' as const,
                        streaming: false,
                      }
                    : m,
                ),
              )
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        artifactStatus: event.phase,
                        ...(event.phase === 'generating' && event.section
                          ? { artifactSection: event.section }
                          : {}),
                      }
                    : m,
                ),
              )
            }
          } else if (event.type === 'artifact-created') {
            const descriptor = mergeCreatedArtifact(event)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      artifactKind: event.kind,
                      artifact: descriptor,
                      content: event.summary,
                    }
                  : m,
              ),
            )
          } else if (event.type === 'artifact-error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      artifactStatus: 'failed',
                      errorMessage: event.message ?? event.code,
                      streaming: false,
                    }
                  : m,
              ),
            )
          } else if (event.type === 'artifact-done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      artifactStatus:
                        event.status === 'failed' ? 'failed' : event.status,
                      streaming: false,
                    }
                  : m,
              ),
            )
          }
        },
        onError: () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, artifactStatus: 'failed' as const, streaming: false }
                : m,
            ),
          )
        },
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
      parser.flush()

      const persisted = await getMessages({ data: { conversationId } })
      setMessages(
        hydrateMessages(persisted as Parameters<typeof hydrateMessages>[0]),
      )
      refreshConversationList()
      void refreshCredits()
    } catch (e) {
      const err = e as Error & { status?: number; code?: string }
      if (err.status === 402 || err.code === 'ERR-019') {
        setUpgradeOpen(true)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    'Kredit tidak mencukupi. Silakan top up paket untuk lanjut.',
                  streaming: false,
                  artifactStatus: undefined,
                }
              : m,
          ),
        )
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  artifactStatus: 'failed',
                  errorMessage:
                    err.message ||
                    (kind === 'agent-skill'
                      ? 'Pembuatan skill gagal.'
                      : 'Pembuatan PRD gagal.'),
                  streaming: false,
                }
              : m,
          ),
        )
      }
    } finally {
      setIsStreaming(false)
      setGenerationId(null)
    }
  }

  const handleSendArtifactRevise = async (
    content: string,
    modelId: string,
    targets: ArtifactMentionInput[],
    contextMentions: ArtifactMentionInput[],
    attachmentIds?: string[],
    enableWebSearch?: boolean,
  ) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      artifactMentions: composerMentions.map((m, idx) => ({
        artifactId: m.artifactId,
        versionId: m.versionId,
        mode: m.mode,
        position: idx,
        title: m.title,
        kind: m.kind,
        version: m.version,
      })),
    }
    const assistantIds = targets.map(() => crypto.randomUUID())
    const assistantMsgs: ChatMessage[] = targets.map((target, idx) => {
      const summary = artifactSummaries.find(
        (s) => s.artifactId === target.artifactId,
      )
      const kind = summary?.kind ?? 'prd'
      return {
        id: assistantIds[idx],
        role: 'assistant',
        content: '',
        modelId,
        streaming: true,
        artifactStatus: 'preparing',
        artifactKind: kind,
        artifactAck: buildArtifactAck(kind, content),
      }
    })
    setMessages((prev) => [...prev, userMsg, ...assistantMsgs])
    setIsStreaming(true)

    try {
      const response = (await generateArtifacts({
        data: {
          conversationId,
          modelId,
          content,
          operation: {
            type: 'revise',
            targets,
            context: contextMentions,
          },
          attachmentIds,
          enableWebSearch: enableWebSearch ?? false,
        },
      })) as Response

      const genId = response.headers.get('X-Generation-Id')
      if (genId) setGenerationId(genId)

      refreshConversationList()
      setTimeout(refreshConversationList, 3000)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Response stream not readable')

      const decoder = new TextDecoder()
      const parser = createArtifactSseParser({
        onEvent: (event) => {
          if (event.type === 'artifact-created') {
            const descriptor = mergeCreatedArtifact(event)
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.role !== 'assistant') return msg
                if (msg.artifactKind === event.kind) {
                  return {
                    ...msg,
                    artifact: descriptor,
                    artifactStatus: 'completed' as const,
                    content: event.summary,
                    streaming: false,
                  }
                }
                return msg
              }),
            )
          } else if (event.type === 'artifact-status') {
            setMessages((prev) =>
              prev.map((msg) => {
                if (
                  msg.role === 'assistant' &&
                  event.generationId === msg.generationRunId
                ) {
                  return {
                    ...msg,
                    artifactStatus: event.phase,
                    artifactSection: event.section,
                  }
                }
                return msg
              }),
            )
          } else if (event.type === 'artifact-error') {
            setMessages((prev) =>
              prev.map((msg) => {
                if (
                  msg.role === 'assistant' &&
                  event.generationId === msg.generationRunId
                ) {
                  return {
                    ...msg,
                    artifactStatus: 'failed' as const,
                    errorMessage: event.message ?? 'Revisi artifact gagal.',
                    streaming: false,
                  }
                }
                return msg
              }),
            )
          }
        },
        onError: () => {},
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
      parser.flush()

      const persisted = await getMessages({ data: { conversationId } })
      setMessages(
        hydrateMessages(persisted as Parameters<typeof hydrateMessages>[0]),
      )
      refreshConversationList()
      void refreshCredits()
    } catch (e) {
      const err = e as Error & { status?: number; code?: string }
      if (err.status === 402 || err.code === 'ERR-019') {
        setUpgradeOpen(true)
      }
      setMessages((prev) =>
        prev.map((m) =>
          (assistantIds as readonly string[]).includes(m.id)
            ? {
                ...m,
                artifactStatus: 'failed',
                errorMessage: err.message || 'Revisi artifact gagal.',
                streaming: false,
              }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
      setGenerationId(null)
    }
  }

  const handleSendCompareArtifactRevise = async (
    content: string,
    modelIds: string[],
    targets: ArtifactMentionInput[],
    contextMentions: ArtifactMentionInput[],
    attachmentIds?: string[],
    enableWebSearch?: boolean,
  ) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      artifactMentions: composerMentions.map((m, idx) => ({
        artifactId: m.artifactId,
        versionId: m.versionId,
        mode: m.mode,
        position: idx,
        title: m.title,
        kind: m.kind,
        version: m.version,
      })),
    }
    const compareAssistantId = crypto.randomUUID()
    const initialGens = modelIds.map((mid) => ({
      id: crypto.randomUUID(),
      modelId: mid,
      status: 'streaming',
      content: '',
    }))
    const compareMsg: ChatMessage = {
      id: compareAssistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      compareGenerations: initialGens,
    }
    setMessages((prev) => [...prev, userMsg, compareMsg])
    setIsStreaming(true)

    try {
      const response = (await generateCompareArtifacts({
        data: {
          conversationId,
          modelIds,
          content,
          operation: {
            type: 'revise',
            targets,
            context: contextMentions,
          },
          attachmentIds,
          enableWebSearch: enableWebSearch ?? false,
        },
      })) as Response

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Response stream not readable')

      const createdArtifacts: ArtifactDescriptor[] = []
      const decoder = new TextDecoder()
      const parser = createArtifactSseParser({
        onEvent: (event) => {
          if (event.type === 'artifact-created') {
            const descriptor = mergeCreatedArtifact(event)
            createdArtifacts.push(descriptor)
          }
        },
        onError: () => {},
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
      parser.flush()

      if (createdArtifacts.length > 0) {
        handleOpenArtifacts(createdArtifacts)
      }
      const persisted = await getMessages({ data: { conversationId } })
      setMessages(
        hydrateMessages(persisted as Parameters<typeof hydrateMessages>[0]),
      )
      refreshConversationList()
      void refreshCredits()
    } catch (e) {
      const err = e as Error & { status?: number; code?: string }
      if (err.status === 402 || err.code === 'ERR-019') {
        setUpgradeOpen(true)
      }
    } finally {
      setIsStreaming(false)
      setGenerationId(null)
    }
  }

  const handleSend = async (
    content: string,
    modelId: string,
    skillId: string,
    attachmentIds?: string[],
    enableWebSearch?: boolean,
    artifactMentions: ArtifactMentionInput[] = [],
  ) => {
    const dispatch = resolveArtifactDispatch({
      skillId: skillId as Parameters<
        typeof resolveArtifactDispatch
      >[0]['skillId'],
      mentions: artifactMentions,
      content,
    })

    if (dispatch.type === 'artifact-revise') {
      return handleSendArtifactRevise(
        content,
        modelId,
        dispatch.targets,
        dispatch.context,
        attachmentIds,
        enableWebSearch,
      )
    }

    if (dispatch.type === 'artifact-create') {
      return handleSendArtifact(
        content,
        modelId,
        dispatch.skillId,
        attachmentIds,
        enableWebSearch,
      )
    }
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      artifactMentions: composerMentions.map((m, idx) => ({
        artifactId: m.artifactId,
        versionId: m.versionId,
        mode: m.mode,
        position: idx,
        title: m.title,
        kind: m.kind,
        version: m.version,
      })),
    }
    const assistantId = crypto.randomUUID()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      modelId,
      streaming: true,
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)
    try {
      const response = (await sendMessage({
        data: {
          conversationId,
          modelId,
          skillId,
          content,
          attachmentIds,
          enableWebSearch: enableWebSearch ?? false,
          artifactMentions,
        },
      })) as Response
      const genId = response.headers.get('X-Generation-Id')
      const routerModelId = response.headers.get('X-Router-Model-Id')
      const routingReason = response.headers.get('X-Routing-Reason')
      const webSearchStatus = response.headers.get('X-Web-Search-Status')
      refreshConversationList()
      setTimeout(refreshConversationList, 3000)
      if (webSearchStatus === 'unavailable') {
        setWebSearchToast(true)
        setTimeout(() => setWebSearchToast(false), 3000)
      }
      if (genId) setGenerationId(genId)
      if (routerModelId && modelId === 'auto') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  routerModelId,
                  routingReason: routingReason ?? undefined,
                }
              : m,
          ),
        )
      }
      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: text, streaming: false }
              : m,
          ),
        )
        setIsStreaming(false)
        setGenerationId(null)
        void refreshCredits()
        return
      }
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        let delta = chunk
        if (chunk.includes('data:')) {
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'text-delta' && parsed.delta)
                  delta = parsed.delta
                else if (parsed.textDelta) delta = parsed.textDelta
                else if (typeof parsed === 'string') delta = parsed
                else continue
              } catch {
                delta = data
              }
              fullText += delta
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m,
                ),
              )
            }
          }
        } else {
          fullText += delta
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullText } : m,
            ),
          )
        }
      }
      const hasFinalText = Boolean(fullText && fullText.trim().length > 0)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? hasFinalText
              ? { ...m, content: fullText, streaming: false }
              : {
                  ...m,
                  content: '',
                  streaming: false,
                  errorCode: 'ERR-001',
                  errorMessage:
                    'Model tidak menghasilkan jawaban akhir. Coba lagi.',
                  onRetry: () =>
                    void handleSend(
                      content,
                      modelId,
                      skillId,
                      attachmentIds,
                      enableWebSearch,
                    ),
                }
            : m,
        ),
      )
      const persisted = await getMessages({ data: { conversationId } })
      setMessages(
        hydrateMessages(persisted as Parameters<typeof hydrateMessages>[0]),
      )
      refreshConversationList()
      void refreshCredits()
    } catch (e) {
      const err = e as Error & { status?: number; code?: string }
      if (err.status === 402 || err.code === 'ERR-019') {
        setUpgradeOpen(true)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    'Kredit tidak mencukupi. Silakan top up paket untuk lanjut.',
                  streaming: false,
                }
              : m,
          ),
        )
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${err.message}`, streaming: false }
              : m,
          ),
        )
      }
    } finally {
      setIsStreaming(false)
      setGenerationId(null)
    }
  }

  const handleSendCompareArtifact = async (
    content: string,
    modelIds: string[],
    skillId: string,
    attachmentIds?: string[],
    enableWebSearch?: boolean,
  ) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }
    const compareAssistantId = crypto.randomUUID()
    const compareMsg: ChatMessage = {
      id: compareAssistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      compareGenerations: modelIds.map((selectedModelId) => ({
        id: crypto.randomUUID(),
        modelId: selectedModelId,
        status: 'streaming',
        content: '',
      })),
    }
    setMessages((current) => [...current, userMsg, compareMsg])
    setIsStreaming(true)

    const updateGeneration = (
      event: Pick<ArtifactStreamEvent, 'generationId' | 'modelId'>,
      update: (
        generation: NonNullable<ChatMessage['compareGenerations']>[number],
      ) => NonNullable<ChatMessage['compareGenerations']>[number],
    ) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === compareAssistantId && message.compareGenerations
            ? {
                ...message,
                compareGenerations: updateArtifactGenerationFromEvent(
                  message.compareGenerations,
                  event,
                  update,
                ),
              }
            : message,
        ),
      )
    }

    try {
      const response = await generateCompareArtifacts({
        data: {
          conversationId,
          modelIds,
          content,
          operation: { type: 'create', skillId },
          attachmentIds,
          enableWebSearch: enableWebSearch ?? false,
        },
      })
      refreshConversationList()
      setTimeout(refreshConversationList, 3000)

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Artifact comparison stream is unavailable.')
      }
      const decoder = new TextDecoder()
      const parser = createArtifactSseParser({
        onEvent: (event) => applyCompareArtifactEvent(event, updateGeneration),
        onError: () => {},
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
      parser.flush()
      setMessages((current) =>
        current.map((message) =>
          message.id === compareAssistantId
            ? { ...message, streaming: false }
            : message,
        ),
      )
      const persisted = await getMessages({ data: { conversationId } })
      setMessages(
        hydrateMessages(persisted as Parameters<typeof hydrateMessages>[0]),
      )
      void queryClient.invalidateQueries({
        queryKey: ['conversation-artifacts', conversationId],
      })
      refreshConversationList()
      void refreshCredits()
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'Unknown error'
      setMessages((current) =>
        current.map((message) =>
          message.id === compareAssistantId
            ? {
                ...message,
                streaming: false,
                compareGenerations: message.compareGenerations?.map(
                  (generation) =>
                    generation.status === 'streaming'
                      ? {
                          ...generation,
                          status: 'failed',
                          error: { message: failure, code: 'ERR-016' },
                        }
                      : generation,
                ),
              }
            : message,
        ),
      )
    } finally {
      setIsStreaming(false)
    }
  }

  const handleSendCompare = async (
    content: string,
    modelIds: string[],
    skillId: string,
    attachmentIds?: string[],
    enableWebSearch?: boolean,
    artifactMentions: ArtifactMentionInput[] = [],
  ) => {
    if (!isCompareSelectionValid(modelIds)) return
    setMode('compare')
    void setConversationMode({
      data: { id: conversationId, mode: 'compare' },
    }).catch(() => {})

    const dispatch = resolveArtifactDispatch({
      skillId: skillId as Parameters<
        typeof resolveArtifactDispatch
      >[0]['skillId'],
      mentions: artifactMentions,
      content,
    })

    if (dispatch.type === 'artifact-revise') {
      return handleSendCompareArtifactRevise(
        content,
        modelIds,
        dispatch.targets,
        dispatch.context,
        attachmentIds,
        enableWebSearch,
      )
    }

    if (dispatch.type === 'artifact-create') {
      return handleSendCompareArtifact(
        content,
        modelIds,
        dispatch.skillId,
        attachmentIds,
        enableWebSearch,
      )
    }
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      artifactMentions: composerMentions.map((m, idx) => ({
        artifactId: m.artifactId,
        versionId: m.versionId,
        mode: m.mode,
        position: idx,
        title: m.title,
        kind: m.kind,
        version: m.version,
      })),
    }
    const compareAssistantId = crypto.randomUUID()
    const initialGens = modelIds.map((mid) => ({
      id: crypto.randomUUID(),
      modelId: mid,
      status: 'streaming',
      content: '',
    }))
    const compareMsg: ChatMessage = {
      id: compareAssistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      compareGenerations: initialGens,
    }
    setMessages((prev) => [...prev, userMsg, compareMsg])
    setIsStreaming(true)

    const updateCompareGen = (
      updater: (
        gens: NonNullable<ChatMessage['compareGenerations']>,
      ) => NonNullable<ChatMessage['compareGenerations']>,
    ) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === compareAssistantId && m.compareGenerations
            ? { ...m, compareGenerations: updater(m.compareGenerations) }
            : m,
        ),
      )
    }

    try {
      const response = (await sendCompareMessage({
        data: {
          conversationId,
          modelIds,
          skillId,
          content,
          attachmentIds,
          enableWebSearch: enableWebSearch ?? false,
          artifactMentions,
        },
      })) as Response

      if (response.headers.get('X-Web-Search-Status') === 'unavailable') {
        setWebSearchToast(true)
        setTimeout(() => setWebSearchToast(false), 3000)
      }
      refreshConversationList()
      setTimeout(refreshConversationList, 3000)

      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        updateCompareGen((gens) =>
          gens.map((g) => ({ ...g, content: text, status: 'completed' })),
        )
        setMessages((prev) =>
          prev.map((m) =>
            m.id === compareAssistantId ? { ...m, streaming: false } : m,
          ),
        )
        setIsStreaming(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      const genIdToIndex = new Map<string, number>()
      const modelStats = new Map<
        string,
        {
          eventTypes: Set<string>
          hasReasoning: boolean
          hasText: boolean
          finishReason: string | null
        }
      >()
      for (const mid of modelIds) {
        modelStats.set(mid, {
          eventTypes: new Set<string>(),
          hasReasoning: false,
          hasText: false,
          finishReason: null,
        })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const lines = part.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const jsonStr = line.slice(5).trim()
            if (!jsonStr || jsonStr === '[DONE]') continue
            try {
              const raw = JSON.parse(jsonStr)
              const event = parseStreamEvent(raw)
              const s = modelStats.get(event.modelId)

              if (event.type === 'generation-start') {
                if (s) s.eventTypes.add('generation-start')
                const modelIdx = modelIds.indexOf(event.modelId)
                if (modelIdx !== -1) {
                  genIdToIndex.set(event.generationId, modelIdx)
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === modelIdx
                        ? {
                            ...g,
                            id: event.generationId,
                            serverGenerationId: event.generationId,
                          }
                        : g,
                    ),
                  )
                }
              } else if (event.type === 'reasoning-delta') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  if (s) {
                    s.hasReasoning = true
                    s.eventTypes.add('reasoning-delta')
                  }
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === idx
                        ? {
                            ...g,
                            reasoningContent:
                              (g.reasoningContent ?? '') + event.text,
                          }
                        : g,
                    ),
                  )
                }
              } else if (event.type === 'text-delta') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  if (s) {
                    s.hasText = true
                    s.eventTypes.add('text-delta')
                  }
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === idx
                        ? { ...g, content: (g.content ?? '') + event.text }
                        : g,
                    ),
                  )
                }
              } else if (event.type === 'generation-finish') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  if (s) {
                    s.finishReason = event.finishReason
                    s.eventTypes.add('generation-finish')
                  }
                  updateCompareGen((gens) =>
                    gens.map((g, i) => {
                      if (i !== idx) return g
                      const hasValidAnswer = Boolean(
                        g.content && g.content.trim().length > 0,
                      )
                      if (!hasValidAnswer) {
                        return {
                          ...g,
                          status: 'failed',
                          error: {
                            message:
                              'Model tidak menghasilkan jawaban akhir. Coba lagi.',
                            code: 'ERR-001',
                          },
                        }
                      }
                      return { ...g, status: 'completed' }
                    }),
                  )
                }
              } else if (event.type === 'generation-error') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  if (s) s.eventTypes.add('generation-error')
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === idx
                        ? {
                            ...g,
                            status: 'failed',
                            error: { message: event.error, code: event.code },
                          }
                        : g,
                    ),
                  )
                }
              } else if (event.type === 'usage') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  if (s) s.eventTypes.add('usage')
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === idx
                        ? {
                            ...g,
                            promptTokens: event.promptTokens,
                            completionTokens: event.completionTokens,
                            totalTokens: event.totalTokens,
                          }
                        : g,
                    ),
                  )
                }
              }
            } catch {}
          }
        }
      }

      // Guard: all compare generations must have valid final content or be marked failed
      updateCompareGen((gens) =>
        gens.map((g) => {
          if (g.status === 'failed') return g
          const hasValidAnswer = Boolean(
            g.content && g.content.trim().length > 0,
          )
          if (!hasValidAnswer) {
            return {
              ...g,
              status: 'failed',
              error: {
                message: 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
                code: 'ERR-001',
              },
            }
          }
          return { ...g, status: 'completed' }
        }),
      )

      setMessages((prev) =>
        prev.map((m) =>
          m.id === compareAssistantId
            ? {
                ...m,
                streaming: false,
                compareGenerations: m.compareGenerations?.map((g) => {
                  if (g.status === 'failed') return g
                  const hasValidAnswer = Boolean(
                    g.content && g.content.trim().length > 0,
                  )
                  return hasValidAnswer
                    ? { ...g, status: 'completed' }
                    : {
                        ...g,
                        status: 'failed',
                        error: {
                          message:
                            'Model tidak menghasilkan jawaban akhir. Coba lagi.',
                          code: 'ERR-001',
                        },
                      }
                }),
              }
            : m,
        ),
      )

      for (const [mId, s] of modelStats.entries()) {
        console.info(
          `[CLIENT_STREAM_METRICS] modelId=${mId} eventTypes=${Array.from(s.eventTypes).join(',')} receivedReasoning=${s.hasReasoning} receivedText=${s.hasText} finishReason=${s.finishReason ?? 'none'}`,
        )
      }

      const persisted = await getMessages({ data: { conversationId } })
      setMessages(
        hydrateMessages(persisted as Parameters<typeof hydrateMessages>[0]),
      )
      refreshConversationList()
      void refreshCredits()
    } catch (e) {
      console.error('[CLIENT handleSendCompare CAUGHT ERROR]:', e)
      const err = e as Error & { status?: number; code?: string }
      const errorContent =
        err.status === 402 || err.code === 'ERR-019'
          ? 'Kredit tidak mencukupi'
          : `Error: ${err.message}`
      if (err.status === 402 || err.code === 'ERR-019') {
        setUpgradeOpen(true)
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === compareAssistantId
            ? {
                ...m,
                streaming: false,
                compareGenerations: m.compareGenerations?.map((g) =>
                  g.status === 'streaming'
                    ? {
                        ...g,
                        status: 'failed',
                        content: errorContent,
                        error: {
                          message: errorContent,
                          code: err.code ?? 'ERR-001',
                        },
                      }
                    : g,
                ),
              }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
    }
  }

  const sendPendingMessage = useEffectEvent((pending: PendingMessage) => {
    setModelId(pending.modelId)
    setSkillId(pending.skillId)
    if (pending.modelIds && pending.modelIds.length >= 2) {
      setMode('compare')
      setCompareModelIds(pending.modelIds)
      void handleSendCompare(
        pending.content,
        pending.modelIds,
        pending.skillId,
        undefined,
        pending.enableWebSearch,
      )
      return
    }
    void handleSend(
      pending.content,
      pending.modelId,
      pending.skillId,
      undefined,
      pending.enableWebSearch,
    )
  })

  useEffect(() => {
    const pending = takePendingMessageForConversation(conversationId)
    if (pending) sendPendingMessage(pending)
  }, [conversationId])

  const handleStop = async () => {
    const streamingCompareMsg = messages.find(
      (m) =>
        m.streaming && m.compareGenerations && m.compareGenerations.length > 0,
    )
    if (streamingCompareMsg?.compareGenerations) {
      const stopResult = await stopConfirmedCompareGenerations(
        streamingCompareMsg.compareGenerations,
        (confirmedGenerationId) =>
          stopGeneration({
            data: { generationId: confirmedGenerationId },
          }),
      )
      const stopped = new Set(stopResult.stoppedGenerationIds)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingCompareMsg.id
            ? {
                ...m,
                streaming: stopResult.hasUnstoppedGeneration,
                compareGenerations: m.compareGenerations?.map((g) =>
                  g.serverGenerationId && stopped.has(g.serverGenerationId)
                    ? { ...g, status: 'cancelled' }
                    : g,
                ),
              }
            : m,
        ),
      )
      setIsStreaming(stopResult.hasUnstoppedGeneration)
      return
    }

    if (generationId) {
      try {
        await stopGeneration({ data: { generationId } })
      } catch {}
    }

    setIsStreaming(false)
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    )
  }

  const handleStopPerModel = async (genId: string) => {
    const generation = messages
      .flatMap((message) => message.compareGenerations ?? [])
      .find(
        (candidate) =>
          candidate.id === genId || candidate.serverGenerationId === genId,
      )
    if (!generation) return
    const stopResult = await stopConfirmedCompareGenerations(
      [generation],
      (confirmedGenerationId) =>
        stopGeneration({ data: { generationId: confirmedGenerationId } }),
    )
    if (stopResult.stoppedGenerationIds.length === 0) return
    const stoppedGenerationId = stopResult.stoppedGenerationIds[0]
    setMessages((prev) =>
      prev.map((m) =>
        m.compareGenerations
          ? {
              ...m,
              compareGenerations: m.compareGenerations.map((g) =>
                g.serverGenerationId === stoppedGenerationId
                  ? { ...g, status: 'cancelled' }
                  : g,
              ),
            }
          : m,
      ),
    )
  }

  const handleRetry = async (genId: string) => {
    const retryMessage = messages.find((message) =>
      message.compareGenerations?.some(
        (generation) =>
          generation.id === genId || generation.serverGenerationId === genId,
      ),
    )
    const targetGeneration = retryMessage?.compareGenerations?.find(
      (generation) =>
        generation.id === genId || generation.serverGenerationId === genId,
    )
    if (!retryMessage || !targetGeneration) return
    setIsStreaming(true)
    setMessages((prev) =>
      prev.map((m) =>
        m.id === retryMessage.id && m.compareGenerations
          ? {
              ...m,
              streaming: true,
              compareGenerations: m.compareGenerations.map((g) =>
                g.id === targetGeneration.id
                  ? {
                      ...g,
                      status: 'streaming',
                      content: '',
                      error: undefined,
                      artifact: undefined,
                      serverGenerationId: undefined,
                    }
                  : g,
              ),
            }
          : m,
      ),
    )
    try {
      const response = (await retryGeneration({
        data: { generationId: genId },
      })) as Response
      if (response.headers.get('X-Artifact-Kind')) {
        const updateRetriedArtifactGeneration = (
          event: Pick<ArtifactStreamEvent, 'generationId' | 'modelId'>,
          update: (
            generation: NonNullable<ChatMessage['compareGenerations']>[number],
          ) => NonNullable<ChatMessage['compareGenerations']>[number],
        ) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === retryMessage.id && message.compareGenerations
                ? {
                    ...message,
                    compareGenerations: updateArtifactGenerationFromEvent(
                      message.compareGenerations,
                      event,
                      update,
                      genId,
                    ),
                  }
                : message,
            ),
          )
        }

        await consumeArtifactEventResponse(
          response,
          (event) =>
            applyCompareArtifactEvent(event, updateRetriedArtifactGeneration),
          async () => {
            const persisted = await getMessages({ data: { conversationId } })
            setMessages(
              hydrateMessages(
                persisted as Parameters<typeof hydrateMessages>[0],
              ),
            )
            void queryClient.invalidateQueries({
              queryKey: ['conversation-artifacts', conversationId],
            })
            refreshConversationList()
            void refreshCredits()
          },
        )
        return
      }
      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        setMessages((prev) =>
          prev.map((m) =>
            m.compareGenerations
              ? {
                  ...m,
                  compareGenerations: m.compareGenerations.map((g) =>
                    g.id === genId
                      ? { ...g, content: text, status: 'completed' }
                      : g,
                  ),
                }
              : m,
          ),
        )
        return
      }
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((m) =>
            m.compareGenerations
              ? {
                  ...m,
                  compareGenerations: m.compareGenerations.map((g) =>
                    g.id === genId ? { ...g, content: full } : g,
                  ),
                }
              : m,
          ),
        )
      }
      const hasRetryContent = Boolean(full && full.trim().length > 0)
      setMessages((prev) =>
        prev.map((m) =>
          m.compareGenerations
            ? {
                ...m,
                compareGenerations: m.compareGenerations.map((g) =>
                  g.id === genId
                    ? hasRetryContent
                      ? {
                          ...g,
                          content: full,
                          status: 'completed',
                          error: undefined,
                        }
                      : {
                          ...g,
                          content: '',
                          status: 'failed',
                          error: {
                            message:
                              'Model tidak menghasilkan jawaban akhir. Coba lagi.',
                            code: 'ERR-001',
                          },
                        }
                    : g,
                ),
              }
            : m,
        ),
      )
    } catch (e) {
      const err = e as Error
      const msg = err.message || 'Coba lagi gagal'
      setMessages((prev) =>
        prev.map((m) =>
          m.compareGenerations
            ? {
                ...m,
                compareGenerations: m.compareGenerations.map((g) =>
                  g.id === genId
                    ? {
                        ...g,
                        status: 'failed',
                        error: { message: msg, code: 'ERR-001' },
                        content: '',
                      }
                    : g,
                ),
              }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
      setMessages((current) =>
        current.map((message) =>
          message.id === retryMessage.id
            ? { ...message, streaming: false }
            : message,
        ),
      )
    }
  }

  const handleRetryArtifact = async (failedGenId: string) => {
    if (isStreaming) return
    const retryAckId = crypto.randomUUID()
    const failedMsg = messages.find((m) => m.generationRunId === failedGenId)
    const kind = failedMsg?.artifactKind ?? 'prd'
    setMessages((prev) => [
      ...prev,
      {
        id: retryAckId,
        role: 'assistant',
        content: '',
        modelId: failedMsg?.modelId,
        streaming: true,
        artifactStatus: 'preparing',
        artifactKind: kind,
        generationRunId: failedGenId,
        artifactAck: 'Baik, saya coba buat ulang.',
      } satisfies ChatMessage,
    ])
    setIsStreaming(true)
    setGenerationId(failedGenId)
    try {
      const response = (await retryGeneration({
        data: { generationId: failedGenId },
      })) as Response
      const routerModelId = response.headers.get('X-Router-Model-Id')
      if (routerModelId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === retryAckId ? { ...m, routerModelId } : m)),
        )
      }
      const reader = response.body?.getReader()
      if (!reader) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === retryAckId
              ? {
                  ...m,
                  artifactStatus: 'failed',
                  errorMessage: 'Gagal menjalankan ulang pembuatan.',
                  streaming: false,
                }
              : m,
          ),
        )
        return
      }
      const decoder = new TextDecoder()
      const parser = createArtifactSseParser({
        onEvent: (event) => {
          if (event.type === 'artifact-status') {
            if (event.phase === 'failed' || event.phase === 'cancelled') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === retryAckId
                    ? {
                        ...m,
                        artifactStatus:
                          event.phase === 'failed' ? 'failed' : 'cancelled',
                        errorMessage: event.message,
                        streaming: false,
                      }
                    : m,
                ),
              )
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === retryAckId
                    ? { ...m, artifactStatus: event.phase }
                    : m,
                ),
              )
            }
          } else if (event.type === 'artifact-created') {
            const descriptor = mergeCreatedArtifact(event)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === retryAckId
                  ? {
                      ...m,
                      artifactKind: event.kind,
                      artifact: descriptor,
                      content: event.summary,
                    }
                  : m,
              ),
            )
          } else if (event.type === 'artifact-error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === retryAckId
                  ? {
                      ...m,
                      artifactStatus: 'failed',
                      errorMessage: event.message ?? event.code,
                      streaming: false,
                    }
                  : m,
              ),
            )
          } else if (event.type === 'artifact-done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === retryAckId
                  ? {
                      ...m,
                      artifactStatus:
                        event.status === 'failed' ? 'failed' : event.status,
                      streaming: false,
                    }
                  : m,
              ),
            )
          }
        },
        onError: () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === retryAckId
                ? {
                    ...m,
                    artifactStatus: 'failed' as const,
                    errorMessage: 'Koneksi terputus saat membuat ulang.',
                    streaming: false,
                  }
                : m,
            ),
          )
        },
      })
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
      parser.flush()
      const persisted = await getMessages({ data: { conversationId } })
      setMessages(
        hydrateMessages(persisted as Parameters<typeof hydrateMessages>[0]),
      )
      refreshConversationList()
      void refreshCredits()
    } catch (e) {
      const err = e as Error & { status?: number; code?: string }
      if (err.status === 402 || err.code === 'ERR-019') {
        setUpgradeOpen(true)
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === retryAckId
            ? {
                ...m,
                artifactStatus: 'failed',
                errorMessage:
                  err.message || 'Gagal menjalankan ulang pembuatan.',
                streaming: false,
              }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
      setGenerationId(null)
    }
  }

  const handleSelectArtifactTab = (artifactId: string) => {
    setArtifactWorkspace((current) => openArtifact(current, { artifactId }))
  }
  const handleArtifactVersionChange = (input: {
    artifactId: string
    versionId: string
  }) => {
    setArtifactWorkspace((current) => selectArtifactVersion(current, input))
  }
  const handleCloseArtifactTab = (artifactId: string) => {
    setArtifactWorkspace((current) => closeArtifactTab(current, artifactId))
  }
  const handleCloseArtifactPanel = () => {
    setArtifactWorkspace((current) => closeArtifactPanel(current))
  }
  const handleRememberArtifactScroll = (input: {
    artifactId: string
    versionId: string
    scrollTop: number
  }) => {
    setArtifactWorkspace((current) => rememberArtifactScroll(current, input))
  }

  return (
    <WorkspaceShell
      credits={credits}
      activeConversationId={conversationId}
      onNewChat={() => {
        void navigate({ to: '/' })
      }}
      onSelectConversation={(id) => {
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId: id },
        })
      }}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {webSearchToast && (
          <div
            role="status"
            data-testid="web-search-toast"
            className="fixed right-6 top-6 z-50 rounded-md border border-hairline bg-pure-white px-4 py-3 text-[13px] text-ink shadow-sm"
          >
            Web search tidak tersedia. Melanjutkan tanpa hasil web.
          </div>
        )}
        <ConversationArtifactLayout
          canvasOpen={artifactWorkspace.isArtifactPanelOpen}
          chatPane={
            <>
              <div
                ref={scrollRef}
                data-testid="chat-messages-scroll-area"
                className="zona-scroll flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
              >
                <header
                  className={`sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between bg-pure-white transition-[padding] duration-200 pl-14 lg:pl-6 ${
                    hasUsedCompareMode
                      ? 'pr-4 sm:pr-6 lg:pr-10 xl:pr-12'
                      : 'pr-4 lg:pr-6'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {compareEnabled && (
                      <span
                        data-testid="topbar-compare-label"
                        className="truncate text-[13px] sm:text-[14px] font-medium text-stone max-w-[140px] sm:max-w-none"
                      >
                        Mode banding · {compareModelIds.length} model
                      </span>
                    )}
                  </div>
                  <GlobalNav
                    user={user}
                    authState="authenticated"
                    mode="app"
                    className="flex items-center gap-2.5 sm:gap-3"
                    leading={
                      process.env.NODE_ENV !== 'production' ? (
                        <button
                          type="button"
                          data-testid="reset-credits-btn"
                          onClick={handleResetCredits}
                          disabled={resettingCredits}
                          className="flex min-h-8 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-full border border-hairline bg-pure-white px-2.5 sm:px-3 text-[13px] font-medium text-ink transition-all duration-200 hover:border-hairline-strong hover:bg-ink/5 active:scale-95 disabled:opacity-50"
                          title="Reset ke 100 kredit (mode dev)"
                        >
                          <HugeiconsIcon
                            icon={ZapIcon}
                            size={14}
                            strokeWidth={1.75}
                            className="text-amber-500 shrink-0"
                          />
                          <span className="hidden sm:inline">
                            {resettingCredits
                              ? 'Mereset...'
                              : 'Reset 100 Kredit'}
                          </span>
                          <span className="sm:hidden">
                            {resettingCredits ? '...' : 'Reset'}
                          </span>
                        </button>
                      ) : undefined
                    }
                  />
                </header>

                <MessageList
                  messages={messages}
                  onRetryGeneration={handleRetry}
                  onStopGeneration={handleStopPerModel}
                  onRetryArtifact={handleRetryArtifact}
                  onOpenArtifact={handleOpenArtifact}
                  onOpenArtifacts={handleOpenArtifacts}
                  scrollRef={scrollRef}
                  hasUsedCompareMode={hasUsedCompareMode}
                />
              </div>

              <div
                data-testid="chat-composer-container"
                className={`pointer-events-none absolute bottom-0 left-0 right-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 transition-[padding] duration-200 ${
                  hasUsedCompareMode ? COMPARE_GUTTER_CLASS : 'px-4 lg:px-6'
                }`}
              >
                <div
                  className={`pointer-events-auto mx-auto w-full transition-[max-width] duration-200 ${
                    hasUsedCompareMode
                      ? COMPARE_MAX_WIDTH_CLASS
                      : 'max-w-[860px]'
                  }`}
                >
                  <Composer
                    onSend={handleSend}
                    onSendCompare={handleSendCompare}
                    onStop={handleStop}
                    isStreaming={isStreaming}
                    credits={credits}
                    modelValue={modelId}
                    onModelChange={handleModelChange}
                    skillValue={skillId}
                    onSkillChange={setSkillId}
                    compareEnabled={compareEnabled}
                    onCompareEnabledChange={setCompareEnabled}
                    compareModelIds={compareModelIds}
                    onCompareModelIdsChange={setCompareModelIds}
                    conversationId={conversationId}
                    placement="inline"
                    availableArtifacts={artifactSummaries}
                    mentionsValue={composerMentions}
                    onMentionsChange={setComposerMentions}
                  />
                </div>
              </div>
            </>
          }
          canvasPane={
            <ArtifactCanvas
              summaries={artifactSummaries}
              detailsByArtifactId={artifactDetailsById}
              workspace={artifactWorkspace}
              onSelectTab={handleSelectArtifactTab}
              onVersionChange={handleArtifactVersionChange}
              onCloseTab={handleCloseArtifactTab}
              onClosePanel={handleCloseArtifactPanel}
              onBackToChat={handleCloseArtifactPanel}
              onCopy={() => undefined}
              onRememberScroll={handleRememberArtifactScroll}
              onAddMention={handleAddMentionFromCanvas}
            />
          }
        />
      </div>
      <InsufficientCreditsDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        onViewPlans={() => {
          setUpgradeOpen(false)
          void navigate({ to: '/pricing' })
        }}
      />
    </WorkspaceShell>
  )
}
