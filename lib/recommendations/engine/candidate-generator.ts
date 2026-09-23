import { mapWithConcurrency } from "@/lib/recommendations/concurrency";
import { artistTitleKey, excludeSourceCandidates } from "@/lib/recommendations/dedupe";
import { allocateClusterQuotas } from "@/lib/recommendations/engine/allocation";
import type { PlaylistProfile } from "@/lib/recommendations/engine/playlist-profile";
import { quantile } from "@/lib/recommendations/features/normalization";
import type { ProviderFeatures } from "@/lib/recommendations/features/types";
import type { ConsensusStrictness } from "@/lib/recommendations/scoring/candidate-score";
import { runRecommendationProviders } from "@/lib/recommendations/providers";
import { ENGINE_LIMITS } from "@/lib/recommendations/recommendation-config";
import type { PlaylistLength, ProviderName, RankedCandidate, RecommendationCandidate, RecommendationProvider } from "@/lib/recommendations/types";

export interface CandidateEvidence extends RankedCandidate {
  generatedBy: ProviderName[];
  seedClusterIds: number[];
  seedTrackIds: string[];
  providerRanks: Partial<Record<ProviderName, number>>;
  sourceArtistCatalog: boolean;
}

function identityKeys(candidate: RecommendationCandidate): string[] {
  return [
    candidate.spotifyId ? `spotify:${candidate.spotifyId}` : null,
    candidate.isrc ? `isrc:${candidate.isrc.toUpperCase()}` : null,
    `text:${artistTitleKey(candidate.name, candidate.artists)}`,
  ].filter((value): value is string => Boolean(value));
}

export function unionCandidateEvidence(
  entries: { candidate: RecommendationCandidate; clusterId: number; seedTrackIds: string[] }[],
): CandidateEvidence[] {
  const union: CandidateEvidence[] = [];
  const keyToIndex = new Map<string, number>();
  for (const { candidate, clusterId, seedTrackIds } of entries) {
    const keys = identityKeys(candidate);
    const index = keys.map((key) => keyToIndex.get(key)).find((value) => value !== undefined);
    if (index === undefined) {
      const item: CandidateEvidence = {
        ...candidate,
        rankScore: 0,
        providerCount: 1,
        seedGroupCount: 1,
        generatedBy: [candidate.provider],
        seedClusterIds: [clusterId],
        seedTrackIds,
        providerRanks: { [candidate.provider]: candidate.providerRank },
        sourceArtistCatalog: candidate.origin === "source-artist",
      };
      const next = union.push(item) - 1;
      keys.forEach((key) => keyToIndex.set(key, next));
      continue;
    }
    const item = union[index];
    if (!item.generatedBy.includes(candidate.provider)) item.generatedBy.push(candidate.provider);
    if (!item.seedClusterIds.includes(clusterId)) item.seedClusterIds.push(clusterId);
    for (const id of seedTrackIds) if (!item.seedTrackIds.includes(id)) item.seedTrackIds.push(id);
    item.providerRanks[candidate.provider] = Math.min(item.providerRanks[candidate.provider] ?? Infinity, candidate.providerRank);
    item.sourceArtistCatalog ||= candidate.origin === "source-artist";
    if (!item.spotifyId && candidate.spotifyId) item.spotifyId = candidate.spotifyId;
    if (!item.isrc && candidate.isrc) item.isrc = candidate.isrc;
    item.providerCount = item.generatedBy.length;
    item.seedGroupCount = item.seedClusterIds.length;
    keys.forEach((key) => keyToIndex.set(key, index));
  }
  return union.map((candidate) => ({
    ...candidate,
    rankScore: 60 - Math.min(...Object.values(candidate.providerRanks)) +
      (candidate.generatedBy.length - 1) * 12 + (candidate.seedClusterIds.length - 1) * 5 +
      (candidate.sourceArtistCatalog ? 10 : 0),
  })).sort((a, b) => b.rankScore - a.rankScore || a.name.localeCompare(b.name));
}

export function capCandidatesAcrossClusters(candidates: CandidateEvidence[], clusterCount: number, limit: number): CandidateEvidence[] {
  if (candidates.length <= limit) return candidates;
  const selected: CandidateEvidence[] = [];
  const seen = new Set<CandidateEvidence>();
  const minimumPerCluster = Math.floor((limit * 2) / Math.max(1, clusterCount * 3));
  for (let clusterId = 0; clusterId < clusterCount; clusterId += 1) {
    let count = 0;
    for (const candidate of candidates) {
      if (count >= minimumPerCluster || selected.length >= limit) break;
      if (!seen.has(candidate) && candidate.seedClusterIds.includes(clusterId)) {
        selected.push(candidate);
        seen.add(candidate);
        count += 1;
      }
    }
  }
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (!seen.has(candidate)) selected.push(candidate);
  }
  return selected;
}

function reccoMedian(
  profile: PlaylistProfile, members: number[], field: keyof Pick<ProviderFeatures,
    "tempo" | "energy" | "danceability" | "valence" | "acousticness" | "instrumentalness" | "speechiness">,
): number | null {
  const values = members.flatMap((index) => {
    const value = profile.records[index].reccobeats?.raw[field];
    return typeof value === "number" ? [value] : [];
  });
  return values.length ? quantile(values, 0.5) : null;
}

export async function generateClusterCandidates(
  profile: PlaylistProfile,
  providers: RecommendationProvider[],
  desiredCount: PlaylistLength,
  generationVariant: number,
  strictness: ConsensusStrictness = "strict",
): Promise<{
  candidates: CandidateEvidence[];
  successes: ProviderName[];
  failures: { provider: string; status: number; retryAfterSeconds: number | null }[];
}> {
  const quotas = allocateClusterQuotas(profile.clusters.map((cluster) => cluster.weight), desiredCount);
  const sourceArtistLimit = providers.some((provider) => provider.name === "freqblog")
    ? 1 : Math.min(3, Math.max(1, Math.floor(12 / profile.clusters.length)));
  const results = await mapWithConcurrency(profile.clusters, 2, async (cluster) => {
    const representatives = cluster.medoidIndices.map((index) => profile.records[index].identity);
    const rotation = representatives.length ? generationVariant % representatives.length : 0;
    const seeds = [...representatives.slice(rotation), ...representatives.slice(0, rotation)]
      .slice(0, Math.min(5, Math.max(1, representatives.length > 3 ? representatives.length - 1 : representatives.length)));
    const candidateLimit = Math.min(40, Math.max(12, (quotas[cluster.id] ?? 1) * 3 + generationVariant % 3 * 3));
    const result = await runRecommendationProviders(providers, {
      seedGroups: [seeds], desiredCount, generationVariant, candidateLimit,
      strictness,
      includeSourceArtistCatalog: true,
      sourceArtistLimit,
      featureTargets: {
        tempo: reccoMedian(profile, cluster.memberIndices, "tempo"),
        energy: reccoMedian(profile, cluster.memberIndices, "energy"),
        danceability: reccoMedian(profile, cluster.memberIndices, "danceability"),
        valence: reccoMedian(profile, cluster.memberIndices, "valence"),
        acousticness: reccoMedian(profile, cluster.memberIndices, "acousticness"),
        instrumentalness: reccoMedian(profile, cluster.memberIndices, "instrumentalness"),
        speechiness: reccoMedian(profile, cluster.memberIndices, "speechiness"),
      },
    });
    return { clusterId: cluster.id, seeds, result };
  });
  const entries = results.flatMap(({ clusterId, seeds, result }) =>
    excludeSourceCandidates(result.candidates, profile.records.map((record) => record.identity))
      .map((candidate) => ({ candidate, clusterId, seedTrackIds: seeds.map((seed) => seed.spotifyId) })));
  const candidates = capCandidatesAcrossClusters(
    unionCandidateEvidence(entries), profile.clusters.length, ENGINE_LIMITS.maxCandidates,
  );
  return {
    candidates,
    successes: [...new Set(results.flatMap((item) => item.result.successes))] as ProviderName[],
    failures: results.flatMap((item) => item.result.failures),
  };
}
