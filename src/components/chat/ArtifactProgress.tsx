import { AlertCircleIcon, Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ArtifactPhase } from '@/lib/ai/artifact-stream'
import type { ArtifactKind } from '@/lib/chat/skills'

export type ArtifactProgressProps = {
  kind: ArtifactKind
  phase: ArtifactPhase
  section?: string
  errorMessage?: string
  ack?: string
}

export function getArtifactStatusText(
  kind: ArtifactKind,
  phase: ArtifactPhase,
  section?: string,
): string {
  if (kind === 'agent-skill') {
    switch (phase) {
      case 'preparing':
        return 'Menyiapkan skill...'
      case 'generating':
        return 'Menulis instruksi...'
      case 'validating':
        return 'Memvalidasi format...'
      case 'saving':
        return 'Menyiapkan file Markdown...'
      case 'completed':
        return 'Skill selesai dibuat.'
      case 'failed':
        return 'Pembuatan skill gagal.'
      case 'cancelled':
        return 'Pembuatan skill dibatalkan.'
    }
  }
  if (kind === 'checklist') {
    switch (phase) {
      case 'preparing':
        return 'Menyiapkan checklist...'
      case 'generating':
        return 'Menyusun checklist...'
      case 'validating':
        return 'Memvalidasi checklist...'
      case 'saving':
        return 'Menyiapkan file checklist...'
      case 'completed':
        return 'Checklist selesai dibuat.'
      case 'failed':
        return 'Pembuatan checklist gagal.'
      case 'cancelled':
        return 'Pembuatan checklist dibatalkan.'
    }
  }
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
    case 'validating':
      return 'Memvalidasi dokumen...'
    case 'saving':
      return 'Menyiapkan file Markdown...'
    case 'completed':
      return 'PRD selesai dibuat.'
    case 'failed':
      return 'Pembuatan PRD gagal.'
    case 'cancelled':
      return 'Pembuatan PRD dibatalkan.'
  }
}

export function ArtifactProgress({
  kind,
  phase,
  section,
  errorMessage,
  ack,
}: ArtifactProgressProps) {
  const isError = phase === 'failed'
  const isCompleted = phase === 'completed'
  const statusText =
    isError && errorMessage
      ? errorMessage
      : getArtifactStatusText(kind, phase, section)

  return (
    <div className="my-2 min-w-0 space-y-2">
      {ack && (
        <p
          data-testid="artifact-ack"
          className="text-[15px] leading-[1.6] text-ink"
        >
          {ack}
        </p>
      )}
      <div
        data-testid="artifact-progress"
        data-phase={phase}
        data-section={section ?? ''}
        data-kind={kind}
        className="inline-flex max-w-full items-center gap-3 rounded-xl border border-hairline bg-pure-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
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
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
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
              data-testid="artifact-progress-text"
              className={`text-[14px] font-medium leading-tight ${isError ? 'text-coral' : 'text-ink'}`}
            >
              {statusText}
            </p>
            {phase === 'generating' && section && (
              <span
                data-testid="artifact-progress-badge"
                className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-stone uppercase"
              >
                {section}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
