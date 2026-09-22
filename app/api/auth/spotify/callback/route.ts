import { NextRequest, NextResponse } from "next/server";
import { getSpotifyEnvironment } from "@/lib/env";
import {
  clearOAuthTransaction,
  getOAuthTransaction,
  setSpotifySession,
} from "@/lib/session";
import {
  exchangeSpotifyAuthorizationCode,
  validateOAuthState,
} from "@/lib/spotify/auth";

export const runtime = "nodejs";

function errorRedirect(code: string): NextResponse {
  const url = new URL("/auth/error", getSpotifyEnvironment().appUrl);
  url.searchParams.set("code", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const transaction = await getOAuthTransaction();

  await clearOAuthTransaction();

  if (
    !state ||
    !transaction ||
    transaction.version !== 1 ||
    !validateOAuthState(
      transaction.state,
      state,
      transaction.createdAt,
    )
  ) {
    return errorRedirect("invalid_state");
  }

  if (error) {
    return errorRedirect(error === "access_denied" ? "access_denied" : "oauth_error");
  }

  if (!code || code.length > 2048) {
    return errorRedirect("oauth_error");
  }

  try {
    const session = await exchangeSpotifyAuthorizationCode(
      code,
      transaction.codeVerifier,
    );
    await setSpotifySession(session);
    return NextResponse.redirect(
      new URL("/dashboard", getSpotifyEnvironment().appUrl),
    );
  } catch (exchangeError) {
    console.error("[spotify-auth] OAuth callback failed", {
      error:
        exchangeError instanceof Error ? exchangeError.name : "UnknownError",
    });
    return errorRedirect("token_exchange_failed");
  }
}
