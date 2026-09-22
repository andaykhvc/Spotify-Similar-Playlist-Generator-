import { getRecommendationEnvironment } from "@/lib/env";
import { excludeSourceCandidates, excludeSourceAndDedupeCandidates } from "@/lib/recommendations/dedupe";
import { RecommendationError } from "@/lib/recommendations/errors";
import { FreqBlogProvider } from "@/lib/recommendations/providers/freqblog";
import { runRecommendationProviders } from "@/lib/recommendations/providers";
import { ReccoBeatsProvider } from "@/lib/recommendations/providers/reccobeats";
import { labelAndLimitRecommendations, rankCandidates } from "@/lib/recommendations/ranking";
import { batchSeeds, selectRepresentativeSeeds } from "@/lib/recommendations/seeds";
import { createGenerationToken } from "@/lib/recommendations/token";
import type {
  PlaylistLength,
  RecommendationGenerationResult,
  RecommendationProvider,
  RecommendationProviderRequest,
} from "@/lib/recommendations/types";
import { getCurrentSpotifyUser, getPlaylistReview } from "@/lib/spotify/playlists";
import { resolveRecommendationsToSpotify } from "@/lib/spotify/tracks";
import type { NormalizedTrack } from "@/lib/spotify/types";

export function isPlaylistLength(value: unknown): value is PlaylistLength {
  return value === 20 || value === 30 || value === 50 || value === 100;
}

export async function generateCandidatePool(
  sourceTracks: NormalizedTrack[],
  request: Omit<RecommendationProviderRequest, "seedGroups">,
  providers: RecommendationProvider[],
  enabled: boolean,
) {
  if (!enabled) {
    throw new RecommendationError(
      "Dış öneri sağlayıcısı bu dağıtımda kapalı.",
      503,
      "feature_disabled",
    );
  }
  const seeds = selectRepresentativeSeeds(sourceTracks, 25, request.generationVariant);
  const seedGroups = batchSeeds(seeds);
  const providerResult = await runRecommendationProviders(providers, { ...request, seedGroups });
  return { seeds, seedGroups, providerResult };
}

export async function generateSimilarPlaylist(
  playlistId: string,
  desiredCount: PlaylistLength,
  generationVariant: number,
): Promise<RecommendationGenerationResult> {
  const environment = getRecommendationEnvironment();
  const startedAt = Date.now();
  console.info("[recommendations] request_started", { desiredCount, generationVariant });

  if (!environment.externalRecommenderEnabled) {
    throw new RecommendationError(
      "Benzer müzik özelliği bu dağıtımda etkin değil.",
      503,
      "feature_disabled",
    );
  }

  const user = await getCurrentSpotifyUser();
  const playlist = await getPlaylistReview(playlistId, user);
  if (playlist.tracks.length === 0) {
    throw new RecommendationError(
      "Bu çalma listesinde öneri üretmek için kullanılabilir parça yok.",
      422,
      "no_usable_tracks",
    );
  }

  const providers: RecommendationProvider[] = [new ReccoBeatsProvider()];
  if (environment.freqBlogApiKey) providers.push(new FreqBlogProvider(environment.freqBlogApiKey));
  const { seeds, providerResult } = await generateCandidatePool(
    playlist.tracks,
    { desiredCount, generationVariant },
    providers,
    environment.externalRecommenderEnabled,
  );

  console.info("[recommendations] provider_summary", {
    sourceTrackCount: playlist.tracks.length,
    representativeSeedCount: seeds.length,
    providerSuccesses: providerResult.successes,
    providerFailures: providerResult.failures.map(({ provider, status }) => ({ provider, status })),
    candidateCount: providerResult.candidates.length,
  });

  if (providerResult.successes.length === 0) {
    const rateLimit = providerResult.failures.find((failure) => failure.status === 429);
    throw new RecommendationError(
      rateLimit
        ? "Öneri hizmeti şu anda yoğun. Biraz sonra tekrar deneyin."
        : "Öneri hizmetine şu anda ulaşılamıyor. Lütfen tekrar deneyin.",
      rateLimit ? 429 : 503,
      rateLimit ? "provider_rate_limited" : "provider_unavailable",
      rateLimit?.retryAfterSeconds ?? null,
    );
  }

  const withoutSource = excludeSourceCandidates(providerResult.candidates, playlist.tracks);
  const ranked = rankCandidates(withoutSource);
  const resolved = await resolveRecommendationsToSpotify(ranked, desiredCount);
  const sourceSafeResolved = excludeSourceAndDedupeCandidates(
    resolved.map((track, index) => ({
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
    })),
    playlist.tracks,
  );
  const allowedIds = new Set(sourceSafeResolved.map((candidate) => candidate.spotifyId));
  const safeTracks = resolved.filter((track) => allowedIds.has(track.spotifyId));
  const recommendations = labelAndLimitRecommendations(safeTracks, desiredCount);

  console.info("[recommendations] request_finished", {
    candidateCount: ranked.length,
    resolvedSpotifyTrackCount: recommendations.length,
    durationMs: Date.now() - startedAt,
  });

  if (recommendations.length === 0) {
    throw new RecommendationError(
      "Öneriler Spotify parçalarıyla güvenli biçimde eşleştirilemedi.",
      422,
      "no_matches",
    );
  }

  return {
    playlistId: playlist.id,
    playlistName: playlist.name,
    recommendations,
    generationToken: createGenerationToken(
      user.id,
      playlist.id,
      recommendations.map((track) => track.spotifyId),
    ),
    desiredCount,
    generationVariant,
  };
}
