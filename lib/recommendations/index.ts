import { getRecommendationEnvironment } from "@/lib/env";
import { dedupeSourceTracks } from "@/lib/recommendations/seeds";
import { excludeSourceAndDedupeCandidates } from "@/lib/recommendations/dedupe";
import { adaptiveArtistCap, selectAllocatedCandidates } from "@/lib/recommendations/engine/allocation";
import { generateClusterCandidates } from "@/lib/recommendations/engine/candidate-generator";
import { buildPlaylistProfile } from "@/lib/recommendations/engine/playlist-profile";
import { RecommendationError } from "@/lib/recommendations/errors";
import { buildFeatureRecords } from "@/lib/recommendations/features/normalization";
import { FreqBlogProvider } from "@/lib/recommendations/providers/freqblog";
import { ReccoBeatsProvider } from "@/lib/recommendations/providers/reccobeats";
import { ENGINE_LIMITS, RECOMMENDATION_ENGINE_VERSION, STRICTNESS } from "@/lib/recommendations/recommendation-config";
import { evaluateCandidate, type CandidateEvaluation, type ConsensusStrictness } from "@/lib/recommendations/scoring/candidate-score";
import { matchLabelForIndex } from "@/lib/recommendations/ranking";
import { createGenerationToken } from "@/lib/recommendations/token";
import type { PlaylistLength, RecommendationGenerationResult } from "@/lib/recommendations/types";
import { getCurrentSpotifyUser, getPlaylistReview } from "@/lib/spotify/playlists";
import { resolveRankedCandidatesToSpotify } from "@/lib/spotify/tracks";
import type { NormalizedTrack } from "@/lib/spotify/types";

export function isPlaylistLength(value: unknown): value is PlaylistLength {
  return value === 20 || value === 30 || value === 50 || value === 100;
}

export function isConsensusStrictness(value: unknown): value is ConsensusStrictness {
  return value === "strict" || value === "balanced" || value === "exploratory";
}

export interface GenerationDiagnostics {
  engineVersion: string;
  sourceTrackCount: number;
  providerCoverage: { dual: number; reccoOnly: number; freqOnly: number; unresolved: number };
  profile: ReturnType<typeof buildPlaylistProfile>;
  providerSuccesses: string[];
  providerFailures: { provider: string; status: number }[];
  candidateCount: number;
  resolvedCount: number;
  candidateEvaluations: CandidateEvaluation[];
  resultMetrics: {
    sourceDuplication: number;
    distinctArtists: number;
    clusterCounts: number[];
    targetClusterCounts: number[];
    providerAgreementShare: number;
    averageNormalizedDistance: number | null;
    rejectionRate: number;
  };
}

export type GenerationResult = RecommendationGenerationResult & { diagnostics?: GenerationDiagnostics };

function candidateAsIdentity(track: NormalizedTrack, index: number) {
  return {
    provider: "reccobeats" as const,
    providerTrackId: track.spotifyId,
    spotifyId: track.spotifyId,
    name: track.name,
    artists: track.artists,
    isrc: track.isrc,
    durationMs: track.durationMs,
    externalUrl: track.externalUrl,
    providerRank: index + 1,
    providerScore: null,
    seedGroupIndex: 0,
  };
}

export async function generateSimilarPlaylist(
  playlistId: string,
  desiredCount: PlaylistLength,
  generationVariant: number,
  strictness: ConsensusStrictness = "balanced",
  includeDiagnostics = false,
): Promise<GenerationResult> {
  const environment = getRecommendationEnvironment();
  const startedAt = Date.now();
  if (!environment.externalRecommenderEnabled) {
    throw new RecommendationError("Benzer müzik özelliği bu dağıtımda etkin değil.", 503, "feature_disabled");
  }
  console.info("[recommendations] request_started", {
    engineVersion: RECOMMENDATION_ENGINE_VERSION, desiredCount, generationVariant, strictness,
  });

  const user = await getCurrentSpotifyUser();
  const playlist = await getPlaylistReview(playlistId, user);
  const source = dedupeSourceTracks(playlist.tracks);
  if (source.length === 0) {
    throw new RecommendationError("Bu çalma listesinde kullanılabilir parça yok.", 422, "no_usable_tracks");
  }
  if (source.length > ENGINE_LIMITS.maxSourceTracks) {
    throw new RecommendationError("Bu liste şu an için çok uzun. En fazla 1000 parça destekleniyor.", 400, "invalid_request");
  }

  const recco = new ReccoBeatsProvider();
  const freq = environment.freqBlogApiKey ? new FreqBlogProvider(environment.freqBlogApiKey) : null;
  const [reccoSourceResult, freqSourceResult] = await Promise.allSettled([
    recco.lookupFeatures(source),
    freq ? freq.lookupFeatures(source) : Promise.resolve(new Map()),
  ]);
  const reccoSource = reccoSourceResult.status === "fulfilled" ? reccoSourceResult.value : new Map();
  const freqSource = freqSourceResult.status === "fulfilled" ? freqSourceResult.value : new Map();
  console.info("[recommendations] source_features", {
    sourceTrackCount: source.length,
    reccoCoverage: reccoSource.size,
    freqCoverage: freqSource.size,
    reccoStatus: reccoSourceResult.status,
    freqStatus: freq ? freqSourceResult.status : "not_configured",
  });
  if (reccoSource.size === 0 && freqSource.size === 0) {
    const rateLimit = [recco.lastFeatureError, freq?.lastFeatureError].find((error) => error?.status === 429);
    throw new RecommendationError(
      rateLimit ? "Ses özelliği hizmeti istek sınırına ulaştı. Biraz sonra tekrar deneyin."
        : "Kaynak parçaların ses özellikleri şu anda alınamıyor.",
      rateLimit ? 429 : 503,
      rateLimit ? "provider_rate_limited" : "provider_unavailable",
      rateLimit?.retryAfterSeconds ?? null,
    );
  }

  const { records, scales } = buildFeatureRecords(source, reccoSource, freqSource);
  const profile = buildPlaylistProfile(records);
  if (profile.clusters.length === 0) {
    throw new RecommendationError("Bu listenin müzikal grupları belirlenemedi.", 422, "no_matches");
  }
  const providers = freq ? [recco, freq] : [recco];
  const pool = await generateClusterCandidates(profile, providers, desiredCount, generationVariant);
  console.info("[recommendations] candidate_generation", {
    clusterCount: profile.clusters.length,
    candidateCount: pool.candidates.length,
    providerSuccesses: pool.successes,
    providerFailures: pool.failures.map((failure) => ({ provider: failure.provider, status: failure.status })),
  });
  if (pool.candidates.length === 0) {
    const rateLimit = pool.failures.find((failure) => failure.status === 429);
    throw new RecommendationError(
      rateLimit ? "Öneri hizmeti istek sınırına ulaştı. Biraz sonra tekrar deneyin." : "Şu anda uygun öneri bulunamadı.",
      rateLimit ? 429 : 503,
      rateLimit ? "provider_rate_limited" : "provider_unavailable",
      rateLimit?.retryAfterSeconds ?? null,
    );
  }

  const resolved = await resolveRankedCandidatesToSpotify(pool.candidates, ENGINE_LIMITS.maxCandidates);
  const sourceSafe = excludeSourceAndDedupeCandidates(
    resolved.map((item, index) => candidateAsIdentity(item.track, index)),
    source,
  );
  const allowed = new Set(sourceSafe.map((item) => item.spotifyId));
  const safeResolved = resolved.filter((item) => allowed.has(item.track.spotifyId));
  if (safeResolved.length === 0) {
    throw new RecommendationError("Öneriler Spotify parçalarıyla güvenli biçimde eşleştirilemedi.", 422, "no_matches");
  }

  const candidateTracks = safeResolved.map((item) => item.track);
  const [reccoCandidateResult, freqCandidateResult] = await Promise.allSettled([
    recco.lookupFeatures(candidateTracks),
    freq ? freq.lookupFeatures(candidateTracks) : Promise.resolve(new Map()),
  ]);
  const reccoCandidates = reccoCandidateResult.status === "fulfilled" ? reccoCandidateResult.value : new Map();
  const freqCandidates = freqCandidateResult.status === "fulfilled" ? freqCandidateResult.value : new Map();
  const evaluations = safeResolved.map(({ track, candidate }) => evaluateCandidate(
    track, candidate,
    reccoCandidates.get(track.spotifyId) ?? null,
    freqCandidates.get(track.spotifyId) ?? null,
    scales, profile, strictness,
  ));
  const accepted = evaluations.filter((item) => item.accepted);
  const actualDualAvailability = reccoSource.size > 0 && freqSource.size > 0 &&
    reccoCandidates.size > 0 && freqCandidates.size > 0;
  const selected = selectAllocatedCandidates(
    accepted.map((item) => ({
      track: item.track, clusterId: item.clusterId, score: item.score,
      singleView: item.singleView,
      evaluation: item,
    })),
    profile.clusters.map((cluster) => cluster.weight),
    desiredCount,
    adaptiveArtistCap(source, desiredCount),
    actualDualAvailability ? STRICTNESS[strictness].maxSingleViewShare : 1,
  );
  if (selected.length === 0) {
    throw new RecommendationError("Öneriler kaynak listenin müzikal gruplarıyla yeterince uyuşmadı.", 422, "no_matches");
  }
  const recommendations = selected.map((item, index) => ({
    ...item.track,
    matchLabel: matchLabelForIndex(index, selected.length),
    explanation: item.evaluation.reasons.slice(0, 2).join(" · ") || "Kaynak grubun ses özelliklerine yakın",
    clusterId: item.clusterId,
  }));
  const counts = profile.clusters.map((cluster) => selected.filter((item) => item.clusterId === cluster.id).length);
  const targetCounts = profile.clusters.map((cluster) => cluster.weight * desiredCount);
  const normalizedDistances = selected.flatMap((item) => [item.evaluation.reccoRadiusRatio, item.evaluation.freqRadiusRatio]
    .filter((value): value is number => value !== null));
  const diagnostics: GenerationDiagnostics = {
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    sourceTrackCount: source.length,
    providerCoverage: {
      dual: profile.metrics.dualCoverage,
      reccoOnly: profile.metrics.reccoOnlyCoverage,
      freqOnly: profile.metrics.freqOnlyCoverage,
      unresolved: profile.metrics.unresolvedCoverage,
    },
    profile,
    providerSuccesses: pool.successes,
    providerFailures: pool.failures.map(({ provider, status }) => ({ provider, status })),
    candidateCount: pool.candidates.length,
    resolvedCount: safeResolved.length,
    candidateEvaluations: evaluations,
    resultMetrics: {
      sourceDuplication: recommendations.filter((track) => source.some((item) => item.spotifyId === track.spotifyId)).length,
      distinctArtists: new Set(recommendations.map((track) => track.artists[0])).size,
      clusterCounts: counts,
      targetClusterCounts: targetCounts,
      providerAgreementShare: selected.filter((item) => !item.singleView).length / selected.length,
      averageNormalizedDistance: normalizedDistances.length
        ? normalizedDistances.reduce((sum, value) => sum + value, 0) / normalizedDistances.length : null,
      rejectionRate: evaluations.length ? (evaluations.length - accepted.length) / evaluations.length : 0,
    },
  };
  console.info("[recommendations] request_finished", {
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    sourceTrackCount: source.length,
    consensusClusterCount: profile.clusters.length,
    candidateCount: pool.candidates.length,
    acceptedCount: recommendations.length,
    durationMs: Date.now() - startedAt,
  });

  const result: GenerationResult = {
    playlistId: playlist.id,
    playlistName: playlist.name,
    recommendations,
    generationToken: createGenerationToken(user.id, playlist.id, recommendations.map((track) => track.spotifyId)),
    desiredCount,
    generationVariant,
    analysis: {
      groupCount: profile.clusters.length,
      groups: profile.clusters.map((cluster) => ({
        id: cluster.id, description: cluster.description, percentage: Math.round(cluster.weight * 100),
      })),
      providerCoverage: diagnostics.providerCoverage,
    },
  };
  if (includeDiagnostics && process.env.NODE_ENV !== "production") result.diagnostics = diagnostics;
  return result;
}
