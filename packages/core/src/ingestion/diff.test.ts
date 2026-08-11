import { describe, expect, it } from "vitest";
import { type IndexedDocument, planIngestion } from "./diff";
import type { SourceDocument } from "./discover";

const src = (path: string, hash: string): SourceDocument => ({
  path,
  absolutePath: `/corpus/${path}`,
  title: path,
  docType: "general",
  docDate: null,
  content: "body",
  contentHash: hash,
  byteSize: 4,
});

const idx = (path: string, hash: string): IndexedDocument => ({
  id: `id-${path}`,
  path,
  contentHash: hash,
});

describe("planIngestion", () => {
  it("indexes everything on a first run", () => {
    const plan = planIngestion([src("a.md", "h1"), src("b.md", "h2")], []);

    expect(plan.added).toHaveLength(2);
    expect(plan.updated).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(0);
    expect(plan.removed).toHaveLength(0);
  });

  it("skips every document when nothing changed", () => {
    const source = [src("a.md", "h1"), src("b.md", "h2")];
    const indexed = [idx("a.md", "h1"), idx("b.md", "h2")];

    const plan = planIngestion(source, indexed);

    expect(plan.unchanged).toHaveLength(2);
    expect(plan.added).toHaveLength(0);
    expect(plan.updated).toHaveLength(0);
  });

  it("re-indexes only the document whose hash changed", () => {
    const source = [src("a.md", "h1-new"), src("b.md", "h2")];
    const indexed = [idx("a.md", "h1"), idx("b.md", "h2")];

    const plan = planIngestion(source, indexed);

    expect(plan.updated.map((d) => d.path)).toEqual(["a.md"]);
    expect(plan.unchanged.map((d) => d.path)).toEqual(["b.md"]);
  });

  it("reports a deleted file as removed", () => {
    const plan = planIngestion([src("a.md", "h1")], [idx("a.md", "h1"), idx("gone.md", "h9")]);

    expect(plan.removed.map((d) => d.path)).toEqual(["gone.md"]);
    expect(plan.unchanged.map((d) => d.path)).toEqual(["a.md"]);
  });

  it("treats everything as updated under force, without inventing additions", () => {
    const source = [src("a.md", "h1"), src("b.md", "h2")];
    const indexed = [idx("a.md", "h1"), idx("b.md", "h2")];

    const plan = planIngestion(source, indexed, { force: true });

    expect(plan.updated).toHaveLength(2);
    expect(plan.unchanged).toHaveLength(0);
    expect(plan.added).toHaveLength(0);
  });

  it("handles a rename as one addition plus one removal", () => {
    const plan = planIngestion([src("new.md", "same")], [idx("old.md", "same")]);

    expect(plan.added.map((d) => d.path)).toEqual(["new.md"]);
    expect(plan.removed.map((d) => d.path)).toEqual(["old.md"]);
  });

  it("partitions every source document exactly once", () => {
    const source = [src("a.md", "x"), src("b.md", "y"), src("c.md", "z")];
    const indexed = [idx("a.md", "x"), idx("b.md", "old")];

    const plan = planIngestion(source, indexed);
    const total = plan.added.length + plan.updated.length + plan.unchanged.length;

    expect(total).toBe(source.length);
  });
});
