import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  type AuditLogValue,
  createAuditMetadata,
  sanitizeAuditText,
} from '../../lib/admin/audit-metadata'
import { requireAdminSession } from '../../lib/auth/admin-guard'
import type { AuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db/index'
import { auditLogs, modelCatalog, modelSettings } from '../../lib/db/schema'
import {
  adminModelIdSchema,
  type CreateAdminModelInput,
  createAdminModelInputSchema,
  type PublishAdminModelInput,
  publishAdminModelInputSchema,
  RESERVED_MODEL_ID,
  type UpdateAdminModelInput,
  updateAdminModelInputSchema,
} from '../../lib/models/admin-model-input'
import type { CatalogEntryDto } from '../../lib/models/catalog-contract'
import {
  type ConnectionProbe,
  discoverGatewayModels,
  type GatewayModelDiscovery,
  getGatewayProbeConfig,
  probeModelConnection,
} from '../../lib/models/model-probe'
import { planP3Cutover } from '../../lib/models/p3-cutover'
import { loadEvaluation } from '../../lib/models/p3-evidence.server'
import { inspectP3Scope, p3Manifest } from '../../lib/models/p3-manifest'
import { checkRateLimit } from '../../lib/security/rate-limit'
import { AppError } from '../../lib/utils/errors'
import {
  findHistoricalModelLabel,
  getEligibleModel,
  getPublicCatalog,
  invalidateCatalogCache,
  loadCatalogSnapshot,
} from './model-catalog'

function modelAuditMetadata(
  session: AuthSession,
  target: { id: string; displayName: string },
  details: Record<string, AuditLogValue>,
) {
  return createAuditMetadata({
    actor: {
      id: session.user.id,
      displayName: session.user.name ?? session.user.email,
    },
    target,
    details,
  })
}

export async function stageP3CatalogCore(request: Request) {
  await requireAdminSession(request)
  const { rows } = await loadCatalogSnapshot()
  const discovery = await discoverGatewayModels().catch(() => [])
  for (const entry of p3Manifest.added) {
    if (rows.some((row) => row.routerModelId === entry.routerModelId)) continue
    const metadata = discovery.find((row) => row.id === entry.routerModelId)
    const provider = entry.routerModelId.split('/')[0]
    await importAdminModelCore({
      request,
      input: {
        modelId: entry.routerModelId,
        displayName: metadata?.label ?? entry.suggestedLabel,
        vendor: 'Unknown',
        provider,
        description: '',
        searchAliases: [],
        contextWindow: metadata?.contextWindow,
      },
    })
  }
  const snapshot = await loadCatalogSnapshot()
  const retiring = new Set(p3Manifest.retire.map((row) => row.routerModelId))
  return inspectP3Scope(
    snapshot.rows.filter(
      (row) => row.status !== 'retired' && !retiring.has(row.routerModelId),
    ),
  )
}

export async function cutoverP3CatalogCore(request: Request, version: unknown) {
  const session = await requireAdminSession(request)
  z.literal(p3Manifest.version).parse(version)
  const now = new Date()
  const result = await db.transaction(
    async (tx) => {
      const { retire } = planP3Cutover((await loadCatalogSnapshot(tx)).rows)
      for (const row of retire) {
        const fields = {
          isActive: false,
          status: 'retired',
          retiredAt: now,
          updatedBy: session.user.id,
          updatedAt: now,
        }
        await tx
          .update(modelCatalog)
          .set({ updatedAt: now })
          .where(eq(modelCatalog.id, row.id))
        await tx
          .insert(modelSettings)
          .values({ modelId: row.id, ...fields })
          .onConflictDoUpdate({ target: modelSettings.modelId, set: fields })
        await tx.insert(auditLogs).values({
          adminId: session.user.id,
          adminEmail: session.user.email,
          action: 'model.delete',
          targetType: 'model',
          targetId: row.id,
          metadata: modelAuditMetadata(
            session,
            { id: row.id, displayName: row.displayName },
            {
              modelId: row.routerModelId,
              manifest: p3Manifest.version,
              previousStatus: row.status,
              status: 'retired',
            },
          ),
          createdAt: now,
        })
      }
      const post = (await loadCatalogSnapshot(tx)).rows.filter(
        (row) => row.status !== 'retired',
      )
      const scope = inspectP3Scope(post)
      if (
        [scope.missing, scope.drift, scope.conflicts].some((ids) => ids.length)
      )
        throw new Error('Unexpected catalog after retirement')
      return {
        retired: retire.map((row) => row.id),
        final: post.map((row) => row.id),
      }
    },
    { isolationLevel: 'serializable' },
  )
  invalidateCatalogCache()
  return result
}

// Enforces admin authentication via requireAdminSession (delegates to getAuthSession)
if (typeof window !== 'undefined') {
  throw new Error('src/server/core/admin-models.ts is server-only')
}

const UNEVALUATED_CATALOG_VALUES = {
  intelligenceLevel: 1,
  intelligenceScore: 0,
  intelligenceBars: 1,
  confidence: 'low',
  creditCostMin: 0,
  creditCostMax: 0,
  creditTier: 'adaptive',
  capabilities: {
    text: true,
    vision: false,
    files: false,
    tools: false,
    reasoning: false,
    structuredOutput: false,
  },
  category: 'general',
  speedClass: 'unknown',
  routingProfile: 'general',
  routingPriority: 0,
  isVirtual: false,
  evaluationStatus: 'pending',
  visionStatus: 'not-tested',
  provenance: 'admin-import',
} as const

type AdminCatalogEntry = CatalogEntryDto & { lastCheckedAt: string | null }

type AdminMutationResult = {
  success: true
  modelId: string
  status: string
  evaluationStatus: string
}

type CatalogRow = typeof modelCatalog.$inferSelect

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

function editableSnapshot(
  row: Pick<CatalogRow, keyof EditableFields>,
): EditableFields {
  return {
    displayName: row.displayName,
    vendor: row.vendor,
    provider: row.provider,
    description: row.description,
    searchAliases: row.searchAliases,
  }
}

type EditableFields = Pick<
  CreateAdminModelInput,
  'displayName' | 'vendor' | 'provider' | 'description' | 'searchAliases'
>
function auditEditableFields(
  fields: EditableFields,
): Record<string, AuditLogValue> {
  return {
    displayName: fields.displayName,
    vendor: fields.vendor,
    provider: fields.provider,
    description: fields.description,
    searchAliases: [...fields.searchAliases],
  }
}

export async function getModelSettingsCore({
  request,
}: {
  request: Request
}): Promise<Array<typeof modelSettings.$inferSelect>> {
  await requireAdminSession(request)
  return db.select().from(modelSettings)
}

export async function listAdminModelsCore({
  request,
}: {
  request: Request
}): Promise<AdminCatalogEntry[]> {
  await requireAdminSession(request)
  const [entries, settings] = await Promise.all([
    getPublicCatalog(undefined, true),
    db.select().from(modelSettings),
  ])
  const byModelId = new Map(settings.map((row) => [row.modelId, row]))
  return entries.map((entry) => ({
    ...entry,
    lastCheckedAt:
      byModelId.get(entry.id)?.lastCheckedAt?.toISOString() ?? null,
  }))
}

export async function discoverAdminGatewayModelsCore({
  request,
}: {
  request: Request
}): Promise<GatewayModelDiscovery[]> {
  await requireAdminSession(request)
  return discoverGatewayModels()
}

export async function importAdminModelCore({
  request,
  input,
}: {
  request: Request
  input: CreateAdminModelInput
}): Promise<AdminMutationResult> {
  const session = await requireAdminSession(request)
  const data = createAdminModelInputSchema.parse(input)
  const modelId = data.modelId

  const label = await findHistoricalModelLabel(modelId)
  const [existing] = await db
    .select()
    .from(modelCatalog)
    .where(eq(modelCatalog.routerModelId, modelId))
    .limit(1)

  if (existing && (label?.status !== 'retired' || !data.reimport)) {
    throw new AppError(
      'Route model sudah terdaftar',
      409,
      'ERR-MODEL-DUPLICATE',
    )
  }

  const now = new Date()
  try {
    await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(modelCatalog)
          .set({
            displayName: data.displayName,
            vendor: data.vendor,
            provider: data.provider,
            description: data.description,
            searchAliases: data.searchAliases,
            contextWindow: data.contextWindow ?? null,
            evaluationStatus: 'pending',
            updatedAt: now,
          })
          .where(eq(modelCatalog.id, existing.id))
      } else {
        await tx.insert(modelCatalog).values({
          id: modelId,
          routerModelId: modelId,
          displayName: data.displayName,
          vendor: data.vendor,
          provider: data.provider,
          description: data.description,
          searchAliases: data.searchAliases,
          contextWindow: data.contextWindow ?? null,
          ...UNEVALUATED_CATALOG_VALUES,
          createdAt: now,
          updatedAt: now,
        })
      }

      await tx
        .insert(modelSettings)
        .values({
          modelId: existing?.id ?? modelId,
          isActive: true,
          status: 'active',
          disabledReason: null,
          updatedBy: session.user.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: modelSettings.modelId,
          set: {
            isActive: true,
            status: 'active',
            disabledReason: null,
            updatedBy: session.user.id,
            updatedAt: now,
          },
        })

      await tx.insert(auditLogs).values({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: 'model.create',
        targetId: existing?.id ?? modelId,
        targetType: 'model',
        metadata: modelAuditMetadata(
          session,
          { id: existing?.id ?? modelId, displayName: data.displayName },
          {
            modelId,
            reimport: existing !== undefined,
            evaluationStatus: 'pending',
            status: 'active',
          },
        ),
        createdAt: now,
      })
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        'Route model sudah terdaftar',
        409,
        'ERR-MODEL-DUPLICATE',
      )
    }
    throw error
  }

  invalidateCatalogCache()
  return {
    success: true,
    modelId,
    status: 'active',
    evaluationStatus: 'pending',
  }
}

export async function updateAdminModelCore({
  request,
  input,
}: {
  request: Request
  input: UpdateAdminModelInput
}): Promise<AdminMutationResult> {
  const session = await requireAdminSession(request)
  const data = updateAdminModelInputSchema.parse(input)

  const [existing] = await db
    .select()
    .from(modelCatalog)
    .where(eq(modelCatalog.routerModelId, data.modelId))
    .limit(1)
  const label = await findHistoricalModelLabel(data.modelId)
  if (!existing || label?.status === 'retired') {
    throw new AppError('Model tidak ditemukan', 404, 'ERR-003')
  }

  const before = editableSnapshot(existing)
  const after: EditableFields = {
    displayName: data.displayName,
    vendor: data.vendor,
    provider: data.provider,
    description: data.description,
    searchAliases: data.searchAliases,
  }

  await db.transaction(async (tx) => {
    await tx
      .update(modelCatalog)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(modelCatalog.id, existing.id))
    await tx.insert(auditLogs).values({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: 'model.update',
      targetId: existing.id,
      targetType: 'model',
      metadata: modelAuditMetadata(
        session,
        { id: existing.id, displayName: after.displayName },
        {
          modelId: data.modelId,
          before: auditEditableFields(before),
          after: auditEditableFields(after),
        },
      ),
      createdAt: new Date(),
    })
  })

  invalidateCatalogCache()
  return {
    success: true,
    modelId: existing.routerModelId,
    status: label?.status ?? 'active',
    evaluationStatus: existing.evaluationStatus,
  }
}

export async function retireAdminModelCore({
  request,
  modelId: rawModelId,
}: {
  request: Request
  modelId: string
}): Promise<AdminMutationResult> {
  const session = await requireAdminSession(request)
  if (rawModelId.trim().toLowerCase() === RESERVED_MODEL_ID) {
    throw new AppError('Auto tidak dapat dihapus', 400, 'ERR-MODEL-RESERVED')
  }
  const modelId = adminModelIdSchema.parse(rawModelId)

  const label = await findHistoricalModelLabel(modelId)
  const [existing] = await db
    .select()
    .from(modelCatalog)
    .where(eq(modelCatalog.routerModelId, modelId))
    .limit(1)
  if (!existing || label?.status === 'retired') {
    throw new AppError('Model tidak ditemukan', 404, 'ERR-003')
  }

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(modelCatalog)
      .set({ updatedAt: now })
      .where(eq(modelCatalog.id, existing.id))
    await tx
      .insert(modelSettings)
      .values({
        modelId: existing.id,
        isActive: false,
        status: 'retired',
        disabledReason: null,
        updatedBy: session.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: modelSettings.modelId,
        set: {
          isActive: false,
          status: 'retired',
          disabledReason: null,
          updatedBy: session.user.id,
          updatedAt: now,
        },
      })
    await tx.insert(auditLogs).values({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: 'model.delete',
      targetId: existing.id,
      targetType: 'model',
      metadata: modelAuditMetadata(
        session,
        { id: existing.id, displayName: existing.displayName },
        {
          modelId,
          evaluationStatus: existing.evaluationStatus,
          previousStatus: label?.status ?? 'active',
          status: 'retired',
        },
      ),
      createdAt: now,
    })
  })

  invalidateCatalogCache()
  return {
    success: true,
    modelId: existing.routerModelId,
    status: 'retired',
    evaluationStatus: existing.evaluationStatus,
  }
}

export async function publishAdminModelCore({
  request,
  ...rawInput
}: PublishAdminModelInput & {
  request: Request
}): Promise<AdminMutationResult> {
  const session = await requireAdminSession(request)
  const input = publishAdminModelInputSchema.parse(rawInput)
  let evidence: ReturnType<typeof loadEvaluation>
  try {
    evidence = loadEvaluation(input.run, input.modelId)
  } catch {
    throw new AppError(
      'Bukti evaluasi tidak lengkap atau tidak valid',
      422,
      'ERR-MODEL-EVIDENCE',
    )
  }
  const now = new Date()
  const evidenceRef = `${input.run}:${evidence.evidenceHash}`
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(modelCatalog)
      .where(eq(modelCatalog.routerModelId, input.modelId))
      .for('update')
    const [setting] = existing
      ? await tx
          .select()
          .from(modelSettings)
          .where(eq(modelSettings.modelId, existing.id))
          .for('update')
      : []
    if (!existing || existing.isVirtual || setting?.status === 'retired')
      throw new AppError('Model tidak ditemukan', 404, 'ERR-003')
    const status = setting?.status ?? 'active'
    if (existing.evidenceRef === evidenceRef)
      return {
        success: true,
        modelId: input.modelId,
        status,
        evaluationStatus: 'verified',
      } as const
    if (
      existing.evaluationStatus === 'verified' &&
      existing.lastEvaluated &&
      evidence.observedAt <= existing.lastEvaluated
    )
      throw new AppError('Bukti evaluasi lebih lama', 409, 'ERR-MODEL-EVIDENCE')
    const groups = evidence.categories
    const core = groups.find((g) => g.category === 'coding')?.score ?? 0
    const reason = groups.find((g) => g.category === 'reasoning')?.score ?? 0
    await tx
      .update(modelCatalog)
      .set({
        intelligenceLevel: evidence.bars,
        intelligenceScore: Math.round(evidence.score),
        intelligenceBars: evidence.bars,
        confidence: 'medium',
        creditCostMin: evidence.credit,
        creditCostMax: evidence.credit,
        creditTier: evidence.tier,
        capabilities: {
          text: true,
          vision: evidence.vision === 'supported',
          files: false,
          tools: false,
          reasoning: false,
          structuredOutput: false,
        },
        routingProfile:
          evidence.bars === 2
            ? 'lightweight'
            : core > reason
              ? 'coding'
              : reason > core
                ? 'reasoning'
                : 'general',
        evaluationStatus: 'verified',
        evaluationSuiteVersion: evidence.suiteVersion,
        evidenceRef,
        visionStatus: evidence.vision,
        visionEvidence: evidenceRef,
        evaluationNotes: JSON.stringify({
          score: evidence.score,
          categories: groups,
          suiteHash: evidence.suiteHash,
          connectivity: 'valid',
          exactRoute: input.modelId,
        }),
        provenance: evidence.runnerVersion,
        lastEvaluated: evidence.observedAt,
        observedAt: new Date(evidence.observedAt),
        updatedAt: now,
      })
      .where(eq(modelCatalog.id, existing.id))
    await tx.insert(auditLogs).values({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: 'model.update',
      targetId: existing.id,
      targetType: 'model',
      metadata: modelAuditMetadata(
        session,
        { id: existing.id, displayName: existing.displayName },
        {
          modelId: input.modelId,
          evidenceRef,
          previousCredit: existing.creditCostMax,
          credit: evidence.credit,
        },
      ),
      createdAt: now,
    })
    return {
      success: true,
      modelId: input.modelId,
      status,
      evaluationStatus: 'verified',
    } as const
  })
  invalidateCatalogCache()
  return result
}

const PROBE_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const

export async function probeAdminModelCore({
  request,
  modelId: rawModelId,
}: {
  request: Request
  modelId: string
}): Promise<ConnectionProbe> {
  const session = await requireAdminSession(request)
  const modelId = adminModelIdSchema.parse(rawModelId)
  const limit = checkRateLimit({
    key: `admin-probe:${session.user.id}`,
    ...PROBE_RATE_LIMIT,
  })
  if (!limit.allowed) {
    throw new AppError('Terlalu banyak uji koneksi', 429, 'ERR-017')
  }

  const label = await findHistoricalModelLabel(modelId)
  if (!label || label.status === 'retired') {
    throw new AppError('Model tidak ditemukan', 404, 'ERR-003')
  }

  const result = await probeModelConnection(modelId, getGatewayProbeConfig())
  await db.transaction(async (tx) => {
    const now = new Date()
    await tx
      .insert(modelSettings)
      .values({
        modelId: label.id,
        isActive: true,
        status: 'active',
        disabledReason: null,
        updatedBy: session.user.id,
        lastCheckedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: modelSettings.modelId,
        set: {
          lastCheckedAt: now,
          updatedBy: session.user.id,
          updatedAt: now,
        },
      })
    await tx.insert(auditLogs).values({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: 'model.connection_test',
      targetId: label.id,
      targetType: 'model',
      metadata: modelAuditMetadata(
        session,
        { id: label.id, displayName: label.displayName },
        {
          modelId,
          outcome: result.outcome,
          result: result.outcome === 'valid' ? 'success' : 'failure',
          listed: result.listed,
          httpStatus: result.httpStatus,
          provenanceVerified: result.provenanceVerified,
          durationMs: result.durationMs,
          checkedAt: result.checkedAt,
        },
      ),
      createdAt: now,
    })
  })

  invalidateCatalogCache()
  return result
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
  if (params.isActive && (await getEligibleModel(params.modelId)) === null) {
    throw new AppError(
      'Model belum dievaluasi dan tidak dapat diaktifkan',
      400,
      'ERR-MODEL-UNVERIFIED',
    )
  }

  const now = new Date()
  const disabledReason = params.disabledReason ?? null
  const status = params.isActive ? ('active' as const) : ('inactive' as const)

  await db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(modelSettings)
      .where(eq(modelSettings.modelId, label.id))

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
      metadata: modelAuditMetadata(
        session,
        { id: label.id, displayName: label.displayName },
        {
          previousStatus: previous?.status ?? label.status,
          status,
          reason: sanitizeAuditText(disabledReason),
          disabledReason: sanitizeAuditText(disabledReason),
          previousReason: sanitizeAuditText(previous?.disabledReason),
        },
      ),
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
