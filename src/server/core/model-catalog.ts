import { count } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod'
import { type DatabaseTransaction, db } from '../../lib/db/index'
import type * as schema from '../../lib/db/schema'
import { modelAliases, modelCatalog, modelSettings } from '../../lib/db/schema'
import {
  type AutoCandidate,
  type ResolvedAutoCandidate,
  selectAutoCandidate,
} from '../../lib/models/auto-policy'
import {
  type CatalogEntryDto,
  type CatalogHistoryLabelDto,
  type CatalogSeedRow,
  catalogCapabilitiesSchema,
  catalogEntryDtoSchema,
  catalogHistoryLabelSchema,
  catalogStatusSchema,
  confidenceSchema,
  creditTierSchema,
  evaluationStatusSchema,
  intelligenceLevelSchema,
  routingProfileSchema,
  toCatalogEntryDto,
  visionStatusSchema,
} from '../../lib/models/catalog-contract'
import {
  type CatalogStatus,
  isCatalogEntryEligible,
  resolveCatalogIdentity,
} from '../../lib/models/catalog-identity'
import {
  buildLegacyCatalogSeed,
  LEGACY_IDENTITY_ALIASES,
} from '../../lib/models/legacy-seed'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/model-catalog.ts is server-only')
}

export type CatalogDatabase =
  | PostgresJsDatabase<typeof schema>
  | DatabaseTransaction

type CatalogRow = typeof schema.modelCatalog.$inferSelect
type StatusRow = typeof schema.modelSettings.$inferSelect

interface CatalogSnapshot {
  rows: CatalogSeedRow[]
  aliases: Map<string, string>
}

interface AutoResolutionInput {
  prompt: string
  credits?: number
  requireVision?: boolean
  requireFiles?: boolean
  purpose?: 'chat' | 'title'
}

const SNAPSHOT_TTL_MS = 30_000
let cachedSnapshot: { expiresAt: number; value: CatalogSnapshot } | null = null
let pendingSnapshot: Promise<CatalogSnapshot> | null = null

export function invalidateCatalogCache(): void {
  cachedSnapshot = null
  pendingSnapshot = null
}

export function normalizeCatalogRow(
  row: CatalogRow,
  status: CatalogStatus,
  disabledReason: string | null,
): CatalogSeedRow {
  return {
    id: row.id,
    routerModelId: row.routerModelId,
    displayName: row.displayName,
    provider: row.provider,
    vendor: row.vendor,
    description: row.description,
    intelligenceLevel: intelligenceLevelSchema.parse(row.intelligenceLevel),
    intelligenceScore: row.intelligenceScore,
    intelligenceBars: intelligenceLevelSchema.parse(row.intelligenceBars),
    confidence: confidenceSchema.parse(row.confidence),
    evaluationNotes: row.evaluationNotes,
    lastEvaluated: row.lastEvaluated,
    creditCostMin: row.creditCostMin,
    creditCostMax: row.creditCostMax,
    creditTier: creditTierSchema.parse(row.creditTier),
    capabilities: catalogCapabilitiesSchema.parse(row.capabilities),
    searchAliases: z.array(z.string()).parse(row.searchAliases),
    contextWindow: row.contextWindow,
    maxOutput: row.maxOutput,
    pricingInput: row.pricingInput,
    pricingOutput: row.pricingOutput,
    category: row.category,
    speedClass: row.speedClass,
    routingProfile: routingProfileSchema.parse(row.routingProfile),
    routingPriority: row.routingPriority,
    isVirtual: row.isVirtual,
    evaluationStatus: evaluationStatusSchema.parse(row.evaluationStatus),
    evaluationSuiteVersion: row.evaluationSuiteVersion,
    evidenceRef: row.evidenceRef,
    visionStatus: visionStatusSchema.parse(row.visionStatus),
    visionEvidence: row.visionEvidence,
    provenance: row.provenance,
    observedAt: row.observedAt?.toISOString() ?? null,
    status,
    disabledReason,
    retiredAt: null,
  }
}

async function readSnapshot(
  database: CatalogDatabase,
): Promise<CatalogSnapshot> {
  const [rows, aliasRows, settingsRows] = await Promise.all([
    database.select().from(modelCatalog),
    database.select().from(modelAliases),
    database.select().from(modelSettings),
  ])

  const aliases = new Map(aliasRows.map((row) => [row.alias, row.modelId]))
  const settings = new Map<string, StatusRow>()
  for (const setting of settingsRows) {
    const canonical = aliases.get(setting.modelId) ?? setting.modelId
    const weight = (row: StatusRow) =>
      row.status === 'retired'
        ? 3
        : row.status !== 'active' || row.disabledReason !== null
          ? 2
          : row.modelId === canonical
            ? 1
            : 0
    const current = settings.get(canonical)
    if (!current || weight(setting) > weight(current))
      settings.set(canonical, setting)
  }

  return {
    rows: rows.map((row) => {
      const setting = settings.get(row.id)
      const status = catalogStatusSchema.parse(
        row.isVirtual && !setting ? 'active' : (setting?.status ?? 'active'),
      )
      return normalizeCatalogRow(row, status, setting?.disabledReason ?? null)
    }),
    aliases,
  }
}

export async function loadCatalogSnapshot(
  database?: CatalogDatabase,
): Promise<CatalogSnapshot> {
  if (database && database !== db) return readSnapshot(database)
  if (cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
    return cachedSnapshot.value
  }
  if (pendingSnapshot) return pendingSnapshot

  pendingSnapshot = readSnapshot(db)
    .then((value) => {
      cachedSnapshot = { expiresAt: Date.now() + SNAPSHOT_TTL_MS, value }
      return value
    })
    .finally(() => {
      pendingSnapshot = null
    })

  try {
    return await pendingSnapshot
  } catch (error) {
    cachedSnapshot = null
    throw error
  }
}

export async function getPublicCatalog(
  database?: CatalogDatabase,
  includeRetired = false,
): Promise<CatalogEntryDto[]> {
  const snapshot = await loadCatalogSnapshot(database)
  const aliasesByModel = new Map<string, string[]>()
  for (const [alias, modelId] of snapshot.aliases) {
    const current = aliasesByModel.get(modelId) ?? []
    current.push(alias)
    aliasesByModel.set(modelId, current)
  }

  return catalogEntryDtoSchema
    .array()
    .parse(
      snapshot.rows
        .filter((row) => includeRetired || row.status !== 'retired')
        .map((row) => toCatalogEntryDto(row, aliasesByModel.get(row.id) ?? [])),
    )
}

export async function findOrphanModelSettings(
  database: CatalogDatabase = db,
): Promise<string[]> {
  const snapshot = await loadCatalogSnapshot(database)
  const known = new Set<string>([
    ...snapshot.rows.map((row) => row.id),
    ...snapshot.aliases.keys(),
  ])
  const settings = await database
    .select({ modelId: modelSettings.modelId })
    .from(modelSettings)
  return settings
    .map((row) => row.modelId)
    .filter((modelId) => !known.has(modelId))
}

export async function findHistoricalModelLabel(
  modelId: string,
  database?: CatalogDatabase,
): Promise<CatalogHistoryLabelDto | null> {
  const snapshot = await loadCatalogSnapshot(database)
  const row = resolveCatalogIdentity(
    snapshot.rows,
    modelId,
    Object.fromEntries(snapshot.aliases),
  )
  if (!row) return null
  return catalogHistoryLabelSchema.parse({
    id: row.id,
    displayName: row.displayName,
    routerModelId: row.routerModelId,
    status: row.status,
  })
}

export async function getEligibleModel(
  modelId: string,
  database?: CatalogDatabase,
): Promise<CatalogEntryDto | null> {
  const snapshot = await loadCatalogSnapshot(database)
  const row = resolveCatalogIdentity(
    snapshot.rows,
    modelId,
    Object.fromEntries(snapshot.aliases),
  )
  if (!isCatalogEntryEligible(row)) return null
  return catalogEntryDtoSchema.parse(toCatalogEntryDto(row))
}

export async function resolveAutoForInference(
  input: AutoResolutionInput,
  database?: CatalogDatabase,
): Promise<ResolvedAutoCandidate | null> {
  const snapshot = await loadCatalogSnapshot(database)
  const candidates: AutoCandidate[] = snapshot.rows
    .filter((row) => isCatalogEntryEligible(row))
    .map((row) => ({
      id: row.id,
      routerModelId: row.routerModelId,
      credit: row.creditCostMax,
      tier: row.creditTier,
      profile: row.routingProfile,
      score: row.intelligenceScore,
      vision: row.visionStatus === 'supported' && row.capabilities.vision,
      files: row.capabilities.files,
    }))
  return selectAutoCandidate({
    prompt: input.prompt,
    credits: input.credits ?? Number.POSITIVE_INFINITY,
    candidates,
    requireVision: input.requireVision,
    requireFiles: input.requireFiles,
    purpose: input.purpose,
  })
}

export async function resolveTitleModel(
  database?: CatalogDatabase,
): Promise<string | null> {
  const resolved = await resolveAutoForInference(
    { prompt: '', purpose: 'title' },
    database,
  )
  return resolved?.routerModelId ?? null
}

export async function seedModelCatalogFromLegacy(
  database: CatalogDatabase = db,
): Promise<{ catalogRows: number; aliasRows: number }> {
  const rows = buildLegacyCatalogSeed()
  await database
    .insert(modelCatalog)
    .values(
      rows.map((row) => ({
        id: row.id,
        routerModelId: row.routerModelId,
        displayName: row.displayName,
        provider: row.provider,
        vendor: row.vendor,
        description: row.description,
        intelligenceLevel: row.intelligenceLevel,
        intelligenceScore: row.intelligenceScore,
        intelligenceBars: row.intelligenceBars,
        confidence: row.confidence,
        evaluationNotes: row.evaluationNotes,
        lastEvaluated: row.lastEvaluated,
        creditCostMin: row.creditCostMin,
        creditCostMax: row.creditCostMax,
        creditTier: row.creditTier,
        capabilities: row.capabilities,
        searchAliases: row.searchAliases,
        contextWindow: row.contextWindow,
        maxOutput: row.maxOutput,
        pricingInput: row.pricingInput,
        pricingOutput: row.pricingOutput,
        category: row.category,
        speedClass: row.speedClass,
        routingProfile: row.routingProfile,
        routingPriority: row.routingPriority,
        isVirtual: row.isVirtual,
        evaluationStatus: row.evaluationStatus,
        evaluationSuiteVersion: row.evaluationSuiteVersion,
        evidenceRef: row.evidenceRef,
        visionStatus: row.visionStatus,
        visionEvidence: row.visionEvidence,
        provenance: row.provenance,
        observedAt: row.observedAt ? new Date(row.observedAt) : null,
      })),
    )
    .onConflictDoNothing({ target: modelCatalog.id })

  await database
    .insert(modelAliases)
    .values(
      Object.entries(LEGACY_IDENTITY_ALIASES).map(([alias, modelId]) => ({
        alias,
        modelId,
      })),
    )
    .onConflictDoNothing({ target: modelAliases.alias })
  await database
    .insert(modelSettings)
    .values(rows.map((row) => ({ modelId: row.id })))
    .onConflictDoNothing({ target: modelSettings.modelId })

  const [catalogCount, aliasCount] = await Promise.all([
    database.select({ value: count() }).from(modelCatalog),
    database.select({ value: count() }).from(modelAliases),
  ])
  invalidateCatalogCache()
  return {
    catalogRows: catalogCount[0]?.value ?? 0,
    aliasRows: aliasCount[0]?.value ?? 0,
  }
}
