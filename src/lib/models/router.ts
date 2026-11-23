import type {
  AutoCandidate,
  ResolvedAutoCandidate,
  SelectAutoCandidateInput,
} from './auto-policy'
import { selectAutoCandidate } from './auto-policy'

export type ResolveAutoModelOptions = Omit<SelectAutoCandidateInput, 'prompt'>

export function resolveAutoModel(
  prompt: string,
  options: ResolveAutoModelOptions,
): ResolvedAutoCandidate | null {
  return selectAutoCandidate({ ...options, prompt })
}

export type { AutoCandidate, ResolvedAutoCandidate }
