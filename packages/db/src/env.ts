import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads the repo-root `.env` for standalone scripts (migrate, seed, ingest).
 *
 * Next.js loads `.env` itself, so this is a no-op there — it only matters for
 * the CLI entry points, which have no framework doing it for them.
 */
export const loadRootEnv = (): void => {
  // packages/db/src -> repo root
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(import.meta.dirname, "../../../.env"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
};
