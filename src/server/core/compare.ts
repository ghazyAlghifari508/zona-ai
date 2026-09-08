import { AppError } from '../../lib/utils/errors'
import { getModelOverridesMap, isModelAvailable } from './admin-models'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/compare.ts is server-only')
}

export async function validateCompareModelsAvailability(
  modelIds: string[],
): Promise<void> {
  await getModelOverridesMap()
  for (const modelId of modelIds) {
    if (!isModelAvailable(modelId)) {
      throw new AppError(
        'Model ini sedang dinonaktifkan oleh administrator.',
        400,
        'ERR-MODEL-DISABLED',
      )
    }
  }
}
