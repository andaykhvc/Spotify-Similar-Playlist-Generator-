import { apiErrorResponse, privateJsonResponse } from "@/lib/api";
import { validateGenerationToken } from "@/lib/recommendations/token";
import { hasValidRequestOrigin } from "@/lib/request";
import { getCurrentSpotifyUser } from "@/lib/spotify/playlists";
import {
  addItemsToSpotifyPlaylist,
  createSpotifyPlaylist,
  PartialPlaylistWriteError,
  sanitizePlaylistName,
} from "@/lib/spotify/write";

const TRACK_ID = /^[A-Za-z0-9]{22}$/;

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) {
    return privateJsonResponse(
      { error: { code: "forbidden", message: "İstek kaynağı doğrulanamadı." } },
      { status: 403 },
    );
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const name = sanitizePlaylistName(body.name);
    const selectedSpotifyIds = Array.isArray(body.selectedSpotifyIds)
      ? body.selectedSpotifyIds
      : [];
    if (
      !name ||
      typeof body.public !== "boolean" ||
      selectedSpotifyIds.length === 0 ||
      selectedSpotifyIds.length > 100 ||
      selectedSpotifyIds.some((id) => typeof id !== "string" || !TRACK_ID.test(id)) ||
      new Set(selectedSpotifyIds).size !== selectedSpotifyIds.length
    ) {
      return privateJsonResponse(
        { error: { code: "bad_request", message: "Çalma listesi adı veya parçalar geçersiz." } },
        { status: 400 },
      );
    }

    const user = await getCurrentSpotifyUser();
    const authorization = validateGenerationToken(body.generationToken, user.id);
    const allowed = new Set(authorization?.allowedSpotifyIds ?? []);
    if (!authorization || selectedSpotifyIds.some((id) => !allowed.has(id as string))) {
      return privateJsonResponse(
        { error: { code: "generation_expired", message: "Öneri oturumu geçersiz veya süresi dolmuş. Listeyi yeniden oluşturun." } },
        { status: 400 },
      );
    }

    const playlist = await createSpotifyPlaylist(name, body.public);
    try {
      await addItemsToSpotifyPlaylist(playlist, selectedSpotifyIds as string[]);
    } catch (error) {
      if (error instanceof PartialPlaylistWriteError) {
        console.error("[playlist-write] partial_failure", {
          addedCount: error.addedCount,
          requestedCount: error.requestedCount,
        });
        return privateJsonResponse(
          {
            partial: true,
            playlist: error.playlist,
            addedCount: error.addedCount,
            requestedCount: error.requestedCount,
            error: {
              code: "partial_playlist_write",
              message: "Çalma listesi oluşturuldu ancak parçaların tamamı eklenemedi. Spotify'da açıp tekrar deneyebilirsiniz.",
            },
          },
          { status: 207 },
        );
      }
      throw error;
    }

    console.info("[playlist-write] creation_succeeded", {
      trackCount: selectedSpotifyIds.length,
      public: body.public,
    });
    return privateJsonResponse({ partial: false, playlist }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return privateJsonResponse(
        { error: { code: "bad_request", message: "Geçersiz istek gövdesi." } },
        { status: 400 },
      );
    }
    console.error("[playlist-write] creation_failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return apiErrorResponse(error);
  }
}
