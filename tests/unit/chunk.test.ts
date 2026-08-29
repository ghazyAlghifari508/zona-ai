/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { chunkText } from "../../src/lib/rag/chunk";

describe("chunk", () => {
  it("splits 2000 chars into 3 chunks with overlap 200", () => {
    const text = "a".repeat(2000);
    const chunks = chunkText(text, { chunkSize: 1000, overlap: 200 });
    expect(chunks.length).toBe(3);
    expect(chunks[0].content.slice(-200)).toBe(chunks[1].content.slice(0, 200));
  });

  it("splits repeating pattern maintains overlap via metadata", () => {
    const text = "a ".repeat(1000);
    const chunks = chunkText(text, { chunkSize: 1000, overlap: 200 });
    expect(chunks.length).toBe(3);
    // Verify via metadata offsets, since trim affects string slice comparison
    expect(chunks[1].metadata!.startOffset).toBe(chunks[0].metadata!.endOffset - 200);
    expect(chunks[2].metadata!.startOffset).toBe(chunks[1].metadata!.endOffset - 200);
  });

  it("preserves sentence boundary if possible", () => {
    const text = "Hello world. This is test. Another sentence. ".repeat(100);
    const chunks = chunkText(text, { chunkSize: 100, overlap: 20 });
    expect(chunks[0].content).toContain("Hello world.");
  });

  it("handles short text single chunk", () => {
    const text = "short";
    const chunks = chunkText(text, { chunkSize: 1000, overlap: 200 });
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe("short");
    expect(chunks[0].index).toBe(0);
  });

  it("includes metadata offsets", () => {
    const text = "a ".repeat(500) + ". ";
    const chunks = chunkText(text, { chunkSize: 100, overlap: 20 });
    expect(chunks[0].metadata).toBeDefined();
    expect(chunks[0].metadata.startOffset).toBe(0);
  });
});
