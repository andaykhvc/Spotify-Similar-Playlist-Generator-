import { SpotifyApiError } from "@/lib/spotify/errors";
import { spotifyRequest } from "@/lib/spotify/client";

const PLAYLIST_ID = /^[A-Za-z0-9]{22}$/;
const TRACK_ID = /^[A-Za-z0-9]{22}$/;
type UnknownRecord = Record<string, unknown>;

export interface CreatedSpotifyPlaylist {
  id: string;
  externalUrl: string;
  name: string;
}

export class PartialPlaylistWriteError extends Error {
  constructor(
    readonly playlist: CreatedSpotifyPlaylist,
    readonly addedCount: number,
    readonly requestedCount: number,
  ) {
    super("Spotify playlist was created but not all tracks were added");
    this.name = "PartialPlaylistWriteError";
  }
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? value as UnknownRecord : null;
}

export function sanitizePlaylistName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export function chunkSpotifyItems<T>(items: T[], size = 100): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error("Spotify item chunks must be 1-100");
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export async function createSpotifyPlaylist(
  name: string,
  isPublic: boolean,
): Promise<CreatedSpotifyPlaylist> {
  const response = record(await spotifyRequest<unknown>("/me/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, public: isPublic, description: "EchoList ile oluşturuldu." }),
  }));
  const id = typeof response?.id === "string" ? response.id : "";
  const externalUrls = record(response?.external_urls);
  if (!PLAYLIST_ID.test(id)) {
    throw new SpotifyApiError("Spotify yeni çalma listesini doğrulayamadı.", 502, "invalid_response");
  }
  return {
    id,
    name: typeof response?.name === "string" ? response.name : name,
    externalUrl: typeof externalUrls?.spotify === "string"
      ? externalUrls.spotify
      : `https://open.spotify.com/playlist/${id}`,
  };
}

export async function addItemsToSpotifyPlaylist(
  playlist: CreatedSpotifyPlaylist,
  spotifyIds: string[],
): Promise<void> {
  const validIds = spotifyIds.filter((id) => TRACK_ID.test(id));
  if (validIds.length === 0 || validIds.length !== spotifyIds.length) {
    throw new SpotifyApiError("Kaydedilecek geçerli parça bulunamadı.", 400, "bad_request");
  }
  let addedCount = 0;
  for (const chunk of chunkSpotifyItems(validIds)) {
    try {
      await spotifyRequest<unknown>(`/playlists/${playlist.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uris: chunk.map((id) => `spotify:track:${id}`) }),
      });
      addedCount += chunk.length;
    } catch {
      throw new PartialPlaylistWriteError(playlist, addedCount, validIds.length);
    }
  }
}
