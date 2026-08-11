import { describe, expect, it } from "vitest";
import { fuse } from "./rrf";

describe("fuse (Reciprocal Rank Fusion)", () => {
  it("ranks a chunk found by both arms above one found by a single arm", () => {
    const [top] = fuse([
      { chunkId: "both", vectorRank: 3, lexicalRank: 3 },
      { chunkId: "vector-only", vectorRank: 1, lexicalRank: null },
    ]);

    // 2/63 > 1/61 — agreement across arms beats a better rank in one.
    expect(top?.chunkId).toBe("both");
  });

  it("scores a better rank higher within the same arm", () => {
    const fused = fuse([
      { chunkId: "second", vectorRank: 2, lexicalRank: null },
      { chunkId: "first", vectorRank: 1, lexicalRank: null },
    ]);

    expect(fused.map((c) => c.chunkId)).toEqual(["first", "second"]);
  });

  it("returns results sorted by descending score", () => {
    const fused = fuse([
      { chunkId: "c", vectorRank: 40, lexicalRank: null },
      { chunkId: "a", vectorRank: 1, lexicalRank: 1 },
      { chunkId: "b", vectorRank: 5, lexicalRank: null },
    ]);

    expect(fused.map((c) => c.chunkId)).toEqual(["a", "b", "c"]);
    for (let i = 1; i < fused.length; i++) {
      expect(fused[i - 1]?.rrf).toBeGreaterThanOrEqual(fused[i]?.rrf ?? 0);
    }
  });

  it("scores a chunk missing from both arms as zero", () => {
    const [only] = fuse([{ chunkId: "orphan", vectorRank: null, lexicalRank: null }]);
    expect(only?.rrf).toBe(0);
  });

  it("uses the documented formula", () => {
    const k = 60;
    const [result] = fuse([{ chunkId: "x", vectorRank: 1, lexicalRank: 2 }], k);
    expect(result?.rrf).toBeCloseTo(1 / 61 + 1 / 62, 12);
  });

  it("makes k control how sharply top ranks are favoured", () => {
    const candidates = [
      { chunkId: "rank1", vectorRank: 1, lexicalRank: null },
      { chunkId: "rank10", vectorRank: 10, lexicalRank: null },
    ];

    const gapSmallK = (fuse(candidates, 1)[0]?.rrf ?? 0) - (fuse(candidates, 1)[1]?.rrf ?? 0);
    const gapLargeK = (fuse(candidates, 60)[0]?.rrf ?? 0) - (fuse(candidates, 60)[1]?.rrf ?? 0);

    expect(gapSmallK).toBeGreaterThan(gapLargeK);
  });

  it("does not mutate its input", () => {
    const input = [{ chunkId: "a", vectorRank: 1, lexicalRank: null }];
    const snapshot = structuredClone(input);
    fuse(input);
    expect(input).toEqual(snapshot);
  });

  it("returns an empty array for no candidates", () => {
    expect(fuse([])).toEqual([]);
  });
});
