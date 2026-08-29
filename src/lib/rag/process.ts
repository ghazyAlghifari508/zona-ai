if (typeof window !== "undefined") {
  throw new Error("src/lib/rag/process.ts is server-only");
}

import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { attachments, documentChunks } from "../db/schema";
import { RAG_CHUNK_OVERLAP, RAG_CHUNK_SIZE } from "../utils/constants";
import { chunkText } from "./chunk";
import { embedTexts } from "./embed";
import { extractText } from "./extract";

export async function processDocument(attachmentId: string): Promise<void> {
  const [att] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  if (!att) return;

  await db.update(attachments).set({ processingStatus: "processing" }).where(eq(attachments.id, attachmentId));

  try {
    const text = await extractText({ r2Key: att.r2Key, mimeType: att.mimeType });

    if (!text) {
      await db
        .update(attachments)
        .set({ processingStatus: "completed", extractedText: "" })
        .where(eq(attachments.id, attachmentId));
      return;
    }

    const chunks = chunkText(text, { chunkSize: RAG_CHUNK_SIZE, overlap: RAG_CHUNK_OVERLAP });
    if (chunks.length === 0) {
      await db
        .update(attachments)
        .set({ processingStatus: "completed", extractedText: text.slice(0, 10000) })
        .where(eq(attachments.id, attachmentId));
      return;
    }

    const vectors = await embedTexts(chunks.map((c) => c.content));

    // Insert chunks
    await db.insert(documentChunks).values(
      chunks.map((c, i) => ({
        attachmentId,
        conversationId: att.conversationId,
        chunkIndex: c.index,
        content: c.content.replace(/\x00/g, ""),
        embedding: vectors[i] as unknown as never,
        metadata: c.metadata as unknown as never,
      })),
    );

    await db
      .update(attachments)
      .set({ processingStatus: "completed", extractedText: text.slice(0, 10000) })
      .where(eq(attachments.id, attachmentId));
  } catch (e: unknown) {
    await db.update(attachments).set({ processingStatus: "failed" }).where(eq(attachments.id, attachmentId));
    await db.delete(documentChunks).where(eq(documentChunks.attachmentId, attachmentId));
    throw e;
  }
}

export async function reprocessAttachment(attachmentId: string): Promise<void> {
  await processDocument(attachmentId);
}
