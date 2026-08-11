---
name: rag-eval
description: Grade retrieval and abstention quality against the corpus's sample questions by calling the running search and chat APIs. Use after changing chunking, ranking, fusion constants, reranking, the query rewriter, or the grounding prompt, to check whether the change actually helped.
argument-hint: "[question-index]"
---

A ranking change that fixes one question and breaks another is not an improvement. This measures
both directions before and after.

Requires the app running (`pnpm dev`) and the corpus ingested.

## Probes

**In-corpus** — each must retrieve its expected document in the top 3 and cite it in the answer:

| # | Query | Expected document |
| --- | --- | --- |
| 1 | maximum file size for an AppLovin playable | `network-specs-applovin.md` |
| 2 | how do I initialize the current Lumen SDK | `sdk-notes-v3.md` |
| 3 | why are sound assets built in a separate pass | `build-pipeline.md` |
| 4 | what caused the March 2026 AppLovin rejections | `incident-postmortem-2026-03.md` |
| 5 | which languages must every playable ship with | `localization-guide.md` |

**Out-of-corpus** — each must abstain with zero citations:

- what is the vacation policy
- how much do developers get paid
- who is the CEO of Lumen Playables

## Procedure

1. For each in-corpus probe, `POST /api/search` and record the rank of the expected document and
   the top reranked score.
2. For each probe, `POST /api/chat` and record the cited document paths and `abstained`.
3. For each out-of-corpus probe, record `abstained` and the citation count.

## Report

One table: probe → expected → rank → cited → verdict. Then three numbers:

- **Recall@3** across the five in-corpus probes
- **Citation accuracy** — answers citing the expected document / 5
- **Abstain accuracy** — out-of-corpus probes correctly abstaining / 3

When comparing against a previous run, show both columns and call out every regression
explicitly, including ones that keep the aggregate flat. State plainly whether the change should
be kept.
