import { AppError } from '../../lib/utils/errors'
import {
  type CatalogDatabase,
  findHistoricalModelLabel,
  getEligibleModel,
  resolveAutoForInference,
} from './model-catalog'

export interface InferenceModelResolution {
  modelId: string
  routerModelId: string
  cost: number
  creditTier: string
  reason?: string
}

export interface ResolveInferenceModelInput {
  modelId: string
  prompt: string
  credits: number
  requireVision?: boolean
  requireFiles?: boolean
  purpose?: 'chat' | 'title'
}

export async function resolveInferenceModel(
  input: ResolveInferenceModelInput,
  database?: CatalogDatabase,
): Promise<InferenceModelResolution> {
  if (input.modelId === 'auto') {
    const resolved = await resolveAutoForInference(
      {
        prompt: input.prompt,
        credits: input.credits,
        requireVision: input.requireVision,
        requireFiles: input.requireFiles,
        purpose: input.purpose,
      },
      database,
    )
    if (!resolved) {
      throw new AppError('Model Auto tidak tersedia', 400, 'ERR-003')
    }
    return {
      modelId: resolved.id,
      routerModelId: resolved.routerModelId,
      cost: resolved.cost,
      creditTier: resolved.tier,
      reason: resolved.reason,
    }
  }

  const entry = await getEligibleModel(input.modelId, database)
  if (!entry) {
    const label = await findHistoricalModelLabel(input.modelId, database)
    if (label?.status === 'inactive') {
      throw new AppError('Model dinonaktifkan', 400, 'ERR-MODEL-DISABLED')
    }
    throw new AppError('Model tidak ditemukan', 400, 'ERR-003')
  }

  const cost =
    typeof entry.creditCost === 'number'
      ? entry.creditCost
      : entry.creditCost.max

  return {
    modelId: entry.id,
    routerModelId: entry.routerModelId,
    cost,
    creditTier: entry.creditTier,
  }
}

export async function requireVisionCapable(
  modelId: string,
  database?: CatalogDatabase,
): Promise<void> {
  const entry = await getEligibleModel(modelId, database)
  if (!entry?.capabilities.vision) {
    throw new AppError('Model tidak mendukung gambar', 400, 'ERR-003')
  }
}
