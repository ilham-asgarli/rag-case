import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

/**
 * Finds the monorepo root by walking up from the working directory looking for
 * the pnpm workspace file.
 *
 * Entry points run from different directories — `next build` from `apps/web`,
 * the ingest CLI from `tools/ingest`, scripts from the root — so anything
 * configured as a repo-relative path has to be anchored here rather than to
 * `process.cwd()`.
 */
export const findRepoRoot = (): string | undefined => {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
};

/**
 * Resolves a possibly-relative path against the repo root.
 *
 * `CORPUS_DIR="./data/corpus"` in `.env` means "relative to the repository",
 * not "relative to whichever package happens to be running".
 */
export const resolveFromRepoRoot = (path: string): string => {
  if (isAbsolute(path)) return path;
  const root = findRepoRoot();
  return root ? resolve(root, path) : resolve(path);
};

/**
 * Loads the repo-root `.env` for standalone entry points (migrate, seed,
 * ingest, drizzle-kit) and for the Next.js app, which looks for `.env` in the
 * app directory rather than the monorepo root.
 *
 * `import.meta.dirname` is guarded because drizzle-kit bundles this module
 * before executing it, and the bundled form has no module directory — reading
 * it unguarded throws "paths[0] must be of type string".
 */
export const loadRootEnv = (): void => {
  const candidates: string[] = [];

  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    candidates.push(resolve(dir, ".env"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const moduleDir = import.meta.dirname as string | undefined;
  if (typeof moduleDir === "string") {
    candidates.push(resolve(moduleDir, "../../../.env"));
  }

  for (const path of candidates) {
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
};
