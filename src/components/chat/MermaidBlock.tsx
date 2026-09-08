import mermaid from 'mermaid'
import { useEffect, useId, useState } from 'react'
import { CodeBlock } from './CodeBlock'

type Props = {
  code: string
}

let mermaidInitialized = false

function ensureMermaidInitialized() {
  if (mermaidInitialized || typeof window === 'undefined') return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    fontFamily: 'Inter, system-ui, sans-serif',
  })
  mermaidInitialized = true
}

export function MermaidBlock({ code }: Props) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'preview' | 'code'>('preview')
  const rawId = useId().replace(/:/g, '_')
  const elementId = `mermaid_${rawId}`

  useEffect(() => {
    let active = true
    ensureMermaidInitialized()

    const trimmed = code.trim()
    if (!trimmed) {
      setSvg(null)
      setError(null)
      return
    }

    void mermaid
      .render(elementId, trimmed)
      .then(({ svg: renderedSvg }) => {
        if (active) {
          setSvg(renderedSvg)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const message =
            err instanceof Error ? err.message : 'Invalid Mermaid syntax'
          setError(message)
          setSvg(null)
        }
      })

    return () => {
      active = false
    }
  }, [code, elementId])

  if (error) {
    return (
      <div data-testid="mermaid-fallback" className="my-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-coral">
          <span>
            Format diagram Mermaid tidak valid. Menampilkan kode sumber:
          </span>
        </div>
        <CodeBlock className="language-mermaid">{code}</CodeBlock>
      </div>
    )
  }

  return (
    <div
      data-testid="mermaid-block"
      className="my-3 overflow-hidden rounded-lg border border-hairline bg-pure-white"
    >
      <div className="flex items-center justify-between border-b border-hairline bg-paper/40 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-stone uppercase tracking-wider">
          Diagram
        </span>
        <div className="flex items-center rounded border border-hairline bg-pure-white p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`rounded px-2 py-0.5 font-medium transition-colors ${
              mode === 'preview'
                ? 'bg-ink/5 font-semibold text-ink'
                : 'text-stone hover:text-ink'
            }`}
          >
            Diagram
          </button>
          <button
            type="button"
            onClick={() => setMode('code')}
            className={`rounded px-2 py-0.5 font-medium transition-colors ${
              mode === 'code'
                ? 'bg-ink/5 font-semibold text-ink'
                : 'text-stone hover:text-ink'
            }`}
          >
            Code
          </button>
        </div>
      </div>

      {mode === 'preview' ? (
        <div className="flex min-w-0 max-w-full justify-center overflow-x-auto p-4 [&>svg]:h-auto [&>svg]:max-w-full">
          {svg ? (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized output from mermaid.render
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <span className="text-[13px] text-stone">Memuat diagram...</span>
          )}
        </div>
      ) : (
        <CodeBlock className="language-mermaid">{code}</CodeBlock>
      )}
    </div>
  )
}
