import { NextResponse } from "next/server";
import { apiErrorResponse, privateJsonResponse } from "@/lib/api";
import {
  getCurrentSpotifyUser,
  getCurrentUserPlaylists,
} from "@/lib/spotify/playlists";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentSpotifyUser();
    const playlists = await getCurrentUserPlaylists(user);
    return privateJsonResponse({ user, playlists });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
