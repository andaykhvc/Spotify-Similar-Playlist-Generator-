import { describe, expect, it, vi } from "vitest";
import { excludeSourceAndDedupeCandidates, normalizeTrackText } from "@/lib/recommendations/dedupe";
import { RecommendationError, ProviderError } from "@/lib/recommendations/errors";
import { generateCandidatePool } from "@/lib/recommendations";
import { runRecommendationProviders } from "@/lib/recommendations/providers";
import { enforceArtistDiversity, labelAndLimitRecommendations, rankCandidates } from "@/lib/recommendations/ranking";
import { batchSeeds, selectRepresentativeSeeds } from "@/lib/recommendations/seeds";
import type { RecommendationCandidate, RecommendationProvider } from "@/lib/recommendations/types";
import type { NormalizedTrack } from "@/lib/spotify/types";

function track(index: number, artist = `Artist ${index}`): NormalizedTrack {
  const id = String(index).padStart(22, "0");
  return {
    spotifyId: id,
    spotifyUri: `spotify:track:${id}`,
    name: `Track ${index}`,
    artists: [artist],
    album: "Album",
    imageUrl: null,
    externalUrl: `https://open.spotify.com/track/${id}`,
    isrc: `ISRC${index}`,
    durationMs: 180_000,
  };
}

function candidate(overrides: Partial<RecommendationCandidate> = {}): RecommendationCandidate {
  return {
    provider: "reccobeats",
    providerTrackId: "provider-1",
    spotifyId: "9999999999999999999999",
    name: "Candidate",
    artists: ["Candidate Artist"],
    isrc: "CANDIDATE1",
    durationMs: 180_000,
    externalUrl: null,
    providerRank: 1,
    providerScore: null,
    seedGroupIndex: 0,
    ...overrides,
  };
}

describe("representative seeds", () => {
  it("spreads at most 25 deterministic seeds across the whole playlist", () => {
    const source = Array.from({ length: 120 }, (_, index) => track(index));
    const first = selectRepresentativeSeeds(source, 25, 0);
    expect(first).toEqual(selectRepresentativeSeeds(source, 25, 0));
    expect(first).toHaveLength(25);
    expect(source.indexOf(first[0])).toBeLessThan(5);
    expect(source.indexOf(first.at(-1)!)).toBeGreaterThan(114);
    expect(selectRepresentativeSeeds(source, 25, 1)).not.toEqual(first);
  });

  it("deduplicates Spotify IDs and batches no more than five seeds", () => {
    const source = [track(1), track(1), ...Array.from({ length: 11 }, (_, index) => track(index + 2))];
    const seeds = selectRepresentativeSeeds(source);
    const groups = batchSeeds(seeds);
    expect(seeds).toHaveLength(12);
    expect(groups.map((group) => group.length)).toEqual([5, 5, 2]);
  });
});

describe("candidate filtering and ranking", () => {
  it("excludes source tracks and deduplicates by Spotify ID, ISRC, then normalized text", () => {
    const source = [track(1, "A")];
    const values = [
      candidate({ spotifyId: source[0].spotifyId }),
      candidate({ spotifyId: null, isrc: "NEW1", name: "Song (feat. Guest)", artists: ["Band"] }),
      candidate({ spotifyId: null, isrc: "new1", name: "Other", artists: ["Other"] }),
      candidate({ spotifyId: null, isrc: null, name: "SONG ft. Guest", artists: ["Band"] }),
    ];
    expect(excludeSourceAndDedupeCandidates(values, source)).toHaveLength(1);
    expect(normalizeTrackText("Mix (Remix)")).not.toBe(normalizeTrackText("Mix (Live)"));
  });

  it("rewards agreement across seed groups and providers", () => {
    const repeated = candidate({ spotifyId: "8888888888888888888888", providerRank: 8 });
    const ranked = rankCandidates([
      candidate({ spotifyId: "7777777777777777777777", providerRank: 1 }),
      repeated,
      { ...repeated, seedGroupIndex: 1, providerRank: 6 },
      { ...repeated, provider: "freqblog", seedGroupIndex: 0, providerScore: 0.8 },
    ]);
    expect(ranked[0].spotifyId).toBe(repeated.spotifyId);
    expect(ranked[0].providerCount).toBe(2);
    expect(ranked[0].seedGroupCount).toBe(3);
  });

  it("applies the artist cap and enforces the requested length", () => {
    const values = [
      track(1, "Same"), track(2, "Same"), track(3, "Same"),
      track(4, "Other 1"), track(5, "Other 2"), track(6, "Other 3"),
    ];
    const selected = enforceArtistDiversity(values, 5, 2);
    expect(selected.filter((item) => item.artists[0] === "Same")).toHaveLength(2);
    expect(labelAndLimitRecommendations(values, 4)).toHaveLength(4);
  });
});

describe("provider orchestration", () => {
  const request = { seedGroups: [[track(1)]], desiredCount: 20 as const, generationVariant: 0 };

  it("keeps a successful fallback when another provider fails", async () => {
    const failed: RecommendationProvider = {
      name: "reccobeats",
      recommend: vi.fn().mockRejectedValue(new ProviderError("down", "reccobeats", 503)),
    };
    const fallback: RecommendationProvider = {
      name: "freqblog",
      recommend: vi.fn().mockResolvedValue([candidate({ provider: "freqblog" })]),
    };
    const result = await runRecommendationProviders([failed, fallback], request);
    expect(result.candidates).toHaveLength(1);
    expect(result.successes).toEqual(["freqblog"]);
    expect(result.failures[0].provider).toBe("reccobeats");
  });

  it("does not call a provider when the compliance feature flag is off", async () => {
    const provider: RecommendationProvider = {
      name: "reccobeats",
      recommend: vi.fn().mockResolvedValue([]),
    };
    await expect(generateCandidatePool([track(1)], {
      desiredCount: 20,
      generationVariant: 0,
    }, [provider], false)).rejects.toBeInstanceOf(RecommendationError);
    expect(provider.recommend).not.toHaveBeenCalled();
  });
});
