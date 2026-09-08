import { requireAdminSession } from '../../lib/auth/admin-guard'
import { db } from '../../lib/db/index'
import { auditLogs, modelSettings } from '../../lib/db/schema'
import { getModelById } from '../../lib/models/registry'

// Enforces admin authentication via requireAdminSession (delegates to getAuthSession)
if (typeof window !== 'undefined') {
  throw new Error('src/server/core/admin-models.ts is server-only')
}

export interface ModelOverride {
  isActive: boolean
  disabledReason: string | null
}

const CACHE_TTL_MS = 60_000
const overridesCache = new Map<string, ModelOverride>()
let cacheExpiresAt = 0

function getCanonicalModelIds(modelId: string): string[] {
  const ids = new Set<string>([modelId])
  try {
    const entry = getModelById(modelId)
    ids.add(entry.id)
    ids.add(entry.routerModelId)
  } catch {
    // Model may be external or unknown, keep original modelId
  }
  return Array.from(ids)
}

function findOverride(modelId: string): ModelOverride | undefined {
  const possibleIds = getCanonicalModelIds(modelId)
  for (const id of possibleIds) {
    const override = overridesCache.get(id)
    if (override !== undefined) {
      return override
    }
  }

  for (const [key, value] of overridesCache.entries()) {
    if (
      key === modelId ||
      key.endsWith(`/${modelId}`) ||
      modelId.endsWith(`/${key}`)
    ) {
      return value
    }
  }

  return undefined
}

export function isModelAvailable(modelId: string): boolean {
  const override = findOverride(modelId)
  if (override !== undefined) {
    return override.isActive
  }
  return true
}

export async function getModelOverridesMap(): Promise<
  Map<string, ModelOverride>
> {
  const now = Date.now()
  if (overridesCache.size > 0 && cacheExpiresAt > now) {
    return new Map(overridesCache)
  }

  try {
    const rows = await db.select().from(modelSettings)
    overridesCache.clear()
    for (const row of rows) {
      overridesCache.set(row.modelId, {
        isActive: row.isActive,
        disabledReason: row.disabledReason,
      })
    }
    cacheExpiresAt = now + CACHE_TTL_MS
  } catch {
    // DB unavailable in some test runs; retain memory cache
  }

  return new Map(overridesCache)
}

export function updateModelOverrideInMemory(
  modelId: string,
  isActive: boolean,
  disabledReason?: string | null,
): void {
  overridesCache.set(modelId, {
    isActive,
    disabledReason: disabledReason ?? null,
  })
  cacheExpiresAt = Date.now() + CACHE_TTL_MS
}

export function resetModelOverridesInMemory(): void {
  overridesCache.clear()
  cacheExpiresAt = 0
}

export function invalidateModelOverridesCache(): void {
  cacheExpiresAt = 0
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
  const now = new Date()
  const disabledReason = params.disabledReason ?? null

  await db
    .insert(modelSettings)
    .values({
      modelId: params.modelId,
      isActive: params.isActive,
      disabledReason,
      updatedBy: session.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: modelSettings.modelId,
      set: {
        isActive: params.isActive,
        disabledReason,
        updatedBy: session.user.id,
        updatedAt: now,
      },
    })

  await db.insert(auditLogs).values({
    adminId: session.user.id,
    adminEmail: session.user.email,
    action: params.isActive ? 'model.enable' : 'model.disable',
    targetId: params.modelId,
    targetType: 'model',
    metadata: {
      disabledReason,
    },
    createdAt: now,
  })

  updateModelOverrideInMemory(params.modelId, params.isActive, disabledReason)

  return {
    success: true,
    modelId: params.modelId,
    isActive: params.isActive,
    disabledReason,
  }
}
