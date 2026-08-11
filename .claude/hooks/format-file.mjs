#!/usr/bin/env node
/**
 * PostToolUse hook: formats a file with Biome immediately after Claude edits it.
 *
 * Written in Node rather than shell + jq so it behaves identically on Windows, macOS, and
 * Linux without asking a reviewer to install anything — Node is already a prerequisite here.
 *
 * Formatting is advisory: this hook always exits 0 so a Biome failure can never block an edit.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extname } from "node:path";

const FORMATTABLE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc", ".css"]);

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const filePath = await readStdin()
  .then((raw) => JSON.parse(raw).tool_input?.file_path)
  .catch(() => undefined);

if (!filePath || !existsSync(filePath) || !FORMATTABLE.has(extname(filePath))) {
  process.exit(0);
}

spawnSync("pnpm", ["exec", "biome", "check", "--write", "--no-errors-on-unmatched", filePath], {
  cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  shell: true,
  stdio: "ignore",
});

process.exit(0);
