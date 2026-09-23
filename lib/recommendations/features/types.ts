import type { NormalizedTrack } from "@/lib/spotify/types";
import type { ProviderName } from "@/lib/recommendations/types";

export const CONTINUOUS_FIELDS = [
  "energy", "danceability", "valence", "loudness", "acousticness",
  "instrumentalness", "speechiness", "liveness",
] as const;
export type ContinuousField = (typeof CONTINUOUS_FIELDS)[number];
export type FeatureField = ContinuousField | "tempo" | "key" | "genre" | "mood" | "timeSignature";

export interface ProviderFeatures {
  tempo: number | null;
  tempoAlternative: number | null;
  energy: number | null;
  danceability: number | null;
  valence: number | null;
  loudness: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  speechiness: number | null;
  liveness: number | null;
  pitchClass: number | null;
  mode: 0 | 1 | null;
  camelot: string | null;
  timeSignature: number | null;
  genre: string | null;
  mood: string | null;
  moodVector: Record<string, number> | null;
  language: null;
  provenance: string;
  tempoConfidence: number | null;
  keyConfidence: number | null;
  providerTrackId: string | null;
}

export interface ProviderFeatureView {
  raw: ProviderFeatures;
  normalized: Partial<Record<ContinuousField, number>>;
  coverage: number;
}

export interface TrackFeatureRecord {
  identity: NormalizedTrack;
  reccobeats: ProviderFeatureView | null;
  freqblog: ProviderFeatureView | null;
  canonical: ProviderFeatures;
  confidence: { reccobeats: number; freqblog: number; dualProvider: boolean };
}

export interface FeatureLookupProvider {
  readonly name: ProviderName;
  lookupFeatures(tracks: NormalizedTrack[]): Promise<Map<string, ProviderFeatures>>;
}

export interface LanguageMetadataProvider {
  readonly name: string;
  getLanguage(track: NormalizedTrack): Promise<string | null>;
}

export function emptyFeatures(provenance: string): ProviderFeatures {
  return {
    tempo: null, tempoAlternative: null, energy: null, danceability: null,
    valence: null, loudness: null, acousticness: null, instrumentalness: null,
    speechiness: null, liveness: null, pitchClass: null, mode: null,
    camelot: null, timeSignature: null, genre: null, mood: null,
    moodVector: null, language: null, provenance, tempoConfidence: null,
    keyConfidence: null, providerTrackId: null,
  };
}
