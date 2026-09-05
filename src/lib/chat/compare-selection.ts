import { COMPARE_MAX_MODELS, COMPARE_MIN_MODELS } from '@/lib/utils/constants'

export type CompareSelection = {
  selectedIds: string[]
}

export const COMPARE_SELECTION_HINT =
  'Pilih minimal 2 model untuk membandingkan.'

export function isCompareSelectionValid(selectedIds: string[]): boolean {
  return (
    selectedIds.length >= COMPARE_MIN_MODELS &&
    selectedIds.length <= COMPARE_MAX_MODELS
  )
}

export function canAddCompareModel(selectedIds: string[]): boolean {
  return selectedIds.length < COMPARE_MAX_MODELS
}

export function isCompareModelBlocked(
  selectedIds: string[],
  modelId: string,
): boolean {
  if (selectedIds.includes(modelId)) return false
  return !canAddCompareModel(selectedIds)
}

export function toggleCompareModel(
  selectedIds: string[],
  modelId: string,
): string[] {
  if (selectedIds.includes(modelId)) {
    return selectedIds.filter((id) => id !== modelId)
  }
  if (!canAddCompareModel(selectedIds)) return selectedIds
  return [...selectedIds, modelId]
}

export function getCompareSelectionHint(selectedIds: string[]): string | null {
  return isCompareSelectionValid(selectedIds) ? null : COMPARE_SELECTION_HINT
}

export type CompareSendGate = {
  hasContent: boolean
  enoughCredits: boolean
  idle: boolean
}

export function canSendCompareWith(
  selectedIds: string[],
  gate: CompareSendGate,
): boolean {
  return (
    isCompareSelectionValid(selectedIds) &&
    gate.hasContent &&
    gate.enoughCredits &&
    gate.idle
  )
}
