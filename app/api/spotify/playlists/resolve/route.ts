import { NextResponse } from "next/server";
import { hasValidRequestOrigin } from "@/lib/request";
import { parseSpotifyPlaylistInput } from "@/lib/spotify/parse";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json(
      { error: { code: "invalid_origin", message: "Geçersiz istek kaynağı." } },
      { status: 403 },
    );
  }

  let input: unknown;

  try {
    const body: unknown = await request.json();
    input =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).input
        : null;
  } catch {
    input = null;
  }

  if (typeof input !== "string" || input.length > 500) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_playlist_input",
          message: "Geçerli bir Spotify çalma listesi bağlantısı veya kimliği girin.",
        },
      },
      { status: 400 },
    );
  }

  const playlistId = parseSpotifyPlaylistInput(input);

  if (!playlistId) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_playlist_input",
          message: "Geçerli bir Spotify çalma listesi bağlantısı veya kimliği girin.",
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ playlistId });
}
