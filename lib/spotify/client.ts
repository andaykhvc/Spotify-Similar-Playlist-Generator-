import {
  clearSpotifySession,
  getSpotifySession,
  setSpotifySession,
  type SpotifySession,
} from "@/lib/session";
import {
  isAccessTokenExpiring,
  refreshSpotifyAccessToken,
} from "@/lib/spotify/auth";
import {
  SpotifyApiError,
  spotifyErrorFromStatus,
} from "@/lib/spotify/errors";

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const MAX_AUTOMATIC_RATE_LIMIT_WAIT_SECONDS = 5;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");

  if (!header) {
    return null;
  }

  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function safeEndpointName(path: string): string {
  return path
    .replace(/\/playlists\/[A-Za-z0-9]+/g, "/playlists/[playlist-id]")
    .split("?")[0];
}

async function requireSession(forceRefresh = false): Promise<SpotifySession> {
  const session = await getSpotifySession();

  if (!session) {
    throw spotifyErrorFromStatus(401);
  }

  if (!forceRefresh && !isAccessTokenExpiring(session.expiresAt)) {
    return session;
  }

  try {
    const refreshedSession = await refreshSpotifyAccessToken(session);
    await setSpotifySession(refreshedSession);
    return refreshedSession;
  } catch (error) {
    console.error("[spotify-auth] Access token refresh failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    await clearSpotifySession();
    throw spotifyErrorFromStatus(401);
  }
}

async function requestWithSession(
  path: string,
  session: SpotifySession,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${SPOTIFY_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });
}

export async function spotifyRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error("Spotify API paths must be relative");
  }

  let session = await requireSession();
  let response = await requestWithSession(path, session, init);

  if (response.status === 401) {
    session = await requireSession(true);
    response = await requestWithSession(path, session, init);
  }

  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfter(response);

    if (
      retryAfterSeconds !== null &&
      retryAfterSeconds <= MAX_AUTOMATIC_RATE_LIMIT_WAIT_SECONDS
    ) {
      await delay(retryAfterSeconds * 1000);
      response = await requestWithSession(path, session, init);
    }
  }

  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfter(response);
    const error = spotifyErrorFromStatus(response.status, retryAfterSeconds);

    console.error("[spotify-api] Request failed", {
      endpoint: safeEndpointName(path),
      method: init.method ?? "GET",
      status: response.status,
      code: error.code,
    });

    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new SpotifyApiError(
      "Spotify geçersiz bir yanıt döndürdü.",
      502,
      "invalid_response",
    );
  }
}
