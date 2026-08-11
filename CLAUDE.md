@AGENTS.md

<!--
Authoring note for human reviewers.

This file follows Anthropic's guidance in code.claude.com/docs/en/memory and /best-practices:
kept well under the 200-line target, and containing only what Claude cannot derive by reading
the codebase. Directory maps, dependency lists, and architecture tours are deliberately absent —
Claude reads those from the source faster than it reads a description of them, and every line
here is a recurring per-session token cost that competes with the rules that matter.

The split is the one Anthropic documents:
  - a fact that is always true            -> AGENTS.md (imported above)
  - a fact scoped to part of the tree     -> .claude/rules/*.md, loaded on matching file access
  - a multi-step procedure                -> .claude/skills/*/SKILL.md, loaded on demand

AGENTS.md rather than CLAUDE.md holds the shared content so other agents (Codex, Cursor,
Copilot) read the same instructions, and because `next dev` maintains its own managed block in
that file. Claude Code does not read AGENTS.md natively, hence the import on line 1.

Block-level HTML comments are stripped before this file enters Claude's context, so this note is
visible on GitHub and costs zero tokens.
-->

## Rules that load themselves

Path-scoped rules in `.claude/rules/` attach when a matching file is opened, and cost nothing
until then:

| Rule | Applies to |
| --- | --- |
| `security.md` | API route handlers, server guards, the MCP server |
| `database.md` | `packages/db` |
| `retrieval.md` | Retrieval and RAG in `packages/core` |
| `frontend.md` | React components under `apps/web` |

## Skills

- `/verify-case` — the acceptance checklist. Run it before reporting any feature as working.
- `/rag-eval` — grade retrieval and abstention against the corpus's own sample questions.
- `/db-migrate` — generate, hand-patch, and apply a Drizzle migration.

## Working style

- Investigate with a subagent so exploration does not consume the main context window.
- Run the `security-reviewer` subagent over any diff touching a route handler, a guard, or
  `apps/mcp` before committing it.
- Prefer extending an existing module over adding a file. This repo has no `utils.ts` and should
  not grow one — a helper belongs beside the thing it serves.
