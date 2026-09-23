import { CONTINUOUS_FIELDS, emptyFeatures, type ContinuousField, type ProviderFeatures, type ProviderFeatureView, type TrackFeatureRecord } from "@/lib/recommendations/features/types";
import type { NormalizedTrack } from "@/lib/spotify/types";

export interface FeatureScale { median: number; spread: number }
export type ProviderScales = Record<ContinuousField, FeatureScale | null>;

export function quantile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function fitProviderScales(values: ProviderFeatures[]): ProviderScales {
  const entries = CONTINUOUS_FIELDS.map((field) => {
    const present = values.map((value) => value[field]).filter((value): value is number => value !== null && Number.isFinite(value));
    if (present.length === 0) return [field, null] as const;
    const median = quantile(present, 0.5);
    const iqr = quantile(present, 0.75) - quantile(present, 0.25);
    const spread = present.length >= 8 && iqr > 0.0001
      ? iqr / 1.349
      : Math.max((Math.max(...present) - Math.min(...present)) / 2, 0.1);
    return [field, { median, spread }] as const;
  });
  return Object.fromEntries(entries) as ProviderScales;
}

export function normalizeProviderFeatures(raw: ProviderFeatures, scales: ProviderScales): ProviderFeatureView {
  const normalized: Partial<Record<ContinuousField, number>> = {};
  for (const field of CONTINUOUS_FIELDS) {
    const value = raw[field];
    const scale = scales[field];
    if (value !== null && scale) normalized[field] = Math.max(-4, Math.min(4, (value - scale.median) / scale.spread));
  }
  const available = CONTINUOUS_FIELDS.filter((field) => raw[field] !== null).length +
    (raw.tempo !== null ? 1 : 0) + (raw.pitchClass !== null ? 1 : 0) +
    (raw.genre !== null ? 1 : 0) + (raw.mood !== null ? 1 : 0);
  return { raw, normalized, coverage: available / (CONTINUOUS_FIELDS.length + 4) };
}

function canonicalFeatures(recco: ProviderFeatures | undefined, freq: ProviderFeatures | undefined): ProviderFeatures {
  const base = emptyFeatures("canonical-display-only");
  for (const field of CONTINUOUS_FIELDS) base[field] = freq?.[field] ?? recco?.[field] ?? null;
  base.tempo = freq?.tempo ?? recco?.tempo ?? null;
  base.tempoAlternative = freq?.tempoAlternative ?? null;
  base.pitchClass = freq?.pitchClass ?? recco?.pitchClass ?? null;
  base.mode = freq?.mode ?? recco?.mode ?? null;
  base.camelot = freq?.camelot ?? null;
  base.timeSignature = freq?.timeSignature ?? null;
  base.genre = freq?.genre ?? null;
  base.mood = freq?.mood ?? null;
  base.moodVector = freq?.moodVector ?? null;
  base.tempoConfidence = freq?.tempoConfidence ?? null;
  base.keyConfidence = freq?.keyConfidence ?? null;
  return base;
}

export function buildFeatureRecords(
  tracks: NormalizedTrack[],
  recco: Map<string, ProviderFeatures>,
  freq: Map<string, ProviderFeatures>,
): { records: TrackFeatureRecord[]; scales: { reccobeats: ProviderScales; freqblog: ProviderScales } } {
  const reccoScales = fitProviderScales([...recco.values()]);
  const freqScales = fitProviderScales([...freq.values()]);
  return {
    records: tracks.map((identity) => {
      const reccoRaw = recco.get(identity.spotifyId);
      const freqRaw = freq.get(identity.spotifyId);
      const reccobeats = reccoRaw ? normalizeProviderFeatures(reccoRaw, reccoScales) : null;
      const freqblog = freqRaw ? normalizeProviderFeatures(freqRaw, freqScales) : null;
      return {
        identity, reccobeats, freqblog,
        canonical: canonicalFeatures(reccoRaw, freqRaw),
        confidence: {
          reccobeats: reccobeats?.coverage ?? 0,
          freqblog: freqblog?.coverage ?? 0,
          dualProvider: Boolean(reccobeats && freqblog),
        },
      };
    }),
    scales: { reccobeats: reccoScales, freqblog: freqScales },
  };
}
