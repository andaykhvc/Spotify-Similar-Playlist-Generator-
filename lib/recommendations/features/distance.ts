import { FEATURE_WEIGHTS, PROVIDER_FEATURE_RELIABILITY } from "@/lib/recommendations/recommendation-config";
import { camelotDistance, pitchClassDistance } from "@/lib/recommendations/features/harmonic";
import { genreDistance } from "@/lib/recommendations/features/genre";
import { tempoDistance } from "@/lib/recommendations/features/tempo";
import { CONTINUOUS_FIELDS, type FeatureField, type ProviderFeatureView } from "@/lib/recommendations/features/types";
import type { ProviderName } from "@/lib/recommendations/types";

export interface DistanceResult {
  value: number | null;
  coverage: number;
  components: Partial<Record<FeatureField, number>>;
}

function moodDistance(a: ProviderFeatureView, b: ProviderFeatureView): number | null {
  const left = a.raw.moodVector;
  const right = b.raw.moodVector;
  if (left && right) {
    const shared = Object.keys(left).filter((key) => Number.isFinite(left[key]) && Number.isFinite(right[key]));
    if (shared.length) return Math.min(1,
      shared.reduce((sum, key) => sum + Math.abs(left[key] - right[key]), 0) / shared.length);
  }
  if (a.raw.mood && b.raw.mood) return a.raw.mood.toLowerCase() === b.raw.mood.toLowerCase() ? 0 : 1;
  return null;
}

export function featureDistance(
  a: ProviderFeatureView | null,
  b: ProviderFeatureView | null,
  provider: ProviderName,
): DistanceResult {
  if (!a || !b) return { value: null, coverage: 0, components: {} };
  const components: Partial<Record<FeatureField, number>> = {};
  for (const field of CONTINUOUS_FIELDS) {
    const left = a.normalized[field];
    const right = b.normalized[field];
    if (left !== undefined && right !== undefined) {
      components[field] = Math.min(1, Math.abs(left - right) / 3);
    }
  }
  const tempo = tempoDistance(a.raw.tempo, b.raw.tempo, a.raw.tempoAlternative, b.raw.tempoAlternative);
  if (tempo !== null) components.tempo = tempo;
  const key = camelotDistance(a.raw.camelot, b.raw.camelot) ?? pitchClassDistance(a.raw.pitchClass, b.raw.pitchClass);
  if (key !== null) components.key = Math.min(1, key + (a.raw.mode !== null && b.raw.mode !== null && a.raw.mode !== b.raw.mode ? 0.1 : 0));
  const genre = genreDistance(a.raw.genre, b.raw.genre);
  if (genre !== null) components.genre = genre;
  const mood = moodDistance(a, b);
  if (mood !== null) components.mood = mood;
  if (a.raw.timeSignature !== null && b.raw.timeSignature !== null) {
    components.timeSignature = a.raw.timeSignature === b.raw.timeSignature ? 0 : 1;
  }

  let availableWeight = 0;
  let weightedDistance = 0;
  let totalWeight = 0;
  for (const [field, defaultWeight] of Object.entries(FEATURE_WEIGHTS) as [FeatureField, number][]) {
    const reliability = PROVIDER_FEATURE_RELIABILITY[provider] as Partial<Record<FeatureField, number>>;
    const weight = defaultWeight * (reliability[field] ?? 1);
    totalWeight += weight;
    const component = components[field];
    if (component !== undefined) {
      availableWeight += weight;
      weightedDistance += weight * component;
    }
  }
  return {
    value: availableWeight > 0 ? weightedDistance / availableWeight : null,
    coverage: totalWeight > 0 ? availableWeight / totalWeight : 0,
    components,
  };
}
