import { mapWithConcurrency } from "@/lib/recommendations/concurrency";
import { artistTitleKey } from "@/lib/recommendations/dedupe";
import type { RankedCandidate } from "@/lib/recommendations/types";
import { spotifyRequest } from "@/lib/spotify/client";
import { SpotifyApiError } from "@/lib/spotify/errors";
import { normalizeSpotifyTrack } from "@/lib/spotify/playlists";
import type { NormalizedTrack } from "@/lib/spotify/types";

const TRACK_ID = /^[A-Za-z0-9]{22}$/;
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? value as UnknownRecord : null;
}

async function getSpotifyTrack(spotifyId: string): Promise<NormalizedTrack | null> {
  if (!TRACK_ID.test(spotifyId)) return null;
  try {
    return normalizeSpotifyTrack(await spotifyRequest<unknown>(`/tracks/${spotifyId}`));
  } catch (error) {
    if (error instanceof SpotifyApiError && error.status === 404) return null;
    throw error;
  }
}

async function searchSpotifyTracks(query: string): Promise<NormalizedTrack[]> {
  const params = new URLSearchParams({ q: query, type: "track", limit: "10" });
  const response = record(await spotifyRequest<unknown>(`/search?${params.toString()}`));
  const tracks = record(response?.tracks);
  if (!tracks || !Array.isArray(tracks.items)) return [];
  return tracks.items
    .map(normalizeSpotifyTrack)
    .filter((track): track is NormalizedTrack => track !== null);
}

export function isConservativeSpotifyMatch(
  candidate: Pick<RankedCandidate, "name" | "artists" | "isrc" | "durationMs">,
  track: NormalizedTrack,
): boolean {
  if (candidate.isrc && track.isrc?.toUpperCase() === candidate.isrc.toUpperCase()) return true;
  if (artistTitleKey(candidate.name, candidate.artists) !== artistTitleKey(track.name, track.artists)) {
    return false;
  }
  return candidate.durationMs === null || Math.abs(candidate.durationMs - track.durationMs) <= 5_000;
}

async function resolveCandidate(candidate: RankedCandidate): Promise<NormalizedTrack | null> {
  if (candidate.spotifyId) return getSpotifyTrack(candidate.spotifyId);
  if (candidate.isrc) {
    const byIsrc = await searchSpotifyTracks(`isrc:${candidate.isrc}`);
    const exact = byIsrc.find((track) =>
      track.isrc?.toUpperCase() === candidate.isrc?.toUpperCase(),
    );
    if (exact) return exact;
  }
  const primaryArtist = candidate.artists[0];
  if (!primaryArtist) return null;
  const results = await searchSpotifyTracks(`track:${candidate.name} artist:${primaryArtist}`);
  return results.find((track) => isConservativeSpotifyMatch(candidate, track)) ?? null;
}

export async function resolveRankedCandidatesToSpotify<T extends RankedCandidate>(
  candidates: T[],
  limit: number,
): Promise<{ candidate: T; track: NormalizedTrack }[]> {
  const cache = new Map<string, Promise<NormalizedTrack | null>>();
  const selected = candidates.slice(0, limit);
  const results = await mapWithConcurrency(selected, 4, async (candidate) => {
    const key = candidate.spotifyId ? `id:${candidate.spotifyId}`
      : candidate.isrc ? `isrc:${candidate.isrc.toUpperCase()}`
        : `text:${artistTitleKey(candidate.name, candidate.artists)}`;
    const pending = cache.get(key) ?? resolveCandidate(candidate);
    cache.set(key, pending);
    return { candidate, track: await pending };
  });
  const seen = new Set<string>();
  return results.filter((result): result is { candidate: T; track: NormalizedTrack } => {
    if (!result.track || seen.has(result.track.spotifyId)) return false;
    seen.add(result.track.spotifyId);
    return true;
  });
}

export async function resolveRecommendationsToSpotify(
  candidates: RankedCandidate[],
  maximumToResolve: number,
): Promise<NormalizedTrack[]> {
  const cache = new Map<string, Promise<NormalizedTrack | null>>();
  const limited = candidates.slice(0, Math.min(candidates.length, Math.max(maximumToResolve * 2, 40)));
  const resolved = await mapWithConcurrency(limited, 4, async (candidate) => {
    const cacheKey = candidate.spotifyId
      ? `id:${candidate.spotifyId}`
      : candidate.isrc
        ? `isrc:${candidate.isrc.toUpperCase()}`
        : `text:${artistTitleKey(candidate.name, candidate.artists)}`;
    const pending = cache.get(cacheKey) ?? resolveCandidate(candidate);
    cache.set(cacheKey, pending);
    return pending;
  });
  const seen = new Set<string>();
  return resolved.filter((track): track is NormalizedTrack => {
    if (!track || seen.has(track.spotifyId)) return false;
    seen.add(track.spotifyId);
    return true;
  });
}
