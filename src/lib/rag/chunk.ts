export type Chunk = {
  content: string;
  index: number;
  metadata?: { startOffset: number; endOffset: number };
};

export function chunkText(
  text: string,
  opts: { chunkSize: number; overlap: number },
): Array<Chunk> {
  const { chunkSize, overlap } = opts;
  if (text.length <= chunkSize) {
    return [{ content: text, index: 0, metadata: { startOffset: 0, endOffset: text.length } }];
  }
  const chunks: Array<Chunk> = [];
  let start = 0;
  let idx = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastPeriod = slice.lastIndexOf(". ");
      if (lastPeriod > chunkSize * 0.5) {
        end = start + lastPeriod + 1;
      }
    }
    const content = text.slice(start, end).trim();
    if (content) {
      chunks.push({ content, index: idx++, metadata: { startOffset: start, endOffset: end } });
    }
    if (end >= text.length) {
      break;
    }
    start = end - overlap;
    // Guard against infinite loop if overlap >= chunkSize
    if (start < 0) start = 0;
    if (chunks.length > 10000) break;
  }
  return chunks;
}
