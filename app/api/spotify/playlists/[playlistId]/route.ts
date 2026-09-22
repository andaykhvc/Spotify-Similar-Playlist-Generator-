import { NextResponse } from "next/server";
import { apiErrorResponse, privateJsonResponse } from "@/lib/api";
import { getPlaylistReview } from "@/lib/spotify/playlists";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ playlistId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { playlistId } = await context.params;
    return privateJsonResponse({
      playlist: await getPlaylistReview(playlistId),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
