import { normalizeTrackText } from "@/lib/recommendations/dedupe";
import type { NormalizedTrack } from "@/lib/spotify/types";

export function allocateClusterQuotas(weights: number[], total: number): number[] {
  if (!weights.length || total < 0) return [];
  const weightSum = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (weightSum === 0) return allocateClusterQuotas(weights.map(() => 1), total);
  const exact = weights.map((weight) => Math.max(0, weight) / weightSum * total);
  const result = exact.map(Math.floor);
  let remaining = total - result.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of order) {
    if (remaining <= 0) break;
    result[item.index] += 1;
    remaining -= 1;
  }
  return result;
}

export function adaptiveArtistCap(source: NormalizedTrack[], desiredCount: number): number {
  const counts = new Map<string, number>();
  for (const track of source) {
    const key = normalizeTrackText(track.artists[0] ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const concentration = Math.max(0, ...counts.values()) / Math.max(1, source.length);
  const base = Math.max(2, Math.ceil(desiredCount / 15));
  return concentration > 0.4 ? Math.max(base, Math.ceil(desiredCount * concentration * 0.65)) : base;
}

export interface AllocatableCandidate<T extends NormalizedTrack> {
  track: T;
  clusterId: number;
  score: number;
  singleView: boolean;
}

export function selectAllocatedCandidates<T extends AllocatableCandidate<NormalizedTrack>>(
  candidates: T[],
  weights: number[],
  desiredCount: number,
  artistCap: number,
  maxSingleViewShare: number,
): T[] {
  const quotas = allocateClusterQuotas(weights, desiredCount);
  const ordered = [...candidates].sort((a, b) => b.score - a.score || a.track.spotifyId.localeCompare(b.track.spotifyId));
  const selected: T[] = [];
  const ids = new Set<string>();
  const byCluster = new Map<number, number>();
  const byArtist = new Map<string, number>();
  const byAlbum = new Map<string, number>();
  let singleViewCount = 0;
  const maxSingle = Math.max(1, Math.floor(desiredCount * maxSingleViewShare));

  function take(item: T, enforceCap: boolean): boolean {
    const artist = normalizeTrackText(item.track.artists[0] ?? "");
    const album = `${artist}:${normalizeTrackText(item.track.album)}`;
    if (ids.has(item.track.spotifyId) || (item.singleView && singleViewCount >= maxSingle)) return false;
    if (enforceCap && ((byArtist.get(artist) ?? 0) >= artistCap || (byAlbum.get(album) ?? 0) >= Math.max(2, artistCap))) return false;
    selected.push(item);
    ids.add(item.track.spotifyId);
    byCluster.set(item.clusterId, (byCluster.get(item.clusterId) ?? 0) + 1);
    byArtist.set(artist, (byArtist.get(artist) ?? 0) + 1);
    byAlbum.set(album, (byAlbum.get(album) ?? 0) + 1);
    if (item.singleView) singleViewCount += 1;
    return true;
  }

  for (const item of ordered) {
    if (selected.length >= desiredCount) break;
    if ((byCluster.get(item.clusterId) ?? 0) < (quotas[item.clusterId] ?? 0)) take(item, true);
  }
  for (const item of ordered) {
    if (selected.length >= desiredCount) break;
    take(item, true);
  }
  for (const item of ordered) {
    if (selected.length >= desiredCount) break;
    take(item, false);
  }
  return selected;
}
