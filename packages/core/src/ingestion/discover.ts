import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix, resolve, sep } from "node:path";
import type { DocType } from "@rag/contracts";

export interface SourceDocument {
  /** POSIX-style, relative to the corpus root, on every platform. */
  path: string;
  absolutePath: string;
  title: string;
  docType: DocType;
  docDate: Date | null;
  content: string;
  contentHash: string;
  byteSize: number;
}

/** Directory name in the corpus root -> document category. */
const DOC_TYPE_BY_DIRECTORY: Record<string, DocType> = {
  "client-briefs": "client-brief",
  "meeting-notes": "meeting-note",
  "delivery-reports": "delivery-report",
  changelogs: "changelog",
  postmortems: "postmortem",
  guides: "guide",
};

const FILENAME_DATE = /(\d{4})-(\d{2})(?:-(\d{2}))?/;

/**
 * Dates are parsed as UTC. Using local time would shift a `2026-03` document
 * across a month boundary for anyone west of Greenwich.
 */
const parseDateFromPath = (relativePath: string): Date | null => {
  const match = FILENAME_DATE.exec(posix.basename(relativePath));
  if (!match?.[1] || !match[2]) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(Date.UTC(year, month - 1, day));
};

const classify = (relativePath: string): DocType => {
  const [first, ...rest] = relativePath.split("/");
  if (rest.length === 0 || !first) return "general";
  return DOC_TYPE_BY_DIRECTORY[first] ?? "general";
};

/** First ATX H1, falling back to a humanized filename. */
const extractTitle = (markdown: string, relativePath: string): string => {
  for (const line of markdown.split("\n", 40)) {
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match?.[1]) return match[1].trim();
  }
  return posix
    .basename(relativePath, ".md")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.isFile() && entry.name.endsWith(".md") ? [full] : [];
    }),
  );
  return files.flat();
};

/**
 * Reads every Markdown file under `corpusDir` and hashes its bytes.
 *
 * The hash is what makes re-ingest incremental: a document whose hash matches
 * the stored one is skipped without embedding it again. Hashing the raw bytes
 * (not the parsed content) means any edit at all is detected, and .gitattributes
 * pins line endings so the hash is stable across platforms.
 */
export const discoverDocuments = async (corpusDir: string): Promise<SourceDocument[]> => {
  const root = resolve(corpusDir);

  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(`Corpus directory not found: ${root}. Check CORPUS_DIR in .env.`);
  }

  const absolutePaths = await walk(root);

  return Promise.all(
    absolutePaths.map(async (absolutePath) => {
      const buffer = await readFile(absolutePath);
      const content = buffer.toString("utf8");
      const relativePath = absolutePath
        .slice(root.length + 1)
        .split(sep)
        .join("/");

      return {
        path: relativePath,
        absolutePath,
        title: extractTitle(content, relativePath),
        docType: classify(relativePath),
        docDate: parseDateFromPath(relativePath),
        content,
        contentHash: createHash("sha256").update(buffer).digest("hex"),
        byteSize: buffer.byteLength,
      } satisfies SourceDocument;
    }),
  );
};
