import { describe, expect, it } from "vitest";
import { resolveRankedCandidatesToSpotify } from "@/lib/spotify/tracks";
import type { RankedCandidate } from "@/lib/recommendations/types";

function candidate(overrides: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    provider: "reccobeats",
    providerTrackId: "provider-track",
    spotifyId: "1234567890123456789012",
    name: "A Song",
    artists: ["The Band"],
    isrc: "ABC123",
    durationMs: 180_000,
    externalUrl: "https://example.invalid/untrusted",
    providerRank: 1,
    providerScore: null,
    seedGroupIndex: 0,
    rankScore: 1,
    providerCount: 1,
    seedGroupCount: 1,
    ...overrides,
  };
}

describe("Spotify-ID candidate resolution without catalog requests", () => {
  it("uses the server-validated ID and creates a canonical Spotify link", async () => {
    const resolved = await resolveRankedCandidatesToSpotify([candidate()], 20);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].track).toMatchObject({
      spotifyId: "1234567890123456789012",
      spotifyUri: "spotify:track:1234567890123456789012",
      externalUrl: "https://open.spotify.com/track/1234567890123456789012",
      imageUrl: null,
    });
  });

  it("drops candidates without a Spotify ID, malformed IDs, and duplicates", async () => {
    const resolved = await resolveRankedCandidatesToSpotify([
      candidate({ spotifyId: null }),
      candidate({ spotifyId: "invalid" }),
      candidate({ provider: "freqblog" }),
      candidate(),
      candidate({ name: "Duplicate recording" }),
    ], 20);
    expect(resolved).toHaveLength(1);
  });
});
