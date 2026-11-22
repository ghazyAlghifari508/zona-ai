export const AUTO_ROUTING_THRESHOLDS = {
  shortPromptWords: 20,
  longPromptWords: 100,
  lowCredit: 15,
} as const

export type AutoRoutingProfile =
  | 'lightweight'
  | 'coding'
  | 'reasoning'
  | 'general'
  | 'router'

export interface AutoCandidate {
  id: string
  routerModelId: string
  credit: number
  tier: string
  profile: AutoRoutingProfile
  score: number
  vision: boolean
  files: boolean
}

export interface ResolvedAutoCandidate extends AutoCandidate {
  cost: number
  reason: string
}

export interface SelectAutoCandidateInput {
  prompt: string
  candidates: readonly AutoCandidate[]
  credits?: number
  requireVision?: boolean
  requireFiles?: boolean
  purpose?: 'chat' | 'title'
}

function classifyPrompt(prompt: string): Exclude<AutoRoutingProfile, 'router'> {
  const lower = prompt.toLowerCase()
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length
  if (
    /```|refactor|debug|implement|endpoint|regex|sql|schema|stack trace/i.test(
      prompt,
    )
  )
    return 'coding'
  if (
    /langkah demi langkah|analisis|jelaskan mendalam|multi-step|logika|dokumen/i.test(
      lower,
    ) ||
    wordCount > AUTO_ROUTING_THRESHOLDS.longPromptWords
  )
    return 'reasoning'
  if (
    wordCount < AUTO_ROUTING_THRESHOLDS.shortPromptWords ||
    /^(halo|hai|hello|terima kasih|apa itu)/i.test(lower)
  )
    return 'lightweight'
  return 'general'
}

function preferredProfiles(
  classification: Exclude<AutoRoutingProfile, 'router'>,
  credits: number,
): readonly Exclude<AutoRoutingProfile, 'router'>[] {
  if (classification === 'coding') {
    return credits < AUTO_ROUTING_THRESHOLDS.lowCredit
      ? ['reasoning', 'general', 'coding']
      : ['coding', 'reasoning', 'general']
  }
  if (classification === 'reasoning') return ['reasoning', 'general', 'coding']
  if (classification === 'lightweight') return ['lightweight', 'general']
  return ['reasoning', 'general']
}

export function selectAutoCandidate(
  input: SelectAutoCandidateInput,
): ResolvedAutoCandidate | null {
  const credits = input.credits ?? Number.POSITIVE_INFINITY
  const classification =
    input.purpose === 'title' ? 'lightweight' : classifyPrompt(input.prompt)

  const eligible = input.candidates.filter(
    (candidate) =>
      candidate.profile !== 'router' &&
      candidate.credit <= credits &&
      (!input.requireVision || candidate.vision) &&
      (!input.requireFiles || candidate.files),
  )

  for (const profile of preferredProfiles(classification, credits)) {
    const best = eligible
      .filter((candidate) => candidate.profile === profile)
      .sort((a, b) =>
        profile === 'lightweight'
          ? a.credit - b.credit || b.score - a.score
          : b.score - a.score || a.credit - b.credit,
      )[0]
    if (best) {
      return {
        ...best,
        cost: best.credit,
        reason:
          input.purpose === 'title' ? 'title-lightweight' : classification,
      }
    }
  }
  return null
}
