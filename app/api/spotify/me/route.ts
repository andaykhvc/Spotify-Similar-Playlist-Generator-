import { NextResponse } from "next/server";
import { apiErrorResponse, privateJsonResponse } from "@/lib/api";
import { getCurrentSpotifyUser } from "@/lib/spotify/playlists";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    return privateJsonResponse({ user: await getCurrentSpotifyUser() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
