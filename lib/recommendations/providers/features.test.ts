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
  it("adds target-audio and source-artist candidates without losing the primary recommendations", async () => {
    const reccoId = "27498118-b821-46d0-8458-23f0eaff07f1";
    const artistId = "175b207e-186d-4e03-9045-69d3c6c29ca2";
    const recommendedId = "1234567890123456789013";
    const catalogId = "1234567890123456789014";
    const entry = (id: string, title: string) => ({
      id: reccoId, href: `https://open.spotify.com/track/${id}`,
      trackTitle: title, artists: [{ id: artistId, name: "Test Artist" }],
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/v1/audio-features") return new Response(JSON.stringify({ content: [
        { id: reccoId, href: track.externalUrl, tempo: 120, energy: 0.7 },
      ] }));
      if (url.pathname === "/v1/track/recommendation") return new Response(JSON.stringify({
        content: [entry(recommendedId, "Suggested Song")],
      }));
      if (url.pathname === `/v1/track/${reccoId}`) return new Response(JSON.stringify({ artists: [
        { id: artistId, name: "Test Artist" },
      ] }));
      if (url.pathname === `/v1/artist/${artistId}/track`) return new Response(JSON.stringify({
        content: [entry(catalogId, "Another Artist Song")],
      }));
      return new Response(null, { status: 404 });
    });
    const provider = new ReccoBeatsProvider(fetcher);
    await provider.lookupFeatures([track]);
    const candidates = await provider.recommend({
      seedGroups: [[track]], desiredCount: 20, generationVariant: 0, candidateLimit: 20,
      strictness: "strict", includeSourceArtistCatalog: true,
      featureTargets: { tempo: 120, energy: 0.7, danceability: null, valence: null,
        acousticness: null, instrumentalness: null, speechiness: null },
    });
    expect(candidates.map((candidate) => candidate.spotifyId)).toEqual([recommendedId, catalogId]);
    expect(candidates[1].origin).toBe("source-artist");
    const recommendationUrl = fetcher.mock.calls.map((call) => call[0] as URL)
      .find((url) => url.pathname === "/v1/track/recommendation")!;
    expect(recommendationUrl.searchParams.get("tempo")).toBe("120");
    expect(recommendationUrl.searchParams.get("featureWeight")).toBe("5");
  });

  it("requests strict-genre FreqBlog recommendations in close mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tracks: [] })));
    const provider = new FreqBlogProvider("test-key", fetcher);
    await provider.recommend({ seedGroups: [[track]], desiredCount: 20,
      generationVariant: 0, strictness: "strict" });
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.searchParams.get("cross_genre")).toBe("strict");
    expect(url.searchParams.get("exclude_seed_artists")).toBe("false");
  });
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
