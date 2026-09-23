import { featureDistance } from "@/lib/recommendations/features/distance";
import { genreDistance } from "@/lib/recommendations/features/genre";
import { normalizeProviderFeatures, type ProviderScales } from "@/lib/recommendations/features/normalization";
import type { ProviderFeatures, ProviderFeatureView } from "@/lib/recommendations/features/types";
import type { CandidateEvidence } from "@/lib/recommendations/engine/candidate-generator";
import type { ConsensusCluster, PlaylistProfile } from "@/lib/recommendations/engine/playlist-profile";
import { RANKING_WEIGHTS, STRICTNESS } from "@/lib/recommendations/recommendation-config";
import type { ProviderName } from "@/lib/recommendations/types";
import type { NormalizedTrack } from "@/lib/spotify/types";

export type ConsensusStrictness = keyof typeof STRICTNESS;

export interface CandidateScoreComponents {
  clusterFit: number;
  providerAgreement: number;
  generationEvidence: number;
  genreFit: number;
  moodFit: number;
  harmonicFit: number;
}

export interface CandidateEvaluation {
  track: NormalizedTrack;
  candidate: CandidateEvidence;
  clusterId: number;
  reccoDistance: number | null;
  freqDistance: number | null;
  reccoRadiusRatio: number | null;
  freqRadiusRatio: number | null;
  score: number;
  components: CandidateScoreComponents;
  accepted: boolean;
  rejectionReason: string | null;
  reasons: string[];
  singleView: boolean;
}

function nearestMedoid(
  candidate: ProviderFeatureView | null,
  cluster: ConsensusCluster,
  profile: PlaylistProfile,
  provider: ProviderName,
): { distance: number | null; components: ReturnType<typeof featureDistance>["components"] } {
  const matches = cluster.providerMedoidIndices[provider]
    .map((index) => featureDistance(candidate, profile.records[index][provider], provider))
    .filter((result) => result.value !== null)
    .sort((a, b) => a.value! - b.value!);
  return { distance: matches[0]?.value ?? null, components: matches[0]?.components ?? {} };
}

export function scoreCandidateForCluster(
  track: NormalizedTrack,
  candidate: CandidateEvidence,
  rawRecco: ProviderFeatures | null,
  rawFreq: ProviderFeatures | null,
  scales: { reccobeats: ProviderScales; freqblog: ProviderScales },
  profile: PlaylistProfile,
  cluster: ConsensusCluster,
  strictness: ConsensusStrictness,
): CandidateEvaluation {
  const recco = rawRecco ? normalizeProviderFeatures(rawRecco, scales.reccobeats) : null;
  const freq = rawFreq ? normalizeProviderFeatures(rawFreq, scales.freqblog) : null;
  const reccoFit = nearestMedoid(recco, cluster, profile, "reccobeats");
  const freqFit = nearestMedoid(freq, cluster, profile, "freqblog");
  const reccoRadiusRatio = reccoFit.distance === null || cluster.reccoRadius === null
    ? null : reccoFit.distance / cluster.reccoRadius;
  const freqRadiusRatio = freqFit.distance === null || cluster.freqRadius === null
    ? null : freqFit.distance / cluster.freqRadius;
  const ratios = [reccoRadiusRatio, freqRadiusRatio].filter((value): value is number => value !== null);
  const singleView = ratios.length === 1;
  const thresholds = STRICTNESS[strictness];
  const maxRatio = singleView ? thresholds.oneRadius : thresholds.bothRadius;
  const accepted = ratios.length > 0 && ratios.every((value) => value <= maxRatio);
  const rejectionReason = ratios.length === 0 ? "no comparable feature view"
    : accepted ? null : "outside source cluster radius";
  const ratioMean = ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : Infinity;
  const clusterFit = Number.isFinite(ratioMean) ? 1 / (1 + ratioMean) : 0;
  const providerAgreement = ratios.length === 2
    ? Math.max(0, 1 - Math.abs(ratios[0] - ratios[1]) / Math.max(1, ...ratios))
    : 0;
  const generationEvidence = Math.min(1,
    0.45 + (candidate.generatedBy.length - 1) * 0.3 +
    (candidate.seedClusterIds.includes(cluster.id) ? 0.15 : 0) +
    Math.max(0, 10 - Math.min(...Object.values(candidate.providerRanks))) / 100);
  const genreDistanceValue = genreDistance(rawFreq?.genre ?? null, cluster.dominantGenre);
  const genreFit = genreDistanceValue === null ? 0 : 1 - genreDistanceValue;
  const moodFit = rawFreq?.mood && cluster.dominantMood
    ? Number(rawFreq.mood.toLowerCase() === cluster.dominantMood.toLowerCase()) : 0;
  const harmonic = freqFit.components.key ?? reccoFit.components.key;
  const harmonicFit = harmonic === undefined ? 0 : 1 - harmonic;
  const components = {
    clusterFit, providerAgreement, generationEvidence, genreFit, moodFit, harmonicFit,
  };
  const score = Object.entries(RANKING_WEIGHTS).reduce((sum, [key, weight]) =>
    sum + weight * components[key as keyof CandidateScoreComponents], 0);
  const reasons = [
    (reccoFit.components.tempo !== undefined && reccoFit.components.tempo < 0.3) ||
      (freqFit.components.tempo !== undefined && freqFit.components.tempo < 0.3)
      ? "Kaynak grupla yakın tempo" : null,
    (reccoFit.components.energy !== undefined && reccoFit.components.energy < 0.25) ||
      (freqFit.components.energy !== undefined && freqFit.components.energy < 0.25)
      ? "Benzer enerji" : null,
    genreFit > 0 ? "Aynı geniş tür ailesi" : null,
    harmonicFit >= 0.75 && harmonic !== undefined ? "Uyumlu tonalite" : null,
    providerAgreement >= 0.7 && ratios.length === 2 ? "İki kaynakta tutarlı özellikler" : null,
  ].filter((reason): reason is string => reason !== null);
  return {
    track, candidate, clusterId: cluster.id,
    reccoDistance: reccoFit.distance,
    freqDistance: freqFit.distance,
    reccoRadiusRatio, freqRadiusRatio,
    score, components, accepted, rejectionReason, reasons, singleView,
  };
}

export function evaluateCandidate(
  track: NormalizedTrack,
  candidate: CandidateEvidence,
  rawRecco: ProviderFeatures | null,
  rawFreq: ProviderFeatures | null,
  scales: { reccobeats: ProviderScales; freqblog: ProviderScales },
  profile: PlaylistProfile,
  strictness: ConsensusStrictness,
): CandidateEvaluation {
  const evaluations = profile.clusters.map((cluster) =>
    scoreCandidateForCluster(track, candidate, rawRecco, rawFreq, scales, profile, cluster, strictness));
  return evaluations.sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.score - a.score || a.clusterId - b.clusterId)[0];
}
