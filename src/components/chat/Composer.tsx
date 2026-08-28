import { ArrowUp, Globe, Paperclip, Square } from 'lucide-react'
import { useRef, useState } from 'react'
import { ModelSelector } from './ModelSelector'
import { SkillSelector } from './SkillSelector'

type Props = {
  onSend: (content: string, modelId: string, skillId: string) => void
  onStop?: () => void
  isStreaming?: boolean
  credits?: number
  initialModel?: string
  initialSkill?: string
}

export function Composer({
  onSend,
  onStop,
  isStreaming = false,
  credits = 100,
  initialModel = 'auto',
  initialSkill = 'none',
}: Props) {
  const [content, setContent] = useState('')
  const [modelId, setModelId] = useState(initialModel)
  const [skillId, setSkillId] = useState(initialSkill)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const trimmed = content.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed, modelId, skillId)
    setContent('')
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px'
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
    el.style.height = '24px'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const isPremium = modelId === 'gpt-5.6-sol'

  return (
    <div className="fixed bottom-0 left-[280px] right-0 bg-cream-paper p-4">
      <div className="mx-auto max-w-[800px] space-y-2">
        <div className="flex flex-col gap-2 rounded-[50px] border border-hairline-mist bg-pure-white p-2">
          <div className="flex items-end gap-2 px-2">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Tanyakan apa saja ke Zona.ai..."
              rows={1}
              data-testid="composer-input"
              className="min-h-[24px] max-h-[160px] flex-1 resize-none bg-transparent text-[15px] text-ink-black placeholder:text-stone-gray focus:outline-none"
            />
            {isStreaming ? (
              <button
                type="button"
                data-testid="stop-button"
                onClick={onStop}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-black text-pure-white hover:bg-stone-gray"
                aria-label="Stop generation"
              >
                <Square size={16} strokeWidth={1.75} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                data-testid="send-button"
                onClick={handleSend}
                disabled={!content.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fresh-grass text-ink-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <ArrowUp size={18} strokeWidth={1.75} />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between px-2 pb-1">
            <div className="flex items-center gap-2">
              <ModelSelector
                value={modelId}
                onChange={setModelId}
                credits={credits}
              />
              <SkillSelector value={skillId} onChange={setSkillId} />
              <button
                type="button"
                disabled
                className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline-mist bg-pure-white text-stone-gray opacity-50"
                title="Attachment (Fase 06)"
              >
                <Paperclip size={14} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                disabled
                className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline-mist bg-pure-white text-stone-gray opacity-50"
                title="Web search (Fase 08)"
              >
                <Globe size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
        {isPremium && (
          <p className="px-2 text-[13px] text-stone-gray">
            GPT-5.6 Sol memakai kredit lebih cepat — pakai Auto →
          </p>
        )}
      </div>
    </div>
  )
}
