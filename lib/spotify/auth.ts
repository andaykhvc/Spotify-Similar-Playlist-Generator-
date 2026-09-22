import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSpotifyEnvironment } from "@/lib/env";
import type { SpotifySession } from "@/lib/session";

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
] as const;

const OAUTH_TRANSACTION_MAX_AGE_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY_SKEW_MS = 60 * 1000;

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
}

export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function createCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function validateOAuthState(
  expected: string,
  received: string,
  createdAt: number,
  now = Date.now(),
): boolean {
  if (
    !expected ||
    !received ||
    !Number.isFinite(createdAt) ||
    createdAt > now ||
    now - createdAt > OAUTH_TRANSACTION_MAX_AGE_MS
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function isAccessTokenExpiring(
  expiresAt: number,
  now = Date.now(),
): boolean {
  return !Number.isFinite(expiresAt) || expiresAt - now <= ACCESS_TOKEN_EXPIRY_SKEW_MS;
}

export function buildSpotifyAuthorizationUrl(
  state: string,
  codeChallenge: string,
): string {
  const environment = getSpotifyEnvironment();
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: environment.clientId,
    scope: SPOTIFY_SCOPES.join(" "),
    redirect_uri: environment.redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  }).toString();

  return url.toString();
}

async function requestToken(body: URLSearchParams): Promise<SpotifyTokenResponse> {
  body.set("client_id", getSpotifyEnvironment().clientId);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("[spotify-auth] Token request failed", {
      status: response.status,
    });
    throw new Error("Spotify token exchange failed");
  }

  const payload: unknown = await response.json();

  if (!isTokenResponse(payload)) {
    throw new Error("Spotify returned an invalid token response");
  }

  return payload;
}

function isTokenResponse(value: unknown): value is SpotifyTokenResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.access_token === "string" &&
    candidate.access_token.length > 0 &&
    typeof candidate.token_type === "string" &&
    candidate.token_type.length > 0 &&
    typeof candidate.expires_in === "number" &&
    Number.isFinite(candidate.expires_in) &&
    candidate.expires_in > 0
  );
}

function toSession(
  token: SpotifyTokenResponse,
  fallbackRefreshToken?: string,
): SpotifySession {
  const refreshToken = token.refresh_token ?? fallbackRefreshToken;

  if (!refreshToken) {
    throw new Error("Spotify did not provide a refresh token");
  }

  return {
    version: 1,
    accessToken: token.access_token,
    refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope ?? SPOTIFY_SCOPES.join(" "),
    tokenType: token.token_type,
  };
}

export async function exchangeSpotifyAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<SpotifySession> {
  const environment = getSpotifyEnvironment();
  const token = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: environment.redirectUri,
      code_verifier: codeVerifier,
    }),
  );

  return toSession(token);
}

const refreshRequests = new Map<string, Promise<SpotifySession>>();

export async function refreshSpotifyAccessToken(
  session: SpotifySession,
): Promise<SpotifySession> {
  const key = createHash("sha256").update(session.refreshToken).digest("hex");
  const existingRequest = refreshRequests.get(key);

  if (existingRequest) {
    return existingRequest;
  }

  const request = requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
  ).then((token) => toSession(token, session.refreshToken));

  refreshRequests.set(key, request);

  try {
    return await request;
  } finally {
    refreshRequests.delete(key);
  }
}
