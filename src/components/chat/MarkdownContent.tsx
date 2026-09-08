import type { ComponentProps, ReactNode } from 'react'
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import {
  chatHighlightOptions,
  extractRawText,
} from '@/lib/chat/syntax-highlight'
import { CodeBlock } from './CodeBlock'
import { MermaidBlock } from './MermaidBlock'

export const CHAT_MARKDOWN_PLUGINS: NonNullable<
  ComponentProps<typeof ReactMarkdown>['rehypePlugins']
> = [rehypeSanitize, [rehypeHighlight, chatHighlightOptions]]

export const CHAT_MARKDOWN_REMARK_PLUGINS: NonNullable<
  ComponentProps<typeof ReactMarkdown>['remarkPlugins']
> = [remarkGfm]

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
      if (className?.includes('language-mermaid')) {
        return <MermaidBlock code={extractRawText(children)} />
      }
      return <CodeBlock className={className}>{children}</CodeBlock>
    }
    return (
      <code className="rounded bg-paper px-1 py-0.5 text-[14px]">
        {children}
      </code>
    )
  },
  pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ul: ({
    children,
    className,
    ...props
  }: {
    children?: ReactNode
    className?: string
  }) => {
    const isTaskList = className?.includes('contains-task-list')
    return (
      <ul
        className={`${
          isTaskList ? 'list-none pl-1' : 'list-disc pl-6'
        } my-2 space-y-1 ${className ?? ''}`}
        {...props}
      >
        {children}
      </ul>
    )
  },
  ol: ({
    children,
    className,
    ...props
  }: {
    children?: ReactNode
    className?: string
  }) => (
    <ol
      className={`list-decimal pl-6 my-2 space-y-1 ${className ?? ''}`}
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({
    children,
    className,
    ...props
  }: {
    children?: ReactNode
    className?: string
  }) => {
    const isTaskItem = className?.includes('task-list-item')
    return (
      <li
        className={`${isTaskItem ? 'list-none' : 'list-item'} ${className ?? ''}`}
        {...props}
      >
        {children}
      </li>
    )
  },
}

export const MarkdownContent = memo(function MarkdownContent({
  text,
  className,
  onToggleTask,
}: {
  text: string
  className?: string
  onToggleTask?: (taskIndex: number, checked: boolean) => void
}) {
  let taskCounter = 0

  return (
    <div
      className={
        className ??
        'chat-prose max-w-none text-[15px] leading-[1.7] text-ink [overflow-wrap:anywhere]'
      }
    >
      <ReactMarkdown
        remarkPlugins={CHAT_MARKDOWN_REMARK_PLUGINS}
        rehypePlugins={CHAT_MARKDOWN_PLUGINS}
        components={{
          ...CHAT_MARKDOWN_COMPONENTS,
          input: ({ type, checked, disabled, ...rest }) => {
            if (type === 'checkbox') {
              const index = taskCounter++
              return (
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  disabled={!onToggleTask}
                  onChange={(e) => {
                    e.stopPropagation()
                    onToggleTask?.(index, e.target.checked)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={`mr-2 h-4 w-4 rounded border border-hairline accent-notion-blue align-middle transition-colors ${
                    onToggleTask ? 'cursor-pointer' : 'cursor-default'
                  }`}
                />
              )
            }
            return (
              <input
                type={type}
                checked={checked}
                disabled={disabled}
                {...rest}
              />
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
