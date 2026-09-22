import type { NormalizedTrack } from "@/lib/spotify/types";

const DEFAULT_MAX_SEEDS = 25;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableOffset(seed: number, bucket: number, width: number): number {
  if (width <= 1) return 0;
  let value = seed + Math.imul(bucket + 1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  return (value >>> 0) % width;
}

export function dedupeSourceTracks(tracks: NormalizedTrack[]): NormalizedTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.spotifyId)) return false;
    seen.add(track.spotifyId);
    return true;
  });
}

export function selectRepresentativeSeeds(
  tracks: NormalizedTrack[],
  maximum = DEFAULT_MAX_SEEDS,
  generationVariant = 0,
): NormalizedTrack[] {
  const unique = dedupeSourceTracks(tracks);
  if (unique.length === 0 || maximum <= 0) return [];

  const count = Math.min(Math.floor(maximum), unique.length);
  const fingerprint = unique.map((track) => track.spotifyId).join("");
  const seed = hashString(`${fingerprint}:${Math.max(0, generationVariant)}`);
  const selected = Array.from({ length: count }, (_, bucket) => {
    const start = Math.floor((bucket * unique.length) / count);
    const end = Math.floor(((bucket + 1) * unique.length) / count);
    const width = Math.max(1, end - start);
    return unique[start + stableOffset(seed, bucket, width)];
  });

  if (generationVariant > 0 && selected.length > 1) {
    const rotation = generationVariant % selected.length;
    return [...selected.slice(rotation), ...selected.slice(0, rotation)];
  }
  return selected;
}

export function batchSeeds(
  seeds: NormalizedTrack[],
  maximum = 5,
): NormalizedTrack[][] {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5) {
    throw new Error("Provider seed groups must contain between 1 and 5 tracks");
  }
  const groups: NormalizedTrack[][] = [];
  for (let index = 0; index < seeds.length; index += maximum) {
    groups.push(seeds.slice(index, index + maximum));
  }
  return groups;
}
