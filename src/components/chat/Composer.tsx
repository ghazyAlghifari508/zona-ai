import {
  ArrowUp02Icon,
  Attachment01Icon,
  GlobalSearchIcon,
  Loading03Icon,
  StopIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ModelRegistryEntry } from '@/lib/models/types'
import { getModels } from '@/server/functions/models'
import { AttachmentPreview, type PreviewAttachment } from './AttachmentPreview'
import { ModelSelector } from './ModelSelector'
import { SKILLS, SkillSelector } from './SkillSelector'

type Props = {
  onSend: (
    content: string,
    modelId: string,
    skillId: string,
    attachmentIds?: string[],
    enableWebSearch?: boolean,
  ) => void
  onSendCompare?: (
    content: string,
    modelIds: string[],
    skillId: string,
    attachmentIds?: string[],
    enableWebSearch?: boolean,
  ) => void
  onStop?: () => void
  isStreaming?: boolean
  credits?: number
  initialModel?: string
  initialSkill?: string
  compareModelIds?: string[]
  onCompareModelIdsChange?: (ids: string[]) => void
  compareEnabled?: boolean
  onCompareEnabledChange?: (enabled: boolean) => void
  conversationId?: string
  guest?: boolean
  onSignIn?: () => void
  initialContent?: string
  placement?: 'fixed' | 'inline'
  autoFocusInput?: boolean
  modelValue?: string
  onModelChange?: (id: string) => void
}

const MIN_TEXTAREA_HEIGHT = 56
const MAX_TEXTAREA_HEIGHT = 240

export function Composer({
  onSend,
  onSendCompare,
  onStop,
  isStreaming = false,
  credits = 100,
  initialModel = 'auto',
  initialSkill = 'none',
  compareModelIds = [],
  onCompareModelIdsChange,
  compareEnabled = false,
  onCompareEnabledChange,
  conversationId,
  guest = false,
  onSignIn,
  initialContent = '',
  placement = 'fixed',
  autoFocusInput = false,
  modelValue,
  onModelChange,
}: Props) {
  const [content, setContent] = useState(initialContent)
  const [internalModelId, setInternalModelId] = useState(initialModel)
  const modelId = modelValue ?? internalModelId
  const changeModel = (id: string) => {
    setInternalModelId(id)
    onModelChange?.(id)
  }
  const [skillId, setSkillId] = useState(initialSkill)
  const [registry, setRegistry] = useState<ModelRegistryEntry[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [attachments, setAttachments] = useState<PreviewAttachment[]>([])
  const [attachmentIds, setAttachmentIds] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [enableWebSearch, setEnableWebSearch] = useState(false)

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    const scrollHeight = el.scrollHeight
    const newHeight = Math.max(
      MIN_TEXTAREA_HEIGHT,
      Math.min(scrollHeight, MAX_TEXTAREA_HEIGHT),
    )
    el.style.height = `${newHeight}px`
    el.style.overflowY = scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useEffect(() => setContent(initialContent), [initialContent])

  useLayoutEffect(() => {
    void content
    resizeTextarea()
  }, [content, resizeTextarea])

  useEffect(() => {
    void content
    const timer = setTimeout(resizeTextarea, 20)
    return () => clearTimeout(timer)
  }, [content, resizeTextarea])

  useEffect(() => {
    if (autoFocusInput) textareaRef.current?.focus()
  }, [autoFocusInput])

  useEffect(() => {
    getModels()
      .then((m) => setRegistry(m as ModelRegistryEntry[]))
      .catch(() => setRegistry([]))
  }, [])

  // Poll attachments processing status when any is pending/processing
  useEffect(() => {
    if (!conversationId) return
    const hasProcessing = attachments.some(
      (a) =>
        a.processingStatus === 'processing' ||
        a.processingStatus === 'pending' ||
        a.uploading,
    )
    if (!hasProcessing) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/attachments?conversationId=${encodeURIComponent(conversationId)}`,
        )
        if (!res.ok) return
        const rows = (await res.json()) as Array<{
          id: string
          processingStatus: string
          fileName: string
          mimeType: string
          fileSize: number
        }>
        setAttachments((prev) =>
          prev.map((p) => {
            const updated = rows.find((r) => r.id === p.id)
            if (updated) {
              return {
                ...p,
                processingStatus: updated.processingStatus,
                fileName: updated.fileName,
                mimeType: updated.mimeType,
                fileSize: updated.fileSize,
                uploading: false,
              }
            }
            return { ...p, uploading: false }
          }),
        )
      } catch {
        // ignore polling errors
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [attachments, conversationId])

  const compareTotal = compareModelIds.reduce((sum, id) => {
    const m = registry.find((x) => x.id === id)
    if (!m) return sum
    const cost =
      typeof m.creditCost === 'number' ? m.creditCost : m.creditCost.max
    return sum + cost
  }, 0)
  const compareInsufficient = credits < compareTotal
  const hasContent = content.trim().length > 0 || attachmentIds.length > 0
  const canSendCompare =
    hasContent &&
    compareModelIds.length >= 2 &&
    compareModelIds.length <= 4 &&
    !compareInsufficient &&
    !isStreaming &&
    !uploading
  const canSendNormal = hasContent && !isStreaming && !uploading

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList as FileList)
    if (files.length === 0) return
    if (!conversationId) {
      setError('Buat percakapan terlebih dahulu sebelum upload file')
      return
    }
    if (attachments.length + files.length > 5) {
      setError('Maksimum 5 file per pesan')
      return
    }
    setError(null)
    for (const f of files) {
      const tempId = `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setAttachments((prev) => [
        ...prev,
        {
          id: tempId,
          fileName: f.name,
          mimeType: f.type || 'application/octet-stream',
          fileSize: f.size,
          uploading: true,
        },
      ])
      setUploading(true)
      const fd = new FormData()
      fd.append('file', f)
      fd.append('conversationId', conversationId)
      try {
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          body: fd,
        })
        if (!res.ok) {
          const body = await res
            .json()
            .catch(() => ({ message: 'Upload failed' }))
          const msg =
            body.message ||
            body.error ||
            'File upload failed. Please try again.'
          setError(msg)
          setAttachments((prev) => prev.filter((a) => a.id !== tempId))
          continue
        }
        const data = (await res.json()) as {
          id: string
          fileName: string
          mimeType: string
          fileSize: number
          processingStatus?: string
        }
        setAttachments((prev) => {
          const filtered = prev.filter((a) => a.id !== tempId)
          return [
            ...filtered,
            {
              id: data.id,
              fileName: data.fileName,
              mimeType: data.mimeType,
              fileSize: data.fileSize,
              processingStatus: data.processingStatus ?? 'pending',
            },
          ]
        })
        setAttachmentIds((prev) => [...prev, data.id])
      } catch {
        setError('File upload failed. Please try again.')
        setAttachments((prev) => prev.filter((a) => a.id !== tempId))
      } finally {
        setUploading(false)
      }
    }
    // reset file input
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleRemove(id: string) {
    // Optimistic remove
    const removed = attachments.find((a) => a.id === id)
    setAttachments((prev) => prev.filter((a) => a.id !== id))
    setAttachmentIds((prev) => prev.filter((x) => x !== id))
    if (id.startsWith('uploading-')) return
    try {
      const res = await fetch(`/api/attachments/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        // fallback to POST on same endpoint with JSON body
        await fetch(`/api/attachments/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
      }
    } catch {
      // ignore; already removed locally
      void removed
    }
  }

  async function handleRetry(id: string) {
    // Optimistic set to processing
    setAttachments((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, processingStatus: 'processing' } : a,
      ),
    )
    try {
      const res = await fetch('/api/attachments/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('reprocess failed')
      // After retry, poll will update status; force refresh once
      const listRes = await fetch(
        `/api/attachments?conversationId=${encodeURIComponent(conversationId as string)}`,
      )
      if (listRes.ok) {
        const rows = (await listRes.json()) as Array<{
          id: string
          processingStatus: string
        }>
        const updated = rows.find((r) => r.id === id)
        if (updated) {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, processingStatus: updated.processingStatus }
                : a,
            ),
          )
        }
      }
    } catch {
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, processingStatus: 'failed' } : a,
        ),
      )
    }
  }

  const handleSend = () => {
    const trimmed = content.trim()
    if ((!trimmed && attachmentIds.length === 0) || isStreaming) return
    const isCompare = compareEnabled && compareModelIds.length >= 2
    if (isCompare) {
      if (!canSendCompare) return
      if (onSendCompare)
        onSendCompare(
          trimmed,
          compareModelIds,
          skillId,
          attachmentIds,
          enableWebSearch,
        )
      else
        onSend(
          trimmed,
          compareModelIds.join(','),
          skillId,
          attachmentIds,
          enableWebSearch,
        )
    } else {
      onSend(trimmed, modelId, skillId, attachmentIds, enableWebSearch)
    }
    setContent('')
    setAttachments([])
    setAttachmentIds([])
    setError(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`
      textareaRef.current.style.overflowY = 'hidden'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    const el = e.target
    el.style.height = '0px'
    const scrollHeight = el.scrollHeight
    const newHeight = Math.max(
      MIN_TEXTAREA_HEIGHT,
      Math.min(scrollHeight, MAX_TEXTAREA_HEIGHT),
    )
    el.style.height = `${newHeight}px`
    el.style.overflowY = scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden'
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    // only set false if leaving the container, not child
    if (e.currentTarget === e.target) setDragOver(false)
    // fallback: if relatedTarget is null or outside
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
  }
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files)
  }

  const isPremium = modelId === 'gpt-5.6-sol'

  return (
    <div
      className={
        placement === 'fixed'
          ? 'fixed bottom-0 left-0 right-0 z-30 bg-pure-white/95 backdrop-blur-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:left-[280px]'
          : 'w-full'
      }
    >
      <div className="mx-auto max-w-[860px] space-y-2">
        {compareEnabled && compareModelIds.length >= 2 && (
          <div className="flex items-center justify-between rounded-md border border-hairline bg-sky-tint px-3 py-2 text-[13px] text-ink">
            <span data-testid="composer-compare-banner">
              Compare mode: {compareModelIds.length} model • Total:{' '}
              {compareTotal} Kredit
            </span>
            {compareInsufficient && (
              <span className="text-xs text-stone">
                Butuh {compareTotal} (Sisa {credits})
              </span>
            )}
          </div>
        )}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: composer drag container */}
        <div
          data-testid="composer"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="relative flex flex-col gap-2 rounded-xl border border-hairline-strong bg-pure-white p-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.07)] transition-colors duration-200 focus-within:border-ink/30"
        >
          {dragOver && (
            <div
              data-testid="drag-overlay"
              className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-ink/40 bg-paper text-[15px] font-medium text-stone"
            >
              Drop files here
            </div>
          )}
          {attachments.length > 0 && (
            <AttachmentPreview
              attachments={attachments}
              onRemove={handleRemove}
              onRetry={handleRetry}
            />
          )}
          {error && (
            <div
              data-testid="composer-error"
              className="rounded-md border border-hairline bg-paper px-3 py-2 text-[13px] text-ink"
            >
              {error}
            </div>
          )}
          <div className="px-2 pt-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={
                SKILLS.find((s) => s.id === skillId)?.example ??
                'Tanyakan apa saja ke Zona.ai...'
              }
              rows={1}
              data-testid="composer-input"
              className="min-h-[56px] max-h-[240px] w-full resize-none bg-transparent text-[15px] leading-[1.5] text-ink placeholder:text-ink/35 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ModelSelector
                value={modelId}
                onChange={changeModel}
                credits={credits}
                compareEnabled={compareEnabled}
                onCompareEnabledChange={(enabled) =>
                  onCompareEnabledChange?.(enabled)
                }
                compareModelIds={compareModelIds}
                onCompareModelIdsChange={(ids) =>
                  onCompareModelIdsChange?.(ids)
                }
              />
              <SkillSelector value={skillId} onChange={setSkillId} />
              <input
                ref={fileRef}
                type="file"
                hidden
                accept=".pdf,.docx,.txt,.csv,image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => {
                  if (e.target.files) void handleFiles(e.target.files)
                }}
                data-testid="file-input"
              />
              <button
                type="button"
                data-testid="attachment-btn"
                onClick={() => {
                  if (guest) {
                    onSignIn?.()
                    return
                  }
                  fileRef.current?.click()
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-pure-white text-ink/70 transition-all duration-200 hover:bg-ink/5 hover:text-ink active:scale-95"
                title={guest ? 'Masuk untuk melampirkan file' : 'Attachment'}
                aria-label="Attach file"
              >
                {uploading ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={14}
                    strokeWidth={1.75}
                    className="animate-spin"
                  />
                ) : (
                  <HugeiconsIcon
                    icon={Attachment01Icon}
                    size={15}
                    strokeWidth={1.75}
                  />
                )}
              </button>
              <button
                type="button"
                data-testid="web-toggle"
                aria-pressed={enableWebSearch}
                onClick={() => setEnableWebSearch((v) => !v)}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 active:scale-95 ${
                  enableWebSearch
                    ? 'border-notion-blue/40 bg-sky-tint text-notion-blue shadow-none'
                    : 'border-hairline bg-pure-white text-ink/60 hover:bg-ink/5 hover:text-ink'
                }`}
                title={
                  enableWebSearch
                    ? 'Pencarian web aktif — model akan mencari informasi terkini'
                    : 'Aktifkan pencarian web via Tavily'
                }
                aria-label={
                  enableWebSearch
                    ? 'Matikan pencarian web'
                    : 'Aktifkan pencarian web'
                }
              >
                <HugeiconsIcon
                  icon={GlobalSearchIcon}
                  size={15}
                  strokeWidth={1.75}
                />
              </button>
            </div>
            {isStreaming ? (
              <button
                type="button"
                data-testid="stop-button"
                onClick={onStop}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-pure-white transition-all duration-200 hover:bg-ink/80 active:scale-95"
                aria-label="Stop generation"
              >
                <HugeiconsIcon
                  icon={StopIcon}
                  size={14}
                  strokeWidth={1.75}
                  fill="currentColor"
                />
              </button>
            ) : (
              <button
                type="button"
                data-testid="send-button"
                onClick={handleSend}
                disabled={
                  compareEnabled && compareModelIds.length >= 2
                    ? !canSendCompare
                    : !canSendNormal
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-notion-blue text-pure-white transition-all duration-200 hover:bg-blue-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <HugeiconsIcon icon={ArrowUp02Icon} size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        {compareEnabled && compareModelIds.length >= 2 ? (
          compareInsufficient ? (
            <p className="px-2 text-[13px] text-stone">
              Kredit tidak cukup untuk compare ini.
            </p>
          ) : null
        ) : (
          isPremium && (
            <p className="px-2 text-[13px] text-stone">
              GPT-5.6 Sol memakai kredit lebih cepat — pakai Auto →
            </p>
          )
        )}
      </div>
    </div>
  )
}
