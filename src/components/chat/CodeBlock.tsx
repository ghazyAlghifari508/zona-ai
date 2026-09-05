import { CopyButton } from './CopyButton'

export function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative max-w-full rounded-lg border border-hairline bg-pure-white p-4">
      <CopyButton
        content={children}
        label
        testId="codeblock-copy"
        className="absolute top-2 right-2 min-h-0 rounded-md border border-hairline bg-pure-white px-2 py-1 text-xs text-ink hover:bg-ink/5"
      />
      <pre className="overflow-x-auto text-[14px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  )
}
