import { ProviderError } from "@/lib/recommendations/errors";
import { fetchProviderJson } from "@/lib/recommendations/providers/http";
import { ENGINE_LIMITS } from "@/lib/recommendations/recommendation-config";
import { mapWithConcurrency } from "@/lib/recommendations/concurrency";
import { artistTitleKey } from "@/lib/recommendations/dedupe";
import { emptyFeatures, type FeatureLookupProvider, type ProviderFeatures } from "@/lib/recommendations/features/types";
import { RequestFeatureCache } from "@/lib/recommendations/cache/feature-cache";
import type { NormalizedTrack } from "@/lib/spotify/types";
import type {
  RecommendationCandidate,
  RecommendationProvider,
  RecommendationProviderRequest,
} from "@/lib/recommendations/types";

const BASE_URL = "https://api.freqblog.com";
type UnknownRecord = Record<string, unknown>;
function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? value as UnknownRecord : null;
}
function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseResponse(value: unknown): RecommendationCandidate[] {
  const root = record(value);
  if (!root || !Array.isArray(root.tracks)) {
    throw new ProviderError("FreqBlog returned an invalid response", "freqblog", 502);
  }
  return root.tracks.flatMap((entry, index) => {
    const result = record(entry);
    const track = record(result?.track);
    const idValue = track?.itunes_track_id;
    const name = stringValue(track?.track_name);
    const artist = stringValue(track?.artist_name);
    if ((typeof idValue !== "string" && typeof idValue !== "number") || !name || !artist) return [];
    return [{
      provider: "freqblog" as const,
      providerTrackId: String(idValue),
      spotifyId: null,
      name,
      artists: [artist],
      isrc: stringValue(track?.isrc),
      durationMs: typeof track?.duration_ms === "number" ? track.duration_ms : null,
      externalUrl: null,
      providerRank: index + 1,
      providerScore: typeof result?.score === "number" ? result.score : null,
      seedGroupIndex: 0,
    }];
  });
}

function numberIn(value: unknown, lower: number, upper: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= lower && value <= upper ? value : null;
}

export function parseFreqFeatures(value: unknown): ProviderFeatures | null {
  const item = record(value);
  if (!item) return null;
  const moodVectorRaw = record(item.mood_vector);
  const moodVector = moodVectorRaw
    ? Object.fromEntries(Object.entries(moodVectorRaw).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])))
    : null;
  const features = {
    ...emptyFeatures(typeof item.feature_source === "string" ? item.feature_source : "freqblog-unknown"),
    tempo: numberIn(item.bpm, 20, 300),
    tempoAlternative: numberIn(item.bpm_alt, 20, 300),
    tempoConfidence: numberIn(item.bpm_confidence, 0, 100),
    energy: numberIn(item.energy, 0, 1),
    danceability: numberIn(item.danceability, 0, 1),
    valence: numberIn(item.valence, 0, 1),
    loudness: numberIn(item.loudness_db, -80, 10),
    acousticness: numberIn(item.acousticness, 0, 1),
    instrumentalness: numberIn(item.instrumentalness, 0, 1),
    speechiness: numberIn(item.speechiness, 0, 1),
    liveness: numberIn(item.liveness, 0, 1),
    pitchClass: numberIn(item.key_int, 0, 11),
    mode: item.mode === 0 || item.mode === 1 ? item.mode : null,
    camelot: stringValue(item.camelot),
    keyConfidence: numberIn(item.key_confidence, 0, 1),
    timeSignature: numberIn(item.time_signature, 1, 12),
    genre: stringValue(item.genre),
    mood: stringValue(item.mood),
    moodVector: moodVector && Object.keys(moodVector).length ? moodVector : null,
    providerTrackId: item.itunes_track_id === undefined ? null : String(item.itunes_track_id),
  } satisfies ProviderFeatures;
  return [features.tempo, features.energy, features.danceability, features.valence,
    features.acousticness, features.genre].some((field) => field !== null) ? features : null;
}

function featureCacheKey(track: NormalizedTrack): string {
  return track.isrc ? `isrc:${track.isrc.toUpperCase()}`
    : `text:${artistTitleKey(track.name, track.artists)}`;
}

export class FreqBlogProvider implements RecommendationProvider, FeatureLookupProvider {
  readonly name = "freqblog" as const;
  private readonly featureCache = new RequestFeatureCache();
  private readonly schemaVersion = "openapi-1.5";
  readonly pending = new Set<string>();
  lastFeatureError: ProviderError | null = null;
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async lookupFeatures(tracks: NormalizedTrack[]): Promise<Map<string, ProviderFeatures>> {
    const unique = [...new Map(tracks.map((track) => [featureCacheKey(track), track])).values()];
    const missing = unique.filter((track) => !this.featureCache.has(this.name, this.schemaVersion, featureCacheKey(track)));
    const batches: NormalizedTrack[][] = [];
    for (let index = 0; index < missing.length; index += ENGINE_LIMITS.freqBulkBatch) {
      batches.push(missing.slice(index, index + ENGINE_LIMITS.freqBulkBatch));
    }
    let rateLimited = false;
    await mapWithConcurrency(batches, 1, async (batch) => {
      if (rateLimited) return;
      try {
      const url = new URL("/bulk", BASE_URL);
      const payload = record(await fetchProviderJson(this.name, url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Api-Key": this.apiKey },
        body: JSON.stringify(batch.map((track) => ({
          isrc: track.isrc || undefined,
          track: track.name,
          artist: track.artists[0],
        }))),
      }, this.fetcher, 30_000));
      if (!payload) throw new ProviderError("Invalid FreqBlog bulk response", this.name, 502);
      if (!Array.isArray(payload.results) && (payload.status === "queued" || payload.status === "processing" ||
        typeof payload.retry_after_seconds === "number")) {
        for (const track of batch) {
          this.featureCache.set(this.name, this.schemaVersion, featureCacheKey(track), null);
          this.pending.add(featureCacheKey(track));
        }
        return;
      }
      if (!Array.isArray(payload.results)) throw new ProviderError("Invalid FreqBlog bulk response", this.name, 502);
      const results = payload.results as unknown[];
      batch.forEach((track, index) => {
        const result = record(results[index]);
        const raw = result?.found === true ? result.result : null;
        const features = parseFreqFeatures(raw);
        this.featureCache.set(this.name, this.schemaVersion, featureCacheKey(track), features);
        if (!features && (result?.backfill_status === "queued" || result?.backfill_status === "processing")) {
          this.pending.add(featureCacheKey(track));
        }
      });
      } catch (error) {
        this.lastFeatureError = error instanceof ProviderError ? error : new ProviderError("FreqBlog feature batch failed", this.name, 503);
        if (this.lastFeatureError.status === 429) rateLimited = true;
      }
    });
    return new Map(tracks.flatMap((track) => {
      const features = this.featureCache.get(this.name, this.schemaVersion, featureCacheKey(track));
      return features ? [[track.spotifyId, features]] : [];
    }));
  }

  async recommend(request: RecommendationProviderRequest): Promise<RecommendationCandidate[]> {
    const seeds = request.seedGroups.flat();
    const seed = seeds[request.generationVariant % seeds.length];
    if (!seed) return [];
    const url = new URL("/recommendations", BASE_URL);
    const catalogIds = seeds.map((track) => this.featureCache.get(this.name, this.schemaVersion, featureCacheKey(track))?.providerTrackId)
      .filter((id): id is string => typeof id === "string" && /^\d+$/.test(id)).slice(0, 5);
    if (catalogIds.length) url.searchParams.set("seed_tracks", catalogIds.join(","));
    else {
      url.searchParams.set("track", seed.name);
      url.searchParams.set("artist", seed.artists[0]);
    }
    url.searchParams.set("limit", String(Math.min(100, request.candidateLimit ?? Math.max(20, request.desiredCount))));
    url.searchParams.set("exclude_seed_artists", "false");
    url.searchParams.set("cross_genre", request.strictness === "strict" ? "strict" : "auto");
    const body = await fetchProviderJson(
      this.name,
      url,
      { headers: { Accept: "application/json", "X-Api-Key": this.apiKey } },
      this.fetcher,
    );
    return parseResponse(body);
  }
}
