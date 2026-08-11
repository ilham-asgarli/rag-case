import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Loads the repo-root `.env` for standalone entry points (migrate, seed,
 * ingest, drizzle-kit).
 *
 * Next.js loads `.env` itself, so this is a no-op there.
 *
 * `import.meta.dirname` is guarded because drizzle-kit bundles this config
 * before executing it, and the bundled form has no module directory — reading
 * it unguarded throws "paths[0] must be of type string".
 */
export const loadRootEnv = (): void => {
  const candidates: string[] = [];

  // Walk up from the working directory: covers being invoked from the repo
  // root, from packages/db, or from any other workspace package.
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth++) {
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
