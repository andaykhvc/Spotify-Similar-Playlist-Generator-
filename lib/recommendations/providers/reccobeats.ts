import { mapWithConcurrency } from "@/lib/recommendations/concurrency";
import { ProviderError } from "@/lib/recommendations/errors";
import { fetchProviderJson } from "@/lib/recommendations/providers/http";
import { ENGINE_LIMITS } from "@/lib/recommendations/recommendation-config";
import { emptyFeatures, type FeatureLookupProvider, type ProviderFeatures } from "@/lib/recommendations/features/types";
import { RequestFeatureCache } from "@/lib/recommendations/cache/feature-cache";
import type { NormalizedTrack } from "@/lib/spotify/types";
import type {
  RecommendationCandidate,
  RecommendationProvider,
  RecommendationProviderRequest,
} from "@/lib/recommendations/types";

const BASE_URL = "https://api.reccobeats.com";
const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;
const RECCO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UnknownRecord = Record<string, unknown>;
function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? value as UnknownRecord : null;
}
function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function spotifyIdFromHref(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
    const match = url.pathname.match(/^\/track\/([A-Za-z0-9]{22})\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function parseResponse(value: unknown, seedGroupIndex: number, origin: "recommendation" | "source-artist" = "recommendation"): RecommendationCandidate[] {
  const root = record(value);
  if (!root || !Array.isArray(root.content)) {
    throw new ProviderError("ReccoBeats returned an invalid response", "reccobeats", 502);
  }
  return root.content.flatMap((entry, index) => {
    const item = record(entry);
    if (!item) return [];
    const id = stringValue(item.id);
    const name = stringValue(item.trackTitle);
    const href = stringValue(item.href);
    const artists = Array.isArray(item.artists)
      ? item.artists.flatMap((artist) => {
          const nameValue = stringValue(record(artist)?.name);
          return nameValue ? [nameValue] : [];
        })
      : [];
    if (!id || !name || artists.length === 0) return [];
    const spotifyId = spotifyIdFromHref(href);
    return [{
      provider: "reccobeats" as const,
      providerTrackId: id,
      spotifyId: spotifyId && SPOTIFY_TRACK_ID.test(spotifyId) ? spotifyId : null,
      name,
      artists,
      isrc: stringValue(item.isrc),
      durationMs: typeof item.durationMs === "number" ? item.durationMs : null,
      externalUrl: href,
      providerRank: index + 1,
      providerScore: null,
      seedGroupIndex,
      origin,
    }];
  });
}

function numberIn(value: unknown, lower: number, upper: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= lower && value <= upper ? value : null;
}

export function parseReccoFeatures(value: unknown): ProviderFeatures | null {
  const item = record(value);
  if (!item) return null;
  const features = {
    ...emptyFeatures("reccobeats-v1-audio-features"),
    tempo: numberIn(item.tempo, 30, 300),
    energy: numberIn(item.energy, 0, 1),
    danceability: numberIn(item.danceability, 0, 1),
    valence: numberIn(item.valence, 0, 1),
    loudness: numberIn(item.loudness, -80, 10),
    acousticness: numberIn(item.acousticness, 0, 1),
    instrumentalness: numberIn(item.instrumentalness, 0, 1),
    speechiness: numberIn(item.speechiness, 0, 1),
    liveness: numberIn(item.liveness, 0, 1),
    pitchClass: numberIn(item.key, 0, 11),
    mode: item.mode === 0 || item.mode === 1 ? item.mode : null,
    providerTrackId: stringValue(item.id),
  } satisfies ProviderFeatures;
  return [features.tempo, features.energy, features.danceability, features.valence,
    features.acousticness, features.loudness].some((field) => field !== null) ? features : null;
}

export class ReccoBeatsProvider implements RecommendationProvider, FeatureLookupProvider {
  readonly name = "reccobeats" as const;
  private readonly featureCache = new RequestFeatureCache();
  private readonly schemaVersion = "v1-audio-features";
  private readonly artistTrackCache = new Map<string, Promise<RecommendationCandidate[]>>();
  lastFeatureError: ProviderError | null = null;
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async lookupFeatures(tracks: NormalizedTrack[]): Promise<Map<string, ProviderFeatures>> {
    const unique = [...new Map(tracks.map((track) => [track.spotifyId, track])).values()];
    const missing = unique.filter((track) => !this.featureCache.has(this.name, this.schemaVersion, track.spotifyId));
    const batches: NormalizedTrack[][] = [];
    for (let index = 0; index < missing.length; index += ENGINE_LIMITS.reccoBatch) {
      batches.push(missing.slice(index, index + ENGINE_LIMITS.reccoBatch));
    }
    let rateLimited = false;
    await mapWithConcurrency(batches, 2, async (batch) => {
      if (rateLimited) return;
      try {
      const url = new URL("/v1/audio-features", BASE_URL);
      batch.forEach((track) => url.searchParams.append("ids", track.spotifyId));
      const payload = record(await fetchProviderJson(this.name, url, { headers: { Accept: "application/json" } }, this.fetcher, 15_000));
      if (!payload || !Array.isArray(payload.content)) throw new ProviderError("Invalid ReccoBeats audio features", this.name, 502);
      const byId = new Map<string, ProviderFeatures>();
      for (const raw of payload.content) {
        const item = record(raw);
        const href = stringValue(item?.href);
        const id = spotifyIdFromHref(href);
        const features = parseReccoFeatures(item);
        if (id && features) byId.set(id, features);
      }
      for (const track of batch) this.featureCache.set(this.name, this.schemaVersion, track.spotifyId, byId.get(track.spotifyId) ?? null);
      } catch (error) {
        this.lastFeatureError = error instanceof ProviderError ? error : new ProviderError("ReccoBeats feature batch failed", this.name, 503);
        if (this.lastFeatureError.status === 429) rateLimited = true;
      }
    });
    return new Map(unique.flatMap((track) => {
      const features = this.featureCache.get(this.name, this.schemaVersion, track.spotifyId);
      return features ? [[track.spotifyId, features]] : [];
    }));
  }

  async recommend(request: RecommendationProviderRequest): Promise<RecommendationCandidate[]> {
    const perGroup = request.candidateLimit ?? Math.min(
      40,
      Math.max(10, Math.ceil((request.desiredCount * 1.6) / request.seedGroups.length)),
    );
    const pages = await mapWithConcurrency(request.seedGroups, 2, async (group, index) => {
      const url = new URL("/v1/track/recommendation", BASE_URL);
      url.searchParams.set("size", String(perGroup));
      group.forEach((track) => url.searchParams.append("seeds", track.spotifyId));
      for (const [field, value] of Object.entries(request.featureTargets ?? {})) {
        if (value !== null && Number.isFinite(value)) url.searchParams.set(field, String(value));
      }
      if (request.featureTargets) url.searchParams.set("featureWeight", request.strictness === "strict" ? "5" : "4");
      const recommendation = fetchProviderJson(
        this.name, url, { headers: { Accept: "application/json" } }, this.fetcher,
      );
      const catalog = request.includeSourceArtistCatalog
        ? this.sourceArtistTracks(group, index, perGroup, request.sourceArtistLimit ?? 1) : Promise.resolve([]);
      const [recommended, sameArtist] = await Promise.allSettled([recommendation, catalog]);
      const catalogCandidates = sameArtist.status === "fulfilled" ? sameArtist.value : [];
      if (recommended.status === "rejected" && catalogCandidates.length === 0) throw recommended.reason;
      let recommendedCandidates: RecommendationCandidate[] = [];
      if (recommended.status === "fulfilled") {
        try {
          recommendedCandidates = parseResponse(recommended.value, index);
        } catch (error) {
          if (catalogCandidates.length === 0) throw error;
        }
      }
      return [
        ...recommendedCandidates,
        ...catalogCandidates,
      ];
    });
    return pages.flat();
  }

  private async sourceArtistTracks(
    group: NormalizedTrack[], seedGroupIndex: number, limit: number, artistLimit: number,
  ): Promise<RecommendationCandidate[]> {
    const trackIds = [...new Set(group.map((track) =>
      this.featureCache.get(this.name, this.schemaVersion, track.spotifyId)?.providerTrackId)
      .filter((id): id is string => typeof id === "string" && RECCO_ID.test(id)))].slice(0, Math.min(3, Math.max(1, artistLimit)));
    const details = await mapWithConcurrency(trackIds, 2, async (trackId) => {
      try {
        const trackUrl = new URL(`/v1/track/${trackId}`, BASE_URL);
        return record(await fetchProviderJson(this.name, trackUrl,
          { headers: { Accept: "application/json" } }, this.fetcher));
      } catch { return null; }
    });
    const artistIds = [...new Set(details.flatMap((detail) => Array.isArray(detail?.artists)
      ? detail.artists.map((artist) => stringValue(record(artist)?.id)) : [])
      .filter((id): id is string => typeof id === "string" && RECCO_ID.test(id)))].slice(0, Math.min(3, Math.max(1, artistLimit)));
    const pages = await mapWithConcurrency(artistIds, 2, async (artistId) => {
      try {
        return await this.artistTracks(artistId, limit);
      } catch { return []; }
    });
    return pages.flat().map((candidate) => ({ ...candidate, seedGroupIndex }));
  }

  private artistTracks(artistId: string, limit: number): Promise<RecommendationCandidate[]> {
    const cached = this.artistTrackCache.get(artistId);
    if (cached) return cached;
    const artistUrl = new URL(`/v1/artist/${artistId}/track`, BASE_URL);
    artistUrl.searchParams.set("page", "0");
    artistUrl.searchParams.set("size", String(Math.min(50, Math.max(20, limit))));
    const tracks = fetchProviderJson(this.name, artistUrl,
      { headers: { Accept: "application/json" } }, this.fetcher)
      .then((payload) => parseResponse(payload, 0, "source-artist"));
    this.artistTrackCache.set(artistId, tracks);
    return tracks;
  }
}
