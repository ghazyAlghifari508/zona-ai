import { CREDIT_COST_BY_BARS } from '../utils/constants'

export interface ResolveAutoModelOptions {
  credits?: number
  isAvailable?: (modelId: string) => boolean
}

type ResolvedModel = {
  routerModelId: string
  cost: number
  reason: string
  tier: string
}

export function resolveAutoModel(
  prompt: string,
  opts?: ResolveAutoModelOptions,
): ResolvedModel {
  const isAvailable = opts?.isAvailable ?? (() => true)
  const lower = prompt.toLowerCase()
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length
  const isCode =
    /```|refactor|debug|implement|endpoint|regex|sql|schema|stack trace/i.test(
      prompt,
    )
  const isReasoning =
    /langkah demi langkah|analisis|jelaskan mendalam|multi-step|logika|dokumen/i.test(
      lower,
    )
  const isLightweight =
    wordCount < 20 || /^(halo|hai|hello|terima kasih|apa itu)/i.test(lower)

  const pickFirstAvailable = (candidates: ResolvedModel[]): ResolvedModel => {
    for (const candidate of candidates) {
      if (isAvailable(candidate.routerModelId)) {
        return candidate
      }
    }
    return candidates[0]
  }

  if (isCode) {
    if (opts?.credits !== undefined && opts.credits < 15) {
      return pickFirstAvailable([
        {
          routerModelId: 'ag/gemini-3.7-flash-high',
          cost: CREDIT_COST_BY_BARS[3],
          reason: 'fallback-low-credit',
          tier: 'balanced',
        },
        {
          routerModelId: 'cx/gpt-5.5',
          cost: CREDIT_COST_BY_BARS[3],
          reason: 'fallback-low-credit',
          tier: 'balanced',
        },
        {
          routerModelId: 'ag/gemini-3.8-flash-high',
          cost: CREDIT_COST_BY_BARS[4],
          reason: 'fallback-high-reasoning',
          tier: 'premium',
        },
      ])
    }
    return pickFirstAvailable([
      {
        routerModelId: 'cx/gpt-5.6-sol',
        cost: CREDIT_COST_BY_BARS[4],
        reason: 'coding-architecture',
        tier: 'premium',
      },
      {
        routerModelId: 'ag/gemini-3.7-flash-high',
        cost: CREDIT_COST_BY_BARS[3],
        reason: 'fallback-coding',
        tier: 'balanced',
      },
      {
        routerModelId: 'cx/gpt-5.5',
        cost: CREDIT_COST_BY_BARS[3],
        reason: 'fallback-coding',
        tier: 'balanced',
      },
    ])
  }

  if (isReasoning || wordCount > 100) {
    return pickFirstAvailable([
      {
        routerModelId: 'ag/gemini-3.7-flash-high',
        cost: CREDIT_COST_BY_BARS[3],
        reason: 'heavy-reasoning',
        tier: 'balanced',
      },
      {
        routerModelId: 'ag/gemini-3.8-flash-high',
        cost: CREDIT_COST_BY_BARS[4],
        reason: 'fallback-reasoning',
        tier: 'premium',
      },
      {
        routerModelId: 'cx/gpt-5.5',
        cost: CREDIT_COST_BY_BARS[3],
        reason: 'fallback-reasoning',
        tier: 'balanced',
      },
    ])
  }

  if (isLightweight) {
    return pickFirstAvailable([
      {
        routerModelId: 'ag/gemini-3.7-flash-low',
        cost: 1,
        reason: 'lightweight',
        tier: 'economy',
      },
      {
        routerModelId: 'ag/gemini-3.7-flash-high',
        cost: CREDIT_COST_BY_BARS[3],
        reason: 'fallback-lightweight',
        tier: 'balanced',
      },
    ])
  }

  return pickFirstAvailable([
    {
      routerModelId: 'ag/gemini-3.7-flash-high',
      cost: CREDIT_COST_BY_BARS[3],
      reason: 'heavy-reasoning',
      tier: 'balanced',
    },
    {
      routerModelId: 'cx/gpt-5.5',
      cost: CREDIT_COST_BY_BARS[3],
      reason: 'fallback-reasoning',
      tier: 'balanced',
    },
  ])
}
