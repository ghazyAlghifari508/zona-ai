import { AppError } from '../../lib/utils/errors'
import type { CatalogDatabase } from './model-catalog'
import { findHistoricalModelLabel, getEligibleModel } from './model-catalog'

// Request boundary handled by caller chat.ts (which enforces getAuthSession)
if (typeof window !== 'undefined') {
  throw new Error('src/server/core/compare.ts is server-only')
}

export async function validateCompareModelsAvailability(
  modelIds: string[],
  database?: CatalogDatabase,
): Promise<void> {
  const canonicalIds = new Set<string>()
  for (const modelId of modelIds) {
    const entry = await getEligibleModel(modelId, database)
    if (entry) {
      if (canonicalIds.has(entry.id)) {
        throw new AppError('Model dibandingkan harus unik', 400, 'ERR-003')
      }
      canonicalIds.add(entry.id)
      continue
    }
    const label = await findHistoricalModelLabel(modelId, database)
    if (label?.status === 'inactive') {
      throw new AppError(
        'Model ini sedang dinonaktifkan oleh administrator.',
        400,
        'ERR-MODEL-DISABLED',
      )
    }
    throw new AppError('Model tidak tersedia', 400, 'ERR-003')
  }
}
