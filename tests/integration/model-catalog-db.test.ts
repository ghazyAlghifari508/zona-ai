/**
 * @vitest-environment node
 */
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../src/lib/db/schema'
import {
  findHistoricalModelLabel,
  getEligibleModel,
  getPublicCatalog,
  resolveAutoForInference,
  seedModelCatalogFromLegacy,
} from '../../src/server/core/model-catalog'

const connectionString = process.env.ZONA_P1_TEST_DATABASE_URL ?? ''
const describeDb = connectionString ? describe : describe.skip

describeDb('model catalog on isolated PostgreSQL', () => {
  let sql: Sql
  let database: PostgresJsDatabase<typeof schema>

  beforeAll(async () => {
    sql = postgres(connectionString, { max: 1 })
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`
    await sql`DROP SCHEMA public CASCADE`
    await sql`CREATE SCHEMA public`
    database = drizzle(sql, { schema })
    await migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), 'src/lib/db/migrations'),
    })
  })

  beforeEach(async () => {
    await sql`TRUNCATE model_aliases, model_catalog, model_settings CASCADE`
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('seeds 25 physical models plus Auto, idempotently', async () => {
    const first = await seedModelCatalogFromLegacy(database)
    const second = await seedModelCatalogFromLegacy(database)

    expect(first).toEqual({ catalogRows: 26, aliasRows: 2 })
    expect(second).toEqual({ catalogRows: 26, aliasRows: 2 })

    const rows = await database
      .select({ value: count() })
      .from(schema.modelCatalog)
    expect(rows[0]?.value).toBe(26)
  })

  it('keeps exact routes distinct and maps legacy aliases to one canonical row', async () => {
    await seedModelCatalogFromLegacy(database)

    const sol = await getEligibleModel('gpt-5.6-sol', database)
    const solByRoute = await getEligibleModel('cx/gpt-5.6-sol', database)
    const qwen = await getEligibleModel('qwen3.8-flash', database)
    const terra = await getEligibleModel('cx/gpt-5.6-terra', database)

    expect(sol?.id).toBe('cx/gpt-5.6-sol')
    expect(solByRoute?.id).toBe(sol?.id)
    expect(qwen?.id).toBe('bai/qwen3.8-flash')
    expect(sol?.routerModelId).not.toBe(terra?.routerModelId)
  })

  it('preserves disabled state and reason from an existing legacy setting', async () => {
    await database.insert(schema.modelSettings).values({
      modelId: 'gpt-5.6-sol',
      isActive: false,
      status: 'inactive',
      disabledReason: 'legacy maintenance',
    })
    await seedModelCatalogFromLegacy(database)

    const catalog = await getPublicCatalog(database)
    const sol = catalog.find((entry) => entry.id === 'cx/gpt-5.6-sol')
    expect(sol?.isActive).toBe(false)
    expect(sol?.disabledReason).toBe('legacy maintenance')
    expect(await getEligibleModel('gpt-5.6-sol', database)).toBeNull()
  })

  it('rejects retired, inactive, unknown and suffix-like ids before inference', async () => {
    await seedModelCatalogFromLegacy(database)
    await database
      .update(schema.modelSettings)
      .set({ status: 'retired', retiredAt: new Date(), isActive: false })
      .where(eq(schema.modelSettings.modelId, 'gh/gpt-4o'))

    for (const id of ['gh/gpt-4o', 'gpt-4o', 'cx/missing', 'sol', 'auto']) {
      expect(await getEligibleModel(id, database)).toBeNull()
    }
  })

  it('keeps retired labels for old conversations', async () => {
    await seedModelCatalogFromLegacy(database)
    await database
      .update(schema.modelSettings)
      .set({ status: 'retired', retiredAt: new Date(), isActive: false })
      .where(eq(schema.modelSettings.modelId, 'gh/gpt-4o'))

    const label = await findHistoricalModelLabel('gh/gpt-4o', database)
    expect(label).toMatchObject({
      id: 'gh/gpt-4o',
      displayName: 'GPT-4o',
      status: 'retired',
    })
  })

  it('resolves Auto only from eligible catalog candidates', async () => {
    await seedModelCatalogFromLegacy(database)
    const resolved = await resolveAutoForInference(
      { prompt: 'refactor this', credits: 100 },
      database,
    )
    expect(resolved?.routerModelId).toBe('cx/gpt-5.6-sol')
    expect(resolved?.cost).toBe(15)

    await database
      .update(schema.modelSettings)
      .set({ status: 'inactive', isActive: false })
    expect(
      await resolveAutoForInference(
        { prompt: 'refactor this', credits: 100 },
        database,
      ),
    ).toBeNull()
  })

  it('fails closed when the catalog is unavailable', async () => {
    const closedSql = postgres(connectionString, { max: 1 })
    const closedDatabase = drizzle(closedSql, { schema })
    await closedSql.end()

    await expect(getPublicCatalog(closedDatabase)).rejects.toThrow()
    await expect(
      getEligibleModel('cx/gpt-5.5', closedDatabase),
    ).rejects.toThrow()
  })
})
