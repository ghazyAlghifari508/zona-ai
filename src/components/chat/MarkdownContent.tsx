import {
  Children,
  type ComponentProps,
  isValidElement,
  memo,
  type ReactNode,
} from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { createChecklistItemId } from '@/lib/artifacts/checklist-toggle'
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
    if (!isTaskItem) {
      return (
        <li className={`list-item ${className ?? ''}`} {...props}>
          {children}
        </li>
      )
    }

    let baseChecked = false
    const inlineChildren: ReactNode[] = []
    const blockChildren: ReactNode[] = []

    Children.forEach(children, (child) => {
      if (isValidElement<{ checked?: boolean; type?: string }>(child)) {
        if (
          child.props &&
          ('checked' in child.props || child.props.type === 'checkbox')
        ) {
          baseChecked = Boolean(child.props.checked)
          return
        }
        if (child.type === 'ul' || child.type === 'ol') {
          blockChildren.push(child)
          return
        }
      }
      inlineChildren.push(child)
    })

    return (
      <li className={`list-none my-1.5 ${className ?? ''}`} {...props}>
        <label className="group inline-flex items-start gap-2.5 cursor-default select-none">
          <input
            type="checkbox"
            checked={baseChecked}
            disabled
            className="mt-1 h-4 w-4 shrink-0 rounded border border-hairline accent-notion-blue align-middle"
          />
          <span
            className={`min-w-0 flex-1 text-[15px] leading-[1.6] transition-colors duration-150 [overflow-wrap:anywhere] ${
              baseChecked ? 'line-through text-stone' : 'text-ink'
            }`}
          >
            {inlineChildren}
          </span>
        </label>
        {blockChildren}
      </li>
    )
  },
  input: ({
    type,
    checked,
    disabled,
    ...rest
  }: {
    type?: string
    checked?: boolean
    disabled?: boolean
  }) => {
    if (type === 'checkbox') {
      return null
    }
    return <input type={type} checked={checked} disabled={disabled} {...rest} />
  },
}

export type MarkdownContentProps = {
  text: string
  className?: string
  taskOverrides?: Record<string, boolean>
  onToggleTask?: (itemId: string, checked: boolean) => void
}

export const MarkdownContent = memo(function MarkdownContent({
  text,
  className,
  taskOverrides,
  onToggleTask,
}: MarkdownContentProps) {
  const occurrenceMap = new Map<string, number>()

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
          li: ({ children, className, ...props }) => {
            const isTaskItem = className?.includes('task-list-item')
            if (!isTaskItem) {
              return (
                <li className={`list-item ${className ?? ''}`} {...props}>
                  {children}
                </li>
              )
            }

            let baseChecked = false
            const inlineChildren: ReactNode[] = []
            const blockChildren: ReactNode[] = []

            Children.forEach(children, (child) => {
              if (isValidElement<{ checked?: boolean; type?: string }>(child)) {
                if (
                  child.props &&
                  ('checked' in child.props || child.props.type === 'checkbox')
                ) {
                  baseChecked = Boolean(child.props.checked)
                  return
                }
                if (child.type === 'ul' || child.type === 'ol') {
                  blockChildren.push(child)
                  return
                }
              }
              inlineChildren.push(child)
            })

            const rawText = extractRawText(inlineChildren).trim()
            const occurrence = occurrenceMap.get(rawText) ?? 0
            occurrenceMap.set(rawText, occurrence + 1)
            const itemId = createChecklistItemId(rawText, occurrence)

            const isChecked = taskOverrides?.[itemId] ?? baseChecked

            return (
              <li
                className={`list-none my-1.5 ${className ?? ''}`}
                data-testid={`task-item-${itemId}`}
                data-completed={isChecked}
                {...props}
              >
                <label
                  className={`group inline-flex items-start gap-2.5 ${
                    onToggleTask
                      ? 'cursor-pointer select-none'
                      : 'cursor-default'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!onToggleTask}
                    onChange={(e) => {
                      e.stopPropagation()
                      onToggleTask?.(itemId, e.target.checked)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={`mt-1 h-4 w-4 shrink-0 rounded border border-hairline accent-notion-blue align-middle transition-colors ${
                      onToggleTask ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  />
                  <span
                    className={`min-w-0 flex-1 text-[15px] leading-[1.6] transition-colors duration-150 [overflow-wrap:anywhere] ${
                      isChecked ? 'line-through text-stone' : 'text-ink'
                    }`}
                  >
                    {inlineChildren}
                  </span>
                </label>
                {blockChildren}
              </li>
            )
          },
          input: ({ type, checked, disabled, ...rest }) => {
            if (type === 'checkbox') {
              return null
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
