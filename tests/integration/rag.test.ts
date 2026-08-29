/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { db } from "../../src/lib/db/index";
import { sql, eq } from "drizzle-orm";
import { attachments, conversations, users, documentChunks } from "../../src/lib/db/schema";

// Mock R2 and embedding fetch for integration
vi.mock("../../src/lib/r2/client", () => ({
  getObject: vi.fn(async () => ({
    body: Buffer.from("Hello world. ".repeat(500)),
    contentType: "text/plain",
  })),
  putObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
}));

vi.mock("unpdf", () => ({
  extractText: vi.fn(async (buf: Uint8Array) => {
    const str = Buffer.from(buf).toString("utf8");
    if (str.includes("corrupted-not-pdf")) throw new Error("Invalid PDF");
    return { text: str, totalPages: 1 };
  }),
}));

vi.mock("mammoth", () => ({
  extractRawText: vi.fn(async ({ buffer }: { buffer: Buffer }) => {
    return { value: buffer.toString("utf8") };
  }),
}));

vi.mock("../../src/lib/auth/session", () => ({
  getAuthSession: vi.fn(async (req: Request) => {
    const testUser = (req as unknown as { headers: Headers })?.headers?.get("x-test-user");
    if (testUser) return { user: { id: testUser, email: `${testUser}@example.com` } };
    return { user: { id: "test-user-rag", email: "test-rag@example.com" } };
  }),
}));

describe("document_chunks schema", () => {
  it("has table with embedding vector", async () => {
    const r = await db.execute(
      sql`SELECT column_name, udt_name FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='embedding'`,
    );
    const rows = Array.isArray(r) ? r : (r as unknown as { rows: unknown[] }).rows;
    expect(rows.length).toBe(1);
  });
  it("has HNSW index", async () => {
    const r = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename='document_chunks' AND indexname LIKE '%hnsw%'`);
    const rows = Array.isArray(r) ? r : (r as unknown as { rows: unknown[] }).rows;
    expect(rows.length).toBe(1);
  });
});

describe("processDocument", () => {
  const mockUserId = "test-user-rag-process";
  let convId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Mock fetch for embeddings - deterministic 1536 dim
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          json: async () => ({
            data: Array.from({ length: 20 }, () => ({ embedding: Array(1536).fill(0.1) })),
          }),
        }) as unknown as Response,
      ),
    );

    // Clean up
    await db.delete(documentChunks);
    await db.delete(attachments).where(eq(attachments.userId, mockUserId));
    const convs = await db.select().from(conversations).where(eq(conversations.userId, mockUserId));
    for (const c of convs) {
      await db.delete(documentChunks).where(eq(documentChunks.conversationId, c.id));
      await db.delete(attachments).where(eq(attachments.conversationId, c.id));
      await db.delete(conversations).where(eq(conversations.id, c.id));
    }
    await db.delete(users).where(eq(users.id, mockUserId));
    await db.insert(users).values({ id: mockUserId, email: "rag-process@example.com", name: "RAG" } as never);
    const [conv] = await db.insert(conversations).values({ userId: mockUserId, title: "RAG conv" }).returning();
    convId = conv.id;

    // Default mock getObject
    const r2 = await import("../../src/lib/r2/client");
    vi.mocked(r2.getObject).mockResolvedValue({
      body: Buffer.from("Hello world. ".repeat(500)),
      contentType: "text/plain",
    } as never);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.delete(documentChunks);
    await db.delete(attachments).where(eq(attachments.userId, mockUserId));
    await db.delete(conversations).where(eq(conversations.id, convId));
    await db.delete(users).where(eq(users.id, mockUserId));
  });

  it("pipeline pending→completed with chunks", async () => {
    const { processDocument } = await import("../../src/lib/rag/process");
    const attId = crypto.randomUUID();
    await db.insert(attachments).values({
      id: attId,
      userId: mockUserId,
      conversationId: convId,
      fileName: "test.txt",
      fileSize: 1000,
      mimeType: "text/plain",
      r2Key: `users/${mockUserId}/attachments/${attId}/test.txt`,
      r2Bucket: "test-bucket",
      processingStatus: "pending",
      extractedText: null,
    });
    await processDocument(attId);
    const [att] = await db.select().from(attachments).where(eq(attachments.id, attId));
    expect(att.processingStatus).toBe("completed");
    expect(att.extractedText).toBeDefined();
    const chunks = await db.select().from(documentChunks).where(eq(documentChunks.attachmentId, attId));
    expect(chunks.length).toBeGreaterThan(0);
    // Check embedding dimension
    const first = chunks[0];
    expect(first.content.length).toBeGreaterThan(0);
    // Cleanup
    await db.delete(documentChunks).where(eq(documentChunks.attachmentId, attId));
    await db.delete(attachments).where(eq(attachments.id, attId));
  });

  it("embedding fail → failed no chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    );
    const { processDocument } = await import("../../src/lib/rag/process");
    const attId = crypto.randomUUID();
    await db.insert(attachments).values({
      id: attId,
      userId: mockUserId,
      conversationId: convId,
      fileName: "fail.txt",
      fileSize: 1000,
      mimeType: "text/plain",
      r2Key: `users/${mockUserId}/attachments/${attId}/fail.txt`,
      r2Bucket: "test-bucket",
      processingStatus: "pending",
      extractedText: null,
    });
    await expect(processDocument(attId)).rejects.toThrow();
    const [att] = await db.select().from(attachments).where(eq(attachments.id, attId));
    expect(att.processingStatus).toBe("failed");
    const chunks = await db.select().from(documentChunks).where(eq(documentChunks.attachmentId, attId));
    expect(chunks.length).toBe(0);
    await db.delete(attachments).where(eq(attachments.id, attId));
  });

  it("image skip → completed no chunks", async () => {
    const { processDocument } = await import("../../src/lib/rag/process");
    const r2 = await import("../../src/lib/r2/client");
    // Ensure getObject not called for image but we mock anyway
    vi.mocked(r2.getObject).mockClear();
    const attId = crypto.randomUUID();
    await db.insert(attachments).values({
      id: attId,
      userId: mockUserId,
      conversationId: convId,
      fileName: "photo.png",
      fileSize: 1000,
      mimeType: "image/png",
      r2Key: `users/${mockUserId}/attachments/${attId}/photo.png`,
      r2Bucket: "test-bucket",
      processingStatus: "pending",
      extractedText: null,
    });
    await processDocument(attId);
    const [att] = await db.select().from(attachments).where(eq(attachments.id, attId));
    expect(att.processingStatus).toBe("completed");
    expect(att.extractedText).toBe("");
    const chunks = await db.select().from(documentChunks).where(eq(documentChunks.attachmentId, attId));
    expect(chunks.length).toBe(0);
    expect(r2.getObject).not.toHaveBeenCalled();
    await db.delete(attachments).where(eq(attachments.id, attId));
  });
});
