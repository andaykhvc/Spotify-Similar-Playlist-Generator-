import type { NormalizedTrack } from "@/lib/spotify/types";

export const PLAYLIST_LENGTHS = [20, 30, 50, 100] as const;
export type PlaylistLength = (typeof PLAYLIST_LENGTHS)[number];
export type ProviderName = "reccobeats" | "freqblog";
export type MatchLabel = "Strong match" | "Similar" | "Discovery";

export interface RecommendationCandidate {
  provider: ProviderName;
  providerTrackId: string;
  spotifyId: string | null;
  name: string;
  artists: string[];
  isrc: string | null;
  durationMs: number | null;
  externalUrl: string | null;
  providerRank: number;
  providerScore: number | null;
  seedGroupIndex: number;
}

export interface RecommendationProviderRequest {
  seedGroups: NormalizedTrack[][];
  desiredCount: PlaylistLength;
  generationVariant: number;
}

export interface RecommendationProvider {
  readonly name: ProviderName;
  recommend(request: RecommendationProviderRequest): Promise<RecommendationCandidate[]>;
}

export interface RankedCandidate extends RecommendationCandidate {
  rankScore: number;
  providerCount: number;
  seedGroupCount: number;
}

export interface GeneratedRecommendation extends NormalizedTrack {
  matchLabel: MatchLabel;
}

export interface RecommendationGenerationResult {
  playlistId: string;
  playlistName: string;
  recommendations: GeneratedRecommendation[];
  generationToken: string;
  desiredCount: PlaylistLength;
  generationVariant: number;
}
