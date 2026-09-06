import type { ComponentProps, ReactNode } from 'react'
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import {
  chatHighlightOptions,
  extractRawText,
} from '@/lib/chat/syntax-highlight'
import { CodeBlock } from './CodeBlock'

export const CHAT_MARKDOWN_PLUGINS: NonNullable<
  ComponentProps<typeof ReactMarkdown>['rehypePlugins']
> = [rehypeSanitize, [rehypeHighlight, chatHighlightOptions]]

export const CHAT_MARKDOWN_COMPONENTS: NonNullable<
  ComponentProps<typeof ReactMarkdown>['components']
> = {
  code: ({
    children,
    className,
  }: {
    children?: ReactNode
    className?: string
  }) => {
    const isBlock =
      Boolean(className) || extractRawText(children).includes('\n')
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>
    }
    return (
      <code className="rounded bg-paper px-1 py-0.5 text-[14px]">
        {children}
      </code>
    )
  },
  pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
}

export const MarkdownContent = memo(function MarkdownContent({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <div
      className={
        className ??
        'chat-prose max-w-none text-[15px] leading-[1.7] text-ink [overflow-wrap:anywhere]'
      }
    >
      <ReactMarkdown
        rehypePlugins={CHAT_MARKDOWN_PLUGINS}
        components={CHAT_MARKDOWN_COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
