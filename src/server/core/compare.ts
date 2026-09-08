import { AppError } from '../../lib/utils/errors'
import { isModelAvailable } from './admin-models'
import { sendCompareMessageCore } from './chat'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/compare.ts is server-only')
}

export function validateCompareModelsAvailability(modelIds: string[]): void {
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

export { sendCompareMessageCore }
