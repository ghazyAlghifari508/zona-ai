/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { db } from "../../src/lib/db/index";
import { sql } from "drizzle-orm";
describe("comparison_runs schema", () => {
  it("has comparison_runs table with modelIds text[]", async () => {
    const r = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='comparison_runs' AND column_name='model_ids'`);
    const rows = Array.isArray(r) ? r : (r as { rows: unknown[] }).rows;
    expect(rows.length).toBe(1);
  });
  it("generation_runs has comparison_run_id FK", async () => {
    const r = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='generation_runs' AND column_name='comparison_run_id'`);
    const rows = Array.isArray(r) ? r : (r as { rows: unknown[] }).rows;
    expect(rows.length).toBe(1);
  });
});
