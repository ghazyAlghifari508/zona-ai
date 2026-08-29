/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest"
import { sql } from "drizzle-orm"
import { db } from "../../src/lib/db/index"

describe("web_sources schema", () => {
  it("has web_sources table with required columns", async () => {
    const r = await db.execute(
      sql`SELECT to_regclass('public.web_sources') as cls`,
    )
    const rows = Array.isArray(r)
      ? (r as unknown as Array<{ cls: string | null }>)
      : (r as { rows: Array<{ cls: string | null }> }).rows
    const val = (rows[0] as { cls: string | null }).cls
    expect(val).toBe("web_sources")

    const cols = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name='web_sources'`,
    )
    const colRows = Array.isArray(cols)
      ? (cols as unknown as Array<{ column_name: string }>)
      : (cols as { rows: Array<{ column_name: string }> }).rows
    const names = colRows.map((c) => c.column_name)
    expect(names).toContain("generation_run_id")
    expect(names).toContain("conversation_id")
    expect(names).toContain("position")
    expect(names).toContain("score")
  })
})
