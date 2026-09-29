import { candidateQuery, isExactMatch, searchCatalog } from "@/lib/jamendo";
import { type CandidateJudgment, jevConfigured, judgeCandidates, type Relation } from "@/lib/jev";
import type { MatchResult, PlaylistTrack } from "@/lib/types";

const CANDIDATE_LIMIT = 10;

/**
 * Find a downloadable catalog recording for a playlist track.
 *
 * 1. Search the catalog and keep only tracks whose artist allows downloads.
 * 2. Accept an identical normalized title and artist without asking a model.
 * 3. Otherwise, when Jev is configured, let it judge each candidate. Only a
 *    "same recording" judgment becomes a match; a remix, live take, or cover
 *    is returned as an alternate for the listener to check.
 */
export async function findCatalogMatch(source: Pick<PlaylistTrack, "title" | "artist">): Promise<MatchResult> {
  const candidates = (await searchCatalog(candidateQuery(source.title, source.artist), CANDIDATE_LIMIT))
    .filter((track) => track.downloadAllowed);
  if (!candidates.length) return { match: null };

  const exact = candidates.find((track) => isExactMatch(track, source.title, source.artist));
  if (exact) return { match: exact, method: "exact" };
  if (!jevConfigured()) return { match: null };

  try {
    return chooseMatch(await judgeCandidates(source, candidates));
  } catch (error) {
    // Jev is an enhancement: an outage should cost recall, not the whole import.
    console.warn("[opencrate] Jev match check failed; falling back to exact matches.", error);
    return { match: null };
  }
}

/** Turn Jev's per-candidate judgments into at most one match and one alternate. */
export function chooseMatch(judgments: CandidateJudgment[]): MatchResult {
  const strongest = (relation: Relation) => judgments
    .filter((judgment) => judgment.relation === relation)
    .sort((a, b) => b.score - a.score)[0];

  const same = strongest("same");
  if (same) return { match: same.track, method: "jev", confidence: same.confidence };

  const version = strongest("version");
  return { match: null, alternate: version?.track ?? null };
}
