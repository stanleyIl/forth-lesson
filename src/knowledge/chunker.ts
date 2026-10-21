export type ChunkStrategy = "auto" | "separator" | "markdown_heading";
export type TextChunk = { text: string; index: number; startOffset: number; endOffset: number };

function autoChunks(text: string, maxChars: number, overlapChars: number, baseOffset = 0): TextChunk[] {
  const chunks: TextChunk[] = [];
  if (!text.trim()) return chunks;
  const step = Math.max(1, maxChars - overlapChars);
  for (let start = 0; start < text.length; start += step) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf("。", end), text.lastIndexOf(". ", end));
      if (boundary > start + Math.floor(maxChars * 0.6)) end = boundary + 1;
    }
    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    if (raw.trim()) chunks.push({ text: raw.trim(), index: chunks.length, startOffset: baseOffset + start + leading, endOffset: baseOffset + end - trailing });
    if (end >= text.length) break;
  }
  return chunks;
}

function separatorChunks(text: string, separator: string): TextChunk[] {
  if (!separator || separator.length > 20) throw new Error("Invalid chunk separator");
  const chunks: TextChunk[] = [];
  let cursor = 0;
  for (const segment of text.split(separator)) {
    const located = text.indexOf(segment, cursor);
    const leading = segment.length - segment.trimStart().length;
    const trailing = segment.length - segment.trimEnd().length;
    if (segment.trim()) chunks.push({ text: segment.trim(), index: chunks.length, startOffset: located + leading, endOffset: located + segment.length - trailing });
    cursor = located + segment.length + separator.length;
  }
  return chunks;
}

function markdownChunks(text: string, maxChars: number, overlapChars: number): TextChunk[] {
  const heading = /^#{1,3}\s+.+$/gm;
  const starts: number[] = [];
  for (const match of text.matchAll(heading)) starts.push(match.index ?? 0);
  if (!starts.length) return autoChunks(text, maxChars, overlapChars);
  if (starts[0] !== 0) starts.unshift(0);
  starts.push(text.length);
  const chunks: TextChunk[] = [];
  for (let index = 0; index < starts.length - 1; index += 1) {
    const start = starts[index]; const end = starts[index + 1];
    for (const chunk of autoChunks(text.slice(start, end), maxChars, overlapChars, start)) chunks.push({ ...chunk, index: chunks.length });
  }
  return chunks;
}

export function chunkText(input: { text: string; strategy: ChunkStrategy; maxChars: number; overlapChars: number; separator?: string }): TextChunk[] {
  if (input.strategy === "separator") return separatorChunks(input.text, input.separator ?? "\n\n");
  if (input.strategy === "markdown_heading") return markdownChunks(input.text, input.maxChars, input.overlapChars);
  return autoChunks(input.text, input.maxChars, input.overlapChars);
}
