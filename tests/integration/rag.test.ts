/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { db } from "../../src/lib/db/index";
import { sql } from "drizzle-orm";

describe("document_chunks schema", () => {
  it("has table with embedding vector", async () => {
    const r = await db.execute(
      sql`SELECT column_name, udt_name FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='embedding'`
    );
    const rows = Array.isArray(r) ? r : (r as unknown as { rows: unknown[] }).rows;
    expect(rows.length).toBe(1);
  });
  it("has HNSW index", async () => {
    const r = await db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE tablename='document_chunks' AND indexname LIKE '%hnsw%'`
    );
    const rows = Array.isArray(r) ? r : (r as unknown as { rows: unknown[] }).rows;
    expect(rows.length).toBe(1);
  });
});
