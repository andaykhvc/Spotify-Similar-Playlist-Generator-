import { describe, expect, it } from "vitest";
import { adaptiveArtistCap, allocateClusterQuotas, selectAllocatedCandidates } from "@/lib/recommendations/engine/allocation";
import { capCandidatesAcrossClusters, generateClusterCandidates, unionCandidateEvidence } from "@/lib/recommendations/engine/candidate-generator";
import { buildPlaylistProfile } from "@/lib/recommendations/engine/playlist-profile";
import { buildFeatureRecords, fitProviderScales } from "@/lib/recommendations/features/normalization";
import { emptyFeatures, type ProviderFeatures } from "@/lib/recommendations/features/types";
import { scoreCandidateForCluster } from "@/lib/recommendations/scoring/candidate-score";
import { excludeSourceAndDedupeCandidates } from "@/lib/recommendations/dedupe";
import type { RecommendationCandidate, RecommendationProvider } from "@/lib/recommendations/types";
import type { NormalizedTrack } from "@/lib/spotify/types";

function track(index: number, artist = `Artist ${index}`): NormalizedTrack {
  const id = String(index).padStart(22, "0");
  return { spotifyId: id, spotifyUri: `spotify:track:${id}`, name: `Song ${index}`,
    artists: [artist], album: `Album ${index}`, imageUrl: null,
    externalUrl: `https://open.spotify.com/track/${id}`, isrc: `USABC${String(index).padStart(7, "0")}`, durationMs: 180_000 };
}

function raw(overrides: Partial<ProviderFeatures> = {}): ProviderFeatures {
  return { ...emptyFeatures("synthetic"), tempo: 120, energy: 0.5, danceability: 0.5,
    valence: 0.5, acousticness: 0.5, ...overrides };
}

function candidate(overrides: Partial<RecommendationCandidate> = {}): RecommendationCandidate {
  return { provider: "reccobeats", providerTrackId: "r-1", spotifyId: track(100).spotifyId,
    name: "Song 100", artists: ["Artist 100"], isrc: track(100).isrc,
    durationMs: 180_000, externalUrl: null, providerRank: 1, providerScore: null,
    seedGroupIndex: 0, ...overrides };
}

describe("cluster candidate engine", () => {
  it("unions candidates with provenance instead of requiring literal provider overlap", () => {
    const recco = candidate();
    const freq = candidate({ provider: "freqblog", spotifyId: null, providerTrackId: "itunes-1", providerRank: 4 });
    const different = candidate({ spotifyId: track(101).spotifyId, name: "Song 101", isrc: track(101).isrc });
    const union = unionCandidateEvidence([
      { candidate: recco, clusterId: 0, seedTrackIds: [track(1).spotifyId] },
      { candidate: freq, clusterId: 0, seedTrackIds: [track(2).spotifyId] },
      { candidate: different, clusterId: 1, seedTrackIds: [track(3).spotifyId] },
    ]);
    expect(union).toHaveLength(2);
    expect(union[0].generatedBy).toEqual(["reccobeats", "freqblog"]);
    expect(union[0].seedTrackIds).toHaveLength(2);
    expect(union[0].providerRanks.freqblog).toBe(4);
  });

  it("reserves candidate room for later clusters before applying a global pool cap", () => {
    const values = Array.from({ length: 12 }, (_, index) =>
      unionCandidateEvidence([{ candidate: candidate({ spotifyId: track(index + 100).spotifyId,
        isrc: track(index + 100).isrc, name: `Song ${index + 100}` }),
        clusterId: index < 10 ? 0 : 1, seedTrackIds: [track(1).spotifyId] }])[0]);
    const capped = capCandidatesAcrossClusters(values, 2, 6);
    expect(capped).toHaveLength(6);
    expect(capped.filter((item) => item.seedClusterIds.includes(1))).toHaveLength(2);
  });

  it("regeneration rotates medoid seeds deterministically and changes the provider request", async () => {
    const source = Array.from({ length: 5 }, (_, index) => track(index));
    const reccoFeatures = new Map(source.map((item) => [item.spotifyId, raw({ tempo: 120 })]));
    const freqFeatures = new Map(source.map((item) => [item.spotifyId, raw({ tempo: 200 })]));
    const profile = buildPlaylistProfile(buildFeatureRecords(source, reccoFeatures, freqFeatures).records);
    profile.clusters[0].medoidIndices = [0, 1, 2, 3, 4];
    const calls: string[][] = [];
    const targets: (number | null | undefined)[] = [];
    const provider: RecommendationProvider = {
      name: "reccobeats",
      async recommend(request) {
        calls.push(request.seedGroups[0].map((item) => item.spotifyId));
        targets.push(request.featureTargets?.tempo);
        return [];
      },
    };
    await generateClusterCandidates(profile, [provider], 30, 0);
    await generateClusterCandidates(profile, [provider], 30, 1);
    await generateClusterCandidates(profile, [provider], 30, 1);
    expect(calls[0]).not.toEqual(calls[1]);
    expect(calls[1]).toEqual(calls[2]);
    expect(targets).toEqual([120, 120, 120]);
  });

  it("favors a dual-view fit and rejects strong cross-provider disagreement", () => {
    const source = track(1);
    const base = raw({ genre: "rock" });
    const { records } = buildFeatureRecords([source],
      new Map([[source.spotifyId, base]]), new Map([[source.spotifyId, base]]));
    const profile = buildPlaylistProfile(records);
    const cluster = profile.clusters[0];
    cluster.reccoRadius = 0.2;
    cluster.freqRadius = 0.2;
    const scales = {
      reccobeats: fitProviderScales([base]),
      freqblog: fitProviderScales([base]),
    };
    const evidence = unionCandidateEvidence([{ candidate: candidate(), clusterId: 0, seedTrackIds: [source.spotifyId] }])[0];
    const near = scoreCandidateForCluster(track(100), evidence, raw(), raw({ genre: "rock" }), scales, profile, cluster, "strict");
    const disagrees = scoreCandidateForCluster(track(100), evidence, raw(),
      raw({ tempo: 175, energy: 0.95, danceability: 0.95, valence: 0.95, genre: "rock" }), scales, profile, cluster, "strict");
    const moderate = scoreCandidateForCluster(track(100), evidence,
      raw({ energy: 0.6, danceability: 0.6, valence: 0.6, genre: "rock" }),
      raw({ energy: 0.6, danceability: 0.6, valence: 0.6, genre: "rock" }),
      scales, profile, cluster, "balanced");
    const moderateStrict = scoreCandidateForCluster(track(100), evidence,
      raw({ energy: 0.6, danceability: 0.6, valence: 0.6 }),
      raw({ energy: 0.6, danceability: 0.6, valence: 0.6 }),
      scales, profile, cluster, "strict");
    expect(near.accepted).toBe(true);
    expect(disagrees.accepted).toBe(false);
    expect(moderate.accepted).toBe(true);
    expect(moderateStrict.accepted).toBe(false);
    expect(near.score).toBeGreaterThan(moderate.score);
    expect(moderate.components.providerAgreement).toBeGreaterThan(0.9);
  });

  it("keeps close same-artist songs but rejects genre-unknown strangers with one provider", () => {
    const source = track(1, "Muse");
    const base = raw({ tempo: 135, energy: 0.8 });
    const { records, scales } = buildFeatureRecords([source],
      new Map([[source.spotifyId, base]]), new Map());
    const profile = buildPlaylistProfile(records);
    const evidence = unionCandidateEvidence([{ candidate: candidate(), clusterId: 0,
      seedTrackIds: [source.spotifyId] }])[0];
    const close = raw({ tempo: 136, energy: 0.78 });
    const sameArtist = scoreCandidateForCluster(track(100, "Muse"), evidence, close, null,
      scales, profile, profile.clusters[0], "strict");
    const unrelated = scoreCandidateForCluster(track(100, "Unrelated Artist"), evidence, close, null,
      scales, profile, profile.clusters[0], "exploratory");
    expect(sameArtist.accepted).toBe(true);
    expect(sameArtist.reasons).toContain("Kaynak listedeki sanatçıdan yeni parça");
    expect(unrelated.accepted).toBe(false);
    expect(unrelated.rejectionReason).toBe("no reliable style evidence");
  });

  it("rejects an unrelated genre family even when audio features are identical", () => {
    const source = track(1, "Muse");
    const sourceRecco = raw();
    const sourceFreq = raw({ genre: "rock" });
    const { records, scales } = buildFeatureRecords([source],
      new Map([[source.spotifyId, sourceRecco]]),
      new Map([[source.spotifyId, sourceFreq]]));
    const profile = buildPlaylistProfile(records);
    const evidence = unionCandidateEvidence([{ candidate: candidate(), clusterId: 0,
      seedTrackIds: [source.spotifyId] }])[0];
    const wrongGenre = scoreCandidateForCluster(track(100), evidence, sourceRecco,
      raw({ genre: "hip hop" }), scales, profile, profile.clusters[0], "exploratory");
    expect(wrongGenre.accepted).toBe(false);
    expect(wrongGenre.rejectionReason).toBe("different genre family");
  });

  it("keeps a minority source genre eligible in a mixed small playlist", () => {
    const sources = [track(1, "Rock Artist"), track(2, "Pop Artist")];
    const recco = new Map(sources.map((item) => [item.spotifyId, raw()]));
    const freq = new Map(sources.map((item, index) => [item.spotifyId,
      raw({ genre: index === 0 ? "rock" : "pop" })]));
    const { records, scales } = buildFeatureRecords(sources, recco, freq);
    const profile = buildPlaylistProfile(records);
    const evidence = unionCandidateEvidence([{ candidate: candidate(), clusterId: 0,
      seedTrackIds: [sources[0].spotifyId] }])[0];
    const evaluation = scoreCandidateForCluster(track(100), evidence, raw(),
      raw({ genre: "pop" }), scales, profile, profile.clusters[0], "strict");
    expect(evaluation.accepted).toBe(true);
  });

  it("calibrates the source radius from different songs, not self-distance", () => {
    const source = Array.from({ length: 9 }, (_, index) => track(index, "Muse"));
    const features = new Map(source.map((item, index) => [item.spotifyId,
      raw({ tempo: 120 + index, energy: 0.5 + index * 0.01 })]));
    const profile = buildPlaylistProfile(buildFeatureRecords(source, features, new Map()).records);
    expect(profile.clusters.every((cluster) => cluster.reccoRadius === null || cluster.reccoRadius >= 0.18)).toBe(true);
  });

  it("allocates exactly the target length and relaxes quotas only for qualifying tracks", () => {
    expect(allocateClusterQuotas([0.4, 0.3, 0.2, 0.1], 30)).toEqual([12, 9, 6, 3]);
    expect(allocateClusterQuotas([0.35, 0.35, 0.3], 20).reduce((sum, count) => sum + count, 0)).toBe(20);
    const items = Array.from({ length: 20 }, (_, index) => ({
      track: track(index, index < 8 ? "Same Artist" : `Artist ${index}`),
      clusterId: index < 10 ? 0 : 1,
      score: 1 - index / 100,
      singleView: false,
    }));
    const selected = selectAllocatedCandidates(items, [0.5, 0.5], 10, 2, 1);
    expect(selected).toHaveLength(10);
    expect(selected.filter((item) => item.clusterId === 0)).toHaveLength(4);
    expect(selected.filter((item) => item.track.artists[0] === "Same Artist")).toHaveLength(2);
  });

  it("adapts artist cap for intentionally artist-centric sources", () => {
    const mixed = Array.from({ length: 30 }, (_, index) => track(index));
    const focused = mixed.map((item, index) => index < 24 ? { ...item, artists: ["Same Artist"] } : item);
    expect(adaptiveArtistCap(mixed, 30)).toBe(2);
    expect(adaptiveArtistCap(focused, 30)).toBeGreaterThan(2);
  });

  it("excludes source recordings by ISRC and retains distinct remix versions", () => {
    const source = [{ ...track(1), name: "Song (Live)" }];
    const values = [
      candidate({ spotifyId: track(2).spotifyId, isrc: source[0].isrc, name: "Other" }),
      candidate({ spotifyId: track(3).spotifyId, isrc: track(3).isrc, name: "Song (Remix)", artists: source[0].artists }),
    ];
    const filtered = excludeSourceAndDedupeCandidates(values, source);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Song (Remix)");
  });
});
