import { RETRIEVAL } from "../config";

export interface RankedCandidate {
  chunkId: string;
  vectorRank: number | null;
  lexicalRank: number | null;
}

export interface FusedCandidate extends RankedCandidate {
  rrf: number;
}

/**
 * Reciprocal Rank Fusion.
 *
 * score = sum over arms of 1 / (k + rank)
 *
 * Fusing by *rank* rather than raw score is the whole point: cosine distance
 * and ts_rank_cd are on incomparable scales, so any weighted blend of the two
 * values would be arbitrary and would need re-tuning per corpus. Rank fusion
 * needs only k, and k = 60 is the value from the original paper.
 *
 * Exported separately from the SQL so the arithmetic can be unit-tested.
 */
export const fuse = (
  candidates: RankedCandidate[],
  // Annotated as `number` rather than inferred: RETRIEVAL is `as const`, so the
  // inferred parameter type would be the literal 60 and no other k would compile.
  k: number = RETRIEVAL.rrfK,
): FusedCandidate[] =>
  candidates
    .map((candidate) => ({
      ...candidate,
      rrf:
        (candidate.vectorRank === null ? 0 : 1 / (k + candidate.vectorRank)) +
        (candidate.lexicalRank === null ? 0 : 1 / (k + candidate.lexicalRank)),
    }))
    .sort((a, b) => b.rrf - a.rrf);
