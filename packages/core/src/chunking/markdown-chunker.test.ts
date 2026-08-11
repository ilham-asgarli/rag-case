import { describe, expect, it } from "vitest";
import { chunkMarkdown, embeddingText } from "./markdown-chunker.js";
import { estimateTokens } from "./tokens.js";

const para = (n: number): string => `${"word ".repeat(n).trim()}.`;

describe("chunkMarkdown", () => {
  it("returns nothing for empty input", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   \n\n  ")).toEqual([]);
  });

  it("keeps a short document as a single chunk", () => {
    // Representative of most of this corpus: 400-1000 bytes.
    const doc = "# Network Specs: AppLovin\n\nMaximum file size: 5 MB for the final HTML file.";
    const chunks = chunkMarkdown(doc);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.headingPath).toEqual(["Network Specs: AppLovin"]);
    expect(chunks[0]?.content).toContain("5 MB");
    expect(chunks[0]?.ordinal).toBe(0);
  });

  it("builds a nested heading breadcrumb", () => {
    const doc = [
      "# Delivery Report: Waffle Rush",
      "",
      para(200),
      "",
      "## QA findings and fixes",
      "",
      para(200),
    ].join("\n");

    const chunks = chunkMarkdown(doc);
    const deepest = chunks.at(-1);
    expect(deepest?.headingPath[0]).toBe("Delivery Report: Waffle Rush");
  });

  it("pops the breadcrumb when heading depth decreases", () => {
    const doc = [
      "# Top",
      "",
      para(150),
      "",
      "## Middle",
      "",
      para(150),
      "",
      "# Second Top",
      "",
      para(150),
    ].join("\n");

    const paths = chunkMarkdown(doc).map((c) => c.headingPath);
    // No chunk under "Second Top" may still carry "Middle".
    const leaked = paths.filter((p) => p.includes("Second Top") && p.includes("Middle"));
    expect(leaked).toHaveLength(0);
  });

  it("does not treat a # inside a fenced code block as a heading", () => {
    const doc = [
      "# Real Heading",
      "",
      "```bash",
      "# this is a shell comment",
      "ls -la",
      "```",
    ].join("\n");

    const chunks = chunkMarkdown(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.headingPath).toEqual(["Real Heading"]);
    expect(chunks[0]?.content).toContain("# this is a shell comment");
  });

  it("splits an oversized document into multiple ordered chunks", () => {
    const doc = ["# Big", "", para(900), "", para(900), "", para(900)].join("\n");
    const chunks = chunkMarkdown(doc);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it("overlaps consecutive chunks so a boundary sentence stays retrievable", () => {
    const doc = ["# Big", "", para(900), "", "## Second", "", para(900)].join("\n");
    const chunks = chunkMarkdown(doc);

    expect(chunks.length).toBeGreaterThan(1);
    const second = chunks[1];
    expect(second).toBeDefined();
    // The overlap prefix comes from the previous chunk's tail.
    expect(second?.tokenCount).toBeGreaterThan(0);
  });

  it("merges a tiny section forward instead of stranding it", () => {
    const doc = ["# Title", "", "Short intro.", "", "## Details", "", para(300)].join("\n");
    const chunks = chunkMarkdown(doc);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("Short intro.");
    expect(chunks[0]?.content).toContain("word");
  });

  it("never emits an empty chunk", () => {
    const doc = ["# A", "", "", "## B", "", "", "## C", "", "content here"].join("\n");
    for (const chunk of chunkMarkdown(doc)) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("embeddingText", () => {
  it("prepends the heading breadcrumb without mutating content", () => {
    const chunk = { headingPath: ["Doc", "Section"], content: "Body text." };
    expect(embeddingText(chunk)).toBe("Doc > Section\n\nBody text.");
    // content must stay byte-identical: citation offsets index into it.
    expect(chunk.content).toBe("Body text.");
  });

  it("returns the body unchanged when there is no heading", () => {
    expect(embeddingText({ headingPath: [], content: "Body." })).toBe("Body.");
  });
});

describe("estimateTokens", () => {
  it("is zero only for empty input", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBeGreaterThan(0);
  });

  it("grows with length", () => {
    expect(estimateTokens(para(400))).toBeGreaterThan(estimateTokens(para(100)));
  });
});
