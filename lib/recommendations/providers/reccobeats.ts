import { mapWithConcurrency } from "@/lib/recommendations/concurrency";
import { ProviderError } from "@/lib/recommendations/errors";
import { fetchProviderJson } from "@/lib/recommendations/providers/http";
import type {
  RecommendationCandidate,
  RecommendationProvider,
  RecommendationProviderRequest,
} from "@/lib/recommendations/types";

const BASE_URL = "https://api.reccobeats.com";
const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;

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

function parseResponse(value: unknown, seedGroupIndex: number): RecommendationCandidate[] {
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
    }];
  });
}

export class ReccoBeatsProvider implements RecommendationProvider {
  readonly name = "reccobeats" as const;
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async recommend(request: RecommendationProviderRequest): Promise<RecommendationCandidate[]> {
    const perGroup = Math.min(
      40,
      Math.max(10, Math.ceil((request.desiredCount * 1.6) / request.seedGroups.length)),
    );
    const pages = await mapWithConcurrency(request.seedGroups, 2, async (group, index) => {
      const url = new URL("/v1/track/recommendation", BASE_URL);
      url.searchParams.set("size", String(perGroup));
      group.forEach((track) => url.searchParams.append("seeds", track.spotifyId));
      const body = await fetchProviderJson(
        this.name,
        url,
        { headers: { Accept: "application/json" } },
        this.fetcher,
      );
      return parseResponse(body, index);
    });
    return pages.flat();
  }
}
