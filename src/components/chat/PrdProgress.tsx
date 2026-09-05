import { AlertCircleIcon, Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { PrdPhase, PrdSection } from '@/lib/ai/prd-stream'

export type PrdProgressProps = {
  phase: PrdPhase
  section?: PrdSection
  errorMessage?: string
}

export function getPrdStatusText(
  phase: PrdPhase,
  section?: PrdSection,
): string {
  switch (phase) {
    case 'preparing':
      return 'Menyiapkan PRD...'
    case 'generating':
      switch (section) {
        case 'overview':
          return 'Menulis overview...'
        case 'requirements':
          return 'Menyusun requirements...'
        case 'features':
          return 'Menulis fitur inti...'
        case 'userflow':
          return 'Menyusun user flow...'
        case 'architecture':
          return 'Merancang arsitektur...'
        case 'schema':
          return 'Membuat database schema...'
        case 'techstack':
          return 'Menyusun tech stack...'
        default:
          return 'Menulis dokumen...'
      }
    case 'creating_file':
      return 'Menyiapkan file Markdown...'
    case 'completed':
      return 'PRD selesai dibuat.'
    case 'error':
      return 'Pembuatan PRD gagal.'
  }
}

export function PrdProgress({
  phase,
  section,
  errorMessage,
}: PrdProgressProps) {
  const isError = phase === 'error'
  const isCompleted = phase === 'completed'
  const statusText =
    isError && errorMessage ? errorMessage : getPrdStatusText(phase, section)

  return (
    <div
      data-testid="prd-progress"
      data-phase={phase}
      data-section={section ?? ''}
      className="my-2 inline-flex max-w-full items-center gap-3 rounded-xl border border-hairline bg-pure-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-paper">
        {isError ? (
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={16}
            strokeWidth={2}
            className="text-coral"
            aria-hidden="true"
          />
        ) : isCompleted ? (
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        ) : (
          <HugeiconsIcon
            icon={Loading03Icon}
            size={16}
            strokeWidth={2}
            className="animate-spin text-ink/70"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            data-testid="prd-progress-text"
            className={`text-[14px] font-medium leading-tight ${isError ? 'text-coral' : 'text-ink'}`}
          >
            {statusText}
          </p>
          {phase === 'generating' && section && (
            <span
              data-testid="prd-progress-badge"
              className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-stone uppercase"
            >
              {section}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
