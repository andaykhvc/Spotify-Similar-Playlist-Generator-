import { NextResponse } from "next/server";
import { getSpotifyEnvironment } from "@/lib/env";
import { hasValidRequestOrigin } from "@/lib/request";
import { clearOAuthTransaction, clearSpotifySession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json(
      { error: { code: "invalid_origin", message: "Geçersiz istek kaynağı." } },
      { status: 403 },
    );
  }

  await Promise.all([clearSpotifySession(), clearOAuthTransaction()]);
  return NextResponse.redirect(getSpotifyEnvironment().appUrl, 303);
}
