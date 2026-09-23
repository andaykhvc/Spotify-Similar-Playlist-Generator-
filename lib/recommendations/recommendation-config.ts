export const RECOMMENDATION_ENGINE_VERSION = "consensus-v1";

// Tunable engineering defaults, not empirically calibrated music-quality scores.
export const FEATURE_WEIGHTS = {
  tempo: 1.2,
  energy: 1.4,
  danceability: 1.2,
  valence: 1.0,
  loudness: 0.65,
  acousticness: 0.9,
  instrumentalness: 0.55,
  speechiness: 0.55,
  liveness: 0.25,
  key: 0.25,
  genre: 0.5,
  mood: 0.45,
  timeSignature: 0.15,
} as const;

export const PROVIDER_FEATURE_RELIABILITY = {
  reccobeats: { tempo: 0.9, key: 0.7, acousticness: 0.8 },
  freqblog: { tempo: 0.9, key: 0.7, acousticness: 0.6, genre: 0.7, mood: 0.55 },
} as const;

export const CONSENSUS_WEIGHTS = {
  reccobeats: 0.5,
  freqblog: 0.5,
} as const;

export const RANKING_WEIGHTS = {
  clusterFit: 0.58,
  providerAgreement: 0.2,
  generationEvidence: 0.09,
  genreFit: 0.05,
  moodFit: 0.04,
  harmonicFit: 0.04,
} as const;

export const STRICTNESS = {
  strict: { bothRadius: 1.05, oneRadius: 0.7, maxSingleViewShare: 0.1 },
  balanced: { bothRadius: 1.5, oneRadius: 1.15, maxSingleViewShare: 0.3 },
  exploratory: { bothRadius: 2.1, oneRadius: 1.55, maxSingleViewShare: 0.45 },
} as const;

export const ENGINE_LIMITS = {
  maxSourceTracks: 1000,
  maxCandidates: 240,
  maxClusters: 8,
  reccoBatch: 40,
  freqBulkBatch: 25,
} as const;
