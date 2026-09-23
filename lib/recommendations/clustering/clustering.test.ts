import { describe, expect, it } from "vitest";
import { buildConsensus, coAssociationMatrix } from "@/lib/recommendations/clustering/consensus";
import { adjustedRandIndex } from "@/lib/recommendations/clustering/metrics";
import { pairwiseMatrix, selectMedoidClusters } from "@/lib/recommendations/clustering/medoids";
import { silhouetteScore } from "@/lib/recommendations/clustering/silhouette";
import { buildPlaylistProfile } from "@/lib/recommendations/engine/playlist-profile";
import { buildFeatureRecords } from "@/lib/recommendations/features/normalization";
import { emptyFeatures } from "@/lib/recommendations/features/types";
import type { NormalizedTrack } from "@/lib/spotify/types";

function track(index: number): NormalizedTrack {
  const id = String(index).padStart(22, "0");
  return { spotifyId: id, spotifyUri: `spotify:track:${id}`, name: `Song ${index}`,
    artists: [`Artist ${index}`], album: "Album", imageUrl: null,
    externalUrl: `https://open.spotify.com/track/${id}`, isrc: `ISRC${index}`, durationMs: 180_000 };
}

function syntheticPlaylist() {
  const tracks = Array.from({ length: 30 }, (_, index) => track(index));
  const recco = new Map();
  const freq = new Map();
  tracks.forEach((item, index) => {
    const group = Math.floor(index / 10);
    const variation = (index % 5 - 2) * 0.01;
    const basis = [
      { energy: 0.88, danceability: 0.86, valence: 0.65, tempo: 126, acousticness: 0.08, genre: "electronic", mood: "energetic" },
      { energy: 0.25, danceability: 0.3, valence: 0.7, tempo: 84, acousticness: 0.86, genre: "folk", mood: "calm" },
      { energy: 0.52, danceability: 0.44, valence: 0.18, tempo: 103, acousticness: 0.45, genre: "indie rock", mood: "melancholic" },
    ][group];
    recco.set(item.spotifyId, { ...emptyFeatures("recco"),
      energy: basis.energy + variation, danceability: basis.danceability + variation,
      valence: basis.valence + variation, tempo: basis.tempo + index % 3,
      acousticness: basis.acousticness + variation });
    freq.set(item.spotifyId, { ...emptyFeatures("freq"),
      energy: basis.energy * 0.76 + 0.12 + variation, danceability: basis.danceability * 0.72 + 0.18 + variation,
      valence: basis.valence * 0.8 + 0.05 + variation, tempo: basis.tempo + index % 3,
      acousticness: basis.acousticness * 0.7 + 0.1 + variation, genre: basis.genre, mood: basis.mood });
  });
  return { tracks, recco, freq };
}

describe("provider clustering and consensus", () => {
  it("finds separated musical groups deterministically without a global centroid", () => {
    const { tracks, recco, freq } = syntheticPlaylist();
    const { records } = buildFeatureRecords(tracks, recco, freq);
    const first = buildPlaylistProfile(records);
    const second = buildPlaylistProfile(records);
    expect(first.mode).toBe("consensus");
    expect(first.clusters.length).toBeGreaterThanOrEqual(2);
    expect(first.clusters.length).toBeLessThanOrEqual(5);
    expect(first.assignments.map((item) => item.consensusCluster))
      .toEqual(second.assignments.map((item) => item.consensusCluster));
    expect(first.metrics.dualCoverage).toBe(1);
    const labels = first.assignments.map((item) => item.consensusCluster);
    for (let group = 0; group < 3; group += 1) {
      const own = labels.slice(group * 10, group * 10 + 10);
      expect(Math.max(...[...new Set(own)].map((label) => own.filter((value) => value === label).length)))
        .toBeGreaterThanOrEqual(7);
    }
  });

  it("selects k from silhouette and computes co-association independent of label names", () => {
    const values = [0, 0.1, 0.2, 0.3, 5, 5.1, 5.2, 5.3, 10, 10.1, 10.2, 10.3];
    const matrix = pairwiseMatrix(values, (a, b) => Math.min(1, Math.abs(a - b) / 5));
    const result = selectMedoidClusters(matrix);
    expect(result.clusterCount).toBeGreaterThanOrEqual(2);
    expect(silhouetteScore(matrix, result.labels)).toBeGreaterThan(0.5);
    const associations = coAssociationMatrix([0, 0, 1, 1], [5, 5, 8, 8]);
    expect(associations[0][1]).toBe(1);
    expect(associations[0][2]).toBe(0);
    expect(adjustedRandIndex([0, 0, 1, 1], [5, 5, 8, 8])).toBeCloseTo(1);
    const consensus = buildConsensus([0, 0, 1, 1, 2, 2, 3, 3], [5, 5, 8, 8, 9, 9, 4, 4]);
    expect(consensus.confidence.every((score) => score >= 0 && score <= 1)).toBe(true);
  });

  it("assigns one-provider songs with lower confidence and excludes no-feature songs", () => {
    const { tracks, recco, freq } = syntheticPlaylist();
    freq.delete(tracks[0].spotifyId);
    recco.delete(tracks[29].spotifyId);
    freq.delete(tracks[29].spotifyId);
    const { records } = buildFeatureRecords(tracks, recco, freq);
    const profile = buildPlaylistProfile(records);
    expect(profile.assignments[0].consensusCluster).not.toBeNull();
    expect(profile.assignments[0].confidence).toBeLessThan(0.6);
    expect(profile.assignments[29].consensusCluster).toBeNull();
    expect(profile.metrics.unresolvedCoverage).toBeCloseTo(1 / 30);
  });

  it("uses a single profile for tiny playlists", () => {
    const { tracks, recco, freq } = syntheticPlaylist();
    const { records } = buildFeatureRecords(tracks.slice(0, 3), recco, freq);
    const profile = buildPlaylistProfile(records);
    expect(profile.mode).toBe("seed");
    expect(profile.clusters).toHaveLength(1);
    expect(profile.clusters[0].medoidIndices.length).toBeGreaterThan(0);
  });

  it("keeps a valid provider-specific medoid when feature coverage is sparse", () => {
    const { tracks, recco, freq } = syntheticPlaylist();
    tracks.slice(0, 28).forEach((item) => freq.delete(item.spotifyId));
    const { records } = buildFeatureRecords(tracks, recco, freq);
    const profile = buildPlaylistProfile(records);
    const containing = profile.clusters.find((cluster) => cluster.memberIndices.includes(28));
    expect(containing?.providerMedoidIndices.freqblog.length).toBeGreaterThan(0);
    expect(containing?.freqRadius).not.toBeNull();
  });

  it("bounds the number of clusters for a 500-track source playlist", () => {
    const tracks = Array.from({ length: 500 }, (_, index) => track(index));
    const recco = new Map(tracks.map((item, index) => [item.spotifyId, {
      ...emptyFeatures("synthetic-recco"),
      tempo: [125, 84, 103][index % 3] + index % 4,
      energy: [0.85, 0.25, 0.52][index % 3],
      danceability: [0.82, 0.31, 0.45][index % 3],
      valence: [0.7, 0.68, 0.18][index % 3],
    }]));
    const freq = new Map(tracks.map((item, index) => [item.spotifyId, {
      ...emptyFeatures("synthetic-freq"),
      tempo: [125, 84, 103][index % 3] + index % 4,
      energy: [0.75, 0.32, 0.48][index % 3],
      danceability: [0.72, 0.38, 0.5][index % 3],
      valence: [0.64, 0.61, 0.22][index % 3],
      genre: ["electronic", "folk", "indie rock"][index % 3],
    }]));
    const profile = buildPlaylistProfile(buildFeatureRecords(tracks, recco, freq).records);
    expect(profile.assignments).toHaveLength(500);
    expect(profile.clusters.length).toBeGreaterThanOrEqual(2);
    expect(profile.clusters.length).toBeLessThanOrEqual(8);
  }, 30_000);
});
