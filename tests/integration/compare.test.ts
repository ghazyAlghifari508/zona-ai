/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "../../src/lib/db/index";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import {
  comparisonRuns,
  conversations,
  creditTransactions,
  generationRuns,
  messages,
  usageRecords,
  users,
} from "../../src/lib/db/schema";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: vi.fn((opts: Record<string, unknown>) => {
      const onFinish = opts.onFinish as ((o: unknown) => Promise<void>) | undefined;
      const onChunk = opts.onChunk as (() => void) | undefined;
      const fakeText = "Hello mocked compare";
      const fakeUsage = { inputTokens: 5, outputTokens: 10, totalTokens: 15 };
      if (onChunk) onChunk();
      if (onFinish) {
        setTimeout(() => {
          void onFinish({
            text: fakeText,
            usage: fakeUsage,
            finishReason: "stop",
            reasoningText: undefined,
          });
        }, 20);
      }
      const fakeStream = new ReadableStream({
        start(controller) {
          controller.enqueue("Hello mocked ");
          controller.enqueue("compare");
          controller.close();
        },
      });
      return {
        text: Promise.resolve(fakeText),
        stream: fakeStream,
        toUIMessageStreamResponse: (init?: { headers?: Record<string, string> }) => new Response(fakeText, { headers: init?.headers }),
        toTextStreamResponse: () => new Response(fakeText),
      };
    }),
  };
});

vi.mock("../../src/lib/auth/session", () => ({
  getAuthSession: vi.fn(async () => ({ user: { id: "compare-user", email: "compare@example.com" } })),
}));
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

const compareUserId = "compare-user";
describe("sendCompareMessage integration", () => {
  beforeEach(async () => {
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, compareUserId));
    await db.delete(usageRecords).where(eq(usageRecords.userId, compareUserId));
    const convs = await db.select().from(conversations).where(eq(conversations.userId, compareUserId));
    for (const c of convs) {
      await db.delete(generationRuns).where(eq(generationRuns.conversationId, c.id));
      await db.delete(comparisonRuns).where(eq(comparisonRuns.conversationId, c.id));
      await db.delete(messages).where(eq(messages.conversationId, c.id));
      await db.delete(conversations).where(eq(conversations.id, c.id));
    }
    await db.delete(users).where(eq(users.id, compareUserId));
    await db.insert(users).values({ id: compareUserId, email: "compare@example.com", name: "CompareUser", credits: 100 } as never);
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, compareUserId));
    await db.delete(usageRecords).where(eq(usageRecords.userId, compareUserId));
    const convs = await db.select().from(conversations).where(eq(conversations.userId, compareUserId));
    for (const c of convs) {
      await db.delete(generationRuns).where(eq(generationRuns.conversationId, c.id));
      await db.delete(comparisonRuns).where(eq(comparisonRuns.conversationId, c.id));
      await db.delete(messages).where(eq(messages.conversationId, c.id));
      await db.delete(conversations).where(eq(conversations.id, c.id));
    }
    await db.delete(users).where(eq(users.id, compareUserId));
  });

  it("deducts total 19 for 4+15 and creates comparison_runs", async () => {
    const { sendCompareMessageCore } = await import("../../src/server/functions/chat");
    const request = new Request("http://localhost:3000");
    const response = (await sendCompareMessageCore({
      data: { modelIds: ["gemini-3.7-flash-high", "gpt-5.6-sol"], content: "jelaskan AI", skillId: "none" },
      request,
    })) as unknown as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    await response.text().catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    const [user] = await db.select().from(users).where(eq(users.id, compareUserId));
    expect(user.credits).toBe(81);
    const comps = await db.select().from(comparisonRuns);
    expect(comps.length).toBeGreaterThan(0);
    const gens = await db.select().from(generationRuns).where(eq(generationRuns.conversationId, comps[0].conversationId));
    expect(gens.length).toBe(2);
    const txs = await db.select().from(creditTransactions).where(eq(creditTransactions.userId, compareUserId));
    expect(txs.filter((t) => t.type === "usage").length).toBe(2);
  });

  it("throws 402 if insufficient total", async () => {
    await db.update(users).set({ credits: 10 }).where(eq(users.id, compareUserId));
    const { sendCompareMessageCore } = await import("../../src/server/functions/chat");
    const request = new Request("http://localhost:3000");
    await expect(
      sendCompareMessageCore({
        data: { modelIds: ["gemini-3.7-flash-high", "gpt-5.6-sol"], content: "insufficient", skillId: "none" },
        request,
      }),
    ).rejects.toMatchObject({ status: 402 });
    const [user] = await db.select().from(users).where(eq(users.id, compareUserId));
    expect(user.credits).toBe(10);
    const comps = await db.select().from(comparisonRuns);
    expect(comps.length).toBe(0);
  });

  it("validates modelIds no auto and no dup", async () => {
    const { sendCompareMessageCore } = await import("../../src/server/functions/chat");
    const request = new Request("http://localhost:3000");
    await expect(
      sendCompareMessageCore({
        data: { modelIds: ["auto", "gemini-3.7-flash-high"], content: "hi", skillId: "none" } as never,
        request,
      }),
    ).rejects.toThrow();
    await expect(
      sendCompareMessageCore({
        data: { modelIds: ["gemini-3.7-flash-high", "gemini-3.7-flash-high"], content: "hi", skillId: "none" } as never,
        request,
      }),
    ).rejects.toThrow();
    await expect(
      sendCompareMessageCore({
        data: { modelIds: ["gemini-3.7-flash-high"], content: "hi", skillId: "none" } as never,
        request,
      }),
    ).rejects.toThrow();
  });
});
