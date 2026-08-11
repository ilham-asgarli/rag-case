---
name: verify-case
description: Run the full end-to-end acceptance checklist for this RAG case study against the running app — retrieval accuracy, abstention, citation highlighting, role enforcement, incremental re-ingest, MCP over OAuth, and responsive layout. Use before reporting the project or any feature as finished.
disable-model-invocation: true
argument-hint: "[section-number]"
---

Run every check below against the running app unless a section number is given, in which case
run only that section. Report each as PASS or FAIL **with the evidence** — the response body, the
status code, the run counts. Never report PASS from reasoning alone.

Prerequisites: `docker compose up -d`, `pnpm db:migrate && pnpm db:seed`, `pnpm ingest`,
`pnpm dev`. Sign in as `admin@lumen.test` for admin checks.

## 1. Retrieval accuracy

Ask each question and confirm the answer cites the expected document:

| Question | Must cite |
| --- | --- |
| Maximum file size for an AppLovin playable, and how it ships | `network-specs-applovin.md` |
| How to initialize the current Lumen SDK, and what happened to `lumen.track` | `sdk-notes-v3.md` |
| Why sound assets are built in a separate pass | `build-pipeline.md` |
| What caused the March 2026 AppLovin rejections and what was fixed | `incident-postmortem-2026-03.md` |
| Languages every playable must ship with, and the fallback | `localization-guide.md` |

## 2. Deprecation handling

The SDK question must surface **both** `sdk-notes-v2.md` and `sdk-notes-v3.md` and state that v2
is deprecated. Citing only v3 is a partial pass; citing only v2 is a failure.

## 3. Abstention

Ask "What is the company vacation policy?". Required: an explicit statement that the corpus does
not cover it, **zero citations rendered**, and `abstained: true` on the `done` event. An invented
citation here fails the whole run.

## 4. Citation highlighting

Click a citation chip. The matching source card highlights the exact cited sentence, not the
whole chunk.

## 5. Authorization

Signed in as `user@lumen.test`: `/dashboard` redirects to `/chat`, and a direct request to an
admin API returns 403 — this proves the handler guard, not just the proxy.

```
curl -i -b "<user session cookie>" http://localhost:3000/api/admin/documents
```

## 6. Incremental re-ingest

Edit one file under `data/corpus`, run `pnpm ingest`, and confirm the run record reads
`updated: 1` with the rest unchanged. Delete a file, re-run, and confirm `removed: 1` and that it
no longer appears in search results. Restore the file afterwards.

## 7. MCP over OAuth

Connect MCP Inspector to `http://localhost:8787/mcp`, complete the OAuth flow against the web
app, and call `search_corpus`. Confirm ranked passages return and the call appears in dashboard
analytics with source `mcp`.

## 8. MCP without a token

```
curl -i http://localhost:8787/mcp
```

Must return `401` with a `WWW-Authenticate: Bearer` header containing `resource_metadata`.

## 9. Responsive layout

Check `/chat` and `/dashboard` at 375 px, 768 px, and 1440 px. On mobile the source panel is a
sheet and nothing overflows horizontally.

## Reporting

Summarize as a table of check → PASS/FAIL → evidence. List every FAIL with the smallest next
action. If anything failed, the feature is not done.
