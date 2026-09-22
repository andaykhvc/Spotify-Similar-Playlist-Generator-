import { SpotifyApiError } from "@/lib/spotify/errors";
import { paginateSpotify } from "@/lib/spotify/pagination";
import { spotifyRequest } from "@/lib/spotify/client";
import type {
  NormalizedTrack,
  SpotifyApiPlaylist,
  SpotifyApiPlaylistItem,
  SpotifyApiUser,
  SpotifyPaging,
  SpotifyPlaylistReview,
  SpotifyPlaylistSummary,
  SpotifyUser,
} from "@/lib/spotify/types";

const PLAYLIST_PAGE_SIZE = 50;
const PLAYLIST_MAX_PAGES = 100;
const ITEM_PAGE_SIZE = 50;
const ITEM_MAX_PAGES = 400;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringOr(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}

function spotifyExternalUrl(value: unknown, fallback: string): string {
  if (isRecord(value)) {
    const spotify = optionalString(value.spotify);

    if (spotify?.startsWith("https://open.spotify.com/")) {
      return spotify;
    }
  }

  return fallback;
}

function firstImageUrl(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const image of value) {
    if (isRecord(image)) {
      const url = optionalString(image.url);

      if (url) {
        try {
          const parsed = new URL(url);
          if (
            parsed.protocol === "https:" &&
            (parsed.hostname === "i.scdn.co" ||
              parsed.hostname === "mosaic.scdn.co")
          ) {
            return parsed.toString();
          }
        } catch {
          // Ignore malformed artwork URLs from upstream responses.
        }
      }
    }
  }

  return null;
}

function extractTotal(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.total === "number" && value.total >= 0
    ? value.total
    : null;
}

function parsePaging<T>(value: unknown): SpotifyPaging<T> {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new SpotifyApiError(
      "Spotify geçersiz bir sayfalama yanıtı döndürdü.",
      502,
      "invalid_response",
    );
  }

  return {
    items: value.items as T[],
    limit: typeof value.limit === "number" ? value.limit : value.items.length,
    offset: typeof value.offset === "number" ? value.offset : 0,
    total: typeof value.total === "number" ? value.total : value.items.length,
    next: typeof value.next === "string" ? value.next : null,
  };
}

function assertPlaylistId(playlistId: string): void {
  if (!PLAYLIST_ID_PATTERN.test(playlistId)) {
    throw new SpotifyApiError(
      "Geçerli bir Spotify çalma listesi kimliği girin.",
      400,
      "bad_request",
    );
  }
}

export async function getCurrentSpotifyUser(): Promise<SpotifyUser> {
  const raw = await spotifyRequest<SpotifyApiUser>("/me");
  // The legacy `id` still matches playlist owner IDs. `account_id` is the
  // stable fallback for newer profile responses that omit it.
  const id = optionalString(raw.id) ?? optionalString(raw.account_id);

  if (!id) {
    throw new SpotifyApiError(
      "Spotify hesap bilgisi doğrulanamadı.",
      502,
      "invalid_response",
    );
  }

  return {
    id,
    displayName: stringOr(raw.display_name, "Spotify kullanıcısı"),
    imageUrl: firstImageUrl(raw.images),
    externalUrl: isRecord(raw.external_urls)
      ? optionalString(raw.external_urls.spotify)
      : null,
  };
}

function normalizePlaylist(
  raw: SpotifyApiPlaylist,
  currentUserId: string,
): SpotifyPlaylistSummary | null {
  const id = optionalString(raw.id);
  const owner = isRecord(raw.owner) ? raw.owner : {};
  const ownerId = optionalString(owner.id) ?? "";

  if (!id || !PLAYLIST_ID_PATTERN.test(id)) {
    return null;
  }

  const collaborative = raw.collaborative === true;
  const isOwned = ownerId === currentUserId;
  const isReadableSource = isOwned || collaborative;

  return {
    id,
    name: stringOr(raw.name, "İsimsiz çalma listesi"),
    imageUrl: firstImageUrl(raw.images),
    ownerName: stringOr(owner.display_name, "Spotify kullanıcısı"),
    ownerId,
    itemCount: extractTotal(raw.items) ?? extractTotal(raw.tracks),
    public: typeof raw.public === "boolean" ? raw.public : null,
    collaborative,
    externalUrl: spotifyExternalUrl(
      raw.external_urls,
      `https://open.spotify.com/playlist/${id}`,
    ),
    isReadableSource,
    unavailableReason: isReadableSource
      ? null
      : "Spotify şu anda yalnızca size ait veya birlikte düzenlediğiniz listelerin parçalarını uygulamaya açıyor.",
  };
}

async function getPlaylistMetadataRaw(
  playlistId: string,
): Promise<SpotifyApiPlaylist> {
  assertPlaylistId(playlistId);
  return spotifyRequest<SpotifyApiPlaylist>(`/playlists/${playlistId}`);
}

export async function getCurrentUserPlaylists(
  currentUser?: SpotifyUser,
): Promise<SpotifyPlaylistSummary[]> {
  const user = currentUser ?? (await getCurrentSpotifyUser());
  const rawPlaylists = await paginateSpotify<SpotifyApiPlaylist>(
    async (offset, limit) => {
      const response = await spotifyRequest<unknown>(
        `/me/playlists?limit=${limit}&offset=${offset}`,
      );
      return parsePaging<SpotifyApiPlaylist>(response);
    },
    { pageSize: PLAYLIST_PAGE_SIZE, maxPages: PLAYLIST_MAX_PAGES },
  );

  return rawPlaylists
    .map((playlist) => normalizePlaylist(playlist, user.id))
    .filter((playlist): playlist is SpotifyPlaylistSummary => playlist !== null);
}

export function normalizeSpotifyTrack(value: unknown): NormalizedTrack | null {
  const candidate = isRecord(value) ? value : null;

  if (
    !candidate ||
    candidate.type !== "track" ||
    candidate.is_local === true ||
    candidate.is_playable === false
  ) {
    return null;
  }

  const spotifyId = optionalString(candidate.id);
  const spotifyUri = optionalString(candidate.uri);
  const name = optionalString(candidate.name);
  const durationMs = candidate.duration_ms;

  if (
    !spotifyId ||
    !spotifyUri?.startsWith("spotify:track:") ||
    !name ||
    typeof durationMs !== "number" ||
    durationMs < 0
  ) {
    return null;
  }

  const artists = Array.isArray(candidate.artists)
    ? candidate.artists
        .map((artist) => (isRecord(artist) ? optionalString(artist.name) : null))
        .filter((artist): artist is string => artist !== null)
    : [];
  const album = isRecord(candidate.album) ? candidate.album : {};
  const externalIds = isRecord(candidate.external_ids)
    ? candidate.external_ids
    : {};

  if (artists.length === 0) {
    return null;
  }

  return {
    spotifyId,
    spotifyUri,
    name,
    artists,
    album: stringOr(album.name, "Bilinmeyen albüm"),
    imageUrl: firstImageUrl(album.images),
    externalUrl: spotifyExternalUrl(
      candidate.external_urls,
      `https://open.spotify.com/track/${spotifyId}`,
    ),
    isrc: optionalString(externalIds.isrc),
    durationMs,
  };
}

function normalizeTrack(rawItem: SpotifyApiPlaylistItem): NormalizedTrack | null {
  if (rawItem.is_local === true) return null;
  return normalizeSpotifyTrack(
    isRecord(rawItem.item) ? rawItem.item : isRecord(rawItem.track) ? rawItem.track : null,
  );
}

export async function getPlaylistItems(playlistId: string): Promise<{
  tracks: NormalizedTrack[];
  skippedItemCount: number;
}> {
  assertPlaylistId(playlistId);
  const rawItems = await paginateSpotify<SpotifyApiPlaylistItem>(
    async (offset, limit) => {
      const response = await spotifyRequest<unknown>(
        `/playlists/${playlistId}/items?limit=${limit}&offset=${offset}`,
      );
      return parsePaging<SpotifyApiPlaylistItem>(response);
    },
    { pageSize: ITEM_PAGE_SIZE, maxPages: ITEM_MAX_PAGES },
  );
  const tracks = rawItems
    .map(normalizeTrack)
    .filter((track): track is NormalizedTrack => track !== null);

  return {
    tracks,
    skippedItemCount: rawItems.length - tracks.length,
  };
}

export async function getPlaylistReview(
  playlistId: string,
  currentUser?: SpotifyUser,
): Promise<SpotifyPlaylistReview> {
  assertPlaylistId(playlistId);
  const user = currentUser ?? (await getCurrentSpotifyUser());
  const metadataRaw = await getPlaylistMetadataRaw(playlistId);
  const metadata = normalizePlaylist(metadataRaw, user.id);

  if (!metadata) {
    throw new SpotifyApiError(
      "Çalma listesi bilgisi doğrulanamadı.",
      502,
      "invalid_response",
    );
  }

  const { tracks, skippedItemCount } = await getPlaylistItems(playlistId);

  return {
    ...metadata,
    isReadableSource: true,
    unavailableReason: null,
    itemCount: metadata.itemCount ?? tracks.length + skippedItemCount,
    tracks,
    skippedItemCount,
  };
}
