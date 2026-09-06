import { CREDIT_COST_BY_BARS } from '../utils/constants'

export function resolveAutoModel(
  prompt: string,
  opts?: { credits?: number },
): { routerModelId: string; cost: number; reason: string; tier: string } {
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

  if (isCode) {
    if (opts?.credits !== undefined && opts.credits < 15)
      return {
        routerModelId: 'ag/gemini-3.7-flash-high',
        cost: CREDIT_COST_BY_BARS[3],
        reason: 'fallback-low-credit',
        tier: 'balanced',
      }
    return {
      routerModelId: 'cx/gpt-5.6-sol',
      cost: CREDIT_COST_BY_BARS[4],
      reason: 'coding-architecture',
      tier: 'premium',
    }
  }
  if (isReasoning || wordCount > 100)
    return {
      routerModelId: 'ag/gemini-3.7-flash-high',
      cost: CREDIT_COST_BY_BARS[3],
      reason: 'heavy-reasoning',
      tier: 'balanced',
    }
  if (isLightweight)
    return {
      routerModelId: 'ag/gemini-3.7-flash-low',
      cost: 1,
      reason: 'lightweight',
      tier: 'economy',
    }
  return {
    routerModelId: 'ag/gemini-3.7-flash-high',
    cost: CREDIT_COST_BY_BARS[3],
    reason: 'heavy-reasoning',
    tier: 'balanced',
  }
}
