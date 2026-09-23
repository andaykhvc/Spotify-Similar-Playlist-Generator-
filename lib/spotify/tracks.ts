import type { RankedCandidate } from "@/lib/recommendations/types";
import type { NormalizedTrack } from "@/lib/spotify/types";

const TRACK_ID = /^[A-Za-z0-9]{22}$/;

function providerTrackWithSpotifyId(candidate: RankedCandidate): NormalizedTrack | null {
  const id = candidate.spotifyId;
  if (candidate.provider !== "reccobeats" || !id || !TRACK_ID.test(id) || !candidate.name.trim() ||
    !candidate.artists.some((artist) => artist.trim().length > 0)) return null;

  // ReccoBeats candidates carry a Spotify ID parsed from an official Spotify
  // track URL server-side. Resolving every candidate through Spotify Search or
  // GET /tracks/{id} would exhaust Development Mode's request budget.
  return {
    spotifyId: id,
    spotifyUri: `spotify:track:${id}`,
    name: candidate.name,
    artists: candidate.artists,
    album: "",
    imageUrl: null,
    externalUrl: `https://open.spotify.com/track/${id}`,
    isrc: candidate.isrc,
    durationMs: candidate.durationMs ?? 0,
  };
}

export async function resolveRankedCandidatesToSpotify<T extends RankedCandidate>(
  candidates: T[],
  limit: number,
): Promise<{ candidate: T; track: NormalizedTrack }[]> {
  const seen = new Set<string>();
  return candidates.slice(0, limit).flatMap((candidate) => {
    const track = providerTrackWithSpotifyId(candidate);
    if (!track || seen.has(track.spotifyId)) return [];
    seen.add(track.spotifyId);
    return [{ candidate, track }];
  });
}
