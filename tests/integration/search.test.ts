/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { eq, sql } from "drizzle-orm"
import { db } from "../../src/lib/db/index"
import { webSources } from "../../src/lib/db/schema"

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

vi.mock("../../src/lib/auth/session", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { id: "test-user-search", email: "search@example.com" },
  })),
}))

describe("searchWeb standalone", () => {
  beforeEach(async () => {
    await db.delete(webSources)
  })

  it("returns 2 results no web_sources insert (standalone)", async () => {
    const mockResults = [
      {
        url: "https://example.com/article-1",
        title: "Understanding RAG Systems",
        content: "RAG combines retrieval...",
        score: 0.95,
      },
      {
        url: "https://example.com/article-2",
        title: "AI Model Comparison Guide",
        content: "Comparing...",
        score: 0.88,
      },
    ]
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: mockResults }),
      })) as unknown as typeof fetch,
    )
    const { searchWebCore } = await import("../../src/server/functions/search")
    const before = await db.select().from(webSources)
    const beforeCount = before.length
    const res = await searchWebCore({
      data: { query: "hello", searchDepth: "basic" },
      request: new Request("http://localhost:3000"),
    })
    expect(res.results.length).toBe(2)
    expect(res.results[0].score).toBe(0.95)
    const after = await db.select().from(webSources)
    expect(after.length).toBe(beforeCount)
  })

  it("handles Tavily fail graceful empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    )
    const { searchWebCore } = await import("../../src/server/functions/search")
    const res = await searchWebCore({
      data: { query: "fail", searchDepth: "basic" },
      request: new Request("http://localhost:3000"),
    })
    expect(res.results.length).toBe(0)
    const after = await db.select().from(webSources)
    expect(after.length).toBe(0)
  })
})
