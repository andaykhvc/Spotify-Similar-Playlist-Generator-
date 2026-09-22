import { describe, expect, it, vi } from "vitest";
import { ReccoBeatsProvider } from "@/lib/recommendations/providers/reccobeats";
import type { NormalizedTrack } from "@/lib/spotify/types";

const seed: NormalizedTrack = {
  spotifyId: "1234567890123456789012",
  spotifyUri: "spotify:track:1234567890123456789012",
  name: "Seed",
  artists: ["Artist"],
  album: "Album",
  imageUrl: null,
  externalUrl: "https://open.spotify.com/track/1234567890123456789012",
  isrc: null,
  durationMs: 100_000,
};

describe("ReccoBeatsProvider", () => {
  it("respects Retry-After once on HTTP 429 and types the current response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: [{
          id: "recco-id",
          trackTitle: "Result",
          artists: [{ id: "artist-id", name: "Result Artist", href: "https://api.reccobeats.com/v1/artist/artist-id" }],
          durationMs: 123_000,
          isrc: "TEST123",
          href: "https://open.spotify.com/track/9999999999999999999999",
          popularity: 42,
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new ReccoBeatsProvider(fetcher);
    const result = await provider.recommend({ seedGroups: [[seed]], desiredCount: 20, generationVariant: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result[0]).toMatchObject({
      spotifyId: "9999999999999999999999",
      name: "Result",
      isrc: "TEST123",
    });
    const requestedUrl = fetcher.mock.calls[0][0] as URL;
    expect(requestedUrl.pathname).toBe("/v1/track/recommendation");
    expect(requestedUrl.searchParams.getAll("seeds")).toEqual([seed.spotifyId]);
  });
});
