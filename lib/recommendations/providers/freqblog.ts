import { ProviderError } from "@/lib/recommendations/errors";
import { fetchProviderJson } from "@/lib/recommendations/providers/http";
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

export class FreqBlogProvider implements RecommendationProvider {
  readonly name = "freqblog" as const;
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async recommend(request: RecommendationProviderRequest): Promise<RecommendationCandidate[]> {
    const seeds = request.seedGroups.flat();
    const seed = seeds[request.generationVariant % seeds.length];
    if (!seed) return [];
    const url = new URL("/recommendations", BASE_URL);
    url.searchParams.set("track", seed.name);
    url.searchParams.set("artist", seed.artists[0]);
    url.searchParams.set("limit", String(Math.min(100, Math.max(20, request.desiredCount))));
    url.searchParams.set("exclude_seed_artists", "true");
    url.searchParams.set("cross_genre", "auto");
    const body = await fetchProviderJson(
      this.name,
      url,
      { headers: { Accept: "application/json", "X-Api-Key": this.apiKey } },
      this.fetcher,
    );
    return parseResponse(body);
  }
}
