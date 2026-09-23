import { describe, expect, it, vi } from "vitest";
import { FreqBlogProvider } from "@/lib/recommendations/providers/freqblog";
import { ReccoBeatsProvider } from "@/lib/recommendations/providers/reccobeats";
import type { NormalizedTrack } from "@/lib/spotify/types";

const track: NormalizedTrack = {
  spotifyId: "1234567890123456789012",
  spotifyUri: "spotify:track:1234567890123456789012",
  name: "Test Song", artists: ["Test Artist"], album: "Album", imageUrl: null,
  externalUrl: "https://open.spotify.com/track/1234567890123456789012",
  isrc: "USABC1234567", durationMs: 180_000,
};

describe("provider feature lookup", () => {
  it("batches Recco IDs, parses verified fields and caches within one request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [
      { id: "recco-uuid", href: track.externalUrl, isrc: track.isrc,
        energy: 0.7, danceability: 0.6, tempo: 125, key: 1, mode: 0 },
    ] }), { status: 200 }));
    const provider = new ReccoBeatsProvider(fetcher);
    const first = await provider.lookupFeatures([track, track]);
    const second = await provider.lookupFeatures([track]);
    expect(first.get(track.spotifyId)?.energy).toBe(0.7);
    expect(second.get(track.spotifyId)?.pitchClass).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/v1/audio-features");
    expect(url.searchParams.getAll("ids")).toEqual([track.spotifyId]);
  });

  it("treats FreqBlog queued/202 analysis as pending and continues", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "queued", retry_after_seconds: 12,
    }), { status: 202 }));
    const provider = new FreqBlogProvider("test-key", fetcher);
    const result = await provider.lookupFeatures([track]);
    expect(result.size).toBe(0);
    expect(provider.pending.size).toBe(1);
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/bulk");
    expect(JSON.parse(String(init.body))).toEqual([{
      isrc: track.isrc, track: track.name, artist: track.artists[0],
    }]);
  });

  it("reads partial FreqBlog bulk results and does not request the same item twice", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { found: true, result: { itunes_track_id: "42", bpm: 125, energy: 0.7, genre: "pop" } },
      { found: false, result: null, backfill_status: "processing" },
    ], found: 1, not_found: 1, requests_used: 1 }), { status: 200 }));
    const provider = new FreqBlogProvider("test-key", fetcher);
    const second = { ...track, spotifyId: "9999999999999999999999", isrc: "USABC7654321" };
    const first = await provider.lookupFeatures([track, second]);
    await provider.lookupFeatures([track, second]);
    expect(first.get(track.spotifyId)?.genre).toBe("pop");
    expect(first.has(second.spotifyId)).toBe(false);
    expect(provider.pending.size).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stops later FreqBlog batches after a rate limit and preserves earlier features", async () => {
    const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
      status, headers: status === 429 ? { "Retry-After": "60" } : undefined,
    });
    const fetcher = vi.fn().mockResolvedValueOnce(response(200, { results: Array.from({ length: 25 }, () => ({
      found: true, result: { bpm: 125, energy: 0.7 },
    })) })).mockResolvedValueOnce(response(429, { error: "rate limited" }));
    const tracks = Array.from({ length: 51 }, (_, index) => ({
      ...track, spotifyId: String(index).padStart(22, "0"),
      isrc: `USABC${String(index).padStart(7, "0")}`,
    }));
    const provider = new FreqBlogProvider("test-key", fetcher);
    const found = await provider.lookupFeatures(tracks);
    expect(found.size).toBe(25);
    expect(provider.lastFeatureError?.status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
