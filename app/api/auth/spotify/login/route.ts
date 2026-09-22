import { NextResponse } from "next/server";
import {
  buildSpotifyAuthorizationUrl,
  createCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
} from "@/lib/spotify/auth";
import { setOAuthTransaction } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const state = generateOAuthState();
  const codeVerifier = generateCodeVerifier();

  await setOAuthTransaction({
    version: 1,
    state,
    codeVerifier,
    createdAt: Date.now(),
  });

  return NextResponse.redirect(
    buildSpotifyAuthorizationUrl(state, createCodeChallenge(codeVerifier)),
  );
}
