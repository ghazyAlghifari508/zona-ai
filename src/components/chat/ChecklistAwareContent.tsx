import type { ReactNode } from 'react'
import { resolveChecklistDisplay } from '@/lib/chat/checklist'
import { ChecklistView } from './ChecklistView'
import { TypingDots } from './TypingDots'

type Props = {
  content: string
  isStreaming: boolean
  storageKey: string
  renderMarkdown: (content: string) => ReactNode
}

export function ChecklistAwareContent({
  content,
  isStreaming,
  storageKey,
  renderMarkdown,
}: Props) {
  const display = resolveChecklistDisplay(content, isStreaming)
  if (display?.status === 'pending') return <TypingDots />
  if (display?.status === 'ready') {
    return (
      <ChecklistView checklist={display.checklist} storageKey={storageKey} />
    )
  }
  return <>{renderMarkdown(content)}</>
}
