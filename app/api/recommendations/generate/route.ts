import { apiErrorResponse, privateJsonResponse } from "@/lib/api";
import { generateSimilarPlaylist, isPlaylistLength } from "@/lib/recommendations";
import { RecommendationError } from "@/lib/recommendations/errors";
import { hasValidRequestOrigin } from "@/lib/request";
import { getSpotifySession } from "@/lib/session";

export const runtime = "nodejs";

const PLAYLIST_ID = /^[A-Za-z0-9]{22}$/;

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) {
    return privateJsonResponse(
      { error: { code: "forbidden", message: "İstek kaynağı doğrulanamadı." } },
      { status: 403 },
    );
  }

  if (!(await getSpotifySession())) {
    return privateJsonResponse(
      { error: { code: "unauthorized", message: "Spotify bağlantınızın süresi doldu. Lütfen yeniden bağlanın." } },
      { status: 401 },
    );
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const playlistId = typeof body.playlistId === "string" ? body.playlistId : "";
    const desiredCount = body.desiredCount;
    const generationVariant = body.generationVariant;
    if (
      !PLAYLIST_ID.test(playlistId) ||
      !isPlaylistLength(desiredCount) ||
      !Number.isInteger(generationVariant) ||
      typeof generationVariant !== "number" ||
      generationVariant < 0 ||
      generationVariant > 10_000
    ) {
      throw new RecommendationError(
        "Çalma listesi veya üretim ayarları geçersiz.",
        400,
        "invalid_request",
      );
    }
    const result = await generateSimilarPlaylist(playlistId, desiredCount, generationVariant);
    return privateJsonResponse(result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return privateJsonResponse(
        { error: { code: "bad_request", message: "Geçersiz istek gövdesi." } },
        { status: 400 },
      );
    }
    return apiErrorResponse(error);
  }
}
