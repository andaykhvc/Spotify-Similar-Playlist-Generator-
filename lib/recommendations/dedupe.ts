import type { RecommendationCandidate } from "@/lib/recommendations/types";
import type { NormalizedTrack } from "@/lib/spotify/types";

export function normalizeTrackText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\[(]\s*(?:feat(?:uring)?|ft)\.?\s+[^\])]+[\])]/gi, " ")
    .replace(/\s+(?:feat(?:uring)?|ft)\.?\s+.+$/gi, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function artistTitleKey(name: string, artists: string[]): string {
  return `${normalizeTrackText(artists[0] ?? "")}::${normalizeTrackText(name)}`;
}

function identityKeys(track: {
  spotifyId?: string | null;
  isrc?: string | null;
  name: string;
  artists: string[];
}): string[] {
  return [
    track.spotifyId ? `spotify:${track.spotifyId}` : null,
    track.isrc ? `isrc:${track.isrc.toUpperCase()}` : null,
    `text:${artistTitleKey(track.name, track.artists)}`,
  ].filter((key): key is string => key !== null);
}

export function excludeSourceAndDedupeCandidates(
  candidates: RecommendationCandidate[],
  sourceTracks: NormalizedTrack[],
): RecommendationCandidate[] {
  const sourceKeys = new Set(sourceTracks.flatMap(identityKeys));
  const candidateKeys = new Set<string>();
  const result: RecommendationCandidate[] = [];

  for (const candidate of candidates) {
    const keys = identityKeys(candidate);
    if (keys.some((key) => sourceKeys.has(key))) continue;
    if (keys.some((key) => candidateKeys.has(key))) continue;
    keys.forEach((key) => candidateKeys.add(key));
    result.push(candidate);
  }
  return result;
}

export function excludeSourceCandidates(
  candidates: RecommendationCandidate[],
  sourceTracks: NormalizedTrack[],
): RecommendationCandidate[] {
  const sourceKeys = new Set(sourceTracks.flatMap(identityKeys));
  return candidates.filter((candidate) =>
    identityKeys(candidate).every((key) => !sourceKeys.has(key)),
  );
}

export function candidateIdentity(candidate: RecommendationCandidate): string {
  if (candidate.spotifyId) return `spotify:${candidate.spotifyId}`;
  if (candidate.isrc) return `isrc:${candidate.isrc.toUpperCase()}`;
  return `text:${artistTitleKey(candidate.name, candidate.artists)}`;
}
