import { requireAdminSession } from '../../lib/auth/admin-guard'
import { db } from '../../lib/db/index'
import { auditLogs, modelSettings } from '../../lib/db/schema'
import { AppError } from '../../lib/utils/errors'
import {
  findHistoricalModelLabel,
  invalidateCatalogCache,
} from './model-catalog'

// Enforces admin authentication via requireAdminSession (delegates to getAuthSession)
if (typeof window !== 'undefined') {
  throw new Error('src/server/core/admin-models.ts is server-only')
}

export async function getModelSettingsCore({
  request,
}: {
  request: Request
}): Promise<Array<typeof modelSettings.$inferSelect>> {
  await requireAdminSession(request)
  return db.select().from(modelSettings)
}

export async function updateModelAvailabilityCore(params: {
  modelId: string
  isActive: boolean
  disabledReason?: string | null
  request: Request
}): Promise<{
  success: true
  modelId: string
  isActive: boolean
  disabledReason: string | null
}> {
  const session = await requireAdminSession(params.request)
  const label = await findHistoricalModelLabel(params.modelId)
  if (!label || label.status === 'retired') {
    throw new AppError('Model tidak ditemukan', 404, 'ERR-003')
  }

  const now = new Date()
  const disabledReason = params.disabledReason ?? null
  const status = params.isActive ? ('active' as const) : ('inactive' as const)

  await db.transaction(async (tx) => {
    await tx
      .insert(modelSettings)
      .values({
        modelId: label.id,
        isActive: params.isActive,
        status,
        disabledReason,
        updatedBy: session.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: modelSettings.modelId,
        set: {
          isActive: params.isActive,
          status,
          disabledReason,
          updatedBy: session.user.id,
          updatedAt: now,
        },
      })

    await tx.insert(auditLogs).values({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: params.isActive ? 'model.enable' : 'model.disable',
      targetId: label.id,
      targetType: 'model',
      metadata: {
        disabledReason,
      },
      createdAt: now,
    })
  })

  invalidateCatalogCache()

  return {
    success: true,
    modelId: label.id,
    isActive: params.isActive,
    disabledReason,
  }
}
