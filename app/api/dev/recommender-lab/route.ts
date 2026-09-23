import { apiErrorResponse, privateJsonResponse } from "@/lib/api";
import { generateSimilarPlaylist, isConsensusStrictness, isPlaylistLength } from "@/lib/recommendations";
import { hasValidRequestOrigin } from "@/lib/request";
import { getSpotifySession } from "@/lib/session";

export const runtime = "nodejs";
const PLAYLIST_ID = /^[A-Za-z0-9]{22}$/;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return privateJsonResponse({ error: "Not found" }, { status: 404 });
  if (!hasValidRequestOrigin(request)) return privateJsonResponse({ error: "Forbidden" }, { status: 403 });
  if (!(await getSpotifySession())) return privateJsonResponse({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!PLAYLIST_ID.test(String(body.playlistId ?? "")) || !isPlaylistLength(body.desiredCount) ||
      !isConsensusStrictness(body.strictness) ||
      !Number.isInteger(body.generationVariant) || typeof body.generationVariant !== "number" ||
      body.generationVariant < 0 || body.generationVariant > 10_000) {
      return privateJsonResponse({ error: "Invalid lab input" }, { status: 400 });
    }
    const result = await generateSimilarPlaylist(
      String(body.playlistId), body.desiredCount,
      body.generationVariant, body.strictness, true,
    );
    return privateJsonResponse({
      diagnostics: result.diagnostics,
      summary: result.analysis,
      recommendations: result.recommendations,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
