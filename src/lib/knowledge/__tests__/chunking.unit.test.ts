import { chunkContent, estimateTokenCount } from "../chunking";

const words = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");

describe("paragraph-aware chunking", () => {
  it("prefers a paragraph boundary while keeping 400-600 token chunks", () => {
    const firstParagraph = words("alpha", 450);
    const secondParagraph = words("beta", 450);
    const content = `${firstParagraph}\n\n${secondParagraph}`;
    const chunks = chunkContent("version-1", content);

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.tokenCount)).toEqual([450, 450]);
    expect(chunks[0].content).toBe(firstParagraph);
    expect(chunks[1].content).toBe(secondParagraph);
    expect(chunks[1].startOffset).toBe(firstParagraph.length + 2);
  });

  it("splits long paragraphs deterministically and preserves source offsets", () => {
    const content = words("token", 1_250);
    const first = chunkContent("version-1", content);
    const retry = chunkContent("version-1", content);

    expect(first).toEqual(retry);
    expect(first).toHaveLength(3);
    expect(first.every((chunk) => chunk.tokenCount >= 400 && chunk.tokenCount <= 600)).toBe(true);
    for (const chunk of first) {
      expect(content.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
      expect(estimateTokenCount(chunk.content)).toBe(chunk.tokenCount);
      expect(chunk.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(chunk.id).toMatch(/^chk_[0-9a-f]{32}$/);
    }
  });

  it("keeps short content in one addressable chunk and ignores whitespace-only input", () => {
    expect(chunkContent("version-1", "A short source.")).toEqual([
      expect.objectContaining({ ordinal: 0, content: "A short source.", tokenCount: 4 }),
    ]);
    expect(chunkContent("version-1", " \n\t ")).toEqual([]);
  });

  it("changes stable chunk IDs when the immutable content version changes", () => {
    const content = words("token", 500);
    expect(chunkContent("version-1", content)[0].id).not.toBe(
      chunkContent("version-2", content)[0].id
    );
  });

  it("reports offsets that remain exact for UTF-16 source text", () => {
    const content = `Intro 🚀 paragraph.\n\n${words("grounded", 450)}`;
    for (const chunk of chunkContent("version-emoji", content)) {
      expect(content.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
    }
  });

  it("rejects incoherent token windows", () => {
    expect(() => chunkContent("version-1", "content", { minTokens: 5, maxTokens: 4 })).toThrow(
      /min <= target <= max/
    );
  });
});
