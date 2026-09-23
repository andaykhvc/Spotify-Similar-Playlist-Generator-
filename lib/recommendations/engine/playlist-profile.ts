import { buildConsensus } from "@/lib/recommendations/clustering/consensus";
import { adjustedRandIndex } from "@/lib/recommendations/clustering/metrics";
import { pairwiseMatrix, selectMedoidClusters, type ClusteringResult } from "@/lib/recommendations/clustering/medoids";
import { featureDistance } from "@/lib/recommendations/features/distance";
import { genreFamily } from "@/lib/recommendations/features/genre";
import { quantile } from "@/lib/recommendations/features/normalization";
import type { TrackFeatureRecord } from "@/lib/recommendations/features/types";
import type { ProviderName } from "@/lib/recommendations/types";

export interface TrackAssignment {
  spotifyId: string;
  reccoCluster: number | null;
  freqCluster: number | null;
  consensusCluster: number | null;
  confidence: number;
  coverage: "dual" | "recco" | "freqblog" | "none";
}

export interface ConsensusCluster {
  id: number;
  memberIndices: number[];
  weight: number;
  medoidIndices: number[];
  providerMedoidIndices: { reccobeats: number[]; freqblog: number[] };
  reccoRadius: number | null;
  freqRadius: number | null;
  providerAgreement: number;
  featureCoverage: number;
  medianTempo: number | null;
  tempoRange: [number, number] | null;
  medianEnergy: number | null;
  medianDanceability: number | null;
  medianValence: number | null;
  medianLoudness: number | null;
  dominantGenre: string | null;
  dominantMood: string | null;
  camelotDistribution: Record<string, number>;
  description: string;
}

export interface PlaylistProfile {
  records: TrackFeatureRecord[];
  assignments: TrackAssignment[];
  clusters: ConsensusCluster[];
  metrics: {
    reccoSilhouette: number | null;
    freqSilhouette: number | null;
    consensusSilhouette: number | null;
    adjustedRandIndex: number | null;
    dualCoverage: number;
    reccoOnlyCoverage: number;
    freqOnlyCoverage: number;
    unresolvedCoverage: number;
    averageConsensusConfidence: number;
  };
  mode: "seed" | "single-profile" | "consensus" | "single-provider";
}

interface ProviderPartition extends ClusteringResult { indices: number[]; byIndex: Map<number, number> }

function providerPartition(records: TrackFeatureRecord[], provider: ProviderName): ProviderPartition {
  const indices = records.map((record, index) => record[provider]?.coverage && record[provider]!.coverage >= 0.15 ? index : -1)
    .filter((index) => index >= 0);
  const matrix = pairwiseMatrix(indices, (a, b) =>
    featureDistance(records[a][provider], records[b][provider], provider).value ?? 1);
  const result = selectMedoidClusters(matrix);
  return {
    ...result, indices,
    byIndex: new Map(indices.map((index, at) => [index, result.labels[at]])),
  };
}

function sharedDistance(a: TrackFeatureRecord, b: TrackFeatureRecord): number {
  const available = [
    featureDistance(a.reccobeats, b.reccobeats, "reccobeats").value,
    featureDistance(a.freqblog, b.freqblog, "freqblog").value,
  ].filter((value): value is number => value !== null);
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : 1;
}

function nearestGroup(
  index: number,
  groups: number[][],
  matrix: number[][],
): { group: number; distance: number } | null {
  let best: { group: number; distance: number } | null = null;
  groups.forEach((members, group) => {
    const distances = members.map((other) => matrix[index][other]).filter((value) => value < 1);
    if (!distances.length) return;
    const distance = Math.min(...distances);
    if (!best || distance < best.distance) best = { group, distance };
  });
  return best;
}

function dominant(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  values.forEach((value) => { if (value) counts.set(value, (counts.get(value) ?? 0) + 1); });
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function median(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? quantile(present, 0.5) : null;
}

function clusterDescription(genre: string | null, energy: number | null, tempo: number | null, mood: string | null): string {
  const parts = [
    genre,
    energy === null ? null : energy >= 0.7 ? "yüksek enerjili" : energy <= 0.38 ? "düşük enerjili" : "orta enerjili",
    tempo === null ? null : `~${Math.round(tempo)} BPM`,
    mood,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Özellik verisi sınırlı";
}

function clusterRadius(
  records: TrackFeatureRecord[],
  members: number[],
  medoids: number[],
  provider: ProviderName,
): number | null {
  const distances = members.map((index) => medoids.map((medoid) =>
    featureDistance(records[index][provider], records[medoid][provider], provider).value)
    .filter((value): value is number => value !== null).sort((a, b) => a - b)[0])
    .filter((value): value is number => value !== undefined);
  const smallSampleFloor = members.length <= 3 ? 0.24 : members.length <= 7 ? 0.16 : 0.08;
  return distances.length ? Math.max(smallSampleFloor, quantile(distances, 0.75)) : null;
}

function providerMedoids(records: TrackFeatureRecord[], members: number[], provider: ProviderName): number[] {
  const available = members.filter((index) => records[index][provider] !== null);
  return available.map((index) => ({
    index,
    distance: available.reduce((sum, other) =>
      sum + (featureDistance(records[index][provider], records[other][provider], provider).value ?? 1), 0),
  })).sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, 3).map((item) => item.index);
}

export function buildPlaylistProfile(records: TrackFeatureRecord[]): PlaylistProfile {
  const sharedMatrix = pairwiseMatrix(records, sharedDistance);
  const recco = providerPartition(records, "reccobeats");
  const freq = providerPartition(records, "freqblog");
  const dual = records.map((record, index) => record.reccobeats && record.freqblog ? index : -1)
    .filter((index) => index >= 0 && recco.byIndex.has(index) && freq.byIndex.has(index));
  const consensus = dual.length >= 8
    ? buildConsensus(dual.map((index) => recco.byIndex.get(index)!), dual.map((index) => freq.byIndex.get(index)!))
    : null;
  const initialMembers: number[][] = [];
  const confidence = new Map<number, number>();
  if (consensus) {
    for (let group = 0; group < consensus.clusterCount; group += 1) initialMembers.push([]);
    dual.forEach((index, at) => {
      initialMembers[consensus.labels[at]].push(index);
      confidence.set(index, consensus.confidence[at]);
    });
  } else {
    const primary = recco.indices.length >= freq.indices.length ? recco : freq;
    if (records.length < 8 || primary.indices.length < 8) {
      const featured = records.map((record, index) => record.reccobeats || record.freqblog ? index : -1).filter((index) => index >= 0);
      if (featured.length) initialMembers.push(featured);
      featured.forEach((index) => confidence.set(index, records[index].reccobeats && records[index].freqblog ? 0.65 : 0.4));
    } else {
      for (let group = 0; group < primary.clusterCount; group += 1) initialMembers.push([]);
      primary.indices.forEach((index, at) => {
        initialMembers[primary.labels[at]].push(index);
        confidence.set(index, 0.45);
      });
    }
  }

  records.forEach((record, index) => {
    if (!record.reccobeats && !record.freqblog) return;
    if (initialMembers.some((members) => members.includes(index))) return;
    const nearest = nearestGroup(index, initialMembers, sharedMatrix);
    if (nearest) {
      initialMembers[nearest.group].push(index);
      confidence.set(index, Math.max(0.15, 0.45 * (1 - nearest.distance)));
    }
  });

  const membersByGroup = initialMembers.filter((members) => members.length > 0);
  const assignedCount = membersByGroup.reduce((sum, members) => sum + members.length, 0);
  const clusters = membersByGroup.map((members, id): ConsensusCluster => {
    const medoidIndices = [...members].map((index) => ({
      index,
      distance: members.reduce((sum, other) => sum + sharedMatrix[index][other], 0),
    })).sort((a, b) => a.distance - b.distance || a.index - b.index).slice(0, 5).map((item) => item.index);
    const providerMedoidIndices = {
      reccobeats: providerMedoids(records, members, "reccobeats"),
      freqblog: providerMedoids(records, members, "freqblog"),
    };
    const feature = members.map((index) => records[index].canonical);
    const medianTempo = median(feature.map((item) => item.tempo));
    const tempos = feature.map((item) => item.tempo).filter((value): value is number => value !== null);
    const dominantGenre = dominant(feature.map((item) => genreFamily(item.genre)));
    const dominantMood = dominant(feature.map((item) => item.mood));
    const camelotDistribution: Record<string, number> = {};
    feature.forEach((item) => { if (item.camelot) camelotDistribution[item.camelot] = (camelotDistribution[item.camelot] ?? 0) + 1; });
    const medianEnergy = median(feature.map((item) => item.energy));
    return {
      id, memberIndices: members, weight: members.length / Math.max(1, assignedCount),
      medoidIndices, providerMedoidIndices,
      reccoRadius: providerMedoidIndices.reccobeats.length
        ? clusterRadius(records, members, providerMedoidIndices.reccobeats, "reccobeats") : null,
      freqRadius: providerMedoidIndices.freqblog.length
        ? clusterRadius(records, members, providerMedoidIndices.freqblog, "freqblog") : null,
      providerAgreement: median(members.map((index) => confidence.get(index) ?? 0)) ?? 0,
      featureCoverage: median(members.map((index) => Math.max(records[index].confidence.reccobeats, records[index].confidence.freqblog))) ?? 0,
      medianTempo,
      tempoRange: tempos.length ? [quantile(tempos, 0.1), quantile(tempos, 0.9)] : null,
      medianEnergy,
      medianDanceability: median(feature.map((item) => item.danceability)),
      medianValence: median(feature.map((item) => item.valence)),
      medianLoudness: median(feature.map((item) => item.loudness)),
      dominantGenre, dominantMood, camelotDistribution,
      description: clusterDescription(dominantGenre, medianEnergy, medianTempo, dominantMood),
    };
  });
  const groupByIndex = new Map(clusters.flatMap((cluster) => cluster.memberIndices.map((index) => [index, cluster.id] as const)));
  const assignments = records.map((record, index): TrackAssignment => ({
    spotifyId: record.identity.spotifyId,
    reccoCluster: recco.byIndex.get(index) ?? null,
    freqCluster: freq.byIndex.get(index) ?? null,
    consensusCluster: groupByIndex.get(index) ?? null,
    confidence: confidence.get(index) ?? 0,
    coverage: record.reccobeats && record.freqblog ? "dual"
      : record.reccobeats ? "recco" : record.freqblog ? "freqblog" : "none",
  }));
  const count = Math.max(1, records.length);
  return {
    records, assignments, clusters,
    mode: records.length <= 3 ? "seed" : records.length <= 7 ? "single-profile"
      : consensus ? "consensus" : "single-provider",
    metrics: {
      reccoSilhouette: recco.indices.length >= 8 ? recco.silhouette : null,
      freqSilhouette: freq.indices.length >= 8 ? freq.silhouette : null,
      consensusSilhouette: consensus?.silhouette ?? null,
      adjustedRandIndex: dual.length >= 8 ? adjustedRandIndex(dual.map((index) => recco.byIndex.get(index)!), dual.map((index) => freq.byIndex.get(index)!)) : null,
      dualCoverage: assignments.filter((item) => item.coverage === "dual").length / count,
      reccoOnlyCoverage: assignments.filter((item) => item.coverage === "recco").length / count,
      freqOnlyCoverage: assignments.filter((item) => item.coverage === "freqblog").length / count,
      unresolvedCoverage: assignments.filter((item) => item.coverage === "none").length / count,
      averageConsensusConfidence: assignments.reduce((sum, item) => sum + item.confidence, 0) / count,
    },
  };
}
