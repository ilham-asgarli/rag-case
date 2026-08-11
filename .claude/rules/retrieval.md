---
paths:
  - "packages/core/src/retrieval/**"
  - "packages/core/src/rag/**"
  - "packages/core/src/chunking/**"
---

# Retrieval and RAG rules

## Fusion

- Fuse by **rank**, never by raw score. Cosine distance and `ts_rank_cd` are not on comparable
  scales, so any weighted blend of the two values is meaningless.
- The tuned constants are: RRF `k = 60`, 40 candidates per arm, 20 fused, reranked to 6.
  Changing one changes answer quality — say why in the commit message.
- Both arms run in a single SQL statement. Do not split them into two round trips and merge in
  TypeScript; the fusion belongs where the ranks are produced.

## Embeddings

`input_type: "query"` when searching, `input_type: "document"` when indexing. Getting this
backwards raises no error and quietly costs recall.

## Chunking

The heading path is prepended to the text that gets **embedded**, and stored separately from
`content`. Citations quote `content` only, so the two must not be merged into one field.

## Citations

- Send one Anthropic `document` block per retrieved chunk, in retrieval order. A citation's
  `document_index` indexes that array — if the array and the block order ever diverge, every
  citation points at the wrong source, silently.
- `start_char_index` / `end_char_index` are offsets into `chunk.content` **exactly as sent**. Do
  not trim, normalize whitespace, or re-wrap the text between sending it and highlighting it.
- Citations cannot be combined with `output_config.format`; that request returns 400.

## Abstention

Zero citations in a completed response means `abstained: true`. This is the grounding check, so:

- Never post-process an abstained response into an answer.
- Never relax the grounding prompt to make an abstention go away. If the corpus does contain the
  answer, the defect is in retrieval — fix ranking, not the prompt.

## Verifying a change

Run `/rag-eval` after touching anything in these directories. A ranking change that improves one
sample question and breaks another is not an improvement.
