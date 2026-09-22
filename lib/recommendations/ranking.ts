import { candidateIdentity, normalizeTrackText } from "@/lib/recommendations/dedupe";
import type {
  GeneratedRecommendation,
  MatchLabel,
  RankedCandidate,
  RecommendationCandidate,
} from "@/lib/recommendations/types";

export function rankCandidates(candidates: RecommendationCandidate[]): RankedCandidate[] {
  const groups = new Map<
    string,
    { best: RecommendationCandidate; providers: Set<string>; seedGroups: Set<string> }
  >();

  for (const candidate of candidates) {
    const key = candidateIdentity(candidate);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        best: candidate,
        providers: new Set([candidate.provider]),
        seedGroups: new Set([`${candidate.provider}:${candidate.seedGroupIndex}`]),
      });
      continue;
    }
    existing.providers.add(candidate.provider);
    existing.seedGroups.add(`${candidate.provider}:${candidate.seedGroupIndex}`);
    if (candidate.providerRank < existing.best.providerRank) existing.best = candidate;
    if ((candidate.providerScore ?? -Infinity) > (existing.best.providerScore ?? -Infinity)) {
      existing.best = { ...existing.best, providerScore: candidate.providerScore };
    }
  }

  return [...groups.values()]
    .map(({ best, providers, seedGroups }) => {
      const providerRankScore = Math.max(0, 60 - (best.providerRank - 1) * 1.5);
      const agreementBonus = Math.max(0, seedGroups.size - 1) * 10;
      const crossProviderBonus = Math.max(0, providers.size - 1) * 18;
      const providerScoreBonus = best.providerScore === null
        ? 0
        : Math.max(0, Math.min(1, (best.providerScore + 1) / 2)) * 12;
      return {
        ...best,
        providerCount: providers.size,
        seedGroupCount: seedGroups.size,
        rankScore: providerRankScore + agreementBonus + crossProviderBonus + providerScoreBonus,
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore || left.providerRank - right.providerRank);
}

export function enforceArtistDiversity<T extends { artists: string[] }>(
  tracks: T[],
  desiredCount: number,
  cap = Math.max(2, Math.ceil(desiredCount / 15)),
): T[] {
  const selected: T[] = [];
  const deferred: T[] = [];
  const counts = new Map<string, number>();

  for (const track of tracks) {
    const artist = normalizeTrackText(track.artists[0] ?? "unknown");
    if ((counts.get(artist) ?? 0) < cap) {
      selected.push(track);
      counts.set(artist, (counts.get(artist) ?? 0) + 1);
    } else {
      deferred.push(track);
    }
    if (selected.length === desiredCount) return selected;
  }

  for (const track of deferred) {
    selected.push(track);
    if (selected.length === desiredCount) break;
  }
  return selected;
}

export function matchLabelForIndex(index: number, total: number): MatchLabel {
  if (index < Math.max(1, Math.ceil(total * 0.3))) return "Strong match";
  if (index < Math.max(2, Math.ceil(total * 0.75))) return "Similar";
  return "Discovery";
}

export function labelAndLimitRecommendations(
  tracks: Omit<GeneratedRecommendation, "matchLabel">[],
  desiredCount: number,
): GeneratedRecommendation[] {
  const selected = enforceArtistDiversity(tracks, desiredCount);
  return selected.map((track, index) => ({
    ...track,
    matchLabel: matchLabelForIndex(index, selected.length),
  }));
}
